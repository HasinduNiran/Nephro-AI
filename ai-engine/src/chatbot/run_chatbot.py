import sys
import time
import re # Added for text cleaning
import webbrowser
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from chatbot.patient_input import PatientInputHandler
from chatbot.rag_engine import RAGEngine
from chatbot.tts_engine import TTSEngine
from chatbot.sinhala_nlu import SinhalaNLUEngine

# --- HELPER FROM SERVER.PY ---
def clean_text_for_tts(text: str) -> str:
    """Removes Markdown symbols and unsupported characters."""
    # Remove bold/italic markers (*, _)
    text = re.sub(r'[\*_#]', '', text) 
    # Remove markdown links [text](url) -> text
    text = re.sub(r'\[([^\]]+)\]\([^\)]+\)', r'\1', text)
    # Remove emojis and unsupported chars (keep only Sinhala, English, numbers, punctuation)
    text = re.sub(r'[^\w\s\u0D80-\u0DFF\.,\?!a-zA-Z0-9]', '', text)
    return text

def main():
    print("=" * 70)
    print("🤖 NEPHRO-AI KIDNEY CARE CHATBOT (RAG + TTS + SINHALA)")
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
    chat_history = [] # Initialize history
    
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
            
            # --- GIBBERISH DETECTION (SYNCED WITH SERVER.PY) ---
            gibberish_triggers = ["Tamb", "Hue", "כש", "subs", "Amara", "Unara"]
            is_garbage = any(x in query for x in gibberish_triggers) or len(query) < 2
            
            if is_garbage:
                 print("   ⚠️ Detected Silence/Gibberish. Skipping processing.")
                 print("🤖 NEPHRO-AI: I couldn't hear you clearly. Please try again.")
                 continue

            # Handle Sinhala Input (Text or Voice)
            if current_mode == "sinhala" or current_mode == "sinhala_voice":
                print(f"🇱🇰 Analyzing Sinhala: '{query}'...")
            
            # Pass History to RAG Engine (With Patient ID)
            result = chatbot.process_query(query, patient_id="default_patient_cli", chat_history=chat_history)
            response_text = result["response"]
            
            # --- 🕵️ AGENTIC LAYER: CHECK FOR TOOLS ---
            map_tag = "[MAPS:"
            if map_tag in response_text:
                # 1. Extract the location
                start_index = response_text.find(map_tag) + len(map_tag)
                end_index = response_text.find("]", start_index)
                if end_index != -1:
                    location_query = response_text[start_index:end_index].strip()
                    
                    # 2. Clean the response (Remove the tag so the user doesn't hear it)
                    response_text = response_text.replace(f"{map_tag} {location_query}]", "")
                    response_text = response_text.replace(f"{map_tag}{location_query}]", "")
                    
                    # 3. Execute the Tool
                    print(f"\n🗺️  AGENT ACTION: Opening Google Maps for '{location_query}'...")
                    maps_url = f"https://www.google.com/maps/search/{location_query.replace(' ', '+')}"
                    webbrowser.open(maps_url) 
            # ----------------------------------------
            
            # Update History
            chat_history.append({"role": "user", "content": query})
            chat_history.append({"role": "assistant", "content": response_text})
            # Limit to last 10 turns
            if len(chat_history) > 10:
                chat_history = chat_history[-10:]
            
            print("\n" + "="*50)
            print("🤖 NEPHRO-AI RESPONSE:")
            print("="*50)
            print(response_text)
            print("\n" + "-"*50)
            print(f"📚 Sources Used: {len(result['source_documents'])}")
            
            # Voice Output (en/si)
            # Uses Edge TTS (High Quality + Free)
            if current_mode == "voice" or current_mode == "sinhala_voice":
                clean_response = clean_text_for_tts(response_text)
                tts.generate_and_play(clean_response)
            
        except KeyboardInterrupt:
            print("\n👋 Goodbye!")
            break
        except Exception as e:
            print(f"\n❌ Error: {e}")

if __name__ == "__main__":
    main()
