
import sys
import os
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(os.getcwd()) / "src"))

from chatbot.nlu_engine import CKDNLUEngine

def test_hybrid_nlu():
    print("=" * 70)
    print("🧠 TESTING HYBRID NLU (SciSpaCy + LaBSE)")
    print("=" * 70)
    
    nlu = CKDNLUEngine()
    
    test_queries = [
        # English / Clinical (Should use SciSpaCy or match rules)
        "What is creatinine?",
        "My eGFR is 45",
        
        # Sinhala (Should use LaBSE)
        "Mata mahansiyi", # I am tired -> ask_symptom
        "Mata bada ridenawa", # My stomach hurts -> ask_symptom
        "Mata kanna puluwan monawada?", # What can I eat? -> ask_diet
        
        # Singlish (Should use LaBSE)
        "Mage pressure wadi", # My pressure is high -> ask_symptom/medical
        "Mata breathing amaruwak thiyenawa" # I have breathing difficulty -> ask_emergency
    ]
    
    for query in test_queries:
        print(f"\nQuery: '{query}'")
        analysis = nlu.analyze_query(query)
        
        # Get top intent
        top_intent = max(analysis['intent'].items(), key=lambda x: x[1])
        print(f"   👉 Intent: {top_intent[0]} (Score: {top_intent[1]:.2f})")
        
        if analysis['entities']:
            print(f"   🏥 Entities: {analysis['entities']}")

if __name__ == "__main__":
    test_hybrid_nlu()
