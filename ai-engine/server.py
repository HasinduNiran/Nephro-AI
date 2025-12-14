import sys
import os
import shutil
import hashlib
import base64
import asyncio
from pathlib import Path
from typing import Dict, Any
import aiofiles  # NEW: For non-blocking file operations

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
import edge_tts
from pydub import AudioSegment # NEW: For Audio Normalization

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

from src.chatbot.rag_engine import RAGEngine
from src.chatbot.patient_input import PatientInputHandler

app = FastAPI(title="Nephro-AI Context-Aware Chatbot API")

# Setup CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------------------------------------------------------
# GLOBAL ENGINES
# -----------------------------------------------------------------------------
print("⚙️ Loading AI Engines...")
try:
    rag_engine = RAGEngine()
    # model_size="tiny" or "base" is faster for development; "medium" for accuracy
    stt_engine = PatientInputHandler(model_size="medium")
    print("✅ All Engines Loaded Successfully")
except Exception as e:
    print(f"❌ Error loading engines: {e}")
    sys.exit(1)

# Ensure directories exist
Path("temp_inputs").mkdir(exist_ok=True)
Path("tts_cache").mkdir(exist_ok=True)

# -----------------------------------------------------------------------------
# HELPERS
# -----------------------------------------------------------------------------
def cleanup_file(path: str):
    """Background task to remove temp files after response is sent"""
    try:
        os.remove(path)
        print(f"🧹 Cleaned up: {path}")
    except Exception as e:
        print(f"⚠️ Cleanup failed for {path}: {e}")

async def generate_tts_file(text: str) -> Path:
    # 1. Logic for language detection
    is_sinhala = any('\u0D80' <= char <= '\u0DFF' for char in text)
    voice = "si-LK-ThiliniNeural" if is_sinhala else "en-US-AriaNeural"
    
    # 2. Caching Strategy
    # Hash the text + voice to create a unique filename
    file_hash = hashlib.md5(f"{text}{voice}".encode()).hexdigest()
    output_path = Path("tts_cache") / f"{file_hash}.mp3"
    
    # If cached, return immediately
    if output_path.exists():
        print(f"⚡ Serving Cached TTS: {file_hash[:8]}...")
        return output_path

    # Otherwise, generate
    print(f"🔊 Generating New TTS ({voice})...")
    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(str(output_path))
    return output_path

# -----------------------------------------------------------------------------
# ENDPOINTS
# -----------------------------------------------------------------------------
@app.get("/")
def health_check():
    return {"status": "active", "service": "Nephro-AI Chatbot API"}

@app.post("/chat/text")
async def text_chat(request: ChatRequest):
    # Run the blocking RAG process in a thread pool to keep server responsive
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, rag_engine.process_query, request.text, request.patient_id)
    
    return {
        "response": result["response"],
        "nlu_analysis": result.get("nlu_analysis", {})
    }

@app.post("/chat/audio")
async def audio_chat(
    background_tasks: BackgroundTasks, # NEW: For cleanup
    file: UploadFile = File(...), 
    patient_id: str = Form("default_patient")
):
    print(f"\n🎙️ Audio Request Received (Patient: {patient_id})")
    
    # 1. Save Upload (Non-blocking)
    temp_filename = f"temp_{hashlib.md5(file.filename.encode()).hexdigest()}.wav"
    input_path = Path("temp_inputs") / temp_filename
    
    async with aiofiles.open(input_path, 'wb') as out_file:
        content = await file.read()
        await out_file.write(content)
        
    try:
        # 1.5 NORMALIZE AUDIO (Server-Side Quality Fix)
        # Load audio (pydub handles m4a/mp3 via ffmpeg)
        print("   🔊 Normalizing Audio...")
        audio = AudioSegment.from_file(str(input_path))
        # Normalize to -20dBFS (Standard voice level)
        normalized_audio = audio.apply_gain(-20.0 - audio.dBFS)
        # Export as clean WAV for Whisper
        normalized_path = input_path.with_name(f"clean_{input_path.name}")
        normalized_audio.export(str(normalized_path), format="wav")
        
        # Update input_path to use the clean version
        # We keep the original for cleanup, but standard cleanup logic handles list of files or folder
        # For simplicity, we just use the new path for STT and register it for cleanup too
        background_tasks.add_task(cleanup_file, str(normalized_path))
        
        # 2. Transcribe (Run in Thread)
        loop = asyncio.get_event_loop()
        transcribed_text = await loop.run_in_executor(None, stt_engine.transcribe_audio, str(normalized_path))
        print(f"   📝 Transcribed: '{transcribed_text}'")
        
        if not transcribed_text:
            transcribed_text = "I couldn't hear you clearly."
            response_text = "Please try speaking again."
        else:
            # 3. Process RAG (Run in Thread)
            rag_result = await loop.run_in_executor(None, rag_engine.process_query, transcribed_text, patient_id)
            response_text = rag_result["response"]

        # 4. Generate TTS (Async native)
        output_audio_path = await generate_tts_file(response_text)
        
        # 5. Safe Header Encoding (Crucial for Sinhala)
        # We Base64 encode the Sinhala text so HTTP doesn't break
        safe_transcription = base64.b64encode(transcribed_text.encode('utf-8')).decode('ascii')
        safe_response = base64.b64encode(response_text.encode('utf-8')).decode('ascii')

        # Register cleanup task to run AFTER response is sent
        background_tasks.add_task(cleanup_file, str(input_path))

        return FileResponse(
            output_audio_path, 
            media_type="audio/mpeg",
            headers={
                "X-Transcription-B64": safe_transcription,
                "X-Response-B64": safe_response
            }
        )

    except Exception as e:
        # Cleanup even if error
        cleanup_file(str(input_path))
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    # Accessible on local network
    # reload=True is good for dev, allowing quick updates if we change code
    uvicorn.run(app, host="0.0.0.0", port=8000)
