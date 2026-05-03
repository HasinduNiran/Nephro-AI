# Sinhala Kathana Wahara (Voice Feature) — Implementation Reference

## Overview

The voice feature has two independent paths that share the same server:

| Path | Direction | What it does |
|------|-----------|-------------|
| **Voice Input** | User → App → Server → RAG → Server → App | User speaks → audio recorded → sent to server → Groq Whisper transcribes → RAG answers → TTS audio returned → auto-played |
| **TTS Playback** | User taps Play → App → Server → App | User taps the Play button on any bot message → text sent to server → Gemini/Edge TTS generates audio → streamed back → played segment by segment |

The language at every stage is driven by the user's session-level `selectedLanguage` preference (`"sinhala"` or `"english"`), which is selected once per app session via the language modal.

---

## Architecture Diagram

```
VOICE INPUT PATH
────────────────
[Long-press mic]
    │ startRecording() — expo-av HIGH_QUALITY preset, 100ms progress interval
    │
[Release mic]
    │ stopRecording() → sendAudioToBackend(uri)
    │
    │  POST /chat/audio
    │  FormData: { file: .m4a, patient_id, language }
    ▼
[server.py /chat/audio]
    │ 1. Save temp .wav
    │ 2. Normalize audio (pydub: target -20 dBFS)
    │ 3. stt_engine.transcribe_audio() → Groq Whisper large-v3
    │ 4. Gibberish check
    │ 5. rag_engine.process_query(transcribed_text, ...)
    │ 6. generate_tts_file(response_text, language)
    │        → Gemini TTS (Sinhala) → WAV
    │        → Edge-TTS AriaNeural (English) → MP3
    │ 7. FileResponse(audio)
    │    Headers:
    │      X-Transcription-B64: base64(transcribed_text)
    │      X-Response-B64:      base64(response_text)
    │      X-Sources-B64:       base64(source_list)
    ▼
[sendAudioToBackend() continues]
    │ Read headers → decode base64
    │ Update voice bubble text from "🎤 Voice Message" → transcribed_text
    │ If Sinhala: read blob → write .wav → Audio.Sound.createAsync → play
    │ If English: Speech.speak(responseText, { language: "en-US" })
    │ Append bot message bubble

TTS PLAYBACK PATH
─────────────────
[Tap Play button on bot bubble]
    │ playServerTTS(text, messageId, urgencyFlags)
    │
    │ Check: is already playing this messageId? → stop (toggle off)
    │ stopAllAudio() — abort fetch, Speech.stop(), soundRef.unloadAsync()
    │
    │ Language check:
    │   English → expo-speech directly (no server call)
    │   Sinhala → continue below
    │
    │ Check mobile cache (FileSystem.cacheDirectory/tts_<id>_seg0.wav)
    │   Cache hit → skip network, go to segment playback
    │
    │  POST /chat/tts/stream
    │  { text, urgency_flags, language }
    ▼
[server.py /chat/tts/stream]
    │ clean_text_for_tts() — strip markdown, English brackets, emojis
    │ TTS phonetic layer (apply_tts_phonetics) — "Pressure" → "pressure"
    │ Server cache check → return .bin directly if hit
    │ split_into_sentences() — merge until 80 chars per chunk
    │ asyncio.gather(*[generate_sentence_bytes(i, s) for s])
    │   each sentence → _generate_gemini_tts_bytes() → raw WAV bytes
    │   or Edge-TTS ThiliniNeural if Gemini unavailable
    │ CRITICAL_URGENCY flag → prepend PREGEN_CACHE emergency phrase
    │ Pack: [uint32 length][wav bytes] × N segments
    │ Save .bin to server cache
    │ Return binary blob
    ▼
[playServerTTS() continues]
    │ parseStreamedSegments(arrayBuffer) → [ArrayBuffer, ...]
    │ Write each to FileSystem.cacheDirectory/tts_<id>_segN.wav
    │ playSegment(0) → Audio.Sound.createAsync → playAsync
    │   onPlaybackStatusUpdate: didJustFinish → playSegment(index+1)
    │ AbortController / sessionToken cancels chain on Stop tap
```

---

## Part 1 — Mobile: Recording Voice Input

