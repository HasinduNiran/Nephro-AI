"""
RAG Engine for Nephro-AI
Orchestrates the flow between NLU, VectorDB, Patient Data, and LLM.
"""

import sys
import json
import hashlib
import time
from pathlib import Path
from typing import Dict, Any, List

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from chatbot.enhanced_query_vectordb import EnhancedVectorQuery
from chatbot.patient_data import PatientDataManager
from chatbot.llm_engine import LLMEngine
from chatbot import config
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

    def get_cache_key(self, query, patient_id, target_lang):
        """Generate cache key that includes language to prevent wrong-language cached responses"""
        data_version = self.patient_data.get_last_update_timestamp(patient_id)
        raw_key = f"{patient_id}:{data_version}:{target_lang}:{query.lower().strip()}"
        return hashlib.md5(raw_key.encode()).hexdigest()
    
    def clear_cache_for_patient(self, patient_id: str):
        """Clear all cached responses for a specific patient"""
        keys_to_remove = [k for k in self.cache.keys() if patient_id in str(k)]
        for key in keys_to_remove:
            del self.cache[key]
        Log.step("🗑️", "CACHE CLEARED", f"Removed {len(keys_to_remove)} entries for patient '{patient_id}'")
        return len(keys_to_remove)

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

        # 1. DETERMINE OUTPUT LANGUAGE FIRST (before cache check)
        target_lang = self._detect_output_language(query)
        Log.step("🔍", "Detecting Language", f"Result: {'SINHALA' if target_lang == 'si' else 'ENGLISH'}")

        # 2. CHECK CACHE (now includes language in key)
        cache_key = self.get_cache_key(query, patient_id, target_lang)
        if cache_key in self.cache:
            Log.step("⚡", "CACHE HIT", f"Returning cached {target_lang.upper()} response")
            return self.cache[cache_key]

        # 3. BRIDGE LAYER (Hybrid Smart Route + MedDict Integration)
        # ============================================================
        # NEW ARCHITECTURE:
        # - Step 1: Always extract MedDict hints (fast, local)
        # - Step 2: Try Sinhala NLU with LaBSE (zero-shot, local)
        # - Step 3: If confidence high → Use NLU + MedDict (fast path)
        # - Step 4: If confidence low → Fallback to LLM API (smart path)
        # ============================================================
        english_query = query
        translation_method = "none"  # Track which method was used
        t_translation_start = time.time()
        
        if target_lang == 'si':
            Log.step("🔄", "NLU BRIDGE: Processing Sinhala (Hybrid Mode)...")
            
            # STEP 1: ALWAYS extract dictionary hints (fast operation, ~5ms)
            dict_hints_raw = self.llm._get_dictionary_hints(query)
            if dict_hints_raw:
                Log.step("📖", "MedDict Hit", f"{{ {dict_hints_raw[:80]}{'...' if len(dict_hints_raw) > 80 else ''} }}")
            
            # STEP 2: Try Sinhala NLU with LaBSE (zero-shot intent detection, ~300ms)
            si_analysis = self.llm.sinhala_nlu.analyze_query(query)
            nlu_confidence = si_analysis['confidence']
            nlu_intent = si_analysis['detected_intent']
            
            Log.step("🧠", "Sinhala NLU (LaBSE)", 
                    f"Intent: {nlu_intent} | Confidence: {nlu_confidence:.2%}")
            
            # STEP 3: Decision based on confidence threshold
            if nlu_confidence > 0.6:
                # ============ FAST PATH: NLU + MedDict ============
                translation_method = "sinhala_nlu"
                Log.step("⚡", "FAST PATH", "Using Sinhala NLU + MedDict (no API call)")

                # ── Intent → Natural English Query Templates ─────────────────
                # Maps NLU intent labels to natural question templates.
                # {entities} is replaced with top medical entity terms.
                # This produces coherent ChromaDB search queries instead of
                # the old bag-of-words "ask general health Do I have? / ..." bug.
                INTENT_TEMPLATES = {
                    "ask_diet":           "What foods can I eat or should I avoid for {entities}?",
                    "ask_symptoms":       "What are the symptoms and signs of {entities}?",
                    "ask_medication":     "What medications are used to treat {entities}?",
                    "ask_general_health": "What is the health risk assessment and management for {entities}?",
                    "ask_lab_results":    "What do abnormal {entities} lab values mean for kidney disease?",
                    "ask_lifestyle":      "What lifestyle changes help with {entities}?",
                    "ask_emergency":      "When should a patient with {entities} go to the hospital?",
                    "ask_stage":          "What are the stages and progression of {entities}?",
                }

                # ── Function-word filter: discard non-medical dictionary values ──
                # These are sentence fragments / pronouns from the dict, not medical terms.
                NOISE_VALUES = {
                    "me", "to me", "i want", "i do not want", "i don't want",
                    "have", "there is", "do i have? / is there?",
                    "tell me", "help me", "what is", "is it", "yes", "no",
                    "and", "or", "but", "the", "a", "an", "my", "your",
                    "good", "bad", "okay", "not", "enough",
                }

                # ── Extract clean medical entities from NLU ───────────────────
                nlu_entities = si_analysis.get('entities', {})
                entity_terms = []
                for category, terms in nlu_entities.items():
                    entity_terms.extend(terms)

                # ── Extract clean medical terms from MedDict hints ────────────
                meddict_terms = []
                if dict_hints_raw:
                    for hint in dict_hints_raw.split(','):
                        if '=' in hint:
                            try:
                                parts = hint.strip().split('=')
                                if len(parts) == 2:
                                    en_term = parts[1].strip().strip("'\"")
                                    # Filter out noise values and duplicates
                                    if (en_term
                                            and en_term.lower() not in NOISE_VALUES
                                            and en_term not in meddict_terms
                                            and en_term not in entity_terms):
                                        meddict_terms.append(en_term)
                            except Exception:
                                pass

                # ── Build the natural English search query ────────────────────
                # Combine NLU entities + filtered MedDict terms (deduplicated)
                all_entities = list(dict.fromkeys(entity_terms + meddict_terms[:3]))

                template = INTENT_TEMPLATES.get(nlu_intent)
                if template and all_entities:
                    # Fill template with top 3 entities (e.g. "Kidney disease, eGFR, Risk")
                    entity_str = ", ".join(all_entities[:3])
                    english_query = template.format(entities=entity_str)
                elif all_entities:
                    # No template match: compose a clean natural sentence
                    entity_str = ", ".join(all_entities[:3])
                    english_query = f"kidney disease {entity_str} management and risk assessment"
                else:
                    # Final fallback: use NLU's own translated query (never the intent label)
                    english_query = si_analysis['translated_query']

                Log.step("  ", "Built Query", f"'{english_query}'")
                
            else:
                # ============ SMART PATH: LLM Fallback ============
                translation_method = "llm_api"
                Log.step("🧠", "SMART PATH", f"NLU confidence too low ({nlu_confidence:.2%}), using LLM API...")
                english_query = self.llm.translate_to_english(query, chat_history)
                Log.step("  ", "LLM Translation", f"'{english_query}'")
        
        # Calculate translation time (only for Sinhala queries)
        t_translation_end = time.time()
        translation_time = t_translation_end - t_translation_start if target_lang == 'si' else 0
        if target_lang == 'si':
            Log.step("⏱️", "Translation Time", f"{translation_time:.2f}s ({translation_method})")

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
        _raw_record = self.patient_data.get_patient_record(patient_id)
        patient_context = self.patient_data.get_patient_context_string(patient_id)
        Log.step("👤", "Patient Data", f"Loaded record for '{patient_id}'")
        print(json.dumps(_raw_record, indent=2, default=str))
        print(patient_context)
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
            final_response = self.llm.translate_to_sinhala_fallback(llm_response, user_intent=nlu_intent)
            Log.success(f"Final Output: {final_response[:50]}...")
        else:
            Log.step("ℹ️", "STYLE: Skipped (English Mode)")
        
        # 7. 🆕 URGENCY FLAG SCAN (Angle 4: Empathy & Urgency Router)
        # Scans the ENGLISH LLM response for flagged terms (emergency, nephrotoxin, symptom)
        urgency_flags = []
        if getattr(config, 'NLG_URGENCY_FLAGS_ENABLED', False):
            urgency_flags = self.llm.glossary.get_response_flags(llm_response)
            if urgency_flags:
                flag_names = [f['flag'] for f in urgency_flags]
                Log.step("🚨", f"URGENCY: {len(urgency_flags)} flags detected — {flag_names}")
        
        response_payload = {
            "response": final_response,
            "source_documents": context_documents[:3],
            "source_metadata": source_metadata[:3],
            "nlu_analysis": search_results.get("nlu_analysis", {}),
            "target_lang": target_lang,
            # NEW: Hybrid Smart Route metrics (for thesis/evaluation)
            "translation_method": translation_method if target_lang == 'si' else "none",
            "translation_time": translation_time if target_lang == 'si' else 0,
            # 🆕 Urgency flags for mobile UI styling (Angle 4)
            "urgency_flags": urgency_flags
        }
        
        self.cache[cache_key] = response_payload
        
        return response_payload

