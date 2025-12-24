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

        # 2. UPDATED DICTIONARY (Fixing Ambiguity)
        dictionary = """
        MANDATORY DICTIONARY:
        # --- Severity / Adjectives ---
        - Podi / Poddak / Tikak -> Mild / Slight / A little bit (IF describing pain/symptom)
        - Godak / Hari -> Severe / Very / A lot
        - Loku -> Severe / Big
        
        # --- Symptoms ---
        - Kakkumai / Kakkuma -> Pain / Ache / Cramping
        - Oluwa -> Head
        - Ridenawa -> Pain
        - Idimenne / Idimuma -> Swelling
        - Hathiya -> Difficulty breathing
        
        # --- Context ---
        - Ekak -> One (But implies 'A type of' in this context)
        """

        system_instruction = (
            "You are a medical translator. \n"
            f"CONTEXT: {context_str}\n" 
            f"{dictionary}\n"
            "RULES:\n"
            "1. USE CONTEXT: If the Doctor asked about 'Pain severity', and user says 'Podi ekak', translate as 'It is mild pain' (NOT 'A small child').\n"
            "2. 'Podi' usually means 'Mild' or 'Slight' in symptom context.\n"
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

    def translate_to_sinhala_fallback(self, text: str) -> str:
        """[STYLE LAYER] Translates English to Sinhala with MEDICAL ACCURACY."""
        print(f"⚠️ Style: Translating response to Sinhala...")
        
        # 1. DEFINE THE OUTPUT DICTIONARY (English -> Sinhala)
        dictionary = """
        CRITICAL MEDICAL DICTIONARY:
        - Stomach -> Bada (බඩ)
        - Kidney -> Wakkugadu (වකුගඩු)   <-- NEVER USE 'KADULU'
        - Pain -> Ridenawa (රිදෙනවා) or Kakkuma (කැක්කුම)
        - Urine -> Muthra (මුත්‍රා)
        - Blood -> Le (ලේ)
        - Fever -> Una (උණ)
        - Vomiting -> Wamane (වමනය)
        - Diabetes -> Diyawadiyawa (දියවැඩියාව)
        - Swelling -> Idimuma (ඉදිමුම)
        - Doctor -> Waidyawaraya (වෛද්‍යවරයා)
        - Medicine -> Beheth (බෙහෙත්)
        - Water -> Wathura (වතුර)
        """

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "HTTP-Referer": "https://github.com/Nephro-AI",
            "Content-Type": "application/json"
        }
        
        system_prompt = (
            "You are a helpful Sri Lankan medical assistant. Translate the advice into NATURAL, SPOKEN Sinhala.\n"
            f"{dictionary}\n"
            "RULES:\n"
            "1. Use the Dictionary terms strictly.\n"
            "2. Keep English numbers (e.g., '5.2', '120/80').\n"
            "3. Keep drug names in English (e.g., 'Panadol', 'Losartan').\n"
            "4. Tone: Empathetic, polite, and simple (not overly formal)."
        )
        
        payload = {
            "model": "openai/gpt-4o-mini", # Use Mini for speed, but prompt for quality
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": text}
            ],
            "temperature": 0.3 # Low temperature to stick to the dictionary
        }
        
        try:
            response = requests.post(self.api_url, headers=headers, data=json.dumps(payload), timeout=30)
            if response.status_code == 200:
                translation = response.json()['choices'][0]['message']['content'].strip()
                print(f"✅ Style Output: {translation}")
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
        1. 👋 **GREETINGS**:
           - If the user says "Hi" or "How are you", reply warmly and briefly.
           - Example: "Hello! I am Nephro-AI. How can I help you with your health today?"
           - **DO NOT** mention translations or your internal rules.

        2. 🚨 **RED FLAG CHECK**: If the user has chest pain, difficulty breathing, or severe bleeding, STOP and send them to the ER immediately.

        3. 🛑 **THE "2-QUESTION" RULE (CRITICAL)**:
           - Do not ask more than 2 clarifying questions in a row.
           - Check the conversation history. If you have already asked about the "Nature of pain" and "Duration", DO NOT ask more. 
           - **MOVE TO ADVICE**.

        4. 🔍 **INVESTIGATE (SOCRATES)**: 
           - If the user's complaint is vague (e.g., "My stomach hurts"), ask ONE specific question (e.g., "Where exactly?").
           - If the user asks a direct question (e.g., "Can I eat mango?"), **ANSWER IT DIRECTLY**. Do not ask about symptoms unless relevant.

        5. 💡 **PROVIDE SOLUTION**:
           - Once you have enough info (or hit the 2-question limit), give a recommendation (Home remedy, Diet change, or "See a doctor").
           - ALWAYS end with a "Safety Net" (e.g., "If it gets worse, go to the hospital").

        6. **TONE**: Empathetic but decisive. Don't be chatty.
        """

    def generate_response(
        self, 
        query: str, 
        context_documents: List[str], 
        patient_context: str,
        history: List[Dict[str, str]] = []
    ) -> str:
        print("\n" + "="*50)
        print("🚀 STARTING PIPELINE")
        print("="*50)
        
        # --- 1. BRIDGE LAYER ---
        print("\n[1] 🌉 BRIDGE LAYER")
        is_sinhala_query = self._is_sinhala_or_singlish(query)
        english_query = self.translate_to_english(query, history)
        
        # --- 2. BRAIN LAYER ---
        print("\n[2] 🧠 BRAIN LAYER")
        
        # 1. Base System Prompt
        system_prompt = self._generate_system_prompt(patient_context)
        knowledge_context = "\n\n".join(context_documents[:3])
        
        # 2. Construct Message List with History
        messages = [{"role": "system", "content": system_prompt}]
        
        # Inject History (Limit to last 4 turns to save tokens)
        if history:
            valid_history = history[-4:] 
            for msg in valid_history:
                # Map roles correctly to OpenAI format
                role = "user" if msg['role'] == "user" else "assistant"
                messages.append({"role": role, "content": msg['content']})

        # 3. Add Current User Question with RAG Context
        # We wrap the RAG context here so the model sees it with the latest question
        user_message_content = f"KNOWLEDGE BASE:\n{knowledge_context}\n\nCURRENT PATIENT QUERY:\n{english_query}"
        messages.append({"role": "user", "content": user_message_content})

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "HTTP-Referer": "https://github.com/Nephro-AI",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": self.model,
            "messages": messages, # ✅ SEND FULL CONVERSATION
            "temperature": 0.7
        }

        english_response = ""
        try:
            response = requests.post(self.api_url, headers=headers, data=json.dumps(payload), timeout=30)
            if response.status_code == 200:
                english_response = response.json()['choices'][0]['message']['content'].strip()
                print(f"✅ Brain Output: {english_response}")
            else:
                return f"Error: {response.status_code}"
        except Exception as e:
            return f"Error: {str(e)}"

        # --- 3. STYLE LAYER ---
        print("\n[3] 🎨 STYLE LAYER")
        
        if is_sinhala_query:
            if any('\u0D80' <= char <= '\u0DFF' for char in english_response):
                return english_response
            else:
                sinhala_response = self.translate_to_sinhala_fallback(english_response)
                print(f"✅ Style Output: {sinhala_response}")
                return sinhala_response
        else:
            print("ℹ️ Query was English. Skipping Style Layer.")
            return english_response

if __name__ == "__main__":
    llm = LLMEngine()
    print(llm.generate_response("mage kakul idimila wage", [], "No Context"))
