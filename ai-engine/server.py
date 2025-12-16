import sys
import os
import shutil
import hashlib
import base64
import asyncio
from pathlib import Path
import aiofiles  

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
import edge_tts
from pydub import AudioSegment 
from gradio_client import Client, handle_file

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

from src.chatbot.rag_engine import RAGEngine
from src.chatbot.patient_input import PatientInputHandler

# --- CONFIGURATION ---
# ✅ UPDATE THIS URL EVERY TIME KAGGLE RESTARTS
KAGGLE_API_URL = "https://d10eaf9179cb275d4d.gradio.live"  
REF_AUDIO_FILE = "ref_voice.wav" 

app = FastAPI(title="Nephro-AI Context-Aware Chatbot API")

# --- DATA MODELS ---
class LoginRequest(BaseModel):
    email: str
    password: str

class ChatRequest(BaseModel):
    text: str
    patient_id: str = "default_patient"

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------------------------------------------------------
# GLOBAL ENGINES
# -----------------------------------------------------------------------------
CHAT_HISTORY = [] 

print("⚙️ Loading AI Engines...")
try:
    rag_engine = RAGEngine()
    stt_engine = PatientInputHandler(model_size="small")
    print("✅ All Engines Loaded Successfully")
except Exception as e:
    print(f"❌ Error loading engines: {e}")
    sys.exit(1)

Path("temp_inputs").mkdir(exist_ok=True)
Path("tts_cache").mkdir(exist_ok=True)

# -----------------------------------------------------------------------------
# HELPERS
# -----------------------------------------------------------------------------
def cleanup_file(path: str):
    try:
        file_path = Path(path)
        if file_path.exists():
            os.remove(file_path)
            print(f"🧹 Cleaned up: {path}")
    except Exception as e:
        print(f"⚠️ Cleanup warning: {e}")

async def generate_tts_file(text: str) -> Path:
    """
    Hybrid TTS: Uses Kaggle GPU for Sinhala, EdgeTTS for English/Backup.
    """
    is_sinhala = any('\u0D80' <= char <= '\u0DFF' for char in text)
    
    file_hash = hashlib.md5(f"{text}_F5".encode()).hexdigest()
    output_path = Path("tts_cache") / f"{file_hash}.mp3"
    
    if output_path.exists():
        print(f"⚡ Serving Cached TTS: {file_hash[:8]}...")
        return output_path

    # 3. TRY KAGGLE GPU (Only for Sinhala)
    if is_sinhala:
        print(f"☁️ Sending to Kaggle GPU: {text[:20]}...")
        try:
            # ✅ FIX: Add headers to bypass Ngrok warning page
            client = Client(
                KAGGLE_API_URL, 
                headers={'ngrok-skip-browser-warning': 'true'}
            )
            
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                None, 
                lambda: client.predict(
                    text, 
                    handle_file(REF_AUDIO_FILE), 
                    "Reference text", 
                    api_name="/predict"
                )
            )
            
            generated_wav = result[0]
            shutil.copy(generated_wav, str(output_path))
            print(f"✅ Kaggle TTS Success: {output_path}")
            return output_path

        except Exception as e:
            # Print the exact error so we know why it failed
            print(f"⚠️ Kaggle Failed: {e}") 
            print("🔄 Switching to Backup...")

    # 4. BACKUP: EDGE TTS
    voice = "si-LK-ThiliniNeural" if is_sinhala else "en-US-AriaNeural"
    print(f"🔊 Generating EdgeTTS Backup ({voice})...")
    
    try:
        communicate = edge_tts.Communicate(text, voice)
        await communicate.save(str(output_path))
    except Exception as e:
        print(f"❌ TTS Critical Error: {e}")
        with open(output_path, 'wb') as f: f.write(b'')
            
    return output_path

# -----------------------------------------------------------------------------
# ENDPOINTS
# -----------------------------------------------------------------------------

