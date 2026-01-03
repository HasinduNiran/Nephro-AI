import sys
from pathlib import Path
import os

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from chatbot import config
from chatbot.pdf_extractor import PDFKnowledgeExtractor
from chatbot.prepare_vectordb import VectorDBPreparator
from chatbot.build_vectordb import VectorDBBuilder

def main():
    print("🚀 STARTING HOSPITAL DATA INGESTION")
    print("=" * 50)

    # 1. Define Paths
    raw_file = os.path.join(config.RAW_DATA_DIR, "hospitals.txt")
    processed_dir = config.PROCESSED_DATA_DIR
    
    if not os.path.exists(raw_file):
        print(f"❌ Error: {raw_file} not found!")
        return

    # 2. Extract & Chunk (Step 1)
    print(f"\n📄 Converting {os.path.basename(raw_file)} to Chunks...")
    extractor = PDFKnowledgeExtractor(raw_file, str(processed_dir))
    chunks_file = extractor.process(save_format='json')
    
    if not chunks_file:
        print("❌ Extraction failed.")
        return

    # 3. Prepare for Vector DB (Step 2)
    print(f"\n🔨 Preparing Vector DB format...")
    preparator = VectorDBPreparator(chunks_file)
    vectordb_ready_data = preparator.process() # This returns the data dict
    
    if not vectordb_ready_data:
        print("❌ Preparation failed or file skipped (maybe no valid entities found?).")
        return

    # 4. Build Vector DB (Step 3)
    print(f"\n🧱 Re-building Vector Database...")
    builder = VectorDBBuilder()
    builder.build()
    
    print("\n✅ INGESTION COMPLETE!")

if __name__ == "__main__":
    main()
