
import time
import sys
import asyncio
import hashlib
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / "src"))

from chatbot.patient_input import PatientInputHandler
from chatbot.rag_engine import RAGEngine
from chatbot.tts_engine import TTSEngine

def benchmark_system(auto_mode=False, test_file="test_audio.wav"):
    print("="*60)
    print("🚀 NEPHRO-AI PRECISION BENCHMARK")
    print("="*60)
    
    # 1. Warm-up / Init
    print("Initializing Engines...")
    t_init_start = time.time()
    stt = PatientInputHandler(model_size="small")
    rag = RAGEngine()
    tts = TTSEngine()
    print(f"✅ Init Time: {time.time() - t_init_start:.4f}s")
    
    print("🔥 Warming up RAG & LLM (Cold Start)...")
    try:
        # Dummy query to load models into memory
        rag.process_query("warmup")
    except Exception as e:
        print(f"⚠️ Warmup failed: {e}")
    print("✅ Warmup Complete")

    while True:
        if not auto_mode:
            print("\n" + "-"*60)
            input("Press Enter to Record (or Ctrl+C to quit)...")
            print("🎙️  Recording...")
            audio_path = stt.record_audio()
        else:
            print(f"\n📂 Using Test File: {test_file}")
            audio_path = test_file
            if not Path(audio_path).exists():
                print("❌ Test file not found!")
                break

        if not audio_path: continue

        print("⚡ Starting Pipeline...")
        t_pipeline_start = time.time()

        # --- STEP 1: STT ---
        t_stt_start = time.time()
        text = stt.transcribe_audio(audio_path)
        t_stt_end = time.time()
        
        print(f"📝 STT Output: '{text}'")
        
        # CHECK IF EMPTY (New Check)
        if not text:
            print("🔄 Input ignored (Silence or Wrong Language). Resetting...")
            continue  # Skip to next loop iteration

        # --- STEP 2: RAG ---
        # Note: We now have granular timing in rag_engine.py
        result = rag.process_query(text)
        response_text = result["response"]
        
        # Extract timings if available, else derive total
        rag_timing = result.get("timing", {})
        retrieval_lat = rag_timing.get("retrieval", 0)
        llm_lat = rag_timing.get("llm_generation", 0)
        
        # If granular timing is missing (fallback), calculate RAG total as proxy
        # But since we updated rag_engine.py, it should be there.

        # --- STEP 3: TTS (GENERATION ONLY) ---
        # Crucial Fix: Measure GENERATION time, not PLAYBACK time
        t_tts_start = time.time()
        
        # We manually generate the file hash path to test generation
        is_sinhala = any('\u0D80' <= char <= '\u0DFF' for char in response_text)
        voice = tts.voice_si if is_sinhala else tts.voice_en
        file_hash = hashlib.md5(f"{response_text}{voice}".encode()).hexdigest()
        output_path = tts.cache_dir / f"{file_hash}_bench.mp3"
        
        # Force generation (bypass cache check if you want true stress test)
        # Calling the internal async method to measure pure latency
        asyncio.run(tts._generate_audio_file(response_text, voice, str(output_path)))
        
        t_tts_end = time.time()
        
        # --- REPORT ---
        stt_lat = t_stt_end - t_stt_start
        tts_lat = t_tts_end - t_tts_start # This is now pure generation time
        
        # Total latency is mostly sum of parts (excluding python glue overhead)
        # But we measure wall clock time for the whole pipeline too
        total_lat = time.time() - t_pipeline_start

        print("\n📊 LATENCY BREAKDOWN (Seconds)")
        print(f"1. STT (Whisper):       {stt_lat:.4f}s")
        print(f"2. RAG Breakdown:")
        print(f"   - Retrieval:         {retrieval_lat:.4f}s")
        print(f"   - LLM Generation:    {llm_lat:.4f}s")
        print(f"3. TTS (Generation):    {tts_lat:.4f}s  <-- True Latency (No Playback)")
        print("-" * 30)
        print(f"TOTAL SYSTEM LATENCY:   {total_lat:.4f}s")
        print("="*60)
        
        # Optional: Play it afterwards so you know what it said
        if not auto_mode:
            print("🔊 Playing Audio...")
            tts.generate_and_play(response_text)

if __name__ == "__main__":
    # Check for arguments
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--auto", action="store_true", help="Run in auto mode with test file")
    parser.add_argument("--file", type=str, default="test_audio.wav", help="Path to test audio file")
    args = parser.parse_args()
    
    benchmark_system(auto_mode=args.auto, test_file=args.file)
