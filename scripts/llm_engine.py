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

class LLMEngine:
    def __init__(self):
        """Initialize LLM Engine with config"""
        self.api_key = config.OPENROUTER_API_KEY
        self.api_url = "https://openrouter.ai/api/v1/chat/completions"
        self.model = "openai/gpt-4.1" # Updated to GPT-4.1 as requested
        
        if not self.api_key:
            print("⚠️ Warning: OPENROUTER_API_KEY not found in config.")

    def generate_response(
        self, 
        query: str, 
        context_documents: List[str], 
        patient_context: str
    ) -> str:
        """
        Generate a response using RAG (Retrieval-Augmented Generation)
        
        Args:
            query: User's question
            context_documents: List of relevant text chunks from VectorDB
            patient_context: String summary of patient data
            
        Returns:
            Generated response string
        """
        
        # 1. Construct the System Prompt
        system_prompt = (
            "You are Nephro-AI, a specialized medical assistant for Chronic Kidney Disease (CKD) patients. "
            "Your goal is to provide accurate, empathetic, and personalized information based on the provided context.\n\n"
            "GUIDELINES:\n"
            "1. USE CONTEXT: Base your answer PRIMARILY on the provided 'Medical Knowledge Context'. "
            "If the answer is not in the context, say you don't know, but offer general advice if safe.\n"
            "2. PERSONALIZE: Use the 'Patient Profile' to tailor your advice (e.g., if potassium is high, warn about bananas).\n"
            "3. SAFETY: Always include a disclaimer that you are an AI and they should consult their doctor.\n"
            "4. TONE: Empathetic, professional, clear, and encouraging.\n"
            "5. FORMAT: Use bullet points for lists. Keep paragraphs short."
        )

        # 2. Construct the User Prompt with Context
        # Join top 3 documents to avoid token limits
        knowledge_context = "\n\n".join(context_documents[:3])
        
        user_prompt = (
            f"--- PATIENT PROFILE ---\n{patient_context}\n\n"
            f"--- MEDICAL KNOWLEDGE CONTEXT ---\n{knowledge_context}\n\n"
            f"--- USER QUESTION ---\n{query}"
        )

        # 3. Call API
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "HTTP-Referer": "https://github.com/Nephro-AI", # Required by OpenRouter
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

        try:
            response = requests.post(
                self.api_url, 
                headers=headers, 
                data=json.dumps(payload),
                timeout=30
            )
            
            if response.status_code == 200:
                result = response.json()
                return result['choices'][0]['message']['content'].strip()
            else:
                return f"Error generating response: {response.status_code} - {response.text}"
                
        except Exception as e:
            return f"Error communicating with LLM: {str(e)}"

if __name__ == "__main__":
    # Test
    llm = LLMEngine()
    print(llm.generate_response(
        "Can I eat bananas?", 
        ["Bananas are high in potassium.", "High potassium is dangerous for Stage 3+ CKD."], 
        "Patient Profile: Stage 3 CKD, High Potassium (5.2)"
    ))
