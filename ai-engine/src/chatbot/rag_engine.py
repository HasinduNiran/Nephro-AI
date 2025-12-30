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
        print("\n" + "="*50)
        print(f"🚀 PROCESSING QUERY: '{query}'")
        print("="*50)

        # 1. CHECK CACHE
        cache_key = self.get_cache_key(query, patient_id)
        if cache_key in self.cache:
            print(f"⚡ CACHE HIT")
            return self.cache[cache_key]

        # 2. DETERMINE OUTPUT LANGUAGE
        target_lang = self._detect_output_language(query)
        print(f"🌍 LANGUAGE DETECTED: {'SINHALA' if target_lang == 'si' else 'ENGLISH'}")

        # 3. BRIDGE LAYER (Translation)
        english_query = query
        if target_lang == 'si':
            print(f"🔄 BRIDGE: Translating Input...")
            english_query = self.llm.translate_to_english(query, chat_history) 
            print(f"   ↳ Result: '{english_query}'")

        # 4. RAG RETRIEVAL
        print(f"📡 RAG: Searching Knowledge Base...")
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
        
        print(f"   ↳ Found {len(context_documents)} documents ({t_retrieval_end - t_retrieval_start:.2f}s)")

        # 5. RETRIEVE PATIENT DATA (WITH NEW LOGS)
        # -----------------------------------------------------------------
        patient_context = self.patient_data.get_patient_context_string(patient_id)
        print(f"👤 PATIENT DATA: Loaded record for '{patient_id}'")
        # Print a short preview of the medical data to confirm it's correct
        preview = patient_context.replace('\n', ' ')[:100] 
        print(f"   ↳ Context Preview: {preview}...")
        # -----------------------------------------------------------------

        # 6. GENERATE RESPONSE (Brain Layer)
        print("🧠 BRAIN: Generating Medical Response...")
        t_llm_start = time.time()
        
        llm_response = self.llm.generate_response(
            query=english_query, 
            context_documents=context_documents,
            patient_context=patient_context,
            history=chat_history 
        )
        t_llm_end = time.time()
        print(f"   ↳ Generated ({t_llm_end - t_llm_start:.2f}s): {llm_response[:50]}...")

        # 6. STYLE LAYER (Translation Back)
        final_response = llm_response
        
        if target_lang == 'si':
            print(f"🎨 STYLE: Translating Output to Sinhala...")
            final_response = self.llm.translate_to_sinhala_fallback(llm_response)
            # LOG THE RESULT TO CATCH GIBBERISH
            print(f"   ↳ Final Sinhala: {final_response[:100]}...") 
        else:
            print("ℹ️ STYLE: Skipped (English Mode)")
        
        response_payload = {
            "response": final_response,
            "source_documents": context_documents[:3],
            "source_metadata": source_metadata[:3],
            "nlu_analysis": search_results.get("nlu_analysis", {}),
            "target_lang": target_lang # <--- PASS THIS TO SERVER.PY FOR TTS
        }
        
        self.cache[cache_key] = response_payload
        print("="*50 + "\n")
        
        return response_payload

if __name__ == "__main__":
    rag = RAGEngine()
    # Test English
    print("--- Test 1 (English) ---")
    rag.process_query("I want to know about kidney pain")
    
    # Test Singlish
    print("\n--- Test 2 (Singlish) ---")
    rag.process_query("Mata bada ridenawa")