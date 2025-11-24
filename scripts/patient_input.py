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

# Add parent directory to path to import config
sys.path.insert(0, str(Path(__file__).parent.parent))

try:
    from config import MEDICAL_ENTITIES, expand_abbreviations
except ImportError:
    # Fallback if config cannot be imported (e.g. running from wrong dir)
    print("⚠️ Warning: Could not import MEDICAL_ENTITIES from config. Using default list.")
    MEDICAL_ENTITIES = ["CKD", "Creatinine", "eGFR", "Dialysis", "Diabetes", "Blood Pressure"]
    def expand_abbreviations(text): return text

# Add FFmpeg to PATH if not present (Fix for WinError 2)
ffmpeg_path = r"C:\Users\lasal\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.0.1-full_build\bin"
if os.path.exists(ffmpeg_path) and ffmpeg_path not in os.environ["PATH"]:
    print(f"🔧 Adding FFmpeg to PATH: {ffmpeg_path}")
    os.environ["PATH"] += os.pathsep + ffmpeg_path

class PatientInputHandler:
    def __init__(self, model_size: str = "base"):
        """
        Initialize Patient Input Handler
        
        Args:
            model_size: Whisper model size (tiny, base, small, medium, large)
        """
        self.model_size = model_size
        self.whisper_model = None
        self.recording = False
        self.audio_queue = queue.Queue()
        
    def _load_model(self):
        """Lazy load Whisper model"""
        if self.whisper_model is None:
            print(f"⏳ Loading Whisper model ({self.model_size})... this may take a moment.")
            import whisper
            self.whisper_model = whisper.load_model(self.model_size)
            print("✅ Whisper model loaded!")
            
    def record_audio(self, duration: int = None, sample_rate: int = 16000) -> Optional[str]:
        """
        Record audio from microphone
        
        Args:
            duration: Fixed duration in seconds (if None, records until stopped)
            sample_rate: Audio sample rate (Whisper expects 16000)
            
        Returns:
            Path to saved temporary audio file
        """
        print("\n🎤 Recording... (Press Ctrl+C to stop if no duration set)")
        
        try:
            if duration:
                # Fixed duration recording
                recording = sd.rec(int(duration * sample_rate), samplerate=sample_rate, channels=1)
                sd.wait()
            else:
                # Indefinite recording until enter is pressed (simulated here with fixed time for safety in basic version)
                # For a real interactive CLI, we'd use a key listener, but for now let's default to 5 seconds
                # if no duration is specified to avoid hanging.
                print("   (Defaulting to 5 seconds for safety)")
                duration = 5
                recording = sd.rec(int(duration * sample_rate), samplerate=sample_rate, channels=1)
                sd.wait()
                
            print("⏹️ Recording finished.")
            
            # Save to temp file
            temp_dir = Path("temp_audio")
            temp_dir.mkdir(exist_ok=True)
            timestamp = int(time.time())
            filename = temp_dir / f"recording_{timestamp}.wav"
            
            sf.write(str(filename), recording, sample_rate)
            return str(filename)
            
        except Exception as e:
            print(f"❌ Recording failed: {e}")
            return None

    def transcribe_audio(self, audio_path: str, language: str = None) -> str:
        """
        Transcribe audio file to text using Whisper
        
        Args:
            audio_path: Path to audio file
            language: Language code (e.g., 'en', 'si'). If None, auto-detects.
            
        Returns:
            Transcribed text
        """
        if not os.path.exists(audio_path):
            return ""
            
        self._load_model()
        
        print(f"🔄 Transcribing ({language if language else 'auto'})...")
        try:
            # Add initial prompt to guide Whisper (especially for Sinhala and Medical terms)
            # Construct a rich context using the top medical entities
            medical_context = ", ".join(MEDICAL_ENTITIES[:30]) # Use top 30 terms to avoid token limit
            
            base_prompt = f"This is a medical discussion about Chronic Kidney Disease (CKD). Terms like {medical_context} are used."
            
            initial_prompt = base_prompt
            if language == 'si':
                initial_prompt += " මෙය වකුගඩු රෝගය පිළිබඳ සිංහලෙන් අසන ලද ප්‍රශ්නයකි. මෙහි ඉංග්‍රීසි වෛද්‍ය වචන (Medical Terms) මිශ්‍ර සිංහල වාක්‍ය භාවිතා වේ." # "This is a question about kidney disease in Sinhala. English medical terms are mixed in Sinhala sentences."
            
            print(f"💡 Guided Prompt: {initial_prompt[:100]}...")

            result = self.whisper_model.transcribe(
                audio_path, 
                language=language,
                initial_prompt=initial_prompt,
                fp16=False # Fix for CPU warning
            )
            text = result["text"].strip()
            print(f"🗣️ You said: \"{text}\"")
            
            # Normalize the medical terms immediately
            expanded_text = expand_abbreviations(text)
            if text != expanded_text:
                print(f"🔄 Normalized to: \"{expanded_text}\"")
                
            return expanded_text
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
