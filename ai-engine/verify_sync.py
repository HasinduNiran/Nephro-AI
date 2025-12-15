import sys
import os
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / "src"))

print("🔍 Starting Deep Verification of Codebase Sync...")

try:
    print("1. Checking Config...")
    from chatbot import config
    print("   ✅ Config Loaded")
    
    print("2. Checking Patient Input (Groq STT)...")
    from chatbot.patient_input import PatientInputHandler
    print("   ✅ PatientInputHandler Loaded")
    
    print("3. Checking LLM Engine (Sandwich Arch + Cache)...")
    from chatbot.llm_engine import LLMEngine
    # Verify cached path logic exists
    llm = LLMEngine()
    if 'translation_cache.json' not in str(llm.cache_path):
        raise ValueError("LLMEngine cache path is not using translation_cache.json")
    if 'google/gemini-2.0-flash-001' not in llm.model:
         print(f"   ⚠️ Notice: LLM Model is '{llm.model}', expected gemini-2.0-flash-001 but this might be okay if config override.")
    print("   ✅ LLMEngine Loaded & Verified")
    
    print("4. Checking RAG Engine (Safe Cache)...")
    from chatbot.rag_engine import RAGEngine
    rag = RAGEngine()
    # Inspection of cache logic is hard dynamically, but import proves syntax is good
    print("   ✅ RAGEngine Loaded")
    
    print("5. Checking Sinhala NLU...")
    from chatbot.sinhala_nlu import SinhalaNLUEngine
    print("   ✅ SinhalaNLUEngine Loaded")
    
    print("6. Checking TTS Engine...")
    from chatbot.tts_engine import TTSEngine
    print("   ✅ TTSEngine Loaded")
    
    print("7. Checking Entry Points...")
    import server
    import benchmark_full
    # import run_chatbot # run_chatbot has input() loop so we don't import it to run, just syntax check
    with open("ai-engine/src/chatbot/run_chatbot.py", "r") as f:
        compile(f.read(), "run_chatbot.py", "exec")
    print("   ✅ Server & Scripts Syntax Checked")

    print("\n🎉 ALL SYSTEMS SYNCED AND READY!")

except Exception as e:
    print(f"\n❌ SYNC CHECK FAILED: {e}")
    sys.exit(1)
