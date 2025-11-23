"""
Text-to-Speech Engine for Nephro-AI
Handles conversion of text response to speech using ElevenLabs API.
"""

import sys
import requests
import sounddevice as sd
import soundfile as sf
import io
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

import config

class TTSEngine:
    def __init__(self):
        """Initialize TTS Engine with config"""
        self.api_key = config.ELEVENLABS_API_KEY
        self.voice_id = config.ELEVENLABS_VOICE_ID
        self.api_url = f"https://api.elevenlabs.io/v1/text-to-speech/{self.voice_id}"
        
        if not self.api_key:
            print("⚠️ Warning: ELEVENLABS_API_KEY not found in config.")

    def generate_and_play(self, text: str):
        """
        Generate speech from text and play it immediately
        
        Args:
            text: Text to convert to speech
        """
        if not self.api_key:
            print("❌ TTS Error: API Key missing")
            return

        headers = {
            "Accept": "audio/mpeg",
            "Content-Type": "application/json",
            "xi-api-key": self.api_key
        }

        data = {
            "text": text,
            "model_id": "eleven_multilingual_v2",
            "voice_settings": {
                "stability": 0.5,
                "similarity_boost": 0.5
            }
        }

        try:
            print("🔊 Generating speech...")
            response = requests.post(self.api_url, json=data, headers=headers)
            
            if response.status_code == 200:
                # Convert audio bytes to numpy array for sounddevice
                audio_data, sample_rate = sf.read(io.BytesIO(response.content))
                print("▶️ Playing audio...")
                sd.play(audio_data, sample_rate)
                sd.wait() # Wait for playback to finish
            else:
                print(f"❌ TTS API Error: {response.status_code} - {response.text}")
                
        except Exception as e:
            print(f"❌ TTS Error: {e}")

if __name__ == "__main__":
    # Test
    tts = TTSEngine()
    tts.generate_and_play("Hello! I am Nephro-AI, your kidney care assistant.")
