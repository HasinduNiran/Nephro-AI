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
from utils.logger import ConsoleLogger as Log

class RAGEngine:
    def __init__(self):
        """Initialize all components"""
        Log.section("Initializing RAGEngine")
        self.vector_db = EnhancedVectorQuery()
        self.patient_data = PatientDataManager()
        self.llm = LLMEngine()
        self.cache = {} # Simple in-memory cache (Use Redis for production)
        Log.success("RAG Engine Ready")

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
        text_lower = f" {text.lower()} " # Pad text for safer matching

        # 1. CHECK FOR SINHALA UNICODE (Absolute Truth)
        if any('\u0D80' <= char <= '\u0DFF' for char in text):
            return 'si'

        # 2. CHECK FOR ENGLISH KEYWORDS
        # Added 'make', 'do', 'can' to cover more ground
        english_roots = [
            ' i ', ' my ', ' you ', ' the ', ' is ', ' are ', ' am ', 
            ' pain', ' hurt', ' ache', ' sick', ' doctor', ' hospital',
            ' kidney', ' stomach', ' head', ' leg', ' chest', ' breath',
            ' vomit', ' nausea', ' dizzy', ' fever', ' swell',
            ' what', ' where', ' when', ' how ', ' who', ' why',
            ' hi ', ' hello', ' hey', ' morning', ' evening', ' help',
            ' make ', ' do ', ' can ', ' to ', ' for '
        ]
        
        # 3. CHECK FOR SINGLISH KEYWORDS (FIXED: Padded short words)
        singlish_roots = [
            'mata', 'mage', 'oyage', 'ape', 'apata',
            'ridenawa', 'kakkuma', 'amaru', 'idimenawa', 'idimuma',
            'bada', 'oluwa', 'papuwa', 'kakula', 'atha',
            'mokakda', 'koheda', 'kawadada', 'kohomada',
            'podi', 'loku', 'godak', 'hari', 'tikak',
            'beheth', 'kanna', 'bonna', 'yanne', 'epaa',
            # ⚠️ DANGEROUS SHORT WORDS (Now Padded with spaces)
            ' ai ', ' ne ', ' na ', ' ow ', ' le ', ' ane '
        ]

        # Count matches
        english_score = sum(1 for root in english_roots if root in text_lower)
        singlish_score = sum(1 for root in singlish_roots if root in text_lower)

        print(f"🔍 Lang Detect: English Score={english_score}, Singlish Score={singlish_score}")

        # LOGIC:
        if english_score > 0 and english_score >= singlish_score:
            return 'en'
        
        if singlish_score > 0:
            return 'si'
            
        return 'en'

    def process_query(self, query: str, patient_id: str = "default_patient", chat_history: List[Dict[str, str]] = []) -> Dict[str, Any]:
        Log.section(f"PROCESSING QUERY: '{query}'")

        # 1. CHECK CACHE
        cache_key = self.get_cache_key(query, patient_id)
        if cache_key in self.cache:
            Log.step("⚡", "CACHE HIT", "Returning cached response")
            return self.cache[cache_key]

        # 2. DETERMINE OUTPUT LANGUAGE
        target_lang = self._detect_output_language(query)
        Log.step("🔍", "Detecting Language", f"Result: {'SINHALA' if target_lang == 'si' else 'ENGLISH'}")

        # 3. BRIDGE LAYER (Translation)
        english_query = query
        if target_lang == 'si':
            Log.step("🔄", "NLU BRIDGE: Translating Input...")
            english_query = self.llm.translate_to_english(query, chat_history) 
            Log.step("  ", "Translation Result", f"'{english_query}'")

        # 3.5 [NEW] CONTEXT REWRITER
        # Rewrite query to be standalone (e.g. "it" -> "kidney disease")
        search_query = english_query
        if chat_history:
             # Log handled inside the method, but we can add a high level step here
             pass
             
        search_query = self.llm.contextualize_query(english_query, chat_history)

        # 4. RAG RETRIEVAL (Use REWRITTEN query)
        Log.step("📡", "RAG: Searching Vector DB", f"Query: '{search_query}'")
        t_retrieval_start = time.time()
        search_results = self.vector_db.query_with_nlu(search_query) # <--- Use Search Query
        t_retrieval_end = time.time()
        
        if search_results and 'results' in search_results:
             count = len(search_results['results'])
             Log.step("📥", "DB Retrieval", f"Found {count} candidates")
             for idx, res in enumerate(search_results['results']):
                 doc_id = res.get('metadata', {}).get('source', 'Unknown')
                 score = res.get('score', 0)
                 # print(f"      [{idx+1}] {doc_id} (Score: {score:.4f})") 
        else:
             Log.warning("DB Retrieval: No chunks found")
        
        context_documents = []
        source_metadata = []
        if search_results and 'results' in search_results:
            for item in search_results['results']:
                if item.get('document'):
                    context_documents.append(item['document'])
                if item.get('metadata'):
                    source_metadata.append(item['metadata'])
        
        # 5. RETRIEVE PATIENT DATA (WITH NEW LOGS)
        # -----------------------------------------------------------------
        patient_context = self.patient_data.get_patient_context_string(patient_id)
        Log.step("👤", "Patient Data", f"Loaded record for '{patient_id}'")
        # -----------------------------------------------------------------

        # 6. GENERATE RESPONSE (Brain Layer)
        Log.step("🧠", "BRAIN: Reasoning...")
        t_llm_start = time.time()
        
        llm_response = self.llm.generate_response(
            query=english_query, 
            context_documents=context_documents,
            patient_context=patient_context,
            history=chat_history 
        )
        t_llm_end = time.time()
        Log.step("  ", "Generated Response", f"({t_llm_end - t_llm_start:.2f}s) {llm_response[:50]}...")

        # 6. STYLE LAYER (Translation Back)
        final_response = llm_response
        
        if target_lang == 'si':
            Log.step("🎨", "STYLE: Sinhala Localization...")
            final_response = self.llm.translate_to_sinhala_fallback(llm_response)
            Log.success(f"Final Output: {final_response[:50]}...")
        else:
            Log.step("ℹ️", "STYLE: Skipped (English Mode)")
        
        response_payload = {
            "response": final_response,
            "source_documents": context_documents[:3],
            "source_metadata": source_metadata[:3],
            "nlu_analysis": search_results.get("nlu_analysis", {}),
            "target_lang": target_lang # <--- PASS THIS TO SERVER.PY FOR TTS
        }
        
        self.cache[cache_key] = response_payload
        
        return response_payload

if __name__ == "__main__":
    rag = RAGEngine()
    # Test English
    print("--- Test 1 (English) ---")
    rag.process_query("I want to know about kidney pain")
    
    # Test Singlish
    print("\n--- Test 2 (Singlish) ---")
    rag.process_query("Mata bada ridenawa")