import sys
import wave
import io
import sounddevice as sd
import soundfile as sf
import numpy as np
from pathlib import Path
from google import genai
from google.genai import types

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

import config

class TTSEngine:
    def __init__(self):
        """Initialize TTS Engine with config"""
        self.api_key = config.GOOGLE_API_KEY
        self.voice_name = config.GOOGLE_TTS_VOICE
        
        if not self.api_key or self.api_key == "YOUR_GOOGLE_API_KEY":
            print("⚠️ Warning: GOOGLE_API_KEY not set in config.")
            self.client = None
        else:
            try:
                self.client = genai.Client(api_key=self.api_key)
            except Exception as e:
                print(f"❌ TTS Init Error: {e}")
                self.client = None

    def generate_and_play(self, text: str):
        """
        Generate speech from text and play it immediately
        
        Args:
            text: Text to convert to speech
        """
        if not self.client:
            print("❌ TTS Error: Client not initialized (check API Key)")
            return

        try:
            print("🔊 Generating speech...")
            response = self.client.models.generate_content(
                model="gemini-2.5-flash-preview-tts",
                contents=f"Say cheerfully: {text}",
                config=types.GenerateContentConfig(
                    response_modalities=["AUDIO"],
                    speech_config=types.SpeechConfig(
                        voice_config=types.VoiceConfig(
                            prebuilt_voice_config=types.PrebuiltVoiceConfig(
                                voice_name=self.voice_name,
                            )
                        )
                    ),
                )
            )
            
            # Extract audio data
            if response.candidates and response.candidates[0].content.parts:
                audio_data_bytes = response.candidates[0].content.parts[0].inline_data.data
                
                # Play audio
                print("▶️ Playing audio...")
                # Convert raw PCM bytes to numpy array
                # Google GenAI TTS returns raw PCM (16-bit, 24kHz by default for this model/config)
                audio_data = np.frombuffer(audio_data_bytes, dtype=np.int16)
                
                sd.play(audio_data, samplerate=24000)
                sd.wait()
            else:
                print("❌ TTS Error: No audio content in response")

        except Exception as e:
            print(f"❌ TTS Error: {e}")

if __name__ == "__main__":
    # Test
    tts = TTSEngine()
    tts.generate_and_play("Hello! I am Nephro-AI, your kidney care assistant.")
