
import sys
import os
from pathlib import Path

# Add ai-engine/src to path
sys.path.insert(0, str(Path(__file__).parent.parent))

print("Testing imports...")

try:
    import chatbot.run_chatbot
    print("✅ Successfully imported chatbot.run_chatbot")
except Exception as e:
    print(f"❌ Failed to import chatbot.run_chatbot: {e}")

try:
    import chatbot.rag_engine
    print("✅ Successfully imported chatbot.rag_engine")
except Exception as e:
    print(f"❌ Failed to import chatbot.rag_engine: {e}")

try:
    import chatbot.enhanced_query_vectordb
    print("✅ Successfully imported chatbot.enhanced_query_vectordb")
except Exception as e:
    print(f"❌ Failed to import chatbot.enhanced_query_vectordb: {e}")

try:
    import chatbot.llm_engine
    print("✅ Successfully imported chatbot.llm_engine")
except Exception as e:
    print(f"❌ Failed to import chatbot.llm_engine: {e}")

try:
    import chatbot.query_vectordb
    print("✅ Successfully imported chatbot.query_vectordb")
except Exception as e:
    print(f"❌ Failed to import chatbot.query_vectordb: {e}")

print("Import verification complete.")
