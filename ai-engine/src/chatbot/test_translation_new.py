import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from chatbot.llm_engine import LLMEngine

def test_translation():
    print("🧪 Testing Natural Sinhala Translation...")
    
    llm = LLMEngine()
    
    test_input = "Your eGFR is 45, which means you have Stage 3 CKD. You need to control your blood pressure and sugar levels to prevent further damage. Please see a doctor immediately."
    
    print(f"\n📥 Input: {test_input}")
    print("-" * 50)
    
    # Force translation (translate_to_sinhala_fallback is called by RAG usually, calling directly here)
    translation = llm.translate_to_sinhala_fallback(test_input)
    
    print("-" * 50)
    print(f"📤 Output:\n{translation}")

if __name__ == "__main__":
    test_translation()
