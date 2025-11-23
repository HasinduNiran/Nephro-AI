import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from scripts.llm_engine import LLMEngine
from scripts.sinhala_nlu import SinhalaNLUEngine

def test_bridge():
    print("\n--- Testing Bridge (Sinhala -> English) ---")
    llm = LLMEngine()
    sinhala_text = "මට මහන්සියි" # I am tired
    english_text = llm.translate_to_english(sinhala_text)
    print(f"Input: {sinhala_text}")
    print(f"Output: {english_text}")

def test_style():
    print("\n--- Testing Style (English -> Sinhala) ---")
    nlu = SinhalaNLUEngine()
    english_text = "You may have anemia. Eat iron-rich foods."
    sinhala_text = nlu.generate_sinhala_response(english_text)
    print(f"Input: {english_text}")
    print(f"Output: {sinhala_text}")

if __name__ == "__main__":
    test_bridge()
    test_style()
