import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from chatbot.llm_engine import LLMEngine

def test_negation():
    print("🧪 Testing Negation Phrase Matching...")
    
    llm = LLMEngine()
    
    # Text contains "kanna" (eat), "hoda" (good), BUT ALSO "hoda nathi" (bad)
    test_input = "Mata kanna hoda nathi ahara monawada?"
    
    print("-" * 50)
    print(f"📥 Input: {test_input}")
    
    # 1. Test Hint Generation Logic Directly
    hints = llm._get_dictionary_hints(test_input)
    print(f"🔍 Generated Hints: {hints}")
    
    # 2. Test Full Translation
    translation = llm.translate_to_english(test_input)
    print(f"📤 Final Translation: {translation}")
    
    # Validation
    if "hoda nathi" in hints:
        print("✅ SUCCESS: Found 'hoda nathi' phrase match!")
    else:
        print("❌ FAILURE: Missed 'hoda nathi' phrase.")

if __name__ == "__main__":
    test_negation()
