import sys
import os
import shutil
import hashlib
import base64
import asyncio
import re  # <--- NEW IMPORT FOR CLEANING TEXT
from pathlib import Path
import aiofiles  

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
import edge_tts
from pydub import AudioSegment 

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

from src.chatbot.rag_engine import RAGEngine
from src.chatbot.patient_input import PatientInputHandler

app = FastAPI(title="Nephro-AI Context-Aware Chatbot API")

# --- DATA MODELS ---
class LoginRequest(BaseModel):
    email: str = None
    username: str = None
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
# -----------------------------------------------------------------------------
# GLOBAL ENGINES
# -----------------------------------------------------------------------------
SESSIONS = {} 

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

def clean_text_for_tts(text: str) -> str:
    """Removes Markdown symbols and unsupported characters."""
    # Remove bold/italic markers (*, _)
    text = re.sub(r'[\*_#]', '', text) 
    # Remove markdown links [text](url) -> text
    text = re.sub(r'\[([^\]]+)\]\([^\)]+\)', r'\1', text)
    # Remove emojis and unsupported chars (keep only Sinhala, English, numbers, punctuation)
    text = re.sub(r'[^\w\s\u0D80-\u0DFF\.,\?!a-zA-Z0-9]', '', text)
    return text

async def generate_tts_file(text: str) -> Path:
    """
    Pure EdgeTTS Generator (No External GPU required)
    """
    # 0. CLEAN THE TEXT (Fixes 'Tharuwa' issue)
    clean_text = clean_text_for_tts(text)

    # 1. Detect Language (Explicit Log)
    is_sinhala = any('\u0D80' <= char <= '\u0DFF' for char in text)
    
    print(f"🔊 TTS REQUEST: Length={len(clean_text)} chars | Detected={'SINHALA' if is_sinhala else 'ENGLISH'}")

    # 2. Check Cache
    file_hash = hashlib.md5(f"{clean_text}_Edge".encode()).hexdigest()
    output_path = Path("tts_cache") / f"{file_hash}.mp3"
    
    if output_path.exists():
        print(f"   ↳ ⚡ Serving Cached Audio")
        return output_path

    # 3. Select Voice
    if is_sinhala:
        voice = "si-LK-ThiliniNeural"
    else:
        voice = "en-US-AriaNeural"
        
    print(f"   ↳ Generating new audio using voice: [{voice}]")
    
    try:
        # Send CLEAN text to TTS
        communicate = edge_tts.Communicate(clean_text, voice)
        await communicate.save(str(output_path))
        print(f"   ✅ TTS Generation Successful")
    except Exception as e:
        print(f"   ❌ TTS FAILED: {e}")
        with open(output_path, 'wb') as f: f.write(b'')
            
    return output_path

# -----------------------------------------------------------------------------
# ENDPOINTS
# -----------------------------------------------------------------------------

@app.post("/login")
@app.post("/api/login")
@app.post("/auth/login")
async def login(request: LoginRequest):
    user_id = request.email or request.username or "unknown_user"
    
    # Initialize session for this specific user
    SESSIONS[user_id] = [] 
    
    print(f"🔓 Login attempt for: {user_id}. History cleared.")
    return {
        "access_token": "mock-token-123",
        "token_type": "bearer",
        "user_id": user_id, 
        "message": "Login Successful"
    }

@app.get("/")
def health_check():
    return {"status": "active"}

@app.post("/chat/text")
@app.post("/api/chat/text")
async def text_chat(request: ChatRequest):
    patient_id = request.patient_id
    print(f"📨 Server received request for Patient ID: '{patient_id}'")
    
    # Retrieve THIS patient's history (default to empty list if new)
    user_history = SESSIONS.get(patient_id, [])
    
    loop = asyncio.get_event_loop()
    # Pass user_history instead of CHAT_HISTORY
    result = await loop.run_in_executor(None, rag_engine.process_query, request.text, patient_id, user_history)
    
    # Update THIS patient's history
    user_history.append({"role": "user", "content": request.text})
    user_history.append({"role": "assistant", "content": result["response"]})
    
    # Keep only last 10 messages (Sliding Window)
    if len(user_history) > 10: 
        user_history = user_history[-10:]
    
    SESSIONS[patient_id] = user_history # Save back to global dict
    
    return {
        "response": result["response"],
        "sources": result.get("source_metadata", []),
        "nlu_analysis": result.get("nlu_analysis", {})
    }

@app.post("/chat/audio")
@app.post("/api/chat/audio")
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
        # 2. Normalize Audio
        print("   🔊 Normalizing Audio...")
        audio = AudioSegment.from_file(str(input_path))
        normalized_audio = audio.apply_gain(-20.0 - audio.dBFS)
        normalized_path = input_path.with_name(f"clean_{input_path.name}")
        normalized_audio.export(str(normalized_path), format="wav")
        background_tasks.add_task(cleanup_file, str(normalized_path))
        
        # 3. Transcribe
        loop = asyncio.get_event_loop()
        transcribed_text = await loop.run_in_executor(None, stt_engine.transcribe_audio, str(normalized_path))
        print(f"   📝 Transcribed: '{transcribed_text}'")
        
        gibberish_triggers = ["Tamb", "Hue", "כש", "subs", "Amara", "Unara"]
        is_garbage = any(x in transcribed_text for x in gibberish_triggers) or len(transcribed_text) < 2
        
        rag_result = {}
        # Retrieve THIS patient's history (default to empty list if new)
        user_history = SESSIONS.get(patient_id, [])

        if is_garbage:
            print("   ⚠️ Detected Silence/Gibberish. Skipping processing.")
            transcribed_text = "(Silence/Noise)"
            response_text = "I couldn't hear you clearly. Please try again."
        else:
            rag_result = await loop.run_in_executor(None, rag_engine.process_query, transcribed_text, patient_id, user_history)
            response_text = rag_result["response"]

            user_history.append({"role": "user", "content": transcribed_text})
            user_history.append({"role": "assistant", "content": response_text})
            if len(user_history) > 10: 
                user_history = user_history[-10:]
            SESSIONS[patient_id] = user_history # Save back to global dict

        # 5. Generate TTS (Pure EdgeTTS)
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
    uvicorn.run(app, host="0.0.0.0", port=8001)
