import sys
from pathlib import Path
import shutil
import os

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

def verify_fix():
    print("🔍 Verifying FFmpeg Fix...")
    
    # Import the patched module
    # This should trigger the code that adds ffmpeg to PATH
    try:
        import scripts.patient_input
        print("   ✅ Imported scripts.patient_input")
    except ImportError as e:
        print(f"   ❌ Import failed: {e}")
        return

    # Check if ffmpeg is now found
    ffmpeg_path = shutil.which("ffmpeg")
    if ffmpeg_path:
        print(f"   ✅ FFmpeg found at: {ffmpeg_path}")
        print("   🎉 Fix successful!")
    else:
        print("   ❌ FFmpeg still NOT found in PATH")
        print(f"   Current PATH: {os.environ['PATH']}")

if __name__ == "__main__":
    verify_fix()
