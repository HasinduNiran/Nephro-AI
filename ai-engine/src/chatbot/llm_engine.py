"""
LLM Engine for Nephro-AI
Handles communication with OpenRouter/OpenAI API to generate responses.
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
        self.model = "google/gemini-2.0-flash-001" # Bridge & Brain Model
        
        # Initialize Sinhala NLU (Style Layer)
        self.sinhala_nlu = SinhalaNLUEngine()
        
        if not self.api_key:
            print("⚠️ Warning: OPENROUTER_API_KEY not found in config.")
            
        # Cache for common Sinhala terms to reduce latency
        self.translation_cache = {
            "වකුගඩු රෝගය": "Kidney Disease",
            "දියවැඩියාව": "Diabetes",
            "අධික රුධිර පීඩනය": "High Blood Pressure",
            "ක්‍රියැටිනින්": "Creatinine",
            "ඩයලිසිස්": "Dialysis",
            "ප්‍රතිකාර": "Treatment",
            "රෝග ලක්ෂණ": "Symptoms",
            "ආහාර පාලනය": "Diet Control"
        }

    def translate_to_english(self, text: str) -> str:
        """
        Bridge Layer: Translate Sinhala text to English.
        """
        # Simple check if text contains Sinhala characters (Unicode range)
        is_sinhala = any('\u0D80' <= char <= '\u0DFF' for char in text)
        
        if not is_sinhala:
            return text

        # Check Cache first
        for key, value in self.translation_cache.items():
            if key in text:
                print(f"⚡ Cache Hit: '{key}' -> '{value}'")
                # Simple replacement for now, but ideally we want full sentence translation if it's complex
                # For single terms/short phrases this works well
                text = text.replace(key, value)
                
        # If text is mostly English now (after replacement), return it
        # This is a heuristic: if < 20% chars are Sinhala, assume it's translated enough
        sinhala_chars = sum(1 for char in text if '\u0D80' <= char <= '\u0DFF')
        if sinhala_chars < len(text) * 0.2:
             return text

        print(f"🔄 Bridge: Translating '{text}' to English...")
        
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "HTTP-Referer": "https://github.com/Nephro-AI",
            "X-Title": "Nephro-AI",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": "You are a professional translator. Translate the following Sinhala text to English. Output ONLY the translation."},
                {"role": "user", "content": text}
            ],
            "temperature": 0.3,
            "max_tokens": 200
        }
        
        try:
            response = requests.post(self.api_url, headers=headers, data=json.dumps(payload), timeout=30)
            if response.status_code == 200:
                translation = response.json()['choices'][0]['message']['content'].strip()
                print(f"✅ Bridge Output: {translation}")
                
                # Dynamic Caching: Store result for next time
                self.translation_cache[text] = translation
                
                return translation
            else:
                print(f"❌ Bridge Error: {response.text}")
                return text # Fallback
        except Exception as e:
            print(f"❌ Bridge Exception: {e}")
            return text

    def translate_to_sinhala_fallback(self, text: str) -> str:
        """
        Fallback Style Layer: Translate English text to Sinhala using OpenAI.
        Used when SinLLaMA is not available.
        """
        print(f"⚠️ Style: SinLLaMA not loaded. Using OpenAI fallback...")
        
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "HTTP-Referer": "https://github.com/Nephro-AI",
            "X-Title": "Nephro-AI",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": "You are a professional translator. Translate the following English medical advice into natural, empathetic Sinhala. Output ONLY the translation."},
                {"role": "user", "content": text}
            ],
            "temperature": 0.5,
            "max_tokens": 500
        }
        
        try:
            response = requests.post(self.api_url, headers=headers, data=json.dumps(payload), timeout=30)
            if response.status_code == 200:
                translation = response.json()['choices'][0]['message']['content'].strip()
                return translation
            else:
                print(f"❌ Style Fallback Error: {response.text}")
                return text # Ultimate fallback
        except Exception as e:
            print(f"❌ Style Fallback Exception: {e}")
            return text

    def _generate_system_prompt(self, patient_context: str) -> str:
        """
        Builds the system prompt with strict brevity constraints.
        """
        system_prompt = f"""
        You are a smart, empathetic Nephrology Voice Assistant named 'Nephro-AI'.
        
        PATIENT CONTEXT:
        {patient_context}
        
        CRITICAL INSTRUCTIONS:
        1. YOU ARE SPEAKING, NOT WRITING. Do not use bullet points, bold text, or lists.
        2. BE CONCISE BUT EMPATHETIC. Keep your answer under 80 words (5-6 sentences max).
        3. ANSWER DIRECTLY. Do not say "Based on your results..." or "Here is what you need to know". Just give the answer.
        4. IF DANGEROUS: Warn the patient immediately and prioritize safety over brevity.
        
        Example Interaction:
        User: "Can I eat bananas?"
        Bad Answer: "Bananas are high in potassium. Given your level of 4.8, you should avoid them. Apples are better."
        Good Answer: "Please avoid bananas tonight since your potassium is 4.8, but the apple is perfectly safe."
        """
        return system_prompt

    def generate_response(
        self, 
        query: str, 
        context_documents: List[str], 
        patient_context: str,
        history: List[Dict[str, str]] = []
    ) -> str:
        """
        Generate a response using the Sandwich Method:
        1. Bridge: Sinhala -> English
        2. Brain: RAG (English) - NEVER CACHED for safety
        3. Style: English -> Sinhala
        """
        # SAFETY CRITICAL: Do NOT cache this function's output.
        # Patient data (e.g., Potassium levels) changes over time.
        # Caching the final response could lead to dangerous, outdated advice.
        
        print("\n" + "="*50)
        print("🚀 STARTING PIPELINE")
        print("="*50)
        
        # --- 1. BRIDGE LAYER (Sinhala -> English) ---
        print("\n[1] 🌉 BRIDGE LAYER")
        english_query = self.translate_to_english(query)
        
        # --- 2. BRAIN LAYER (English Logic + RAG) ---
        print("\n[2] 🧠 BRAIN LAYER")
        
        # Construct the System Prompt
        system_prompt = self._generate_system_prompt(patient_context)

        # Construct the User Prompt with Context
        knowledge_context = "\n\n".join(context_documents[:3])
        
        # Determine original language for the prompt
        is_sinhala_query = any('\u0D80' <= char <= '\u0DFF' for char in query)
        original_language = "Sinhala" if is_sinhala_query else "English"
        
        # Note: Patient Prompfile is already in System Prompt, so we separate Knowledge here
        user_prompt = (
            f"--- MEDICAL KNOWLEDGE CONTEXT ---\n{knowledge_context}\n\n"
            f"--- USER QUESTION ---\n{english_query}\n"
            f"Original Language: {original_language}"
        )

        # Call API for Brain Layer
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "HTTP-Referer": "https://github.com/Nephro-AI",
            "X-Title": "Nephro-AI",
            "Content-Type": "application/json"
        }
        
        # Prepare Messages
        messages = [{"role": "system", "content": system_prompt}]
        
        # 1. Inject History (Last 6 turns)
        if history:
            for turn in history[-6:]:
                messages.append(turn)
        
        # 2. Add Current Query (with Context)
        messages.append({"role": "user", "content": user_prompt})

        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": 0.7,
            "max_tokens": 500
        }

        english_response = ""
        try:
            response = requests.post(
                self.api_url, 
                headers=headers, 
                data=json.dumps(payload),
                timeout=30
            )
            
            if response.status_code == 200:
                result = response.json()
                english_response = result['choices'][0]['message']['content'].strip()
                print(f"✅ Brain Output: {english_response}")
            else:
                return f"Error generating response: {response.status_code} - {response.text}"
                
        except Exception as e:
            return f"Error communicating with LLM: {str(e)}"

        # --- 3. STYLE LAYER (English -> Sinhala) ---
        # Optimization: If original query was Sinhala, the Brain Layer should have already replied in Sinhala.
        # We only need the Style Layer if the Brain Layer failed to produce Sinhala (fallback check) or if we want to enforce NLU style.
        
        print("\n[3] 🎨 STYLE LAYER")
        
        if is_sinhala_query:
            # Check if response is already Sinhala
            is_response_sinhala = any('\u0D80' <= char <= '\u0DFF' for char in english_response)
            
            if is_response_sinhala:
                print("✅ Brain Layer replied in Sinhala. Skipping explicit Style Layer translation.")
                return english_response
            else:
                print("⚠️ Brain Layer replied in English. Activating Style Layer fallback...")
                if self.sinhala_nlu.model:
                    print("✨ Using SinLLaMA for styling...")
                    sinhala_response = self.sinhala_nlu.generate_sinhala_response(english_response)
                    print(f"✅ Style Output: {sinhala_response}")
                    return sinhala_response
                else:
                    print("⚠️ SinLLaMA not available. Falling back to OpenAI...")
                    sinhala_response = self.translate_to_sinhala_fallback(english_response)
                    print(f"✅ Style Output (Fallback): {sinhala_response}")
                    return sinhala_response
        else:
            print("ℹ️ Query was English. Skipping Style Layer.")
            return english_response

if __name__ == "__main__":
    # Test
    llm = LLMEngine()
    
    # Test Case 1: English
    print("\n--- TEST 1: English ---")
    print(llm.generate_response(
        "Can I eat bananas?", 
        ["Bananas are high in potassium.", "High potassium is dangerous for Stage 3+ CKD."], 
        "Patient Profile: Stage 3 CKD, High Potassium (5.2)"
    ))
    
    # Test Case 2: Sinhala (Mocking the input)
    print("\n--- TEST 2: Sinhala ---")
    # "මට කෙසල් කන්න පුළුවන්ද?" (Can I eat bananas?)
    print(llm.generate_response(
        "මට කෙසල් කන්න පුළුවන්ද?", 
        ["Bananas are high in potassium.", "High potassium is dangerous for Stage 3+ CKD."], 
        "Patient Profile: Stage 3 CKD, High Potassium (5.2)"
    ))
