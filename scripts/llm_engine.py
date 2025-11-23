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

import config
from scripts.sinhala_nlu import SinhalaNLUEngine

class LLMEngine:
    def __init__(self):
        """Initialize LLM Engine with config"""
        self.api_key = config.OPENROUTER_API_KEY
        self.api_url = "https://openrouter.ai/api/v1/chat/completions"
        self.model = "openai/gpt-4.1" # Bridge & Brain Model
        
        # Initialize Sinhala NLU (Style Layer)
        self.sinhala_nlu = SinhalaNLUEngine()
        
        if not self.api_key:
            print("⚠️ Warning: OPENROUTER_API_KEY not found in config.")

    def translate_to_english(self, text: str) -> str:
        """
        Bridge Layer: Translate Sinhala text to English.
        """
        # Simple check if text contains Sinhala characters (Unicode range)
        is_sinhala = any('\u0D80' <= char <= '\u0DFF' for char in text)
        
        if not is_sinhala:
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

    def generate_response(
        self, 
        query: str, 
        context_documents: List[str], 
        patient_context: str
    ) -> str:
        """
        Generate a response using the Sandwich Method:
        1. Bridge: Sinhala -> English
        2. Brain: RAG (English)
        3. Style: English -> Sinhala
        """
        print("\n" + "="*50)
        print("🚀 STARTING PIPELINE")
        print("="*50)
        
        # --- 1. BRIDGE LAYER (Sinhala -> English) ---
        print("\n[1] 🌉 BRIDGE LAYER")
        english_query = self.translate_to_english(query)
        
        # --- 2. BRAIN LAYER (English Logic + RAG) ---
        print("\n[2] 🧠 BRAIN LAYER")
        
        # Construct the System Prompt
        system_prompt = (
            "You are Nephro-AI, a specialized medical assistant for Chronic Kidney Disease (CKD) patients. "
            "Your goal is to provide accurate, empathetic, and personalized information based on the provided context.\n\n"
            "GUIDELINES:\n"
            "1. USE CONTEXT: Base your answer PRIMARILY on the provided 'Medical Knowledge Context'. "
            "If the answer is not in the context, say you don't know, but offer general advice if safe.\n"
            "2. PERSONALIZE: Use the 'Patient Profile' to tailor your advice (e.g., if potassium is high, warn about bananas).\n"
            "3. TONE: Empathetic, professional, clear, and encouraging.\n"
            "4. FORMAT: Use bullet points for lists. Keep paragraphs short.\n"
            "5. NO SUMMARY/DISCLAIMER: Do NOT include a 'Summary' section or a 'Disclaimer' section at the end. Just provide the answer directly."
        )

        # Construct the User Prompt with Context
        knowledge_context = "\n\n".join(context_documents[:3])
        
        user_prompt = (
            f"--- PATIENT PROFILE ---\n{patient_context}\n\n"
            f"--- MEDICAL KNOWLEDGE CONTEXT ---\n{knowledge_context}\n\n"
            f"--- USER QUESTION ---\n{english_query}"
        )

        # Call API for Brain Layer
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "HTTP-Referer": "https://github.com/Nephro-AI",
            "X-Title": "Nephro-AI",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
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
        print("\n[3] 🎨 STYLE LAYER")
        # Check if original query was Sinhala to decide if we should translate back
        is_sinhala_query = any('\u0D80' <= char <= '\u0DFF' for char in query)
        
        if is_sinhala_query:
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
