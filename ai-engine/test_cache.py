
import sys
import os
import time
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(os.getcwd()) / "src"))

from chatbot.rag_engine import RAGEngine

def test_cache():
    print("=" * 70)
    print("⚡ TESTING SEMANTIC CACHE")
    print("=" * 70)
    
    rag = RAGEngine()
    
    query = "What is CKD?"
    
    print(f"\n1️⃣  First Query: '{query}' (Should hit DB/LLM)")
    start_time = time.time()
    rag.process_query(query)
    end_time = time.time()
    print(f"   ⏱️  Time taken: {end_time - start_time:.4f}s")
    
    print(f"\n2️⃣  Second Query: '{query}' (Should hit CACHE)")
    start_time = time.time()
    rag.process_query(query)
    end_time = time.time()
    print(f"   ⏱️  Time taken: {end_time - start_time:.4f}s")
    
    print(f"\n3️⃣  Variation Query: 'what is ckd ' (Should hit CACHE due to normalization)")
    start_time = time.time()
    rag.process_query(query)
    end_time = time.time()
    print(f"   ⏱️  Time taken: {end_time - start_time:.4f}s")

if __name__ == "__main__":
    test_cache()
