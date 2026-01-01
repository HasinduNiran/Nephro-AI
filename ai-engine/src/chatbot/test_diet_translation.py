import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from chatbot.llm_engine import LLMEngine

def test_translation():
    print("🧪 Testing Diet Query Translation...")
    
    llm = LLMEngine()
    
    test_inputs = [
        "Mata aligetapera kanna puluwanda?",
        "Kos kewaata kamak nedda?",
        "Mage bada ridenawa"
    ]
    
    for text in test_inputs:
        print("-" * 50)
        print(f"📥 Input: {text}")
        translation = llm.translate_to_english(text)
        print(f"📤 Output: {translation}")

if __name__ == "__main__":
    test_translation()
