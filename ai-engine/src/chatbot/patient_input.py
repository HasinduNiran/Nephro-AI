"""
Patient Input Handler for Nephro-AI
Handles both Voice (STT) and Text input methods.
Uses Groq Cloud API for ultra-fast speech-to-text.
"""

import os
import sys
import time
import queue
import numpy as np
import sounddevice as sd
import soundfile as sf
import threading
import tempfile
from pathlib import Path
from typing import Optional
from groq import Groq
import torch

# Add parent directory to path to import config
sys.path.insert(0, str(Path(__file__).parent.parent))

try:
    from chatbot.config import MEDICAL_ENTITIES, expand_abbreviations
except ImportError:
    # Fallback if config cannot be imported
    print("⚠️ Warning: Could not import MEDICAL_ENTITIES from config. Using default list.")
    MEDICAL_ENTITIES = ["CKD", "Creatinine", "eGFR", "Dialysis", "Diabetes", "Blood Pressure"]
    def expand_abbreviations(text): return text

import shutil

# Check for FFmpeg
if not shutil.which("ffmpeg"):
    print("⚠️ Warning: FFmpeg not found in PATH. Audio processing may fail.")

# 🔑 CONFIGURATION
from dotenv import load_dotenv
load_dotenv()
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

class PatientInputHandler:
    def __init__(self, model_size: str = "ignored"):
        """
        Initialize Patient Input Handler
        Args:
            model_size: Ignored (Groq Cloud always uses large-v3)
        """
        print("☁️ Initializing Groq Cloud STT Engine...")
        
        try:
            self.client = Groq(api_key=GROQ_API_KEY)
            print("✅ Groq STT Ready (Model: whisper-large-v3)")
        except Exception as e:
            print(f"❌ Critical Error: Groq Client failed to start. {e}")
            self.client = None

        self.recording = False
        self.audio_queue = queue.Queue()

        # 1. Load Silero VAD for Smart Recording (Stop on Silence)
        # We keep this LOCALLY to detect when the user stops speaking.
        print("⏳ Loading VAD Model (for recording logic)...")
        try:
            self.vad_model, utils = torch.hub.load(
                repo_or_dir='snakers4/silero-vad',
                model='silero_vad',
                force_reload=False,
                trust_repo=True
            )
            (self.get_speech_timestamps, _, self.read_audio, _, _) = utils
            print("✅ VAD Ready")
        except Exception as e:
            print(f"⚠️ VAD Load Failed: {e}. Recording might not auto-stop correctly.")
            self.vad_model = None

    def record_audio(self, sample_rate=16000):
        """
        Smart Recording Loop:
        1. Buffers audio constantly.
        2. Starts saving ONLY when 'Human Voice' is detected.
        3. Stops automatically after 2.0 seconds of silence.
        """
        if not self.vad_model:
            print("❌ VAD not loaded. Cannot record smartly.")
            return None

        print("\n🎤 Listening... (Start speaking)")
        
        buffer = []
        started_speaking = False
        silence_start_time = None
        
        # Silero expects chunks of 512 samples (for 16k Hz)
        chunk_size = 512 
        
        try:
            with sd.InputStream(samplerate=sample_rate, channels=1, blocksize=chunk_size, dtype='float32') as stream:
                while True:
                    # Read audio chunk
                    audio_chunk, _ = stream.read(chunk_size)
                    audio_chunk = audio_chunk.flatten()
                    
                    # Convert to PyTorch Tensor for VAD
                    audio_tensor = torch.from_numpy(audio_chunk)

                    # Get confidence (0.0 to 1.0)
                    speech_prob = self.vad_model(audio_tensor, sample_rate).item()
                    
                    # Logic: Is this speech?
                    is_speech = speech_prob > 0.5  # Confidence threshold

                    if is_speech:
                        if not started_speaking:
                            print("   (🗣️ Speech Detected - Recording...)")
                            started_speaking = True
                        
                        silence_start_time = None # Reset silence timer
                        buffer.append(audio_chunk)
                    
                    elif started_speaking:
                        # We are in silence AFTER speech
                        buffer.append(audio_chunk) # Keep recording silence briefly for natural flow
                        
                        if silence_start_time is None:
                            silence_start_time = time.time()
                        
                        # If silence lasts > 1.5 seconds, STOP
                        if time.time() - silence_start_time > 1.5:
                            print("   (✅ End of sentence detected)")
                            break
            
            # Save Buffer to File
            full_audio = np.concatenate(buffer)
            
            # Use tempfile for safer handling (and OS auto-cleanup eventually if we miss it)
            # delete=False is required on Windows if we want to close and then re-open by name
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp_file:
                filename = temp_file.name
                sf.write(filename, full_audio, sample_rate)
            
            return filename

        except Exception as e:
            print(f"❌ Recording failed: {e}")
            return None

    def transcribe_audio(self, audio_path: str, language: str = None) -> str:
        """
        Sends audio to Groq Cloud and returns text.
        """
        if not self.client:
            print("❌ Error: Groq client not initialized.")
            return ""
        
        if not os.path.exists(audio_path):
            return ""

        print(f"🔄 Transcribing ({language if language else 'auto'})...")

        try:
            # 1. Open and Send File with RETRY LOGIC
            text = ""
            for attempt in range(2):
                try:
                    with open(audio_path, "rb") as file:
                        # Groq API Call
                        transcription = self.client.audio.transcriptions.create(
                            file=(audio_path, file.read()),
                            model="whisper-large-v3", # The smartest model
                            response_format="text",   # Just give us the string
                            language="si" if language == 'si' else None, # Force 'si' if requested
                        )
                    text = transcription.strip()
                    break # Success!
                except Exception as e:
                    if attempt == 0:
                        print(f"⚠️ Attempt {attempt+1} failed ({e}). Retrying...")
                        time.sleep(1) # Brief pause
                    else:
                        raise e # Re-raise if final attempt fails
            
            # 2. SAFETY FILTER (Replaces VAD filtering from local whisper)
            # Whisper hallucinating on silence usually outputs these specific phrases:
            ghosts = [
                "you", "thank you", "thanks", "start speaking", 
                "subtitle", "music", "watching", "amara.org", "mbc"
            ]
            
            # If text is empty, too short, or a known ghost -> Ignore it
            if not text or len(text) < 2 or text.lower().strip(" .!?") in ghosts:
                print(f"🚫 Ignored Hallucination/Silence: '{text}'")
                # Auto Cleanup on failure too
                try:
                    os.remove(audio_path)
                except:
                    pass
                return ""

            print(f"📝 STT Output: '{text}'")
            
            # ✅ AUTO CLEANUP
            try:
                os.remove(audio_path)
                print(f"🧹 Deleted temp file: {audio_path}")
            except Exception as e:
                print(f"⚠️ Cleanup failed: {e}")
                
            return text

        except Exception as e:
            print(f"❌ Groq API Error: {e}")
            return ""
            
    def play_audio(self, audio_path: str):
        """Play back the recorded audio for verification"""
        try:
            data, fs = sf.read(audio_path)
            sd.play(data, fs)
            sd.wait()
        except Exception as e:
            print(f"⚠️ Could not play audio: {e}")

    def get_input(self, mode: str = "text", debug_audio: bool = False, language: str = None) -> str:
        """
        Get input from patient
        """
        if mode == "voice":
            audio_path = self.record_audio()
            if audio_path:
                if debug_audio:
                    print("🔊 Playing back recorded audio...")
                    self.play_audio(audio_path)
                return self.transcribe_audio(audio_path, language=language)
            return ""
        else:
            return input("\n👤 You: ").strip()

if __name__ == "__main__":
    # Test the handler
    handler = PatientInputHandler()
    print("Testing Text Mode:")
    print(f"Result: {handler.get_input('text')}")