### The Mic Button

The mic button is a `TouchableOpacity` with `onPressIn` / `onPressOut` — hold to record, release to send:

```js
<TouchableOpacity
  onPressIn={startRecording}
  onPressOut={stopRecording}
  style={[styles.micButton, isRecording && styles.micActive]}
>
  <Ionicons name={isRecording ? "mic" : "mic-outline"} size={26} color="white" />
</TouchableOpacity>
```

State: `isRecording` drives the pulsing waveform animation shown in the recording modal.

### `startRecording()`

1. Stops any currently playing audio (expo-speech + soundRef).
2. Triggers heavy haptic feedback.
3. Calls `Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY)` — records at high quality with 100ms metering updates.
4. Sets `isRecording = true` and `recording = <Recording object>`.

### `stopRecording()`

1. Sets `isRecording = false`, clears `recording` state.
2. Calls `recording.stopAndUnloadAsync()`.
3. Reads the URI from `recording.getURI()`.
4. Triggers light haptic feedback.
5. Calls `sendAudioToBackend(uri)`.

---

## Part 2 — Mobile: Sending Audio and Handling the Response

### `sendAudioToBackend(uri)`

**Builds the request:**
```js
const formData = new FormData();
formData.append("file", {
  uri: uri,
  type: Platform.OS === "ios" ? "audio/m4a" : "audio/mp4",
  name: "voice_input.m4a",
});
formData.append("patient_id", userID || "default_patient");
formData.append("language", selectedLanguage || "auto");
```

**Optimistic UI:** Immediately adds a `"🎤 Voice Message"` bubble so the user sees instant feedback.

**Timeout:** `AbortController` with 60-second timeout.

**Response header decoding:**

The server cannot send UTF-8 text (including Sinhala Unicode) in HTTP headers directly — headers only support ASCII. So all text is base64-encoded:

```js
const b64ResponseText   = response.headers.get("x-response-b64");
const b64Sources        = response.headers.get("x-sources-b64");
const b64Transcription  = response.headers.get("x-transcription-b64");

responseText    = base64Decode(b64ResponseText);
transcribedText = base64Decode(b64Transcription);
```

