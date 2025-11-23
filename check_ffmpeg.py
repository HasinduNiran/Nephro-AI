import shutil
import os
import subprocess

def check_ffmpeg():
    print("🔍 Checking FFmpeg availability...")
    
    # Check via shutil
    ffmpeg_path = shutil.which("ffmpeg")
    print(f"   shutil.which('ffmpeg'): {ffmpeg_path}")
    
    # Check environment PATH
    print(f"\n   PATH environment variable:")
    for p in os.environ["PATH"].split(os.pathsep):
        if "ffmpeg" in p.lower():
            print(f"     - {p}")
            
    # Try running it
    try:
        result = subprocess.run(["ffmpeg", "-version"], capture_output=True, text=True)
        print("\n   ✅ FFmpeg execution successful:")
        print(f"     {result.stdout.splitlines()[0]}")
    except FileNotFoundError:
        print("\n   ❌ FFmpeg execution failed: FileNotFoundError (Command not found)")
    except Exception as e:
        print(f"\n   ❌ FFmpeg execution failed: {e}")

if __name__ == "__main__":
    check_ffmpeg()
