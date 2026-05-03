# Chatbot Document Upload & Question Answering — Implementation Reference

## Overview

The document upload feature lets a patient attach a lab report (PDF or image) to the chatbot session. Once uploaded, every subsequent question the patient asks is answered with the document in context — the AI reads the report directly alongside the patient's stored medical profile and the medical knowledge base. The session is in-memory only; the document is removed when the session ends or the patient explicitly removes it.

---

## Architecture: End-to-End Flow

```
Mobile App                         FastAPI Server                    Gemini Cloud
─────────────────────────────────  ─────────────────────────────────  ──────────────────
[pickDocument / capturePhoto]
        │
        ▼
[uploadDocument()]
  multipart POST
  /chat/upload_context ──────────▶  Validate type + size
                                    Save to temp_uploads/
                                    client.files.upload(temp_path) ──▶ Gemini Files API
                                                                         returns file.name
                                                                              │
                                    SESSIONS[patient_id] = {         ◀───────┘
                                      doc_uri: file.name,
                                      doc_client: client,   ◀── CRITICAL: same API key
                                      local_doc_path: ...
                                    }
                                    return { success: true }
        │
        ◀──────────────────────────
[show "Uploaded" banner]

[user types question]
        │
        ▼
POST /chat/text ────────────────▶  ChatRequest { text, patient_id, language }
                                    read SESSIONS[patient_id].doc_uri
                                    read SESSIONS[patient_id].doc_client
                                        │
                                        ▼
                                   rag_engine.process_query(
                                     query, patient_id, history,
                                     uploaded_file_uri, language,
                                     doc_client          ◀── forwarded from session
                                   )
                                        │
                                        ▼
                               ┌── llm.generate_response(
                               │     uploaded_file_uri, doc_client, ...
                               │   )
                               │       │
                               │       ▼
                               │   doc_client.files.get(name=uploaded_file_uri) ──▶ Gemini
                               │   doc_client.models.generate_content(
                               │     contents=[uploaded_file, full_prompt],
                               │     system_instruction=<5-step protocol>
                               │   )                                      ──────▶ Gemini
                               └──────────────────────────────────────────────────────────
                                                                         returns english_response
                                        │
                                        ▼
                                   Sinhala style layer (if language == sinhala)
                                        │
                                        ▼
                                   return { response, sources, urgency_flags }
        ◀──────────────────────────
[render bot bubble]
```

---

## Part 1 — Mobile App (`ChatbotScreen.js`)

### 1.1 How the User Attaches a Document

The attach button (`Ionicons name="attach"`) calls `showAttachOptions()`, which presents an `Alert` with three choices:

| Option | Handler | Output |
|--------|---------|--------|
| Choose File (PDF/Image) | `pickDocument()` | Uses `expo-document-picker` — opens system file picker filtered to `application/pdf` and `image/*` |
| Take Photo | `capturePhoto()` | Uses `expo-image-picker` with camera, quality 0.8, saved as `lab_report_<timestamp>.jpg` |
| Cancel | — | — |

Both paths produce the same internal `file` object shape:
```js
{ uri: string, name: string, mimeType: string }
```

Then call `setAttachedDoc(file)` (shows the banner) and immediately `await uploadDocument(file)`.

### 1.2 Upload Progress UI

`uploadDocument()` uses `axios.post` (not `fetch`) because axios exposes the `onUploadProgress` event from `XMLHttpRequest`:

```js
const response = await axios.post(
  `${BACKEND_URL}/chat/upload_context`,
  formData,
  {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: (e) => {
      if (e.total) setUploadProgress(e.loaded / e.total);  // 0.0 → 1.0
    },
  }
);
```

While `isUploading === true`, the banner above the input bar shows:
- A spinner replacing the file icon
- `"Uploading… 47%"` text
- A 3 px blue progress bar that fills from left to right: `width: ${uploadProgress * 100}%`
- Remove button hidden

When upload completes, `isUploading` and `uploadProgress` reset to `false` / `0`, the banner shows the filename, and the bot sends a confirmation message into the chat.

### 1.3 Session-Side Storage in the App

`attachedDoc` state holds the file object for the duration of the screen session. It is used only for the UI banner — the actual document reference used for answering is stored server-side (see Part 2). If the user removes the document, `removeDocument()` calls `POST /chat/remove_document` and clears `attachedDoc`.

---

## Part 2 — Server (`server.py`)

