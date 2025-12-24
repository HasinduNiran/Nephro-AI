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
        data_version = self.patient_data.get_last_update_timestamp(patient_id)
        raw_key = f"{patient_id}:{data_version}:{query.lower().strip()}"
        return hashlib.md5(raw_key.encode()).hexdigest()

    def _detect_output_language(self, text: str) -> str:
        """
        Determines the Response Language:
        - 'si' if input has Sinhala chars OR Singlish keywords.
        - 'en' if input has English keywords.
        """
        text_lower = text.lower()

        # 1. CHECK FOR SINHALA UNICODE (Absolute Truth)
        if any('\u0D80' <= char <= '\u0DFF' for char in text):
            return 'si'

        # 2. CHECK FOR ENGLISH KEYWORDS (Substring matching)
        # We check if these roots exist inside the words (e.g., 'kidney' in 'kidneys')
        english_roots = [
            ' i ', ' my ', ' you ', ' the ', ' is ', ' are ', ' am ', # Spaced to avoid partials inside other words
            'pain', 'hurt', 'ache', 'sick', 'doctor', 'hospital',
            'kidney', 'stomach', 'head', 'leg', 'chest', 'breath',
            'vomit', 'nausea', 'dizzy', 'fever', 'swell',
            'what', 'where', 'when', 'how', 'who', 'why',
            'hi', 'hello', 'hey', 'morning', 'evening', 'help'
        ]
        
        # 3. CHECK FOR SINGLISH KEYWORDS
        singlish_roots = [
            'mata', 'mage', 'oyage', 'ape', 'apata',
            'ridenawa', 'kakkuma', 'amaru', 'idimenawa', 'idimuma',
            'bada', 'oluwa', 'papuwa', 'kakula', 'atha',
            'mokakda', 'koheda', 'kawadada', 'kohomada', 'ai',
            'podi', 'loku', 'godak', 'hari', 'tikak',
            'beheth', 'le', 'kanna', 'bonna', 'yanne',
            'nadda', 'nedda', 'ne', 'na', 'ow', 'epa'
        ]

        # Count matches (Robust Substring Check)
        english_score = sum(1 for root in english_roots if root.strip() in text_lower)
        singlish_score = sum(1 for root in singlish_roots if root in text_lower)

        print(f"🔍 Lang Detect: English Score={english_score}, Singlish Score={singlish_score}")

        # LOGIC:
        # If English score is high, it's English (even if "bada" appears in "badass" - unlikely but possible)
        # If Singlish score is strictly higher, it's Sinhala.
        if english_score > 0 and english_score >= singlish_score:
            return 'en'
        
        if singlish_score > 0:
            return 'si'
            
        # Fallback: If no keywords found (e.g., "12345"), default to English
        return 'en'

    def process_query(self, query: str, patient_id: str = "default_patient", chat_history: List[Dict[str, str]] = []) -> Dict[str, Any]:
        """
        Process a user query through the full RAG pipeline
        """
        # 1. CHECK CACHE
        cache_key = self.get_cache_key(query, patient_id)
        if cache_key in self.cache:
            print(f"⚡ CACHE HIT: Serving instant response for '{query}'")
            return self.cache[cache_key]

        # 2. DETERMINE OUTPUT LANGUAGE (Robust Check)
        target_lang = self._detect_output_language(query)
        print(f"🌍 Detected Output Language: {'SINHALA' if target_lang == 'si' else 'ENGLISH'}")

        # 3. BRIDGE LAYER
        english_query = query
        
        # Only translate if we detected Sinhala (Unicode) or Singlish
        if target_lang == 'si':
            print(f"🔄 Bridge: Translating '{query}'...")
            english_query = self.llm.translate_to_english(query, chat_history) 
            print(f"✅ Bridge Output: {english_query}")

        # 4. Retrieve Patient Context & Knowledge
        patient_context = self.patient_data.get_patient_context_string(patient_id)
        
        t_retrieval_start = time.time()
        search_results = self.vector_db.query_with_nlu(english_query)
        t_retrieval_end = time.time()
        
        context_documents = []
        source_metadata = []
        if search_results and 'results' in search_results:
            for item in search_results['results']:
                if item.get('document'):
                    context_documents.append(item['document'])
                if item.get('metadata'):
                    source_metadata.append(item['metadata'])
        
        # 5. Generate Response with LLM (Always in English first)
        print("🧠 Generating response with LLM...")
        t_llm_start = time.time()
        
        llm_response = self.llm.generate_response(
            query=english_query, # Use the English version here!
            context_documents=context_documents,
            patient_context=patient_context,
            history=chat_history 
        )
        t_llm_end = time.time()

        # 6. STYLE LAYER (The Final Decision)
        final_response = llm_response
        
        if target_lang == 'si':
            print(f"⚠️ Style: Translating response to Sinhala...")
            final_response = self.llm.translate_to_sinhala_fallback(llm_response)
            print(f"✅ Style Output: {final_response}")
        else:
            print("ℹ️ Query was English. Skipping Style Layer.")
        
        response_payload = {
            "response": final_response,
            "source_documents": context_documents[:3],
            "source_metadata": source_metadata[:3],
            "nlu_analysis": search_results.get("nlu_analysis", {}),
            "timing": {
                "retrieval": t_retrieval_end - t_retrieval_start,
                "llm_generation": t_llm_end - t_llm_start
            }
        }
        
        # 7. SAVE TO CACHE
        if "Error" not in llm_response and "trouble connecting" not in llm_response:
            self.cache[cache_key] = response_payload
        else:
            print(f"⚠️ Network/LLM error detected. Not caching.")
        
        return response_payload

if __name__ == "__main__":
    rag = RAGEngine()
    # Test English
    print("--- Test 1 (English) ---")
    rag.process_query("I want to know about kidney pain")
    
    # Test Singlish
    print("\n--- Test 2 (Singlish) ---")
    rag.process_query("Mata bada ridenawa")