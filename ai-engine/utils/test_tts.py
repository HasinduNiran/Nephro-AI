import sys
from pathlib import Path

# Add parent directory and scripts directory to path
sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).parent / "scripts"))

from scripts.tts_engine import TTSEngine

def test_tts():
    print("🧪 Testing TTS Engine...")
    
    try:
        # Initialize Engine
        tts = TTSEngine()
        
        # Test Text
        text = "Hello! The text-to-speech system has been updated to the new model."
        print(f"\n🗣️ Speaking: '{text}'")
        
        # Generate and Play
        tts.generate_and_play(text)
        
        print("\n✅ TTS Verification SUCCESS (if you heard audio)")
            
    except Exception as e:
        print(f"\n❌ Test Failed with Error: {e}")

if __name__ == "__main__":
    test_tts()
