import sys
import os
import shutil
import hashlib
import base64
import asyncio
import re  # <--- NEW IMPORT FOR CLEANING TEXT
import struct
import wave
import io
from pathlib import Path
import aiofiles

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel
import edge_tts
from pydub import AudioSegment  # still used for STT audio normalization
from google import genai
from google.genai import types

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

from src.chatbot.rag_engine import RAGEngine
from src.chatbot.patient_input import PatientInputHandler
from src.chatbot.config import GOOGLE_API_KEY, GOOGLE_TTS_MODEL, GOOGLE_TTS_VOICE, TTS_PHONETIC_ENABLED
from src.chatbot.nlg_glossary import NLGGlossary
from src.utils.logger import ConsoleLogger as Log

app = FastAPI(title="Nephro-AI Context-Aware Chatbot API")

# --- DATA MODELS ---
class LoginRequest(BaseModel):
    email: str = None
    username: str = None
    password: str

class ChatRequest(BaseModel):
    text: str
    patient_id: str = "default_patient"

class TTSRequest(BaseModel):
    text: str
    urgency_flags: list = []  # list of {flag, term, ...} dicts from NLG engine

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------------------------------------------------------
# GLOBAL ENGINES
# -----------------------------------------------------------------------------
SESSIONS = {}

Log.section("NEPHRO-AI SERVER STARTUP")
try:
    Log.step("⚙️", "Initializing AI Engines...")
    rag_engine = RAGEngine()
    stt_engine = PatientInputHandler(model_size="small")

    # Initialize Gemini TTS Client
    gemini_client = None
    if GOOGLE_API_KEY:
        try:
            gemini_client = genai.Client(api_key=GOOGLE_API_KEY)
            Log.success("Gemini TTS Client Initialized (Sinhala Voice: Kore)")
        except Exception as e:
            Log.warning(f"Gemini TTS client failed to initialize: {e}")
    else:
        Log.warning("GOOGLE_API_KEY not set - Gemini TTS disabled, using Edge-TTS fallback")

    # 🆕 NLG Glossary for TTS phonetic preprocessing
    nlg_glossary = NLGGlossary()
    Log.success("NLG Glossary loaded for TTS phonetic layer")

    Log.success("All Engines Loaded Successfully")
    print("-" * 60)
except Exception as e:
    Log.error(f"Error loading engines: {e}")
    sys.exit(1)

Path("temp_inputs").mkdir(exist_ok=True)
Path("tts_cache").mkdir(exist_ok=True)

# --- PRE-GENERATION CACHE for emergency phrases (populated once at startup) ---
EMERGENCY_PHRASES = {
    # Sinhala: "Go to a hospital right now! This is a medical emergency."
    "si": "\u0dafැන් රෝහලයට යන්න! මෙය හදිසි වැද්\u200dය අවස්අාවකි.",
    "en": "This sounds urgent. Please go to a hospital immediately.",
}
PREGEN_CACHE: dict = {}  # {"si": Path(...), "en": Path(...)}

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

