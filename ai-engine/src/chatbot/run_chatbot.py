import sys
import time
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from chatbot.patient_input import PatientInputHandler
from chatbot.rag_engine import RAGEngine
from chatbot.tts_engine import TTSEngine
from chatbot.sinhala_nlu import SinhalaNLUEngine

def main():
    print("=" * 70)
    print("🤖 NEPHRO-AI KIDNEY CARE CHATBOT (RAG + TTS + SINHALA)")
    print("=" * 70)
    print("Initializing components...")
    
    import argparse
    parser = argparse.ArgumentParser(description="Nephro-AI Chatbot")
    parser.add_argument("--model", type=str, default="medium", help="Whisper model size (tiny, base, small, medium, large)")
    parser.add_argument("--debug-audio", action="store_true", help="Play back recorded audio for debugging")
    args = parser.parse_args()

    # Initialize components
    try:
        print(f"Loading Whisper model: {args.model}...")
        input_handler = PatientInputHandler(model_size=args.model)
        chatbot = RAGEngine()
        tts = TTSEngine()
        sinhala_nlu = SinhalaNLUEngine()
        print("\n✅ All systems ready!")
    except Exception as e:
        print(f"\n❌ Initialization failed: {e}")
        return

    print("\n" + "-" * 70)
    print("Instructions:")
    print("1. Type 'voice' to switch to Voice Mode (records for 5s)")
    print("2. Type 'text' to switch to Text Mode")
    print("3. Type 'sinhala' to switch to Sinhala Text Mode")
    print("4. Type 'sinhala_voice' to switch to Sinhala Voice Mode")
    print("5. Type 'quit' to exit")
    print("-" * 70)
    
    current_mode = "text"
    
    while True:
        try:
            # Get Input
            print(f"\n[{current_mode.upper()} MODE]")
            if current_mode == "voice" or current_mode == "sinhala_voice":
                print("Press Enter to start recording (5s)...")
                input()
            
            # Determine language for STT
            stt_lang = 'si' if current_mode == "sinhala_voice" else None
            
            # Get input (Text or Voice)
            if current_mode == "sinhala_voice":
                 # Reuse voice logic but pass language
                 query = input_handler.get_input("voice", debug_audio=args.debug_audio, language=stt_lang)
            elif current_mode == "sinhala":
                 query = input_handler.get_input("text", debug_audio=args.debug_audio)
            else:
                 query = input_handler.get_input(current_mode, debug_audio=args.debug_audio)
            
            # Handle empty input or commands
            if not query:
                continue
                
            if query.lower() in ['quit', 'exit', 'q']:
                print("\n👋 Goodbye!")
                break
                
            if query.lower() == 'voice':
                current_mode = "voice"
                print("🎙️ Switched to Voice Mode (English)")
                continue
                
            if query.lower() == 'text':
                current_mode = "text"
                print("⌨️ Switched to Text Mode")
                continue

            if query.lower() == 'sinhala':
                current_mode = "sinhala"
                print("🇱🇰 Switched to Sinhala Text Mode")
                continue

            if query.lower() == 'sinhala_voice':
                current_mode = "sinhala_voice"
                print("🇱🇰🎙️ Switched to Sinhala Voice Mode")
                continue
            
            # Process Query
            print("\n🤔 Thinking...")
            
            # Handle Sinhala Input (Text or Voice)
            if current_mode == "sinhala" or current_mode == "sinhala_voice":
                print(f"🇱🇰 Analyzing Sinhala: '{query}'...")
                analysis = sinhala_nlu.analyze_query(query)
                translated_query = analysis.get("translated_query", query)
                print(f"🔤 Translated/Mapped to: '{translated_query}'")
                query = translated_query # Use translated query for RAG
            
            result = chatbot.process_query(query)
            response_text = result["response"]
            
            print("\n" + "="*50)
            print("🤖 NEPHRO-AI RESPONSE:")
            print("="*50)
            print(response_text)
            print("\n" + "-"*50)
            print(f"📚 Sources Used: {len(result['source_documents'])}")
            
            # Voice Output (only in voice modes)
            # Note: TTS is currently English-only (ElevenLabs default)
            if current_mode == "voice" or current_mode == "sinhala_voice":
                tts.generate_and_play(response_text)
            
        except KeyboardInterrupt:
            print("\n👋 Goodbye!")
            break
        except Exception as e:
            print(f"\n❌ Error: {e}")

if __name__ == "__main__":
    main()
