"""
Nephro-AI Chatbot Runner
Integrates Patient Input (Voice/Text), NLU Engine, and Vector Database.
"""

import sys
import time
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from scripts.patient_input import PatientInputHandler
from scripts.rag_engine import RAGEngine

def main():
    print("=" * 70)
    print("🤖 NEPHRO-AI KIDNEY CARE CHATBOT (RAG ENABLED)")
    print("=" * 70)
    print("Initializing components...")
    
    import argparse
    parser = argparse.ArgumentParser(description="Nephro-AI Chatbot")
    parser.add_argument("--model", type=str, default="small", help="Whisper model size (tiny, base, small, medium, large)")
    parser.add_argument("--debug-audio", action="store_true", help="Play back recorded audio for debugging")
    args = parser.parse_args()

    # Initialize components
    try:
        print(f"Loading Whisper model: {args.model}...")
        input_handler = PatientInputHandler(model_size=args.model)
        chatbot = RAGEngine()
        print("\n✅ All systems ready!")
    except Exception as e:
        print(f"\n❌ Initialization failed: {e}")
        return

    print("\n" + "-" * 70)
    print("Instructions:")
    print("1. Type 'voice' to switch to Voice Mode (records for 5s)")
    print("2. Type 'text' to switch to Text Mode")
    print("3. Type 'quit' to exit")
    print("-" * 70)
    
    current_mode = "text"
    
    while True:
        try:
            # Get Input
            print(f"\n[{current_mode.upper()} MODE]")
            if current_mode == "voice":
                print("Press Enter to start recording (5s)...")
                input()
                
            query = input_handler.get_input(current_mode, debug_audio=args.debug_audio)
            
            # Handle empty input or commands
            if not query:
                continue
                
            if query.lower() in ['quit', 'exit', 'q']:
                print("\n👋 Goodbye!")
                break
                
            if query.lower() == 'voice':
                current_mode = "voice"
                print("🎙️ Switched to Voice Mode")
                continue
                
            if query.lower() == 'text':
                current_mode = "text"
                print("⌨️ Switched to Text Mode")
                continue
            
            # Process Query
            print("\n🤔 Thinking...")
            result = chatbot.process_query(query)
            
            print("\n" + "="*50)
            print("🤖 NEPHRO-AI RESPONSE:")
            print("="*50)
            print(result["response"])
            print("\n" + "-"*50)
            print(f"📚 Sources Used: {len(result['source_documents'])}")
            
        except KeyboardInterrupt:
            print("\n👋 Goodbye!")
            break
        except Exception as e:
            print(f"\n❌ Error: {e}")

if __name__ == "__main__":
    main()
