
import sys
import os
import time
import asyncio
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(os.getcwd()) / "src"))

from chatbot.rag_engine import RAGEngine
from chatbot.tts_engine import TTSEngine

def print_header(title):
    print("\n" + "=" * 80)
    print(f"🧪 QA TEST: {title}")
    print("=" * 80)

def print_metric(name, value, unit="s", threshold=None):
    status = ""
    if threshold:
        if value <= threshold:
            status = "✅ PASS"
        else:
            status = "⚠️ SLOW"
    print(f"   📊 {name}: {value:.4f}{unit} {status}")

def run_test():
    print_header("INITIALIZING SYSTEM")
    start_init = time.time()
    rag = RAGEngine()
    tts = TTSEngine()
    end_init = time.time()
    print_metric("System Startup Time", end_init - start_init, threshold=10.0)

    # --- TEST CASE 1: ENGLISH MEDICAL QUERY ---
    print_header("CASE 1: ENGLISH MEDICAL QUERY (Cold Start)")
    query_en = "What is my eGFR and what does it mean?"
    print(f"📝 Query: '{query_en}'")
    
    # 1. RAG Latency
    start_rag = time.time()
    result_en = rag.process_query(query_en)
    end_rag = time.time()
    rag_latency = end_rag - start_rag
    print_metric("RAG Processing Time", rag_latency, threshold=10.0)
    
    # Verify NLU
    intent = max(result_en['nlu_analysis']['intent'].items(), key=lambda x: x[1])[0]
    print(f"   🧠 Detected Intent: {intent}")
    
    # 2. TTS Latency
    response_text_en = result_en['response']
    print(f"   🗣️ Response (First 50 chars): {response_text_en[:50]}...")
    
    start_tts = time.time()
    # We won't play audio to save time, just generate
    # But generate_and_play does both. For QA script we might want to just check generation speed.
    # We'll use the public method which plays, but that's fine for a real test.
    # To avoid blocking too long, we can mock the play or just accept it plays.
    # Let's just run it, user can hear it.
    tts.generate_and_play(response_text_en[:100]) # Speak first 100 chars only for speed
    end_tts = time.time()
    print_metric("TTS Generation + Playback", end_tts - start_tts)

    # --- TEST CASE 2: SINHALA QUERY (Hybrid NLU + Edge-TTS) ---
    print_header("CASE 2: SINHALA QUERY (Hybrid NLU)")
    query_si = "Mata mahansiyi" # I am tired
    print(f"📝 Query: '{query_si}'")
    
    start_rag = time.time()
    result_si = rag.process_query(query_si)
    end_rag = time.time()
    print_metric("RAG Processing Time", end_rag - start_rag, threshold=10.0)
    
    # Verify NLU (Should be LaBSE)
    intent = max(result_si['nlu_analysis']['intent'].items(), key=lambda x: x[1])[0]
    print(f"   🧠 Detected Intent: {intent} (Expected: ask_symptom)")
    if intent == "ask_symptom":
        print("   ✅ NLU Routing: PASS")
    else:
        print("   ❌ NLU Routing: FAIL")

    # TTS (Sinhala)
    response_text_si = "ඔබට මහන්සියක් දැනෙනවා නම්, කරුණාකර විවේක ගන්න." # Mock response for TTS test if LLM is English
    # Note: The LLM might return English. For this test, let's see what it returns.
    # If LLM returns English, TTS will use English voice.
    # To test Sinhala TTS, we force a Sinhala string if the response is English (since we haven't prompted LLM to speak Sinhala yet).
    # But let's just test the TTS engine with a hardcoded Sinhala string to verify the ENGINE works.
    print(f"   🗣️ Testing Sinhala Voice with: '{response_text_si}'")
    start_tts = time.time()
    tts.generate_and_play(response_text_si)
    end_tts = time.time()
    print_metric("Sinhala TTS Latency", end_tts - start_tts)

    # --- TEST CASE 3: CACHE PERFORMANCE ---
    print_header("CASE 3: CACHE PERFORMANCE (Repeated English Query)")
    print(f"📝 Query: '{query_en}'")
    
    start_rag = time.time()
    result_cache = rag.process_query(query_en)
    end_rag = time.time()
    print_metric("Cached RAG Time", end_rag - start_rag, threshold=0.1)
    
    if end_rag - start_rag < 0.1:
        print("   ✅ RAG Cache: PASS")
    else:
        print("   ❌ RAG Cache: FAIL")
        
    # TTS Cache
    print("   🗣️ Testing TTS Cache...")
    start_tts = time.time()
    tts.generate_and_play(response_text_en[:100])
    end_tts = time.time()
    print_metric("Cached TTS Latency", end_tts - start_tts)

    # --- TEST CASE 4: CONTEXT SAFETY (Data Update) ---
    print_header("CASE 4: CONTEXT SAFETY (Patient Data Update)")
    print("🔄 Updating Patient Lab Results...")
    rag.patient_data.mock_db["default_patient"]["last_updated"] = "2025-12-31"
    
    print(f"📝 Query: '{query_en}'")
    start_rag = time.time()
    result_update = rag.process_query(query_en)
    end_rag = time.time()
    print_metric("Post-Update RAG Time", end_rag - start_rag)
    
    if end_rag - start_rag > 1.0:
        print("   ✅ Cache Invalidation: PASS (System re-processed query)")
    else:
        print("   ❌ Cache Invalidation: FAIL (System served stale cache)")

if __name__ == "__main__":
    run_test()
