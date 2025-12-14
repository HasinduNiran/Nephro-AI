"""
Patient Input Handler for Nephro-AI
Handles both Voice (STT) and Text input methods.
Uses OpenAI Whisper for local speech-to-text conversion.
"""

import os
import sys
import time
import threading
import queue
import numpy as np
import sounddevice as sd
import soundfile as sf
from pathlib import Path
from typing import Optional, Tuple
from faster_whisper import WhisperModel
import torch

# Add parent directory to path to import config
sys.path.insert(0, str(Path(__file__).parent.parent))

try:
    from chatbot.config import MEDICAL_ENTITIES, expand_abbreviations
except ImportError:
    # Fallback if config cannot be imported (e.g. running from wrong dir)
    print("⚠️ Warning: Could not import MEDICAL_ENTITIES from config. Using default list.")
    MEDICAL_ENTITIES = ["CKD", "Creatinine", "eGFR", "Dialysis", "Diabetes", "Blood Pressure"]
    def expand_abbreviations(text): return text

import shutil

# Check for FFmpeg
if not shutil.which("ffmpeg"):
    print("⚠️ Warning: FFmpeg not found in PATH. Audio processing may fail.")
    print("   Please install FFmpeg and add it to your PATH.")
    # You could optionally add a fallback check for common locations here if desired, 
    # but relying on PATH is best practice.
else:
    print("✅ FFmpeg found.")

class PatientInputHandler:
    def __init__(self, model_size: str = "small"):
        """
        Initialize Patient Input Handler
        
        Args:
            model_size: Whisper model size (tiny, base, small, medium, large)
        """
        self.model_size = model_size
        self.recording = False
        self.audio_queue = queue.Queue()
        
        print(f"⏳ Loading Faster-Whisper ({model_size})...")
        # 'int8' is the magic setting for 4x speed on CPU
        # If you have an NVIDIA GPU, change device="cpu" to device="cuda"
        self.whisper_model = WhisperModel(
            model_size_or_path=model_size,
            device="cpu",
            compute_type="int8",
            cpu_threads=4  # Optimized for speed
        )
        print("✅ Model Loaded")

        # 1. Load the Silero VAD model (Downloads once, then caches)
        # We use the 'jit' version for speed (Just-In-Time compilation)
        print("⏳ Loading VAD Model...")
        self.vad_model, utils = torch.hub.load(
            repo_or_dir='snakers4/silero-vad',
            model='silero_vad',
            force_reload=False,
            trust_repo=True
        )
        (self.get_speech_timestamps, _, self.read_audio, _, _) = utils
        print("✅ VAD Ready")
            
    def record_audio(self, sample_rate=16000):
        """
        Smart Recording Loop:
        1. Buffers audio constantly.
        2. Starts saving ONLY when 'Human Voice' is detected.
        3. Stops automatically after 2.0 seconds of silence.
        """
        print("\n🎤 Listening... (Start speaking)")
        
        buffer = []
        started_speaking = False
        silence_start_time = None
        
        # Silero expects chunks of 512 samples (for 16k Hz)
        # 512 samples @ 16kHz = ~32ms
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
                    # This is the "Neural" check - is this human speech?
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
            
            # Save to temp file
            temp_dir = Path("temp_audio")
            temp_dir.mkdir(exist_ok=True)
            timestamp = int(time.time())
            filename = temp_dir / f"recording_{timestamp}.wav"
            
            sf.write(str(filename), full_audio, sample_rate)
            return str(filename)

        except Exception as e:
            print(f"❌ Recording failed: {e}")
            return None

    def transcribe_audio(self, audio_path: str, language: str = None) -> str:
        if not os.path.exists(audio_path):
            return ""

        print(f"🔄 Transcribing ({language if language else 'auto'})...")
        
        try:
            # 1. Construct the Prompt (The most important part for Research)
            # This teaches the model that "Sinhala" here involves English terms.
            base_prompt = "This is a medical discussion about CKD. Common terms: Creatinine, eGFR, Potassium, Dialysis, Urea."
            
            if language == 'si':
                # Force Singlish behavior
                initial_prompt = base_prompt + " Sinhala sentences often contain English medical terms."
            else:
                initial_prompt = base_prompt

            # 2. Run Inference
            # faster-whisper returns a 'generator' (segments) which streams text as it processes
            segments, info = self.whisper_model.transcribe(
                audio_path,
                language=language,
                initial_prompt=initial_prompt,
                beam_size=1,             # <--- THE MAGIC FIX (Default is 5). 1 = Greedy Search (Fastest)
                best_of=1,               # Don't re-evaluate candidates
                temperature=0.0,         # Deterministic (Faster)
                vad_filter=True,         # Built-in Silero VAD to skip silence!
                vad_parameters=dict(min_silence_duration_ms=500)
            )

            # 3. Combine Segments
            text_result = " ".join([segment.text for segment in segments]).strip()
            
            print(f"🗣️ Detected Language: {info.language} (Confidence: {info.language_probability:.2f})")
            
            # 1. Check Detected Language
            # ALLOWED LANGUAGES: English ('en') and Sinhala ('si')
            if info.language not in ['en', 'si']:
                print(f"⚠️ Ignoring non-supported language: {info.language}")
                return ""  # Return empty string to cancel pipeline

            # 2. Filter "Ghost" Hallucinations
            # Whisper often outputs these specific phrases during silence
            hallucinations = ["you", "thank you", "thanks", "start speaking", "subtitle", "music"]
            if not text_result or len(text_result) < 2 or text_result.lower().strip(" .") in hallucinations:
                print("⚠️ Ignoring silence/hallucination")
                return ""
            print(f"🗣️ Text: \"{text_result}\"")
            
            return text_result

        except Exception as e:
            print(f"❌ Transcription failed: {e}")
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
        
        Args:
            mode: 'text' or 'voice'
            debug_audio: If True, plays back recorded audio
            language: Language code for transcription (e.g., 'si')
            
        Returns:
            Patient query string
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