# ✅ FIX: MOCK LOGIN ENDPOINT (Supports /login and /api/login)
@app.post("/login")
@app.post("/api/login")
@app.post("/auth/login") # ✅ Added this line
async def login(request: LoginRequest):
    print(f"🔓 Login attempt for: {request.email}")
    # Always return success for the prototype
    return {
        "access_token": "mock-token-123",
        "token_type": "bearer",
        "user_id": "p_001",
        "message": "Login Successful"
    }

@app.get("/")
def health_check():
    return {"status": "active"}

@app.post("/chat/text")
@app.post("/api/chat/text") # Alias for safety
async def text_chat(request: ChatRequest):
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, rag_engine.process_query, request.text, request.patient_id, CHAT_HISTORY)
    
    CHAT_HISTORY.append({"role": "user", "content": request.text})
    CHAT_HISTORY.append({"role": "assistant", "content": result["response"]})
    if len(CHAT_HISTORY) > 10: CHAT_HISTORY.pop(0); CHAT_HISTORY.pop(0)
    
    return {
        "response": result["response"],
        "sources": result.get("source_metadata", []),
        "nlu_analysis": result.get("nlu_analysis", {})
    }

@app.post("/chat/audio")
@app.post("/api/chat/audio") # Alias for safety
async def audio_chat(
    background_tasks: BackgroundTasks, 
    file: UploadFile = File(...), 
    patient_id: str = Form("default_patient")
):
    print(f"\n🎙️ Audio Request Received (Patient: {patient_id})")
    
    temp_filename = f"temp_{hashlib.md5(file.filename.encode()).hexdigest()}.wav"
    input_path = Path("temp_inputs") / temp_filename
    
    async with aiofiles.open(input_path, 'wb') as out_file:
        content = await file.read()
        await out_file.write(content)
        
    try:
        print("   🔊 Normalizing Audio...")
        audio = AudioSegment.from_file(str(input_path))
        normalized_audio = audio.apply_gain(-20.0 - audio.dBFS)
        normalized_path = input_path.with_name(f"clean_{input_path.name}")
        normalized_audio.export(str(normalized_path), format="wav")
        background_tasks.add_task(cleanup_file, str(normalized_path))
        
        loop = asyncio.get_event_loop()
        transcribed_text = await loop.run_in_executor(None, stt_engine.transcribe_audio, str(normalized_path))
        print(f"   📝 Transcribed: '{transcribed_text}'")
        
        gibberish_triggers = ["Tamb", "Hue", "כש", "subs", "Amara", "Unara"]
        is_garbage = any(x in transcribed_text for x in gibberish_triggers) or len(transcribed_text) < 2
        
        rag_result = {} 

        if is_garbage:
            print("   ⚠️ Detected Silence/Gibberish. Skipping processing.")
            transcribed_text = "(Silence/Noise)"
            response_text = "I couldn't hear you clearly. Please try again."
        else:
            rag_result = await loop.run_in_executor(None, rag_engine.process_query, transcribed_text, patient_id, CHAT_HISTORY)
            response_text = rag_result["response"]

            CHAT_HISTORY.append({"role": "user", "content": transcribed_text})
            CHAT_HISTORY.append({"role": "assistant", "content": response_text})
            if len(CHAT_HISTORY) > 10: CHAT_HISTORY.pop(0); CHAT_HISTORY.pop(0)

        output_audio_path = await generate_tts_file(response_text)
        
        safe_transcription = base64.b64encode(transcribed_text.encode('utf-8')).decode('ascii')
        safe_response = base64.b64encode(response_text.encode('utf-8')).decode('ascii')
        sources_list = [m.get('source', 'Unknown') for m in rag_result.get("source_metadata", [])]
        safe_sources = base64.b64encode(", ".join(sources_list).encode('utf-8')).decode('ascii')

        background_tasks.add_task(cleanup_file, str(input_path))

        return FileResponse(
            output_audio_path, 
            media_type="audio/mpeg",
            headers={
                "X-Transcription-B64": safe_transcription,
                "X-Response-B64": safe_response,
                "X-Sources-B64": safe_sources 
            }
        )

    except Exception as e:
        cleanup_file(str(input_path))
        print(f"❌ Server Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    # ✅ Port 8000
    uvicorn.run(app, host="0.0.0.0", port=8000)
