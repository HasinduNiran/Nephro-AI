
import sys
import os
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(os.getcwd()) / "src"))

from config import CKD_ABBREVIATIONS

def test_sinhala_dict():
    print("Testing Sinhala Dictionary Loading...")
    
    test_terms = ["wakugadu", "creatinine", "soodiyam", "diyawadiyawa"]
    
    for term in test_terms:
        if term in CKD_ABBREVIATIONS:
            print(f"✅ Found '{term}' -> '{CKD_ABBREVIATIONS[term]}'")
        else:
            print(f"❌ '{term}' NOT found")

if __name__ == "__main__":
    test_sinhala_dict()