### 2.1 Upload Endpoint — `POST /chat/upload_context`

**Validation:**
- Allowed types: `application/pdf`, `image/jpeg`, `image/jpg`, `image/png`
- Maximum size: 20 MB

**Steps:**
1. Read the entire file body into memory.
2. Write to `temp_uploads/<md5_hash>_<original_filename>` on disk.
3. Call `get_gemini_client()` — picks the next Gemini API key from the round-robin pool.
4. `client.files.upload(file=str(temp_path))` — uploads to the Gemini Files API. Returns a `gemini_file` object with a `.name` field (e.g. `"files/qneo40y9tyhf"`).
5. If the patient already had a previous document, call `cleanup_document()` to delete the old Gemini file and local temp file.
6. Store in `SESSIONS[patient_id]`:

```python
SESSIONS[patient_id]["doc_uri"]       = gemini_file.name   # e.g. "files/abc123"
SESSIONS[patient_id]["local_doc_path"] = str(temp_path)
SESSIONS[patient_id]["doc_client"]    = client             # CRITICAL — see §2.2
```

### 2.2 Why `doc_client` is Stored (Key Binding)

**Gemini Files are per-API-key.** A file uploaded with Key A returns HTTP 403 if accessed with Key B. The server maintains a round-robin pool of Gemini API keys across `server.py`'s `client_cycle` AND `key_rotator.py`'s `GeminiKeyRotator` singleton — these are two independent pools. Without storing the upload client, the LLM engine would pick whichever key happens to be current at query time, causing intermittent 403 errors.

By storing `client` in the session and forwarding it all the way to `llm_engine.generate_response()`, the file access is guaranteed to use the same key that performed the upload.

### 2.3 Chat Endpoints Pass the Document Through

Both `/chat/text` and `/chat/audio` read the session:

```python
doc_uri    = SESSIONS[patient_id]["doc_uri"]
doc_client = SESSIONS[patient_id].get("doc_client")

result = await loop.run_in_executor(
    None, rag_engine.process_query,
    text, patient_id, history, doc_uri, language, doc_client
)
```

### 2.4 Document Lifecycle

| Event | What happens |
|-------|-------------|
| Upload new document | Old Gemini file deleted, old local file deleted, session updated |
| User removes document | `POST /chat/remove_document` → delete Gemini file + local file, `doc_uri = None` |
| Session cleared | Same as remove |
| Login | Session reset: `doc_uri = None` |

---

## Part 3 — RAG Engine (`rag_engine.py`)

`process_query(query, patient_id, chat_history, uploaded_file_uri, language, doc_client)`

The RAG engine orchestrates the full pipeline. The document URI changes **only one step** of the normal RAG flow:

### Normal flow (no document)
```
query → [Language Detection] → [Sinhala NLU / Translation] → [Vector DB Search]
      → [Patient Data] → [LLM with text context] → [Style Layer] → response
```

### Document flow (doc_uri is set)
```
query → [Language Detection] → [Sinhala NLU / Translation] → [Vector DB Search]
      → [Patient Data] → [LLM: Gemini multimodal — document + text context + patient + history]
      → [Style Layer] → response
```

The document changes nothing in steps 1–5 (language detection, translation, vector retrieval, patient data loading). It only changes what the Brain Layer (step 6) receives. The `uploaded_file_uri` and `doc_client` are passed straight through to `llm.generate_response()`.

### Error guard in the style layer

If `generate_response()` returns an error string (e.g. `"Multimodal Error: 403 PERMISSION_DENIED..."`), the style layer must be bypassed — passing error text through the Sinhala localisation LLM causes it to hallucinate a fabricated medical response.

```python
_is_error_response = (
    llm_response.startswith("Multimodal Error:") or
    llm_response.startswith("Error:")
)

if _is_error_response:
    # Return a hard-coded user-friendly message in the target language
    if target_lang == 'si':
        final_response = "මට කණගාටුයි, ඔයාගේ ලේඛනය access කිරීමේ ගැටළුවක් ..."
    else:
        final_response = "Sorry, I couldn't access your document. Please try uploading it again."
else:
    # Normal style path
    ...
```

---

## Part 4 — LLM Engine (`llm_engine.py`)

### 4.1 System Prompt Injection

When `uploaded_file_uri` is present, a 5-step medical reasoning protocol is appended to the system prompt **before** the patient profile:

