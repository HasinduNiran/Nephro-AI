
import asyncio
import edge_tts
import pygame
import os
import hashlib
from pathlib import Path

class TTSEngine:
    def __init__(self):
        print("🔊 Initializing Neural TTS Engine (Edge-TTS)...")
        try:
            pygame.mixer.init()
        except Exception as e:
            print(f"⚠️ Warning: Pygame mixer failed to init (Audio might not play): {e}")
        
        # Voice Configuration
        self.voice_en = "en-US-AriaNeural"      # Excellent English Medical Voice
        self.voice_si = "si-LK-ThiliniNeural"   # Native Sinhala Voice
        
        # Caching Setup (Best Practice)
        self.cache_dir = Path("tts_cache")
        self.cache_dir.mkdir(exist_ok=True)

    def detect_language(self, text):
        """Check if text contains Sinhala Unicode characters"""
        if any('\u0D80' <= char <= '\u0DFF' for char in text):
            return "si"
        return "en"

    async def _generate_audio_file(self, text, voice, output_path):
        """Generate audio using Edge TTS"""
        try:
            communicate = edge_tts.Communicate(text, voice)
            await communicate.save(output_path)
        except edge_tts.exceptions.NoAudioReceived:
            print(f"❌ TTS Error: No audio generated for text: '{text}'")
            # Create a silent file or fallback to prevent crash
            with open(output_path, 'wb') as f:
                f.write(b'') 
        except Exception as e:
            print(f"❌ TTS Critical Error: {e}")

    def generate_and_play(self, text: str):
        """
        Generate speech with Caching and Language Switching
        """
        if not text:
            return

        # 1. Detect Language & Select Voice
        lang = self.detect_language(text)
        voice = self.voice_si if lang == "si" else self.voice_en
        
        print(f"🗣️ Speaking ({lang}): {text[:50]}...")

        # 2. Check Cache (Industrial Best Practice)
        # Create a unique filename based on the text hash
        file_hash = hashlib.md5(text.encode()).hexdigest()
        output_file = self.cache_dir / f"{file_hash}_{lang}.mp3"
        
        if not output_file.exists():
            print("   ⚡ Generating new audio...")
            try:
                # Run async generation in sync context
                asyncio.run(self._generate_audio_file(text, voice, str(output_file)))
            except Exception as e:
                print(f"❌ TTS Generation Error: {e}")
                return
        else:
            print("   ⚡ Cache Hit! Playing existing audio...")

        # 3. Play Audio (using Pygame for stability)
        try:
            pygame.mixer.music.load(str(output_file))
            pygame.mixer.music.play()
            
            # Wait for playback to finish
            while pygame.mixer.music.get_busy():
                pygame.time.Clock().tick(10)
                
        except Exception as e:
            print(f"❌ Playback Error: {e}")

# Test
if __name__ == "__main__":
    tts = TTSEngine()
    
    # Test 1: English Medical
    print("\n--- Test 1: English ---")
    tts.generate_and_play("Your creatinine level is 5.1. This indicates Stage 3 CKD.")
    
    # Test 2: Sinhala Mixed
    print("\n--- Test 2: Sinhala ---")
    tts.generate_and_play("කරුණාකර වතුර වැඩිපුර බොන්න.") 