def split_into_sentences(text: str) -> list:
    """
    Split text into TTS-sized chunks at sentence boundaries.
    Merges fragments shorter than 15 chars into the preceding sentence.
    """
    # Split at sentence-ending punctuation (Sinhala \u0964 = danda, English . ! ?)
    parts = re.split(r'(?<=[.!?\u0964\n])\s+', text.strip())
    merged = []
    buffer = ""
    for part in parts:
        part = part.strip()
        if not part:
            continue
        buffer = (buffer + " " + part).strip() if buffer else part
        if len(buffer) >= 15:  # minimum viable TTS chunk
            merged.append(buffer)
            buffer = ""
    if buffer:
        if merged:
            merged[-1] += " " + buffer
        else:
            merged.append(buffer)
    return merged if merged else [text]


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
    Hybrid TTS Generator:
    - Sinhala: Gemini TTS (Kore voice) with Edge-TTS fallback
    - English: Edge-TTS (AriaNeural)
    """
    # 0. Clean the text
    clean_text = clean_text_for_tts(text)

    # 1. Detect Language
    is_sinhala = any('\u0D80' <= char <= '\u0DFF' for char in text)

    # 1.5 🆕 TTS Phonetic Preprocessing (Angle 3: TTS Pronunciation Optimization)
    # Replaces English medical terms embedded in Sinhala with phonetic Singlish
    # e.g. "Pressure එක" → "pressure eka" so Gemini TTS pronounces them naturally
    if is_sinhala and TTS_PHONETIC_ENABLED:
        clean_text = nlg_glossary.apply_tts_phonetics(clean_text)
        print(f"   🔤 TTS Phonetic: Applied Singlish pronunciation hints")
    engine_label = "Gemini" if is_sinhala else "Edge"

    print(f"🔊 TTS REQUEST: Length={len(clean_text)} chars | Detected={'SINHALA' if is_sinhala else 'ENGLISH'} | Engine={engine_label}")

    # 2. Check Cache (prefix hash with engine name for isolation)
    file_hash = hashlib.md5(f"{clean_text}_{engine_label}".encode()).hexdigest()
    output_path = Path("tts_cache") / f"{file_hash}.mp3"

    if output_path.exists():
        print(f"   ↳ ⚡ Serving Cached Audio ({engine_label})")
        return output_path

    # 3. Generate Audio
    if is_sinhala:
        # Try Gemini TTS first
        success = False
        if gemini_client:
            loop = asyncio.get_event_loop()
            success = await loop.run_in_executor(None, _generate_gemini_tts, clean_text, output_path)

        if not success:
            # Fallback to Edge-TTS for Sinhala
            print("   ↳ Falling back to Edge-TTS for Sinhala")
            voice = "si-LK-ThiliniNeural"
            try:
                communicate = edge_tts.Communicate(clean_text, voice)
                await communicate.save(str(output_path))
                print(f"   ✅ Edge-TTS fallback successful")
            except Exception as e:
                print(f"   ❌ Edge-TTS fallback also failed: {e}")
                with open(output_path, 'wb') as f:
                    f.write(b'')
    else:
        # English: Edge-TTS
        voice = "en-US-AriaNeural"
        print(f"   ↳ Generating with Edge-TTS voice: [{voice}]")
        try:
            communicate = edge_tts.Communicate(clean_text, voice)
            await communicate.save(str(output_path))
            print(f"   ✅ TTS Generation Successful")
        except Exception as e:
            print(f"   ❌ TTS FAILED: {e}")
            with open(output_path, 'wb') as f:
                f.write(b'')

    return output_path


def _generate_gemini_tts(text: str, output_path: Path) -> bool:
    """
    Generate TTS audio using Gemini API (synchronous, runs in thread pool).
    Outputs PCM -> WAV directly (NO PYDUB TRANSCODING).
    Returns True on success, False on failure.
    """
    try:
        response = gemini_client.models.generate_content(
            model=GOOGLE_TTS_MODEL,
            contents=text,
            config=types.GenerateContentConfig(
                response_modalities=["AUDIO"],
                speech_config=types.SpeechConfig(
                    voice_config=types.VoiceConfig(
                        prebuilt_voice_config=types.PrebuiltVoiceConfig(
                            voice_name=GOOGLE_TTS_VOICE,
                        )
                    )
                ),
            ),
        )

        pcm_data = response.candidates[0].content.parts[0].inline_data.data

        # Write PCM directly into a WAV file — zero transcoding
        wav_path = output_path.with_suffix(".wav")
        with wave.open(str(wav_path), "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)       # 16-bit
            wf.setframerate(24000)   # 24kHz
            wf.writeframes(pcm_data)

        # Move to output_path so the cache key resolves correctly
        wav_path.replace(output_path)

        print(f"   ✅ Gemini TTS generation successful (model: {GOOGLE_TTS_MODEL}, voice: {GOOGLE_TTS_VOICE})")
        return True

    except Exception as e:
        print(f"   ❌ Gemini TTS failed: {e}")
        return False

def _generate_gemini_tts_bytes(text: str):
    """
    Generate TTS audio using Gemini API.
    Returns raw WAV bytes instantly (NO PYDUB TRANSCODING).
    """
    try:
        response = gemini_client.models.generate_content(
            model=GOOGLE_TTS_MODEL,
            contents=text,
            config=types.GenerateContentConfig(
                response_modalities=["AUDIO"],
                speech_config=types.SpeechConfig(
                    voice_config=types.VoiceConfig(
                        prebuilt_voice_config=types.PrebuiltVoiceConfig(
                            voice_name=GOOGLE_TTS_VOICE,
                        )
                    )
                ),
            ),
        )

        pcm_data = response.candidates[0].content.parts[0].inline_data.data

        # Instantly wrap the raw PCM in a WAV header — no pydub/ffmpeg
        wav_buffer = io.BytesIO()
        with wave.open(wav_buffer, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)      # 16-bit
            wf.setframerate(24000)  # 24kHz
            wf.writeframes(pcm_data)

        return wav_buffer.getvalue()

    except Exception as e:
        print(f"   \u274c Gemini TTS bytes failed: {e}")
        return None


async def _pregen_emergency_audio():
    """
    Called once at startup. Pre-generates WAV/MP3 files for each emergency
    phrase so CRITICAL_URGENCY responses hit the local disk instead of waiting
    for a Gemini API call.
    """
    global PREGEN_CACHE
    for lang, phrase in EMERGENCY_PHRASES.items():
        try:
            path = await generate_tts_file(phrase)
            if path.exists() and path.stat().st_size > 0:
                PREGEN_CACHE[lang] = path
                print(f"   \u2705 Emergency audio ready [{lang}]: {path.name} ({path.stat().st_size:,} bytes)")
            else:
                print(f"   \u26a0\ufe0f  Emergency pre-gen returned empty file [{lang}]")
        except Exception as e:
            print(f"   \u26a0\ufe0f  Emergency pre-gen failed [{lang}]: {e}")


@app.on_event("startup")
async def startup_event():
    Log.step("\U0001f6a8", "Pre-generating emergency audio phrases...")
    await _pregen_emergency_audio()
    if PREGEN_CACHE:
        Log.success(f"Emergency audio cache ready ({len(PREGEN_CACHE)} phrase(s) cached)")
    else:
        Log.warning("Emergency audio pre-gen skipped — will generate on first hit")


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

# --- TTS ENDPOINT (Gemini TTS for Sinhala, Edge-TTS for English) ---
@app.post("/chat/tts")
@app.post("/api/chat/tts")
async def text_to_speech(request: TTSRequest):
    """Generate TTS audio for given text. Returns MP3 audio file."""
    if not request.text or not request.text.strip():
        raise HTTPException(status_code=400, detail="Text is required")

    Log.step("🔊", "TTS REQUEST", f"Length: {len(request.text)} chars")

    try:
        output_audio_path = await generate_tts_file(request.text)

        if output_audio_path.stat().st_size == 0:
            raise HTTPException(status_code=500, detail="TTS generation failed")

        return FileResponse(
            output_audio_path,
            media_type="audio/mpeg",
            headers={
                "Content-Disposition": "attachment; filename=tts_output.mp3"
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ TTS endpoint error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# --- STREAMING TTS ENDPOINT (parallel sentence-by-sentence generation) ---
@app.post("/chat/tts/stream")
@app.post("/api/chat/tts/stream")
async def text_to_speech_stream(request: TTSRequest):
    """
    Parallel TTS: splits text into sentences, generates each in parallel,
    returns all MP3 segments as a length-framed binary blob.
    Frame format per segment: [4-byte big-endian uint32 length][MP3 bytes]
    Client decodes and plays segments sequentially for faster perceived start.
    """
    if not request.text or not request.text.strip():
        raise HTTPException(status_code=400, detail="Text is required")

    clean_text = clean_text_for_tts(request.text)
    is_sinhala = any('\u0D80' <= char <= '\u0DFF' for char in request.text)

    if is_sinhala and TTS_PHONETIC_ENABLED:
        clean_text = nlg_glossary.apply_tts_phonetics(clean_text)

    sentences = split_into_sentences(clean_text)
    Log.step("\U0001f50a", "PARALLEL STREAM TTS",
             f"{len(sentences)} sentences | {'SINHALA' if is_sinhala else 'ENGLISH'}")

    loop = asyncio.get_event_loop()

    async def generate_sentence_bytes(idx: int, sentence: str):
        print(f"   \u21b3 [S{idx+1}/{len(sentences)}] {sentence[:60]}...")
        mp3_bytes = None
        if is_sinhala and gemini_client:
            mp3_bytes = await loop.run_in_executor(
                None, _generate_gemini_tts_bytes, sentence
            )
        else:
            voice = "si-LK-ThiliniNeural" if is_sinhala else "en-US-AriaNeural"
            try:
                tmp_path = Path("tts_cache") / f"stmp_{hashlib.md5(sentence.encode()).hexdigest()}.mp3"
                communicate = edge_tts.Communicate(sentence, voice)
                await communicate.save(str(tmp_path))
                mp3_bytes = tmp_path.read_bytes()
                tmp_path.unlink(missing_ok=True)
            except Exception as e:
                print(f"   \u274c [S{idx+1}] Edge-TTS failed: {e}")
        if mp3_bytes:
            print(f"   \u2705 [S{idx+1}] Ready — {len(mp3_bytes):,} bytes")
        return mp3_bytes

    # Fire all sentences in parallel
    results = await asyncio.gather(
        *[generate_sentence_bytes(i, s) for i, s in enumerate(sentences)]
    )

    # Pack as length-framed binary: <uint32 len><wav/mp3 bytes> per segment
    output = io.BytesIO()
    valid = 0

    # 🚨 CRITICAL_URGENCY fast-path: prepend pre-cached emergency phrase (0ms disk read)
    flag_types = [f.get("flag") for f in request.urgency_flags]
    if "CRITICAL_URGENCY" in flag_types:
        pregen_key = "si" if is_sinhala else "en"
        pregen_path = PREGEN_CACHE.get(pregen_key)
        if pregen_path and pregen_path.exists():
            emergency_bytes = pregen_path.read_bytes()
            output.write(struct.pack(">I", len(emergency_bytes)))
            output.write(emergency_bytes)
            valid += 1
            print(f"   \U0001f6a8 CRITICAL_URGENCY: prepended emergency phrase ({len(emergency_bytes):,} bytes, 0ms)")
        else:
            print("   \u26a0\ufe0f  CRITICAL_URGENCY: pre-cache miss \u2014 emergency phrase not available")

    for wav_bytes in results:
        if wav_bytes:
            output.write(struct.pack(">I", len(wav_bytes)))
            output.write(wav_bytes)
            valid += 1

    data = output.getvalue()
    if not data:
        raise HTTPException(status_code=500, detail="All TTS segments failed")

    print(f"   \u2705 Returning {valid} segment(s) \u2014 {len(data):,} bytes total")
    return Response(
        content=data,
        media_type="application/octet-stream",
        headers={"X-Segment-Count": str(valid)},
    )


# --- CLEAR CACHE ENDPOINT ---
@app.post("/chat/clear")
@app.post("/api/chat/clear")
async def clear_chat(request: ChatRequest):
    """Clear chat history and cache for a patient"""
    patient_id = request.patient_id
    Log.step("🗑️", "CLEAR REQUEST", f"Clearing history & cache for '{patient_id}'")
    
    # Clear session history
    if patient_id in SESSIONS:
        del SESSIONS[patient_id]
        Log.step("  ", "Session Cleared", f"Removed history for {patient_id}")
    
    # Clear RAG cache for this patient
    cleared_count = rag_engine.clear_cache_for_patient(patient_id)
    
    return {
        "success": True,
        "message": f"Cleared chat history and {cleared_count} cached responses for {patient_id}"
    }

@app.post("/chat/text")
@app.post("/api/chat/text")
async def text_chat(request: ChatRequest):
    patient_id = request.patient_id
    Log.step("📨", "REQUEST RECEIVED", f"Patient ID: '{patient_id}'")
    
    # --- ZOMBIE CONTEXT FIX ---
    # Detect session starters and wipe memory
    GREETINGS = ["hi", "hello", "ayubowan", "start over", "help", "hey", "good morning", "good evening"]
    
    # Clean and check
    clean_input = request.text.lower().strip().replace(".", "").replace("!", "")
    
    if clean_input in GREETINGS:
        Log.warning(f"DETECTED GREETING ('{clean_input}'): Clearing history for {patient_id}")
        SESSIONS[patient_id] = []
    # ---------------------------

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
        "nlu_analysis": result.get("nlu_analysis", {}),
        "urgency_flags": result.get("urgency_flags", []),
    }

@app.post("/chat/audio")
@app.post("/api/chat/audio")
async def audio_chat(
    background_tasks: BackgroundTasks, 
    file: UploadFile = File(...), 
    patient_id: str = Form("default_patient")
):
    Log.step("🎙️", "AUDIO REQUEST", f"Patient: {patient_id}")
    
    temp_filename = f"temp_{hashlib.md5(file.filename.encode()).hexdigest()}.wav"
    input_path = Path("temp_inputs") / temp_filename
    
    async with aiofiles.open(input_path, 'wb') as out_file:
        content = await file.read()
        await out_file.write(content)
        
    try:
        # 2. Normalize Audio
        Log.step(" ", "Normalizing Audio...")
        audio = AudioSegment.from_file(str(input_path))
        normalized_audio = audio.apply_gain(-20.0 - audio.dBFS)
        normalized_path = input_path.with_name(f"clean_{input_path.name}")
        normalized_audio.export(str(normalized_path), format="wav")
        background_tasks.add_task(cleanup_file, str(normalized_path))
        
        # 3. Transcribe
        loop = asyncio.get_event_loop()
        transcribed_text = await loop.run_in_executor(None, stt_engine.transcribe_audio, str(normalized_path))
        Log.step("📝", "Transcribed", f"'{transcribed_text}'")
        
        gibberish_triggers = ["Tamb", "Hue", "כש", "subs", "Amara", "Unara"]
        is_garbage = any(x in transcribed_text for x in gibberish_triggers) or len(transcribed_text) < 2
        
        rag_result = {}
        # Retrieve THIS patient's history (default to empty list if new)
        user_history = SESSIONS.get(patient_id, [])

        if is_garbage:
            Log.warning("Detected Silence/Gibberish. Skipping processing.")
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

        # 5. Generate TTS (Gemini for Sinhala, Edge-TTS for English)
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
