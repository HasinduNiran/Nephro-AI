"""
RAG Engine for Nephro-AI
Orchestrates the flow between NLU, VectorDB, Patient Data, and LLM.
"""

import sys
import hashlib
import time
from pathlib import Path
from typing import Dict, Any, List

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from chatbot.enhanced_query_vectordb import EnhancedVectorQuery
from chatbot.patient_data import PatientDataManager
from chatbot.llm_engine import LLMEngine

class RAGEngine:
    def __init__(self):
        """Initialize all components"""
        print("⚙️ Initializing RAG Engine...")
        self.vector_db = EnhancedVectorQuery()
        self.patient_data = PatientDataManager()
        self.llm = LLMEngine()
        self.cache = {} # Simple in-memory cache (Use Redis for production)
        print("✅ RAG Engine Ready")

    def get_cache_key(self, query, patient_id):
        # 1. Get the "Data Version" of the patient
        # This returns a timestamp string like "2023-11-25 14:30:00"
        # If the patient adds a new lab report, this timestamp changes.
        data_version = self.patient_data.get_last_update_timestamp(patient_id)
        
        # 2. Combine Query + PatientID + DataVersion
        # If ANY of these change, the cache is invalidated automatically.
        raw_key = f"{patient_id}:{data_version}:{query.lower().strip()}"
        
        return hashlib.md5(raw_key.encode()).hexdigest()

    def process_query(self, query: str, patient_id: str = "default_patient", chat_history: List[Dict[str, str]] = []) -> Dict[str, Any]:
        """
        Process a user query through the full RAG pipeline
        
        Args:
            query: User's question
            patient_id: ID of the patient (for context)
            
        Returns:
            Dict containing response and metadata
        """
        # 1. CHECK CACHE (The "Real-Time" Secret)
        cache_key = self.get_cache_key(query, patient_id)
        if cache_key in self.cache:
            print(f"⚡ CACHE HIT: Serving instant response for '{query}'")
            return self.cache[cache_key]

        # 2. Retrieve Patient Context
        patient_context = self.patient_data.get_patient_context_string(patient_id)
        
        # 2. Retrieve Medical Knowledge (using NLU-enhanced search)
        # We use the existing query_with_nlu method which handles NLU analysis + ChromaDB search
        t_retrieval_start = time.time()
        search_results = self.vector_db.query_with_nlu(query)
        t_retrieval_end = time.time()
        
        # Extract document text from results
        context_documents = []
        source_metadata = [] # NEW: Capture filenames
        if search_results and 'results' in search_results:
            for item in search_results['results']:
                if item.get('document'):
                    context_documents.append(item['document'])
                if item.get('metadata'):
                    source_metadata.append(item['metadata'])
        
        # 3. Generate Response with LLM
        print("🧠 Generating response with LLM...")
        t_llm_start = time.time()
        llm_response = self.llm.generate_response(
            query=query,
            context_documents=context_documents,
            patient_context=patient_context,
            history=chat_history
        )
        t_llm_end = time.time()
        
        response_payload = {
            "response": llm_response,
            "source_documents": context_documents[:3], # Return top sources for reference
            "source_metadata": source_metadata[:3],    # NEW: Return filenames
            "nlu_analysis": search_results.get("nlu_analysis", {}),
            "timing": {
                "retrieval": t_retrieval_end - t_retrieval_start,
                "llm_generation": t_llm_end - t_llm_start
            }
        }
        
        # 4. SAVE TO CACHE
        self.cache[cache_key] = response_payload
        
        return response_payload

if __name__ == "__main__":
    # Test
    rag = RAGEngine()
    result = rag.process_query("What should I eat for breakfast?")
    print("\n--- RESPONSE ---\n")
    print(result["response"])
