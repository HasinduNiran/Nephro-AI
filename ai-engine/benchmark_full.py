import time
import sys
import os
import asyncio
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / "src"))

try:
    from chatbot.patient_input import PatientInputHandler
    from chatbot.rag_engine import RAGEngine
    from chatbot.tts_engine import TTSEngine
except ImportError as e:
    print(f"❌ Critical Import Error: {e}")
    print("Make sure you are running this from the project root!")
    sys.exit(1)

# ==========================================
# ⚙️ SETTINGS
# ==========================================
VOICE_EN = "en-US-JennyNeural"
VOICE_SI = "si-LK-SameeraNeural" 
# (Or 'si-LK-ThiliniNeural' depending on your Edge-TTS list)

async def run_benchmark():
    print("\n============================================================")
    print("🚀 NEPHRO-AI: UNIVERSAL LATENCY CHECKER")
    print("============================================================")
    
    # 1. INITIALIZE ENGINES
    print("⚙️  Loading Engines (Cold Start)...")
    try:
        input_handler = PatientInputHandler() # Groq + VAD
        rag_engine = RAGEngine()             # Vector DB + LLM
        tts_engine = TTSEngine()             # Edge TTS
        print("✅ All Engines Ready.")
    except Exception as e:
        print(f"❌ Engine Init Failed: {e}")
        return

    while True:
        print("\n" + "="*50)
        print("🧪 SELECT TEST MODE")
        print("="*50)
        print("1. ⌨️  Text Input  (English/Sinhala)")
        print("2. 🎙️  Voice Input (English/Sinhala)")
        print("q. 🚪 Quit")
        
        choice = input("\n👉 Select (1/2/q): ").strip().lower()
        
        if choice == 'q':
            print("👋 Exiting...")
            break
            
        # Reset Timers
        t_stt = 0.0
        t_rag = 0.0
        t_tts = 0.0
        query_text = ""
        detected_lang = "en" # Default

        # ==========================================
        # PHASE 1: INPUT (STT)
        # ==========================================
        if choice == '1':
            query_text = input("   📝 Enter Text: ").strip()
            # No STT time for text input
            
        elif choice == '2':
            # Use the PatientInputHandler's smart VAD recorder
            audio_path = input_handler.record_audio() 
            
            if not audio_path:
                print("   ❌ Recording failed or silence detected.")
                continue

            print("   ⏳ Transcribing (Groq)...")
            stt_start = time.time()
            
            # Auto-detect language
            query_text = input_handler.transcribe_audio(audio_path)
            
            t_stt = time.time() - stt_start
            print(f"   ✅ STT Output: '{query_text}'")

        else:
            continue

        if not query_text:
            continue

        # Simple Language Detection for TTS Voice Selection
        # (If text contains Sinhala unicode range)
        is_sinhala = any('\u0D80' <= char <= '\u0DFF' for char in query_text)
        detected_lang = "si" if is_sinhala else "en"
        current_voice = VOICE_SI if is_sinhala else VOICE_EN

        # ==========================================
        # PHASE 2: BRAIN (RAG + LLM)
        # ==========================================
        print(f"   🧠 Thinking ({detected_lang})...")
        rag_start = time.time()
        
        # Call RAG Engine (Assuming process_query handles Retrieval + LLM)
        # We pass an empty history [] for independent benchmarks
        try:
            result = rag_engine.process_query(query_text, patient_id="bench_user", chat_history=[])
            response_text = result["response"]
        except Exception as e:
            print(f"   ❌ Brain Error: {e}")
            response_text = "Error in brain processing."
            
        t_rag = time.time() - rag_start
        print(f"   ✅ Response: {response_text[:60]}...")

        # ==========================================
        # PHASE 3: OUTPUT (TTS)
        # ==========================================
        print(f"   🔊 Generating Audio ({current_voice})...")
        tts_start = time.time()
        
        output_file = Path("benchmark_output.mp3")
        try:
            await tts_engine._generate_audio_file(response_text, current_voice, str(output_file))
        except Exception as e:
            print(f"   ❌ TTS Error: {e}")
            
        t_tts = time.time() - tts_start

        # ==========================================
        # 📊 FINAL REPORT
        # ==========================================
        total_time = t_stt + t_rag + t_tts
        
        print("\n" + "-"*40)
        print(f"⏱️  LATENCY BREAKDOWN ({detected_lang.upper()})")
        print("-"*-40)
        if choice == '2':
            print(f"1. Input (STT):      {t_stt:.4f}s  (Groq Cloud)")
        else:
            print(f"1. Input (Text):     0.0000s")
            
        print(f"2. Brain (RAG+LLM):  {t_rag:.4f}s")
        print(f"3. Output (TTS):     {t_tts:.4f}s")
        print("-"*-40)
        print(f"🏆 TOTAL LATENCY:    {total_time:.4f}s")
        print("="*50)

if __name__ == "__main__":
    asyncio.run(run_benchmark())
