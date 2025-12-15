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
        self.model = "google/gemini-2.0-flash-001" 
        
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
        """Detects if text is Sinhala (Unicode) OR Singlish (Heuristic)."""
        # 1. Unicode Check
        if any('\u0D80' <= char <= '\u0DFF' for char in text):
            return True
        # 2. Singlish Keyword Check
        singlish_keywords = [
            "mage", "mata", "kanna", "bonna", "puluwanda", "kohomada", 
            "ridenawa", "kakul", "oluwa", "bada", "beheth", "le", 
            "wakkugadu", "idimila", "wage", "mokakda", "karanna", "amaru"
        ]
        text_lower = text.lower()
        return any(word in text_lower.split() for word in singlish_keywords)

    def translate_to_english(self, text: str) -> str:
        """[BRIDGE LAYER] Translates Sinhala/Singlish to English."""
        
        if not self._is_sinhala_or_singlish(text):
            return text

        # Cache Check
        if text in self.translation_cache:
            print(f"⚡ Cache Hit: '{text}' -> '{self.translation_cache[text]}'")
            return self.translation_cache[text]

        print(f"🔄 Bridge: Translating '{text}' to English...")
        
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "HTTP-Referer": "https://github.com/Nephro-AI",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": "You are a medical translator. Translate the Sinhala/Singlish query to English. Output ONLY the translation."},
                {"role": "user", "content": text}
            ],
            "temperature": 0.1
        }
        
        try:
            response = requests.post(self.api_url, headers=headers, data=json.dumps(payload), timeout=10)
            if response.status_code == 200:
                translation = response.json()['choices'][0]['message']['content'].strip()
                print(f"✅ Bridge Output: {translation}")
                self.translation_cache[text] = translation
                self._save_translations() 
                return translation
        except Exception as e:
            print(f"❌ Bridge Error: {e}")
        
        return text

    def translate_to_sinhala_fallback(self, text: str) -> str:
        """[STYLE LAYER] Translates English to Sinhala."""
        print(f"⚠️ Style: Translating response to Sinhala...")
        
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "HTTP-Referer": "https://github.com/Nephro-AI",
            "Content-Type": "application/json"
        }
        
        system_prompt = """
        Translate the medical advice into natural, spoken Sinhala.
        RULES:
        1. Keep Drug Names in English (e.g. 'Losartan').
        2. Keep Numbers in English (e.g. '5.2').
        3. Be empathetic.
        """
        
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": text}
            ],
            "temperature": 0.5
        }
        
        try:
            response = requests.post(self.api_url, headers=headers, data=json.dumps(payload), timeout=30)
            if response.status_code == 200:
                return response.json()['choices'][0]['message']['content'].strip()
        except Exception:
            pass
        return text 

    def _generate_system_prompt(self, patient_context: str) -> str:
        return f"""
        You are 'Nephro-AI'.
        PATIENT CONTEXT: {patient_context}
        INSTRUCTIONS:
        1. Be concise (max 60 words).
        2. Answer directly.
        3. Warn if dangerous.
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
        english_query = self.translate_to_english(query)
        
        # --- 2. BRAIN LAYER ---
        print("\n[2] 🧠 BRAIN LAYER")
        system_prompt = self._generate_system_prompt(patient_context)
        knowledge_context = "\n\n".join(context_documents[:3])
        
        user_prompt = f"CONTEXT:\n{knowledge_context}\n\nQUESTION:\n{english_query}"

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "HTTP-Referer": "https://github.com/Nephro-AI",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": self.model,
            "messages": [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}],
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