A custom `base64Decode()` function handles the UTF-8 multi-byte decoding manually (the built-in `atob` doesn't handle multi-byte Unicode).

**Voice bubble update:**
```js
setMessages(prev =>
  prev.map(m => m.id === userMsgId ? { ...m, text: transcribedText } : m)
);
```
The "🎤 Voice Message" placeholder is replaced with what Whisper actually heard.

**Audio playback (Sinhala):**
```js
const audioBlob  = await response.blob();
const base64Audio = await new Promise(resolve => {
  reader.readAsDataURL(audioBlob);
  reader.onloadend = () => resolve(reader.result.split(",")[1]);
});
const fileUri = FileSystem.cacheDirectory + `voice_response_${Date.now()}.wav`;
await FileSystem.writeAsStringAsync(fileUri, base64Audio, { encoding: "base64" });

const { sound } = await Audio.Sound.createAsync({ uri: fileUri }, { shouldPlay: true });
sound.setOnPlaybackStatusUpdate(status => {
  if (status.didJustFinish) {
    sound.unloadAsync();
    FileSystem.deleteAsync(fileUri, { idempotent: true });
  }
});
```

The file is saved as `.wav` (not `.mp3`) because Gemini TTS outputs raw PCM wrapped in a WAV container — naming it `.mp3` would cause the decoder to misread the header.

**Audio playback (English):**
```js
Speech.speak(responseText.replace(/[*#]/g, ""), { language: "en-US", rate: 1.0 });
```
English uses the local `expo-speech` engine — no server call, no network latency.

---

## Part 3 — Server: /chat/audio Endpoint

**File:** `ai-engine/server.py`

### Steps

1. **Save temp file** to `temp_inputs/<md5_hash>.wav`

2. **Normalize audio** using `pydub.AudioSegment`:
   ```python
   audio = AudioSegment.from_file(str(input_path))
   normalized = audio.apply_gain(-20.0 - audio.dBFS)
   normalized.export(str(normalized_path), format="wav")
   ```
   Normalizes loudness to −20 dBFS. This improves Whisper accuracy for quiet recordings.

3. **Transcribe** via `stt_engine.transcribe_audio(normalized_path)` — see Part 4.

4. **Gibberish check:**
   ```python
   gibberish_triggers = ["Tamb", "Hue", "כש", "subs", "Amara", "Unara"]
   is_garbage = any(x in text for x in gibberish_triggers) or len(text) < 2
   ```
   Known Whisper hallucinations on silence/noise. If garbage, returns "I couldn't hear you clearly."

5. **RAG pipeline** — `rag_engine.process_query(transcribed_text, patient_id, history, doc_uri, language, doc_client)` — the full NLU → Vector DB → LLM → Sinhala style chain.

6. **TTS generation** — `generate_tts_file(response_text, language)` — see Part 5.

7. **Response** — `FileResponse` with audio file body and three base64-encoded headers:
   ```python
   return FileResponse(
       output_audio_path,
       media_type="audio/wav" if is_sinhala else "audio/mpeg",
       headers={
           "X-Transcription-B64": base64.b64encode(transcribed_text.encode()).decode(),
           "X-Response-B64":      base64.b64encode(response_text.encode()).decode(),
           "X-Sources-B64":       base64.b64encode(", ".join(sources).encode()).decode(),
       }
   )
   ```

---

## Part 4 — Server: Speech-to-Text (Groq Whisper)

**File:** `ai-engine/src/chatbot/patient_input.py`

### Engine: Groq Cloud Whisper large-v3

`PatientInputHandler` is initialised at server startup with the Groq API key.

### Silero VAD (for desktop recording only)

`patient_input.py` also contains a `record_audio()` method that uses **Silero VAD** (Voice Activity Detection) for smart auto-stop when recording from a microphone directly on the server. This is used only in the standalone desktop mode — the mobile app handles recording itself via `expo-av` and sends the audio file. The VAD logic:

- Buffer audio in 512-sample chunks at 16 kHz.
- Start saving when `speech_prob > 0.5`.
- Stop automatically after 1.5 seconds of silence.

### `transcribe_audio(audio_path, language)`

**Context prompt** (guides Whisper towards Sri Lankan medical speech):
```python
context_prompt = (
    "Medical consultation in Sri Lanka. "
    "User speaks in Singlish (Sinhala phonetics) and English. "
    "Keywords: Wakugadu (Kidney), Rogawala (Diseases), Mata (Me), "
    "Ridenawa (Pain), Beheth (Medicine), Kesel, DiyaWediya (Diabetes), Pressure."
)
```

**Key settings:**
```python
transcription = client.audio.transcriptions.create(
    file=(audio_path, file.read()),
    model="whisper-large-v3",
    response_format="text",
    prompt=context_prompt,
    temperature=0.0,         # prevent creative hallucination
    language="si" if language == "si" else None,
)
```

- `temperature=0.0` — eliminates hallucinated words on silence.
- `language="si"` — forces Sinhala Unicode script output when language is Sinhala. Remove this to get Singlish (romanised) output instead.
- Retry logic: 1 automatic retry on failure.

**Hallucination filter (post-processing):**
```python
ghosts = ["you", "thank you", "thanks", "start speaking", "subtitle", "music", ...]
if text_lower.strip() in ghosts or any(x in text_lower for x in ["맞", "τέ", "ل", "그랑"]):
    return ""  # Ignore — common Whisper silence hallucinations
```

---

## Part 5 — Server: TTS Generation

**File:** `ai-engine/server.py`

### Text Preprocessing: `clean_text_for_tts(text)`

Applied before any TTS generation:

```python
text = re.sub(r'[\*_#]', '', text)                    # Remove markdown bold/italic/headings
text = re.sub(r'\[([^\]]+)\]\([^\)]+\)', r'\1', text) # [text](url) → text
text = re.sub(r'\([a-zA-Z0-9\s\-]+\)', '', text)      # Remove English in parentheses
                                                        # e.g. "(Stage 3)" — crashes Sinhala TTS
text = re.sub(r'[^\w\s඀-෿\.,\?!a-zA-Z0-9]', '', text)  # strip emojis
text = re.sub(r'\s+', ' ', text).strip()
```

The English-in-parentheses removal is critical: strings like `(cognitive impairment)` cause the Gemini TTS Sinhala voice to mispronounce or error.

### TTS Phonetic Layer: `apply_tts_phonetics(text)`

Converts English medical terms embedded in Sinhala sentences to lowercase phonetic Singlish before the TTS engine sees them:

- `"Pressure එක"` → `"pressure eka"` — Gemini pronounces this naturally
- `"eGFR 80"` → `"e G F R 80"` — reads each letter aloud

This is applied only when `TTS_PHONETIC_ENABLED = True` in config.

### Gemini TTS: `_generate_gemini_tts(text, output_path)` (file output)

Used by `/chat/tts` and `/chat/audio` endpoints:

```python
response = client.models.generate_content(
    model=GOOGLE_TTS_MODEL,       # e.g. "gemini-2.5-flash-preview-tts"
    contents=text,
    config=types.GenerateContentConfig(
        response_modalities=["AUDIO"],
        speech_config=types.SpeechConfig(
            voice_config=types.VoiceConfig(
                prebuilt_voice_config=types.PrebuiltVoiceConfig(
                    voice_name=GOOGLE_TTS_VOICE  # e.g. "Kore"
                )
            )
        ),
    ),
)
pcm_data = response.candidates[0].content.parts[0].inline_data.data

# Write raw PCM into a WAV container — no pydub/ffmpeg
with wave.open(str(wav_path), "wb") as wf:
    wf.setnchannels(1)
    wf.setsampwidth(2)      # 16-bit samples
    wf.setframerate(24000)  # 24 kHz
    wf.writeframes(pcm_data)
```

Gemini returns raw PCM (not MP3). The code wraps it in a WAV header directly using Python's `wave` module — zero transcoding, no ffmpeg dependency.

**Key rotation:** Retries across all keys in `gemini_clients` pool before giving up.

### Gemini TTS: `_generate_gemini_tts_bytes(text)` (bytes output)

Same as above but returns `bytes` directly (for the parallel stream endpoint where files are not written to disk per-sentence):

```python
wav_buffer = io.BytesIO()
with wave.open(wav_buffer, "wb") as wf:
    wf.setnchannels(1)
    wf.setsampwidth(2)
    wf.setframerate(24000)
    wf.writeframes(pcm_data)
return wav_buffer.getvalue()
```

### Edge-TTS Fallback

If Gemini TTS fails (API error, quota exceeded):
- **Sinhala fallback:** `edge_tts.Communicate(text, "si-LK-ThiliniNeural")`
- **English (primary):** `edge_tts.Communicate(text, "en-US-AriaNeural")`

Edge-TTS outputs MP3. Gemini outputs WAV. The MIME type in the response and the file extension used on the mobile side must match the actual format.

### Cache: `tts_cache/` directory

`generate_tts_file()` checks an MD5 hash cache before generating:

```python
file_hash = hashlib.md5(f"{clean_text}_{engine_label}".encode()).hexdigest()
output_path = Path("tts_cache") / f"{file_hash}.mp3"  # .mp3 used as key regardless of real format

if output_path.exists():
    return output_path  # Cache hit — 0ms
```

Note: the `.mp3` extension is used as a cache key even for WAV files — the actual bytes are WAV. This is a cosmetic inconsistency but does not affect playback because the mobile side uses the `Content-Type` header or file content to determine format.

---

## Part 6 — Server: Parallel Streaming TTS (/chat/tts/stream)

**File:** `ai-engine/server.py`

This endpoint is the primary TTS path for the Play button. It generates all sentences in parallel rather than sequentially, which means the mobile client starts playing the first sentence while the last is still being generated.

### Step 1: Sentence Splitting — `split_into_sentences(text)`

```python
parts = re.split(r'(?<=[.!?।\n])\s+', text.strip())
# । = Sinhala danda (sentence-ending punctuation mark)
buffer = ""
for part in parts:
    buffer = (buffer + " " + part).strip() if buffer else part
    if len(buffer) >= 80:        # merge short sentences to save API calls
        merged.append(buffer)
        buffer = ""
if buffer:
    merged.append(buffer)
```

Groups sentences into chunks of at least 80 characters each. This reduces API call count — a 5-sentence response typically becomes 2–3 API calls instead of 5.

### Step 2: Parallel Generation

```python
results = await asyncio.gather(
    *[generate_sentence_bytes(i, s) for i, s in enumerate(sentences)]
)
```

All chunks are generated simultaneously. A 3-sentence response takes as long as the slowest single sentence, not the sum.

### Step 3: Length-Framed Binary Format

All audio segments are packed into a single binary blob:

```
[4 bytes: uint32 big-endian length of segment 1][segment 1 WAV bytes]
[4 bytes: uint32 big-endian length of segment 2][segment 2 WAV bytes]
...
```

```python
output.write(struct.pack(">I", len(wav_bytes)))  # 4-byte length prefix
output.write(wav_bytes)                           # segment audio
```

The mobile side parses this with `parseStreamedSegments(arrayBuffer)`:

```js
const view = new DataView(arrayBuffer);
let offset = 0;
while (offset + 4 <= arrayBuffer.byteLength) {
    const length = view.getUint32(offset, false);   // big-endian
    offset += 4;
    if (length === 0 || offset + length > arrayBuffer.byteLength) break;
    segments.push(arrayBuffer.slice(offset, offset + length));
    offset += length;
}
```

### Step 4: Server Stream Cache

After generating, the packed binary is saved:
```python
stream_cache_path = Path("tts_cache") / f"{md5(_cache_src)}_stream.bin"
stream_cache_path.write_bytes(data)
```

On the next request with the same text, the `.bin` file is returned directly — zero Gemini API calls.

---

## Part 7 — Mobile: TTS Playback (`playServerTTS`)

**File:** `mobile-app/src/screens/ChatbotScreen.js`

### State Variables

| Variable | Type | Purpose |
|----------|------|---------|
| `currentlyPlayingId` | string\|null | `messageId` of the currently playing message, or null |
| `isTTSLoading` | boolean | True while fetching audio from server |
| `soundRef` | useRef | Holds the current `Audio.Sound` object for the playing segment |
| `fetchAbortRef` | useRef | Holds the current `AbortController` or synthetic abort object |

### Language Routing

```js
const isSinhala =
    selectedLanguage === "sinhala" ||
    (selectedLanguage === "auto" && text.match(/[඀-෿]/g)?.length > 0);
```

- **English** → `Speech.speak(cleanText, { language: "en-US" })` — instant, no network
- **Sinhala** → server call to `/chat/tts/stream`

### Toggle & Switch Logic

```js
if (currentlyPlayingId === messageId) {
    await stopAllAudio();
    setCurrentlyPlayingId(null);
    return;   // Pure stop — do NOT restart
}
await stopAllAudio();   // Stop whatever was playing before
```

### `stopAllAudio()`

```js
const stopAllAudio = async () => {
    if (fetchAbortRef.current) {
        fetchAbortRef.current.abort();   // Cancel in-flight fetch
        fetchAbortRef.current = null;
    }
    Speech.stop();                        // Stop English expo-speech
    if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        soundRef.current = null;
    }
};
```

Called in three situations: user taps Stop, user taps a different message's Play, user starts recording.

### Two-Layer Caching

**Layer 1 (Server):** `tts_cache/*_stream.bin` — server checks before calling Gemini.

**Layer 2 (Mobile):** `FileSystem.cacheDirectory/tts_<messageId>_seg0.wav` — mobile checks before calling the server at all.

```js
const _seg0Uri = FileSystem.cacheDirectory + `tts_${messageId}_seg0.wav`;
if ((await FileSystem.getInfoAsync(_seg0Uri)).exists) {
    // Load all segments from phone storage — no network call
    ...
}
```

If Layer 2 hits, the message plays instantly from the device without any server request.

### Sequential Segment Playback

Segments write to the device before playback starts:
```js
for (let i = 0; i < segments.length; i++) {
    const segBase64 = Buffer.from(segments[i]).toString("base64");
    const segUri = FileSystem.cacheDirectory + `tts_${messageId}_seg${i}.wav`;
    await FileSystem.writeAsStringAsync(segUri, segBase64, { encoding: "base64" });
    tempFiles.push(segUri);
}
```

Then segments play one after another via a recursive callback:
```js
const playSegment = async (index) => {
    if (!sessionToken.active || index >= tempFiles.length) {
        cleanupSegments(); return;
    }
    const { sound } = await Audio.Sound.createAsync({ uri: tempFiles[index] }, { shouldPlay: false });
    soundRef.current = sound;
    sound.setOnPlaybackStatusUpdate(status => {
        if (status.didJustFinish) playSegment(index + 1);
    });
    await sound.playAsync();
};
```

`sessionToken.active` is checked before every step — if the user taps Stop at any point (even mid-`createAsync`), the chain stops cleanly.

### Fallback Chain for Sinhala TTS

```
1. Mobile Layer 2 cache (phone storage)
        ↓ miss
2. POST /chat/tts/stream (parallel Gemini sentences)
        ↓ fail (network error, server error)
3. POST /chat/tts (full-text single Gemini call)
        ↓ fail
4. expo-speech si-LK local voice (Thilini)
   — lowest quality, always available, no network
```

### Play Button UI States

```js
// Disabled while loading a different message
disabled={isTTSLoading && currentlyPlayingId !== item.id}

// Icon and label:
isTTSLoading && currentlyPlayingId === item.id → <ActivityIndicator> + "Loading..."
currentlyPlayingId === item.id                 → stop-circle icon (red) + "Stop"
otherwise                                      → volume-medium icon + "Play"
```

---

## Part 8 — Emergency Phrase Pre-generation

At server startup, two emergency phrases are pre-generated and stored on disk:

```python
EMERGENCY_PHRASES = {
    "si": "දැන් රෝහලයට යන්න! මෙය හදිසි වෛද්‍ය අවශ්‍යතාවකි.",
    "en": "This sounds urgent. Please go to a hospital immediately.",
}
```

```python
@app.on_event("startup")
async def startup_event():
    for lang, phrase in EMERGENCY_PHRASES.items():
        path = await generate_tts_file(phrase)
        PREGEN_CACHE[lang] = path
```

When the RAG engine detects a `CRITICAL_URGENCY` flag in the response, the stream endpoint prepends this pre-generated audio as the very first segment — the user hears the emergency warning in under 10ms (disk read) before the main response audio starts.

```python
if "CRITICAL_URGENCY" in flag_types:
    emergency_bytes = PREGEN_CACHE["si"].read_bytes()
    output.write(struct.pack(">I", len(emergency_bytes)))
    output.write(emergency_bytes)
```

---

## Part 9 — Known Constraints and Limitations

| Constraint | Detail |
|------------|--------|
| Gemini TTS output format | Raw PCM wrapped as WAV at 24 kHz, 16-bit mono. The mobile must save as `.wav`, not `.mp3` |
| Edge-TTS output format | MP3. File extension and MIME type must be `audio/mpeg` |
| English-in-parentheses | Strings like `(Stage 3)` inside Sinhala text cause Gemini TTS to error or mispronounce. `clean_text_for_tts()` removes them |
| Whisper hallucination on silence | Common outputs: "Thank you", "you", Korean/Greek characters. The garbage filter catches these |
| Groq Whisper `language="si"` | Forces Sinhala Unicode output. Removing this line gives Singlish (romanised) output instead, which the NLU handles better |
| Mobile audio mode switching | `Audio.setAudioModeAsync` must toggle `allowsRecordingIOS` between recording (true) and playback (false) on iOS or the microphone and speaker conflict |
| AbortController scope | A single `fetchAbortRef` holds the current abort handle. After fetching completes, it is replaced with a synthetic `{ abort: () => sessionToken.active = false }` so `stopAllAudio()` continues to work during the playback phase |
| Server cache grows unbounded | `tts_cache/` is never pruged automatically. Long-running deployments need a cron job or TTL to clear old `.mp3` / `.wav` / `.bin` files |
| Session-scoped only | Language preference (`selectedLanguage`) lives in module-level `_sessionLanguage` — cleared on app process restart, not persisted to disk |