if __name__ == "__main__":
    rag = RAGEngine()
    
    print("=" * 70)
    print("🧪 TESTING HYBRID SMART ROUTE + MEDDICT INTEGRATION")
    print("=" * 70)
    
    # Test 1: English (no translation needed)
    print("\n--- Test 1 (English) - No Translation ---")
    result1 = rag.process_query("I want to know about kidney pain")
    print(f"Translation Method: {result1.get('translation_method', 'none')}")
    
    # Test 2: Singlish with clear intent (should use FAST PATH: NLU + MedDict)
    print("\n--- Test 2 (Singlish) - Expected: FAST PATH (NLU + MedDict) ---")
    result2 = rag.process_query("Mata kesel kanna puluwanda?")
    print(f"Translation Method: {result2.get('translation_method')}")
    print(f"Translation Time: {result2.get('translation_time', 0):.3f}s")
    
    # Test 3: Complex Singlish (might use SMART PATH: LLM fallback)
    print("\n--- Test 3 (Complex Singlish) - May use SMART PATH (LLM) ---")
    result3 = rag.process_query("Mage creatinine wadi wela, mokada karanne?")
    print(f"Translation Method: {result3.get('translation_method')}")
    print(f"Translation Time: {result3.get('translation_time', 0):.3f}s")
    
    # Test 4: Pure Sinhala Unicode
    print("\n--- Test 4 (Pure Sinhala) - Testing Unicode handling ---")
    result4 = rag.process_query("මට කෙසල් කන්න පුළුවන්ද?")
    print(f"Translation Method: {result4.get('translation_method')}")
    print(f"Translation Time: {result4.get('translation_time', 0):.3f}s")
    
    print("\n" + "=" * 70)
    print("✅ HYBRID SMART ROUTE TEST COMPLETE")
    print("=" * 70)