"""
LLM Engine for Nephro-AI
Handles communication with OpenRouter/OpenAI API to generate responses.
Implements the 'Sandwich Architecture' for Low-Resource Languages.
"""

import sys
import json
import requests
from pathlib import Path
from typing import List, Dict, Any

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from chatbot import config
from chatbot.sinhala_nlu import SinhalaNLUEngine

class LLMEngine:
    def __init__(self):
        """Initialize LLM Engine with config"""
        self.api_key = config.OPENROUTER_API_KEY
        self.api_url = "https://openrouter.ai/api/v1/chat/completions"
        
        # RESEARCH NOTE: 'flash' models are critical for the <2s latency requirement
        self.model = "openai/gpt-4o-mini" 
        # If you want to test the heavy model, use: "openai/gpt-4o" 
        
        # Initialize Sinhala NLU
        self.sinhala_nlu = SinhalaNLUEngine()
        
        if not self.api_key:
            print("⚠️ Warning: OPENROUTER_API_KEY not found in config.")
            
        # Cache Setup
        self.cache_path = config.DATA_DIR / "translation_cache.json"
        self.translation_cache = self._load_translations()
        
        # Default terms
        if not self.translation_cache:
            self.translation_cache = {
                "වකුගඩු රෝගය": "Kidney Disease",
                "ක්‍රියැටිනින්": "Creatinine",
                "mage": "my",
                "kanna": "eat"
            }
            self._save_translations()

    def _load_translations(self) -> Dict[str, str]:
        if self.cache_path.exists():
            try:
                with open(self.cache_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception: pass
        return {}

    def _save_translations(self):
        try:
            with open(self.cache_path, "w", encoding="utf-8") as f:
                json.dump(self.translation_cache, f, ensure_ascii=False, indent=2)
        except Exception: pass

    def _is_sinhala_or_singlish(self, text: str) -> bool:
        """
        Detects if text is Sinhala (Unicode) OR Singlish.
        UPDATED: Uses substring matching to handle concatenated STT outputs.
        """
        # 1. Unicode Check (Standard Sinhala)
        if any('\u0D80' <= char <= '\u0DFF' for char in text):
            return True
            
        # 2. Singlish Keyword Check (Expanded for Medical/CKD Context)
        singlish_keywords = [
            # --- Pronouns & Question Words ---
            "mage", "mata", "mam", "mama", "api", "ape", "oyage", "oya",
            "mokakda", "monawada", "kohomada", "kawadada", "koheda", "ai", 
            "kawuda", "neda", "ane", "puluwan", "puluwanda", "ba", "bane",
            
            # --- Body Parts (Anatomy) ---
            "wakkugadu", "wakugadu", "kidney", # Kidney
            "kakul", "kakula", "kakuldke", "dath", "atha", "ath", # Legs/Hands
            "oluwa", "his", "hisa", # Head
            "bada", "papuwa", "pappuwa", # Stomach/Chest
            "muthra", "mutra", "chu", "choo", # Urine (Critical for CKD)
            " le ", "lee", "blood", # Blood (Padded ' le ' to avoid matching 'apple')
            "angili", "angilla", # Fingers
            "hama", "skin", # Skin
            
            # --- Symptoms & Feelings ---
            "ridenawa", "redena", "kakkumai", "kakkuma", # Pain
            "idimila", "edimila", "idimuma", "idimenne", "dimenne", # Swelling (Edema)
            "mahansiyi", "mahansi", "weda", # Tiredness/Fatigue
            "karakillai", "karakilla", # Dizziness
            "wamaney", "wamane", "okkara", # Vomiting/Nausea
            "kessai", "kessa", # Cough
            "una", "heat", "rasnei", # Fever/Heat
            "dawillai", "davilla", # Burning sensation
            "amaru", "amarui", # Difficult/Painful
            "bayayi", "baya", # Scared
            "nidimathai", "ninda", # Sleepy
            
            # --- Food & Diet (Critical for CKD) ---
            "kanna", "kana", "kema", "kaama", "kam", # Eat/Food
            "bonna", "bila", "beela", # Drink
            "wathura", "watura", "water", # Water
            "lunu", "salt", # Salt
            "seeni", "sugar", # Sugar
            "thel", "tel", # Oil
            "bath", "bat", "rice", # Rice
            "parippu", "dhal", # Lentils
            "elawalu", "elavalu", # Vegetables
            "palathuru", "palaturu", "fruit", # Fruits
            "mas", "malu", "biththara", "bittara", # Meat/Fish/Eggs
            "kiri", "tea", # Milk/Tea
            "koththamalli", "thambili", # Herbal/King Coconut
            # Specific Fruits/Veg common in queries:
            "kesel", "kehel", "banana",
            "amba", "aba", "mango",
            "papol", "papaya",
            "del", "kos", "jackfruit",
            
            # --- Medical Actions & Terms ---
            "beheth", "behet", "pethi", "peti", # Medicine/Pills
            "injection", "vidda", 
            "check", "pariksha", "test", "report", # Tests
            "doctar", "dosthara", "nurse", # Staff
            "nawaththanna", "nawathanna", # Stop
            "ganna", "gaththa", # Take/Took
            "adui", "wadi", "godak", "tika", # Low/High/Lot/Little
            "pressure", "presha", "bp", # Blood Pressure
            "sugar", "sini", "diabetic", # Diabetes
            "clinic", "hospital", "issaraha", # Locations
            "pramanaya", "kochchara", "koccara", # Quantity
            "nedde", "nadda", # Negative questions
            "etokota", "ethakota" # Then/So
        ]
        
        text_lower = text.lower()
        
        # FIX: Check if keyword is INSIDE the text, not just an exact split
        for keyword in singlish_keywords:
            if keyword in text_lower:
                return True
                
        return False

    def translate_to_english(self, text: str, chat_history: List[Dict] = []) -> str:
        """
        Translates Sinhala to English with CONTEXT AWARENESS.
        """
        # 1. Get Context (What did the Doctor ask last?)
        context_str = "No previous context."
        if chat_history:
            # Get the last message from the Assistant (Doctor)
            last_doctor_msg = next((msg['content'] for msg in reversed(chat_history) if msg['role'] == 'assistant'), None)
            if last_doctor_msg:
                context_str = f"Doctor previously asked: '{last_doctor_msg}'"

        # 2. UPDATED DICTIONARY
        dictionary = """
        MANDATORY DICTIONARY:
        # --- Multi-Word Medical Terms (High Priority) ---
        - Wakugadu amaru / Wakkugadu amaru -> Kidney disease / Kidney trouble
        - Bada amaru /Bade amaru/ bada ridenawa -> Stomach ache
        - Papuwe amaru -> Chest pain / Heart trouble
        
        # --- Severity / Adjectives ---
        - Podi / Poddak / Tikak / chuttak/ chuti/ chooti -> Mild / Slight / A little bit
        - Godak /loku -> Severe / Very
        
        # --- Symptoms ---
        - Kakkumai / Kakkuma -> Pain
        - Ridenawa -> Pain / Hurts
        - Amaru -> Difficulty / Trouble / Disease (Depends on context)
        - Idimenne / Idimuma -> Swelling
        - Hathiya -> Difficulty breathing
        
        # --- Context ---
        - Thiyanwada / Thiyenawada -> Do I have? / Is there?
        - Mata -> I / To me
        """

        system_instruction = (
            "You are a medical translator. \n"
            f"CONTEXT: {context_str}\n" 
            f"{dictionary}\n"
            "RULES:\n"
            "1. **COMPOUND WORDS FIRST**: Check for 2-word phrases like 'Wakugadu amaru' BEFORE translating individual words.\n"
            "2. 'Wakugadu amaru' implies 'Kidney Disease', NOT just 'Kidney pain'.\n"
            "3. Output ONLY the English translation."
        )

        try:
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "HTTP-Referer": "https://github.com/Nephro-AI",
                "Content-Type": "application/json"
            }
            payload = {
                "model": "openai/gpt-4o-mini",
                "messages": [
                    {"role": "system", "content": system_instruction},
                    {"role": "user", "content": text}
                ],
                "temperature": 0.0
            }
            response = requests.post(self.api_url, headers=headers, data=json.dumps(payload), timeout=10)
            return response.json()['choices'][0]['message']['content'].strip()
            
        except Exception as e:
            print(f"❌ Bridge Error: {e}")
            return text

    def enforce_spoken_sinhala(self, text: str) -> str:
        """
        [SAFETY NET] Fixes vocabulary and script mixing issues.
        """
        replacements = {
            # 1. Fix "Current Profile" (Pathikada -> Warthamana Thathwaya)
            "පැතිකඩ": "වර්තමාන තත්ත්වය",
            "වත්මන් පැතිකඩ": "වර්තමාන තත්ත්වය",

            # 2. Fix CKD (English Phonetic -> Sinhala Text)
            "Dheerga Kaleena Wakkugadu Rogaya": "දීර්ඝකාලීන වකුගඩු රෝගය",
            "කාන්තා වසංගත රෝගයක්": "දීර්ඝකාලීන වකුගඩු රෝගයක්",
            "Chronic Kidney Disease": "දීර්ඝකාලීන වකුගඩු රෝගය",

            # 3. Fix "Uncontrolled" (Asamath -> Palanaya Nokala)
            "අසමත්": "පාලනය නොකළ",
            "Uncontrolled": "පාලනය නොකළ",

            # 4. Pressure & Sugar (English Text -> Sinhala Text)
            "Pressure eka": "ප්‍රෙෂර් එක", 
            "Pressure": "ප්‍රෙෂර්",
            "Sugar": "සීනි", # Spoken style often uses "Seeni" or "Diabetic" -> "Diyawadiyawa"
            "glucose": "සීනි",

            # 5. Doctor (Sinhala -> English Text)
            "dosthara": "Doctor",
            "දොස්තර": "Doctor",
            "සෞඛ්‍ය සේවා සපයන්නා": "Doctor",
            "Healthcare Provider": "Doctor",

            # 6. Greetings & Cleanup
            "Hello": "ආයුබෝවන්",
            "Risk eka": "අවදානම",
            "risk": "අවදානම",
            "අවාසනාවන්තයි": "කණගාටුයි",
            "#": "",
            "*": ""
        }
        
        for formal, spoken in replacements.items():
            text = text.replace(formal, spoken)
            
        return text

    def translate_to_sinhala_fallback(self, text: str) -> str:
        """
        [STYLE LAYER] Translates medical advice to Spoken Sinhala
        Respecting specific constraints: Doctor (English), Pressure/Sugar (Colloquial).
        """
        print(f"⚠️ Style: Translating response to Spoken Sinhala (Code-Mixed)...")

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "HTTP-Referer": "https://github.com/Nephro-AI",
            "Content-Type": "application/json"
        }
        
        # 🚨 YOUR ENHANCED PROMPT
        system_prompt = (
            "You are a Sri Lankan doctor speaking to a patient. Translate the advice into **CASUAL, SPOKEN SINHALA (Katha Wahara)**.\n\n"
            
            "⛔ RULE 1: WHAT TO KEEP IN ENGLISH (Strictly)\n"
            "   - **Role:** 'Doctor' (Do NOT translate to Dosthara. Use 'Doctor').\n"
            "   - **Units:** 'mL/min', 'mg/dL', 'mmol/L', 'eGFR', '%'.\n"
            "   - **Medicines:** 'Metformin', 'Losartan', 'Enalapril', etc.\n"
            "   - **Medical Terms:** 'Creatinine', 'Potassium', 'Sodium', 'Cholesterol'.\n\n"

            "⛔ RULE 2: SPECIFIC TRANSLATIONS (Colloquial Mapping)\n"
            "   - **Blood Pressure:** Use 'Pressure එක' (Keep 'Pressure' in English).\n"
            "   - **Diabetes/Sugar:** Use 'Sugar' or 'දියවැඩියාව'.\n"
            "   - **CKD:** Use 'දීර්ඝකාලීන වකුගඩු රෝගය' (Chronic Kidney Disease).\n"
            "   - **Current Condition:** Use 'දැනට තත්ත්වය' (Danata thaththwaya).\n"
            "   - **Uncontrolled:** Use 'පාලනය වෙලා නෑ' (Not controlled - Spoken style) instead of 'පාලනය නොකළ' (Written style).\n\n"

            "⛔ RULE 3: GRAMMAR & TONE (Spoken Style)\n"
            "   - ❌ NO 'Oba' (ඔබ) -> ✅ Use 'Oya' (ඔයා).\n"
            "   - ❌ NO 'Yuthuya' (යුතුය) -> ✅ Use 'ඕන' (Ona) or 'කරන්න' (Karanna).\n"
            "   - ❌ NO 'Sayanaya' (සායනය) -> ✅ Use 'Clinic එක'.\n"
            "   - Keep sentences short and warm.\n\n"

            "💡 EXAMPLES:\n"
            "   - Input: 'Hello, your blood pressure is uncontrolled.'\n"
            "   - Output: 'ආයුබෝවන්, ඔයාගේ **Pressure එක** පාලනය වෙලා නෑ.'\n"
            "   - Input: 'Doctor said to take Metformin.'\n"
            "   - Output: '**Doctor** කිව්වා **Metformin** බොන්න කියලා.'\n\n"

            "⛔ FINAL OUTPUT FORMAT:\n"
            "1. Use UNICODE SINHALA SCRIPT mixed with English terms.\n"
            "2. Do NOT use Markdown (#, *) in the output."
        )
        
        payload = {
            "model": "openai/gpt-4o-mini", 
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": text}
            ],
            "temperature": 0.1 # Low temp = Follows your dictionary rules strictly
        }
        
        try:
            response = requests.post(self.api_url, headers=headers, data=json.dumps(payload), timeout=30)
            if response.status_code == 200:
                translation = response.json()['choices'][0]['message']['content'].strip()
                
                # 🛡️ SAFETY NET: Force your specific preferences even if AI forgets
                # This ensures "Doctor" is always "Doctor", not "Dosthara"
                translation = translation.replace("දොස්තර", "Doctor")
                translation = translation.replace("රුධිර පීඩනය", "Pressure එක")
                translation = translation.replace("සායනය", "Clinic එක")
                
                print(f"✅ Style Output: {translation[:50]}...") 
                return translation
        except Exception as e:
            print(f"❌ Style Layer Error: {e}")
            pass
            
        return text 

    def _generate_system_prompt(self, patient_context: str) -> str:
        return f"""
        You are 'Nephro-AI', a wise and efficient medical assistant.
        PATIENT CONTEXT: {patient_context}

        YOUR GOAL: Triage -> Investigate (Briefly) -> Advise.

        BEHAVIOR PROTOCOL:
        1. 👋 **GREETINGS & RE-GREETINGS**:
           - If the user says "Hi", "Hello", or "How are you", reply warmly.
           - Even if history exists, greet them again if they say "Hi".

        2. 🚨 **RED FLAG CHECK**: 
           - Chest pain, difficulty breathing, severe bleeding -> STOP -> Hospital Advice.

        3. 🛑 **THE "2-QUESTION" RULE**:
           - Do not ask more than 2 clarifying questions in a row.
           - If history exists, provide advice now.

        4. 🔍 **INVESTIGATE**: 
           - Ask specific questions for vague symptoms.

        5. 💡 **PROVIDE SOLUTION**:
           - Diagnosis hypothesis + Home remedy + Safety Net.
        
        6. ✅ **ACKNOWLEDGEMENTS & CLOSURES** (NEW RULE):
           - If the user says "Ok", "Okay", "Thanks", "Thank you", or "Fine":
           - **DO NOT** restart the conversation.
           - **DO NOT** say "Hello" or introduce yourself.
           - REPLY POLITELY: "You're welcome! Take care of your health." or "Glad I could help. Stay safe."

        7. **TONE**: Empathetic, professional, decisive.
        """


    def generate_response(
        self, 
        query: str, 
        context_documents: List[str], 
        patient_context: str,
        history: List[Dict[str, str]] = []
    ) -> str:
        """
        Pure Brain Layer: Generates response based on provided English Query & Context.
        (Translation is handled externally by RAGEngine)
        """
        print("\n[2] 🧠 BRAIN LAYER (Generating Response...)")
        
        # 1. Base System Prompt
        system_prompt = self._generate_system_prompt(patient_context)
        knowledge_context = "\n\n".join(context_documents[:3])
        
        # 2. Construct Message List
        messages = [{"role": "system", "content": system_prompt}]
        
        # 3. Inject History (Limit to last 4 turns)
        if history:
            valid_history = history[-4:] 
            for msg in valid_history:
                role = "user" if msg['role'] == "user" else "assistant"
                messages.append({"role": role, "content": msg['content']})

        # 4. Add Current User Question with RAG Context
        user_message_content = f"KNOWLEDGE BASE:\n{knowledge_context}\n\nCURRENT PATIENT QUERY:\n{query}"
        messages.append({"role": "user", "content": user_message_content})

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "HTTP-Referer": "https://github.com/Nephro-AI",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": self.model,
            "messages": messages, 
            "temperature": 0.7
        }

        try:
            response = requests.post(self.api_url, headers=headers, data=json.dumps(payload), timeout=30)
            if response.status_code == 200:
                english_response = response.json()['choices'][0]['message']['content'].strip()
                print(f"✅ Brain Output: {english_response}")
                return english_response
            else:
                return f"Error: {response.status_code}"
        except Exception as e:
            return f"Error: {str(e)}"

if __name__ == "__main__":
    llm = LLMEngine()
    print(llm.generate_response("mage kakul idimila wage", [], "No Context"))