```
STEP 1 — EXTRACT: Scan the uploaded document for all quantitative lab values
         (Potassium, Creatinine, eGFR, BUN, Albumin, HbA1c, Blood Pressure, Phosphorus).
         List each: "[Lab Name]: [Value] [Unit]"

STEP 2 — CROSS-REFERENCE: For each extracted value relevant to the query,
         look it up in the Medical Guidelines (KNOWLEDGE BASE).
         Classify: Normal / Mildly Abnormal / Critically Abnormal for CKD.

STEP 3 — SYNTHESIZE: Answer using:
         a) Lab values from the uploaded document
         b) Relevant guideline recommendation from KNOWLEDGE BASE
         c) Patient's current CKD stage and comorbidities from PATIENT PROFILE

STEP 4 — CITE SOURCES: Append source for each recommendation:
         (Source: Uploaded Report), (Source: Medical Guidelines), (Source: Patient Profile)

STEP 5 — CONFLICT RESOLUTION: If document contradicts guidelines, state both
         and recommend: "Please consult your nephrologist to review this result."

⚠️ Never fabricate lab values. If a value is not in the uploaded document, say so.
```

### 4.2 Multimodal Generation Call

```python
def _run(client):
    uploaded_file = client.files.get(name=uploaded_file_uri)
    response = client.models.generate_content(
        model='gemini-2.5-flash',
        contents=[uploaded_file, full_prompt],   # document object + text prompt
        config=types.GenerateContentConfig(
            system_instruction=system_prompt,    # 5-step protocol + patient profile
            temperature=0.7,
            max_output_tokens=2048
        )
    )
    return response.text.strip()

# Use the specific client that uploaded the file
if doc_client:
    english_response = _run(doc_client)
else:
    english_response = self._gemini_rotator.call_with_rotation(_run)
```

`contents=[uploaded_file, full_prompt]` means Gemini receives the actual document bytes alongside the text. Gemini 2.5 Flash is natively multimodal and can read both PDF pages and image content (OCR included).

The `full_prompt` sent to the model:
```
CHAT HISTORY:
User: ...
Assistant: ...

KNOWLEDGE BASE:
<top 3 Vector DB chunks from the RAG retrieval step>

CURRENT PATIENT QUERY:
<english_query translated from the user's input>
```

### 4.3 Fallback: No Document

When `uploaded_file_uri` is `None`, the standard text-only Groq / OpenAI path runs. The document code path is completely bypassed.

---

## Part 5 — What Gemini Does With the Document

Gemini 2.5 Flash natively handles:
- **PDF**: reads all pages, understands tables, headers, and lab report layouts
- **JPEG/PNG**: applies OCR automatically, understands scanned lab printouts

The model simultaneously sees:
1. The raw document content (bytes via Files API)
2. The patient's current CKD profile from MongoDB
3. The top 3 relevant chunks from the medical literature vector database
4. The last 4 turns of chat history
5. The 5-step reasoning protocol in the system prompt

This means a single Gemini call performs: document reading + guideline cross-referencing + personalised synthesis + sourcing — all in one generation.

---

## Part 6 — What Does NOT Change With a Document Attached

| Component | Behaviour |
|-----------|-----------|
| Language detection | Same — Sinhala/English determined from query text |
| Sinhala NLU (LaBSE) | Same — intent and entity detection still runs |
| Vector DB retrieval | Same — medical knowledge chunks still retrieved based on translated query |
| Patient data loading | Same — MongoDB record always included |
| Style layer (Sinhala localisation) | Same — output translated to Sinhala if language == sinhala |
| Urgency flag scanning | Same — English response scanned for emergency terms |
| Response caching | Same — cache key includes patient_id + language + query |

The document is **additive** — it enriches the Brain layer with one extra context source without changing any other stage.

---

## Part 7 — Known Constraints

| Constraint | Detail |
|-----------|--------|
| One document per session | A new upload replaces the previous one |
| File types | PDF, JPEG, JPG, PNG only |
| Max size | 20 MB |
| Gemini Files API lifetime | Files expire after 48 hours on Gemini's servers |
| API key binding | The document can only be queried by the same API key that uploaded it (`doc_client` stored in session) |
| Non-medical documents | The 5-step system prompt is always injected regardless of document content — the model will still attempt to extract lab values and may answer unrelated questions with CKD framing if the query is ambiguous |
| Session scope | Document reference lives in `SESSIONS` dict (in-memory). Server restart clears all sessions. |
