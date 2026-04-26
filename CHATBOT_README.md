# Nephro-AI Chatbot Component — Complete Technical Documentation

> **A Context-Aware, Bilingual Medical Chatbot for Chronic Kidney Disease (CKD)**

---

## Table of Contents

1. [Overview](#1-overview)
2. [System Architecture](#2-system-architecture)
3. [Technology Stack](#3-technology-stack)
4. [AI / ML Models Used](#4-ai--ml-models-used)
5. [Frontend — Mobile App (React Native / Expo)](#5-frontend--mobile-app-react-native--expo)
6. [Backend — AI Engine Server (FastAPI / Python)](#6-backend--ai-engine-server-fastapi--python)
7. [Core AI Pipeline — RAG Engine](#7-core-ai-pipeline--rag-engine)
8. [Natural Language Understanding (NLU)](#8-natural-language-understanding-nlu)
9. [Vector Database & Document Processing](#9-vector-database--document-processing)
10. [LLM Integration — Gemini 2.5 Flash](#10-llm-integration--gemini-25-flash)
11. [Multi-Language Support (English + Sinhala)](#11-multi-language-support-english--sinhala)
12. [Text-to-Speech (TTS) System](#12-text-to-speech-tts-system)
13. [Speech-to-Text (STT) System](#13-speech-to-text-stt-system)
14. [API Reference](#14-api-reference)
15. [End-to-End Data Flows](#15-end-to-end-data-flows)
16. [Session & State Management](#16-session--state-management)
17. [Caching Mechanisms](#17-caching-mechanisms)
18. [Error Handling & Resilience](#18-error-handling--resilience)
19. [Project File Reference](#19-project-file-reference)
20. [Dependencies](#20-dependencies)
21. [Environment Variables](#21-environment-variables)
22. [Setup & Installation](#22-setup--installation)
23. [Known Limitations & Future Improvements](#23-known-limitations--future-improvements)

---

## 1. Overview

Nephro-AI Chatbot is a **context-aware, bilingual medical assistant** built as a core component of the Nephro-AI mobile application. It specializes in providing personalized health guidance for patients with **Chronic Kidney Disease (CKD)**.

### Key Capabilities

| Capability                | Description                                                                                        |
| ------------------------- | -------------------------------------------------------------------------------------------------- |
| **Bilingual Interaction** | Full support for English, Sinhala (Unicode), and Singlish (code-switching) via text and voice      |
| **RAG-Based Knowledge**   | Retrieval-Augmented Generation over 4,114 vectorized medical document chunks from 148 source files |
| **Patient-Personalized**  | Contextual responses based on CKD stage, lab values, medications, and comorbidities                |
| **Voice I/O**             | Speech-to-Text (Groq Whisper) and Text-to-Speech (Gemini TTS for Sinhala, Edge-TTS for English)    |
| **Intelligent NLU**       | Intent detection, medical entity extraction, emotion analysis, and severity assessment             |
| **Maps Integration**      | Google Maps navigation buttons for hospitals and pharmacies                                        |
| **Chat Persistence**      | Per-user message history on both client (AsyncStorage) and server (in-memory sessions)             |
| **Source Attribution**    | Every response includes the original medical document sources                                      |

### What Makes It Unique

- **Sandwich Translation Architecture** — Sinhala queries are translated to English for RAG retrieval, and English responses are converted back to natural spoken Sinhala ("Katha Wahara" style)
- **Hybrid Smart Routing** — High-confidence Sinhala intents are resolved locally via dictionary + LaBSE (~300ms) without an API call; complex queries use the full LLM pipeline
- **Cross-Encoder Re-ranking** — Retrieved documents are re-ranked using a TinyBERT cross-encoder for precision
- **Medical-Grade NLU** — SciSpaCy biomedical NER with negation detection (Negex) for accurate medical entity understanding

---

## 2. System Architecture

```
┌──────────────────────────────────┐         ┌───────────────────────────────────────┐
│      MOBILE APP (Expo SDK)       │         │       AI ENGINE (FastAPI + Python)     │
│   React Native 0.81 + Expo 54   │  HTTP   │       Python 3.x + Uvicorn            │
│                                  │ <────>  │                                       │
│  ┌─ ChatbotScreen.js (1,780 L)  │  :8001  │  ┌─ server.py (403 L)                │
│  ├─ axiosConfig.js              │         │  ├─ src/chatbot/                      │
│  ├─ AsyncStorage (local DB)     │         │  │   ├─ rag_engine.py (orchestrator)  │
│  ├─ expo-av (recording/play)    │         │  │   ├─ nlu_engine.py (English NLU)   │
│  ├─ expo-speech (English TTS)   │         │  │   ├─ sinhala_nlu.py (Sinhala NLU)  │
│  ├─ expo-haptics (feedback)     │         │  │   ├─ llm_engine.py (Gemini LLM)   │
│  └─ Markdown renderer          │         │  │   ├─ patient_input.py (STT)        │
│                                  │         │  │   ├─ patient_data.py (mock DB)    │
└──────────────────────────────────┘         │  │   ├─ tts_engine.py (Edge-TTS)     │
                                              │  │   ├─ enhanced_query_vectordb.py   │
                                              │  │   ├─ query_vectordb.py            │
                                              │  │   ├─ build_vectordb.py            │
                                              │  │   ├─ openai_embeddings.py         │
                                              │  │   ├─ pdf_extractor.py             │
                                              │  │   ├─ prepare_vectordb.py          │
                                              │  │   └─ config.py (503 L)            │
                                              │  └─ vectordb/chroma_db/              │
                                              └───────────────────────────────────────┘
                                                              │
                                              ┌───────────────┼───────────────┐
                                              │               │               │
                                           ChromaDB      OpenRouter       Groq API
                                          (VectorDB)    (Gemini 2.5      (Whisper
                                           Local         Flash LLM)       STT)
                                                              │
                                                        Google GenAI
                                                        (Gemini TTS)
```

### Communication Flow

| Connection               | Protocol  | Port | Purpose                      |
| ------------------------ | --------- | ---- | ---------------------------- |
| Mobile App ↔ AI Engine   | HTTP REST | 8001 | Chat text, audio, TTS, clear |
| AI Engine ↔ OpenRouter   | HTTPS     | 443  | LLM generation + embeddings  |
| AI Engine ↔ Groq Cloud   | HTTPS     | 443  | Whisper STT transcription    |
| AI Engine ↔ Google GenAI | HTTPS     | 443  | Gemini TTS voice synthesis   |
| AI Engine ↔ ChromaDB     | Local     | —    | Vector similarity search     |

---

## 3. Technology Stack

### 3.1 Frontend Technologies

| Technology                                    | Version   | Purpose                                              |
| --------------------------------------------- | --------- | ---------------------------------------------------- |
| **React Native**                              | 0.81.5    | Cross-platform mobile framework                      |
| **Expo SDK**                                  | ~54.0.30  | Managed React Native workflow                        |
| **React**                                     | 19.1.0    | UI component library                                 |
| **expo-av**                                   | ~16.0.8   | Audio recording (mic) and playback (TTS audio)       |
| **expo-speech**                               | ~14.0.8   | Local English text-to-speech synthesis               |
| **expo-file-system**                          | ~19.0.21  | File I/O for caching TTS audio blobs                 |
| **expo-haptics**                              | ~15.0.8   | Haptic feedback on recording start/stop              |
| **axios**                                     | ^1.13.2   | HTTP client for text chat + clear endpoints          |
| **@react-native-async-storage/async-storage** | ^2.2.0    | Persistent chat history per user                     |
| **react-native-markdown-display**             | ^7.0.2    | Markdown rendering for bot responses                 |
| **@expo/vector-icons**                        | (bundled) | Ionicons, MaterialCommunityIcons, FontAwesome5 icons |
| **@react-navigation/native**                  | ^6.1.9    | Screen navigation                                    |
| **@react-navigation/stack**                   | ^6.3.20   | Stack navigation pattern                             |
| **react-native-safe-area-context**            | (bundled) | Safe area insets for notched devices                 |
| **react-native-gesture-handler**              | (bundled) | Touch gesture handling                               |
| **react-native-screens**                      | (bundled) | Optimized native screen containers                   |
| **lottie-react-native**                       | ~7.3.1    | Lottie animation playback                            |

### 3.2 Backend Technologies

| Technology                | Version         | Purpose                                         |
| ------------------------- | --------------- | ----------------------------------------------- |
| **Python**                | 3.x             | Primary backend language                        |
| **FastAPI**               | latest          | Async REST API framework                        |
| **Uvicorn**               | latest          | ASGI server (runs FastAPI)                      |
| **ChromaDB**              | ≥0.4.18         | Persistent vector database for RAG              |
| **spaCy**                 | ≥3.7.2          | NLP pipeline (tokenization, POS, NER)           |
| **SciSpaCy**              | ≥0.5.4          | Biomedical NER model integration                |
| **negspaCy**              | ≥1.0.4          | Negation detection (Negex)                      |
| **sentence-transformers** | ≥2.2.2          | LaBSE + Cross-Encoder models                    |
| **NLTK**                  | ≥3.8.1          | Sentence tokenization for chunking              |
| **langdetect**            | ≥1.0.9          | Language detection for documents                |
| **edge-tts**              | ≥6.1.9          | Microsoft Edge TTS (English + Sinhala fallback) |
| **google-genai**          | latest          | Google Gemini TTS API client                    |
| **groq**                  | ≥1.0.0          | Groq Cloud API client (Whisper STT)             |
| **pydub**                 | latest          | Audio format conversion (PCM→WAV→MP3)           |
| **aiofiles**              | latest          | Async file operations                           |
| **pdfplumber**            | latest          | PDF text extraction (primary)                   |
| **PyPDF2**                | latest          | PDF text extraction (fallback)                  |
| **python-dotenv**         | ≥1.0.0          | Environment variable loading                    |
| **requests**              | ≥2.31.0         | HTTP client for OpenRouter API                  |
| **torch**                 | latest          | PyTorch for Silero VAD model                    |
| **torchaudio**            | latest          | Audio tensor operations                         |
| **numpy**                 | ≥1.24.3, <2.0.0 | Numerical operations                            |
| **tqdm**                  | ≥4.66.1         | Progress bars for batch operations              |
| **python-multipart**      | latest          | Multipart form data parsing                     |

### 3.3 External APIs & Services

| Service           | Provider       | Model / Endpoint                             | Purpose                                           |
| ----------------- | -------------- | -------------------------------------------- | ------------------------------------------------- |
| **LLM**           | OpenRouter     | `google/gemini-2.5-flash`                    | Response generation, translation, query rewriting |
| **Embeddings**    | OpenRouter     | `openai/text-embedding-3-small`              | 1536-dim document & query embeddings              |
| **STT**           | Groq Cloud     | `whisper-large-v3`                           | Speech-to-text transcription                      |
| **TTS (Sinhala)** | Google GenAI   | `gemini-2.5-flash-preview-tts` (Voice: Kore) | Sinhala voice synthesis                           |
| **TTS (English)** | Microsoft Edge | `en-US-AriaNeural`                           | English voice synthesis                           |
| **TTS Fallback**  | Microsoft Edge | `si-LK-ThiliniNeural`                        | Sinhala fallback voice                            |
| **Maps**          | Google Maps    | Deep linking                                 | Hospital/pharmacy navigation                      |

---

## 4. AI / ML Models Used

| Model                            | Type                     | Source                         | Parameters      | Purpose                                                   |
| -------------------------------- | ------------------------ | ------------------------------ | --------------- | --------------------------------------------------------- |
| **Gemini 2.5 Flash**             | Large Language Model     | Google (via OpenRouter)        | —               | Response generation, translation, query contextualization |
| **text-embedding-3-small**       | Embedding Model          | OpenAI (via OpenRouter)        | 1536 dimensions | Document & query embedding for semantic search            |
| **Whisper-large-v3**             | Speech Recognition       | OpenAI (via Groq Cloud)        | 1.5B            | Multilingual speech-to-text                               |
| **LaBSE**                        | Sentence Embeddings      | Google (sentence-transformers) | 471M            | Cross-lingual zero-shot intent classification             |
| **ms-marco-TinyBERT-L-2-v2**     | Cross-Encoder            | sentence-transformers          | 4.4M            | Document relevance re-ranking                             |
| **en_ner_bc5cdr_md**             | Biomedical NER           | SciSpaCy                       | —               | Medical entity extraction (diseases, chemicals)           |
| **Silero VAD**                   | Voice Activity Detection | snakers4 (torch.hub)           | —               | Speech/silence boundary detection                         |
| **Negex**                        | Negation Detection       | negspaCy                       | —               | Detecting negated medical terms                           |
| **Gemini 2.5 Flash Preview TTS** | Text-to-Speech           | Google GenAI                   | —               | Sinhala voice synthesis (Kore voice)                      |

### Model Loading Timeline

```
Server Startup
    ├── RAGEngine.__init__()
    │     ├── CKDNLUEngine → loads spaCy en_ner_bc5cdr_md + LaBSE + Negex
    │     ├── EnhancedVectorQuery → loads TinyBERT Cross-Encoder + ChromaDB
    │     ├── LLMEngine → loads SinhalaNLUEngine (LaBSE) + translation caches
    │     └── PatientDataManager → mock patient records
    ├── PatientInputHandler → loads Silero VAD via torch.hub
    └── Gemini TTS Client → Google GenAI initialization
```

---

## 5. Frontend — Mobile App (React Native / Expo)

### 5.1 Main Component: `ChatbotScreen.js` (1,780 lines)

**Path:** `mobile-app/src/screens/ChatbotScreen.js`

#### Navigation

- Registered in `App.js` as `<Stack.Screen name="Chatbot">`
- Accessed from `HomeScreen.js` via the "AI Assistant" card
- Receives route params: `{ userID, userName }`

#### State Management

| State Variable       | Type                      | Purpose                                             |
| -------------------- | ------------------------- | --------------------------------------------------- |
| `message`            | `string`                  | Current text input value                            |
| `messages`           | `array`                   | All chat messages (persisted in AsyncStorage)       |
| `isInitialized`      | `boolean`                 | Guards against saving before initial load completes |
| `recording`          | `Audio.Recording \| null` | Active Expo audio recording object                  |
| `isRecording`        | `boolean`                 | Whether the microphone is active                    |
| `isLoading`          | `boolean`                 | Whether waiting for server response                 |
| `loadingStep`        | `{text, icon}`            | Current step in the animated loading indicator      |
| `loadingType`        | `'audio' \| 'text'`       | Determines which loading animation sequence to show |
| `sound`              | `Audio.Sound \| null`     | Expo AV sound object for TTS audio playback         |
| `metering`           | `number`                  | Live microphone volume level (default: -160)        |
| `inputFocused`       | `boolean`                 | Whether the text input has focus                    |
| `isTyping`           | `boolean`                 | Typing indicator bubble visibility                  |
| `isTTSLoading`       | `boolean`                 | Whether server TTS audio is being fetched           |
| `currentlyPlayingId` | `string \| null`          | Message ID currently being read aloud               |

#### Core Functions

| Function                  | Purpose                                                                                               |
| ------------------------- | ----------------------------------------------------------------------------------------------------- |
| `sendTextMessage()`       | Sends text to `POST /chat/text`, appends bot response to messages                                     |
| `sendAudioToBackend(uri)` | Uploads recorded audio to `POST /chat/audio`, decodes Base64 response headers, auto-plays Sinhala TTS |
| `startRecording()`        | Requests mic permission, starts `HIGH_QUALITY` recording with 100ms metering interval                 |
| `stopRecording()`         | Stops recording, triggers `sendAudioToBackend()` with audio URI                                       |
| `playServerTTS(text, id)` | Plays TTS — English via local `expo-speech`, Sinhala via server `POST /chat/tts`                      |
| `clearChatHistory()`      | Clears AsyncStorage + server session/cache via `POST /chat/clear`                                     |
| `base64Decode(str)`       | Custom Base64→UTF-8 decoder (React Native polyfill for `atob`)                                        |
| `renderItem({item})`      | Renders individual chat bubbles with Markdown, Maps links, TTS button, sources                        |

#### UI Component Hierarchy

```
SafeAreaView
├── KeyboardAvoidingView
│   ├── Header Bar
│   │   ├── Back Button (Ionicons: arrow-back)
│   │   ├── Bot Avatar + "Nephro-AI" Title + Online Status Dot
│   │   └── Clear Chat Button (trash icon)
│   │
│   ├── Message List (FlatList, inverted=false, auto-scroll)
│   │   ├── ListHeader: WelcomeTips (voice input guide, shown when ≤1 message)
│   │   ├── Message Bubbles
│   │   │   ├── User Bubble (blue #2E86DE, right-aligned, timestamp)
│   │   │   └── Bot Bubble (white, left-aligned, bot avatar)
│   │   │       ├── Markdown Body (react-native-markdown-display)
│   │   │       ├── [MAPS: location] → Google Maps Navigation Button
│   │   │       ├── "Read Aloud" TTS Button (speaker icon)
│   │   │       ├── Source Attribution Tags
│   │   │       └── Timestamp
│   │   └── ListFooter: Loading Indicator (animated bot bubble with rotating status)
│   │
│   └── Bottom Input Area
│       ├── Suggestion Chips (horizontal scroll)
│       │   └── "Diet Plan" | "Lab Results" | "Symptoms" | "Medications"
│       ├── TextInput (multiline, 500 char max, character counter)
│       └── Send Button (when text) / Mic Button (when empty)
│
└── Recording Overlay (full-screen modal)
    ├── Semi-transparent Background (black 50%)
    ├── Recording Card (white, centered)
    │   ├── Pulsing Mic Icon (animated)
    │   ├── Volume Meter Bar (real-time)
    │   ├── Volume Feedback ("Perfect Volume" / "Speak Louder")
    │   └── "Release to Send" / "Tap to Cancel" hints
    └── Close Overlay (tap outside)
```

#### Design System

| Element         | Style                                                                      |
| --------------- | -------------------------------------------------------------------------- |
| Primary Color   | `#2E86DE` (blue)                                                           |
| Accent Color    | `#10AC84` (green)                                                          |
| Danger Color    | `#EE5253` (red)                                                            |
| User Bubble     | Blue background, white text, rounded with bottom-right cutoff              |
| Bot Bubble      | White background, dark text, rounded with bottom-left cutoff, light border |
| Input Field     | 24px border radius, shadow on focus                                        |
| Recording Card  | 28px border radius, centered with elevation shadow                         |
| Haptic Feedback | Heavy on recording start, Light on recording stop                          |

### 5.2 API Configuration: `axiosConfig.js`

| Constant      | Value                  | Purpose                                    |
| ------------- | ---------------------- | ------------------------------------------ |
| `API_URL`     | `http://<IP>:5000/api` | Node.js Express backend (auth, labs, etc.) |
| `CHATBOT_URL` | `http://<IP>:8001`     | Python FastAPI AI engine                   |
| Axios Timeout | 120 seconds            | Default request timeout                    |
| Content-Type  | `application/json`     | Default header                             |

---

## 6. Backend — AI Engine Server (FastAPI / Python)

### 6.1 Server Configuration

**File:** `ai-engine/server.py` (403 lines)

| Setting     | Value                                 |
| ----------- | ------------------------------------- |
| Framework   | FastAPI                               |
| ASGI Server | Uvicorn                               |
| Host        | `0.0.0.0`                             |
| Port        | `8001`                                |
| CORS        | `allow_origins=["*"]` (all origins)   |
| App Title   | "Nephro-AI Context-Aware Chatbot API" |

### 6.2 Initialization Sequence

On startup, the server initializes three core singletons:

```python
rag_engine = RAGEngine()          # Full NLU + Retrieval + LLM pipeline
stt_engine = PatientInputHandler() # Whisper STT + Silero VAD
gemini_client = genai.Client(...)  # Google GenAI for Gemini TTS
```

### 6.3 Session Management

```python
SESSIONS = {}  # { patient_id: [{ role: "user"/"assistant", content: "..." }, ...] }
```

- **Per-patient** chat history stored in Python dict (in-memory)
- **Sliding window**: Keeps last 10 messages per patient
- **Auto-clear on greeting**: Detects "hi", "hello", "ayubowan", "kohomada" → clears session
- **Manual clear**: Via `POST /chat/clear`
- **Volatile**: Lost on server restart

### 6.4 Hybrid TTS Architecture

| Language | Primary Engine               | Voice              | Fallback                       |
| -------- | ---------------------------- | ------------------ | ------------------------------ |
| Sinhala  | Gemini 2.5 Flash Preview TTS | Kore               | Edge-TTS `si-LK-ThiliniNeural` |
| English  | Edge-TTS                     | `en-US-AriaNeural` | N/A                            |

**Audio processing pipeline:** `Gemini PCM → WAV (in-memory via wave module) → MP3 (pydub)`

### 6.5 Helper Functions

| Function                           | Purpose                                                          |
| ---------------------------------- | ---------------------------------------------------------------- |
| `cleanup_file(path)`               | Async temp file deletion                                         |
| `clean_text_for_tts(text)`         | Strips markdown (`*`, `#`, `_`), URLs, emojis, unsupported chars |
| `generate_tts_file(text)`          | Async TTS pipeline with caching (MD5 hash key)                   |
| `_generate_gemini_tts(text, path)` | Sync Gemini TTS (runs in thread pool via `asyncio.to_thread`)    |

---

## 7. Core AI Pipeline — RAG Engine

**File:** `ai-engine/src/chatbot/rag_engine.py` (301 lines)  
**Class:** `RAGEngine`

The RAG engine orchestrates the entire query processing pipeline:

```
User Query
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│  1. LANGUAGE DETECTION                                   │
│     • Sinhala Unicode check (U+0D80 – U+0DFF)           │
│     • Singlish keyword matching (180+ medical terms)     │
│     • English (default)                                  │
├─────────────────────────────────────────────────────────┤
│  2. CACHE CHECK                                          │
│     • MD5 hash of patient_id + data_version + lang + qry │
│     • Cache hit → return immediately                     │
├─────────────────────────────────────────────────────────┤
│  3. BRIDGE LAYER — Sandwich Architecture                 │
│     ┌──────────────────────────────────────────┐         │
│     │  Always: Extract MedDict hints (local)   │         │
│     │  Always: LaBSE zero-shot intent (local)  │         │
│     │                                          │         │
│     │  Confidence > 0.6 → FAST PATH            │         │
│     │    • NLU + Dictionary resolution          │         │
│     │    • No API call needed (~300ms)          │         │
│     │                                          │         │
│     │  Confidence ≤ 0.6 → SMART PATH           │         │
│     │    • LLM API translation (Gemini)        │         │
│     │    • Few-shot Singlish→English            │         │
│     └──────────────────────────────────────────┘         │
├─────────────────────────────────────────────────────────┤
│  4. CONTEXT REWRITER                                     │
│     • Generate standalone query from chat history        │
│     • LLM call with temp=0.1, max_tokens=256            │
│     • Hallucination check (length > 4x = hallucination) │
├─────────────────────────────────────────────────────────┤
│  5. VECTOR DB RETRIEVAL                                  │
│     • NLU analysis → enhanced query variations (×3)      │
│     • ChromaDB semantic search per variation             │
│     • Deduplication by document ID                       │
│     • Cross-Encoder re-ranking (TinyBERT, threshold>0.01)│
├─────────────────────────────────────────────────────────┤
│  6. PATIENT CONTEXT INJECTION                            │
│     • CKD stage, eGFR, comorbidities                    │
│     • Current medications, lab values                   │
│     • Data freshness warning                            │
├─────────────────────────────────────────────────────────┤
│  7. LLM RESPONSE GENERATION (Brain Layer)                │
│     • Gemini 2.5 Flash (temp=0.7, max_tokens=2048)      │
│     • System prompt with triage protocol                 │
│     • RAG context + patient context + history (4 turns)  │
│     • Google Maps [MAPS:] tool for hospital directions   │
├─────────────────────────────────────────────────────────┤
│  8. STYLE LAYER (Sinhala only)                           │
│     • LLM English→Sinhala translation (Katha Wahara)    │
│     • Deterministic glossary enforcement                 │
│     • Medical term code-mixing (English terms preserved) │
├─────────────────────────────────────────────────────────┤
│  9. RESPONSE OUTPUT                                      │
│     • Response text + source documents + NLU analysis    │
│     • Cached for future identical queries               │
└─────────────────────────────────────────────────────────┘
```

### Response Payload

```json
{
  "response": "Based on your CKD Stage 3b...",
  "source_documents": ["KDIGO Guidelines 2024"],
  "source_metadata": [{ "source": "...", "content_type": "recommendation" }],
  "nlu_analysis": {
    "intent": "DIET_INQUIRY",
    "entities": ["CKD", "diet"],
    "severity": "normal",
    "emotion": null
  },
  "target_lang": "en",
  "translation_method": "fast_nlu",
  "translation_time": 0.284
}
```

---

## 8. Natural Language Understanding (NLU)

### 8.1 English NLU Engine

**File:** `ai-engine/src/chatbot/nlu_engine.py` (738 lines)  
**Class:** `CKDNLUEngine`

| Feature                 | Technology                    | Details                                                                |
| ----------------------- | ----------------------------- | ---------------------------------------------------------------------- |
| **Base NLP**            | spaCy                         | Tokenization, POS tagging, dependency parsing                          |
| **Biomedical NER**      | SciSpaCy `en_ner_bc5cdr_md`   | Disease & chemical entity extraction                                   |
| **Negation**            | Negex (negspaCy)              | Detects negated medical terms ("no diabetes", "not taking medication") |
| **Intent Detection**    | Hybrid: spaCy Matcher + LaBSE | Rule-based first, zero-shot LaBSE fallback                             |
| **Entity Extraction**   | PhraseMatcher + Regex         | Medical terms, body parts, medications, lab values, nutrients, foods   |
| **Severity Assessment** | Keyword-based                 | 4 levels: `urgent` → `severe` → `moderate` → `mild`                    |
| **Emotion Detection**   | Keyword-based                 | `anxiety`, `sadness`, `confusion`, `urgency`, `frustration`            |
| **Risk Factors**        | Pattern matching              | Diabetes, hypertension, family history, obesity, smoking               |
| **Lab Value Parsing**   | Regex patterns                | Creatinine, eGFR, potassium, BUN, albumin with values & units          |
| **Query Enhancement**   | Intent-driven                 | Generates 3+ search query variations for multi-query RAG retrieval     |

#### Detected Intents

| Intent                    | Trigger Examples                                 |
| ------------------------- | ------------------------------------------------ |
| `ask_medication`          | "medication", "medicine", "drug", "prescription" |
| `ask_symptom`             | "symptom", "pain", "swelling", "feeling"         |
| `ask_diet`                | "diet", "food", "eat", "nutrition", "meal"       |
| `ask_fluid_limit`         | "fluid", "water", "drink", "hydration"           |
| `get_lab_result`          | "lab", "test", "result", "creatinine", "eGFR"    |
| `DIAGNOSIS_UNDERSTANDING` | "diagnosis", "stage", "prognosis"                |
| `EMOTIONAL_CONCERN`       | "worried", "scared", "afraid", "anxious"         |
| `ask_exercise`            | "exercise", "activity", "walking", "movement"    |
| `ask_emergency`           | "emergency", "urgent", "ER", "hospital"          |
| `greeting`                | "hi", "hello", "good morning"                    |

### 8.2 Sinhala NLU Engine

**File:** `ai-engine/src/chatbot/sinhala_nlu.py` (171 lines)  
**Class:** `SinhalaNLUEngine`

| Feature               | Technology                             | Details                                                                                     |
| --------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------- |
| **Model**             | LaBSE (Language-Agnostic BERT)         | 471M parameter multilingual sentence encoder                                                |
| **Method**            | Zero-shot cross-lingual classification | Encodes Sinhala queries and compares with English intent anchors                            |
| **Intents**           | 6 categories                           | `ask_diet`, `ask_symptoms`, `ask_medication`, `get_lab_result`, `ask_emergency`, `greeting` |
| **Entity Extraction** | Hybrid                                 | Sinhala medical dictionary (JSON) + English entity matching from config                     |
| **Advantage**         | No translation needed                  | Works directly with pure Sinhala Unicode, Singlish, and code-switching                      |

#### How LaBSE Zero-Shot Works

```
Sinhala Input: "මගේ වකුගඩු වලට හොඳ කෑම මොනවද?"
                              │
                              ▼
               LaBSE Encoder (768-dim embedding)
                              │
                              ▼
         Cosine Similarity vs English Anchor Clusters
         ┌─────────────────────────────────────────┐
         │  ask_diet anchors:                       │
         │    "What foods should I eat for CKD?"    │
         │    "Diet recommendations for kidney"     │
         │    "What to avoid eating"                │
         │         → Similarity: 0.82 ✅            │
         │                                          │
         │  ask_symptoms anchors:                   │
         │    "What are the symptoms of CKD?"       │
         │         → Similarity: 0.31 ❌            │
         └─────────────────────────────────────────┘
                              │
                              ▼
               Intent: ask_diet (confidence: 0.82)
```

---

## 9. Vector Database & Document Processing

### 9.1 Vector Database

| Property                 | Value                                       |
| ------------------------ | ------------------------------------------- |
| **Technology**           | ChromaDB (persistent client, local storage) |
| **Collection Name**      | `nephro_ai_medical_kb`                      |
| **Total Chunks**         | 4,114                                       |
| **Source Documents**     | 148 files                                   |
| **Embedding Model**      | OpenAI `text-embedding-3-small`             |
| **Embedding Dimensions** | 1,536                                       |
| **Chunk Size**           | 50–600 words with 2-sentence overlap        |
| **Storage Path**         | `ai-engine/vectordb/chroma_db/`             |

### 9.2 Document Processing Pipeline

```
PDF / TXT Medical Documents
         │
         ▼
┌─ pdf_extractor.py (687 lines) ──────────────────────┐
│  1. Dual-extraction: pdfplumber (primary) +          │
│     PyPDF2 (fallback). Also handles .txt files       │
│  2. Text cleaning: abbreviation expansion,           │
│     whitespace normalization, URL removal,            │
│     smart quote normalization, special char filtering │
│     (preserves medical symbols: %, ±, μ, α, β)      │
│  3. Quality filter: min 20 words, <50% numbers,     │
│     skip ToC/references/appendices                   │
│  4. Sentence-based chunking (NLTK sent_tokenize)    │
│  5. Metadata enrichment: section detection,          │
│     content type classification, entity tagging      │
└──────────────────────────────────────────────────────┘
         │
         ▼
┌─ prepare_vectordb.py (496 lines) ───────────────────┐
│  1. Quality filtering: word count bounds,            │
│     requires medical entities, removes               │
│     citation-heavy chunks, requires ≥2 entity matches│
│  2. ChromaDB format preparation                      │
│  3. Boolean metadata flags:                          │
│     has_ckd, has_gfr, has_diabetes,                  │
│     has_hypertension, has_dialysis                    │
│  4. Incremental tracking (.processed_chunks_tracker) │
└──────────────────────────────────────────────────────┘
         │
         ▼
┌─ build_vectordb.py (453 lines) ─────────────────────┐
│  1. Load vectordb_ready JSON files                   │
│  2. Batch OpenAI embedding generation (batch: 100)   │
│  3. ChromaDB insertion with metadata                 │
│  4. Verification query + statistics report           │
│  5. Build summary saved to build_summary.json        │
└──────────────────────────────────────────────────────┘
         │
         ▼
   ChromaDB Collection (4,114 chunks)
```

### 9.3 Chunk Metadata

Each vector chunk includes:

| Metadata Field     | Type    | Example                                                 |
| ------------------ | ------- | ------------------------------------------------------- |
| `source`           | string  | "KDIGO_Guidelines_2024.pdf"                             |
| `title`            | string  | "KDIGO Clinical Practice Guidelines"                    |
| `language`         | string  | "en"                                                    |
| `year`             | int     | 2024                                                    |
| `content_type`     | string  | "recommendation" / "evidence" / "dietary" / "treatment" |
| `section`          | string  | "Nutritional Management"                                |
| `has_ckd`          | boolean | true                                                    |
| `has_gfr`          | boolean | true                                                    |
| `has_diabetes`     | boolean | false                                                   |
| `has_hypertension` | boolean | true                                                    |
| `has_dialysis`     | boolean | false                                                   |
| `keywords`         | string  | "eGFR, creatinine, proteinuria"                         |

### 9.4 RAG Retrieval Pipeline

| Step | Component                | Detail                                               |
| ---- | ------------------------ | ---------------------------------------------------- |
| 1    | NLU Analysis             | Intent, entities, severity, emotion extraction       |
| 2    | Query Generation         | 3 semantic search variations from NLU analysis       |
| 3    | Semantic Search          | ChromaDB similarity search per variation             |
| 4    | Deduplication            | Remove duplicate chunks by document ID               |
| 5    | Cross-Encoder Re-ranking | TinyBERT `ms-marco-TinyBERT-L-2-v2` scores relevance |
| 6    | Sigmoid Normalization    | Convert scores to probabilities                      |
| 7    | Threshold Filtering      | Keep chunks with score > 0.01                        |
| 8    | Context Assembly         | Top-ranked chunks assembled as LLM context           |

### 9.5 OpenAI Embeddings Interface

**File:** `ai-engine/src/chatbot/openai_embeddings.py` (183 lines)  
**Class:** `OpenAIEmbeddings` — SentenceTransformer-compatible interface

| Feature          | Detail                                                          |
| ---------------- | --------------------------------------------------------------- |
| API              | OpenRouter (`https://openrouter.ai/api/v1/embeddings`)          |
| Model            | `openai/text-embedding-3-small` (1536d)                         |
| Batch Size       | Configurable (default: 100)                                     |
| Rate Limiting    | 0.1s delay between batches                                      |
| Error Resilience | Returns `[0.0] × 1536` dummy vectors on failure (never crashes) |
| Retry            | Built-in retry logic                                            |

---

## 10. LLM Integration — Gemini 2.5 Flash

**File:** `ai-engine/src/chatbot/llm_engine.py` (611 lines)  
**Class:** `LLMEngine`

### 10.1 Model Configuration

| Setting                   | Value                                                        |
| ------------------------- | ------------------------------------------------------------ |
| Model                     | `google/gemini-2.5-flash`                                    |
| API                       | OpenRouter (`https://openrouter.ai/api/v1/chat/completions`) |
| Temperature (response)    | 0.7                                                          |
| Temperature (rewriter)    | 0.1                                                          |
| Temperature (translation) | 0.3                                                          |
| Max Response Tokens       | 2,048                                                        |
| Max Context Tokens        | 4,000                                                        |

### 10.2 System Prompt Features

The LLM system prompt includes:

- **Medical triage protocol** — Emergency detection and escalation
- **2-question rule** — Maximum 2 clarifying questions per response
- **Patient context awareness** — CKD stage, medications, lab values
- **Google Maps tool** — Generates `[MAPS: <location>]` tags for hospital/pharmacy navigation
- **Source attribution** — Must cite sources from RAG context
- **Greeting handling** — Natural conversation starters
- **Safety guardrails** — Medical disclaimer, no diagnosis claims

### 10.3 Translation Functions

| Function                          | Direction                  | Method                                                               |
| --------------------------------- | -------------------------- | -------------------------------------------------------------------- |
| `translate_to_english()`          | Singlish/Sinhala → English | Few-shot LLM with dictionary hints                                   |
| `translate_to_sinhala_fallback()` | English → Spoken Sinhala   | LLM + deterministic glossary post-processing                         |
| `enforce_spoken_sinhala()`        | Hybrid                     | Deterministic word-level replacement using `english_to_sinhala.json` |
| `contextualize_query()`           | —                          | Standalone query rewriter (resolves pronouns, context)               |

### 10.4 Hallucination Safeguards

| Check                             | Trigger                         | Action                |
| --------------------------------- | ------------------------------- | --------------------- |
| Response length > 4× query length | Rewriter hallucination          | Return original query |
| Starts with "As Nephro"           | Self-introduction hallucination | Return original query |
| Empty/whitespace response         | API failure                     | Return original query |
| Truncation detected               | Response too long               | Log warning           |

---

## 11. Multi-Language Support (English + Sinhala)

### 11.1 Language Detection

```
Input Text
    │
    ├── Contains Sinhala Unicode (U+0D80–U+0DFF)? → "si" (Sinhala)
    │
    ├── Contains Singlish keywords (180+ terms)? → "si" (Singlish)
    │   Examples: "wathura", "beheth", "kidney eka", "potha"
    │
    └── Default → "en" (English)
```

### 11.2 Supported Vocabulary

| Category                    | Count      | Examples                                                                                                    |
| --------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------- |
| Core CKD Medical Terms      | 120+       | Across 8 categories: renal, lab markers, nutrition, treatments, dialysis, complications, lifestyle, staging |
| Medical Abbreviations       | 270+       | CKD → Chronic Kidney Disease, eGFR → estimated Glomerular Filtration Rate, etc.                             |
| Singlish Keywords           | 180+       | Body parts, symptoms, foods, medical actions in Romanized Sinhala                                           |
| Sinhala Medical Dictionary  | Dynamic    | Loaded from `sinhala_med_dict.json` at runtime                                                              |
| Sinhala Generation Glossary | Dynamic    | `english_to_sinhala.json` for deterministic term replacement                                                |
| Translation Cache           | Persistent | `translation_cache.json` for previously translated phrases                                                  |

### 11.3 Sandwich Translation Architecture

```
┌─────────────────────────────────────────────────┐
│  SINHALA/SINGLISH INPUT                          │
│  "මගේ creatinine level එක ගැන කියන්න"             │
└─────────────────────┬───────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────┐
│  TOP BREAD: Bridge Layer                         │
│  → LaBSE intent + MedDict entity extraction     │
│  → Fast Path (confidence>0.6) or Smart Path      │
│  → English query: "Tell me about creatinine"    │
└─────────────────────┬───────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────┐
│  FILLING: English RAG + LLM Pipeline             │
│  → ChromaDB retrieval → Cross-encoder re-ranking │
│  → Gemini 2.5 Flash response generation          │
│  → English response text                        │
└─────────────────────┬───────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────┐
│  BOTTOM BREAD: Style Layer                       │
│  → LLM: English → Natural Sinhala (Katha Wahara)│
│  → Deterministic glossary enforcement            │
│  → Code-mixing: English medical terms retained   │
│  → "ඔබේ creatinine level එක..."                  │
└─────────────────────────────────────────────────┘
```

---

## 12. Text-to-Speech (TTS) System

### 12.1 Server-Side TTS

| Feature                | Detail                                                                    |
| ---------------------- | ------------------------------------------------------------------------- |
| **Sinhala (Primary)**  | Gemini 2.5 Flash Preview TTS via Google GenAI (Voice: `Kore`)             |
| **Sinhala (Fallback)** | Edge-TTS `si-LK-ThiliniNeural`                                            |
| **English**            | Edge-TTS `en-US-AriaNeural`                                               |
| **Audio Format**       | MP3                                                                       |
| **Processing**         | Gemini PCM → WAV (in-memory via `wave` module) → MP3 (pydub)              |
| **Caching**            | File-based, keyed by `MD5(text + engine)` → `tts_cache/{hash}_{lang}.mp3` |
| **Text Cleaning**      | Strips markdown (`*`, `#`, `_`), URLs, emojis, unsupported characters     |

### 12.2 Client-Side TTS

| Scenario             | Engine                                                       | Latency               |
| -------------------- | ------------------------------------------------------------ | --------------------- |
| English (text chat)  | `expo-speech` (local)                                        | Instant (~0ms)        |
| Sinhala (text chat)  | Server `POST /chat/tts` → download blob → `expo-av` playback | ~2-4s                 |
| English (voice chat) | `expo-speech` (local)                                        | Instant               |
| Sinhala (voice chat) | Server audio response body → `expo-av` playback              | Bundled with response |

### 12.3 TTS Playback Controls

- **Play**: Tap "Read Aloud" on any bot message
- **Stop**: Tap same message again (toggle)
- **Switch**: Tap different message — stops current, starts new
- **Loading indicator**: Spinner shown while fetching server TTS audio
- **Fallback**: If server TTS fails for Sinhala, falls back to `expo-speech` with `si-LK` locale at rate 0.9

---

## 13. Speech-to-Text (STT) System

**File:** `ai-engine/src/chatbot/patient_input.py` (194 lines)  
**Class:** `PatientInputHandler`

### 13.1 Configuration

| Setting                 | Value                                            |
| ----------------------- | ------------------------------------------------ |
| **STT API**             | Groq Cloud API                                   |
| **Model**               | `whisper-large-v3`                               |
| **Temperature**         | 0.0 (strict, no creativity)                      |
| **Sample Rate**         | 16kHz                                            |
| **VAD Model**           | Silero VAD (`snakers4/silero-vad` via torch.hub) |
| **Auto-stop**           | 1.5 seconds of silence                           |
| **Audio Normalization** | pydub `-20dBFS` before transcription             |

### 13.2 Client-Side Recording

| Setting               | Value                                        |
| --------------------- | -------------------------------------------- |
| **Library**           | `expo-av` (`Audio.Recording`)                |
| **Quality**           | `Audio.RecordingOptionsPresets.HIGH_QUALITY` |
| **Format**            | `audio/m4a` (iOS) / `audio/mp4` (Android)    |
| **Metering Interval** | 100ms                                        |
| **Upload**            | FormData multipart to `POST /chat/audio`     |
| **Timeout**           | 60 seconds (AbortController)                 |

### 13.3 Hallucination Filtering

The STT system includes an aggressive filter for Whisper hallucinations:

| Filter Type            | Detail                                                    |
| ---------------------- | --------------------------------------------------------- |
| **Foreign Scripts**    | Detects Korean Hangul, Greek, Arabic characters           |
| **Ghost Words**        | "thank you for watching", "subtitle", "music", "applause" |
| **Gibberish Patterns** | "Tamb", "Hue", repeated syllables                         |
| **Context Prompts**    | Medical and dietary terminology guides Whisper output     |
| **Retry Logic**        | 2 attempts on failure before returning error              |

---

## 14. API Reference

### Base URL: `http://<server-ip>:8001`

### 14.1 `GET /`

**Purpose:** Health check

**Response:**

```json
{ "status": "ok" }
```

---

### 14.2 `POST /chat/text`

**Purpose:** Process text-based chat messages

**Request:**

```json
{
  "text": "What foods should I avoid with CKD stage 3?",
  "patient_id": "default_patient"
}
```

**Response:**

```json
{
  "response": "Based on your CKD Stage 3b, you should limit...",
  "sources": [
    { "source": "KDIGO Guidelines 2024" },
    { "source": "NKF Dietary Guidelines" }
  ],
  "nlu_analysis": {
    "intent": "DIET_INQUIRY",
    "entities": ["CKD", "diet"],
    "severity": "normal",
    "emotion": null
  }
}
```

---

### 14.3 `POST /chat/audio`

**Purpose:** Process voice input and return audio response

**Request:** `multipart/form-data`

| Field        | Type   | Description          |
| ------------ | ------ | -------------------- |
| `file`       | File   | Audio file (m4a/mp4) |
| `patient_id` | string | Patient identifier   |

**Response:** MP3 audio stream (`audio/mpeg`) with custom headers:

| Header                | Encoding | Content                      |
| --------------------- | -------- | ---------------------------- |
| `X-Transcription-B64` | Base64   | User's transcribed speech    |
| `X-Response-B64`      | Base64   | Bot's text response          |
| `X-Sources-B64`       | Base64   | JSON array of source objects |

---

### 14.4 `POST /chat/tts`

**Purpose:** Generate TTS audio for any text

**Request:**

```json
{
  "text": "ඔබේ වකුගඩු සෞඛ්‍යයට..."
}
```

**Response:** MP3 audio stream (`audio/mpeg`)

---

### 14.5 `POST /chat/clear`

**Purpose:** Clear session history and cached responses

**Request:**

```json
{
  "text": "clear",
  "patient_id": "default_patient"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Cleared chat history and 3 cached responses for default_patient"
}
```

---

### 14.6 Dual-Mounted Routes

All chat endpoints are mounted at both root and `/api` prefix:

| Primary            | Alias                  |
| ------------------ | ---------------------- |
| `POST /chat/text`  | `POST /api/chat/text`  |
| `POST /chat/audio` | `POST /api/chat/audio` |
| `POST /chat/tts`   | `POST /api/chat/tts`   |
| `POST /chat/clear` | `POST /api/chat/clear` |

---

## 15. End-to-End Data Flows

### 15.1 Text Chat Flow

```
[User types message in TextInput]
         │
         ▼
[Message added to local state + AsyncStorage]
         │
         ▼
[Loading animation starts]
  "Reading message..." → "Analyzing symptoms..." →
  "Consulting database..." → "Checking safety..." →
  "Typing response..."
         │
         ▼
[axios.post("/chat/text", { text, patient_id })]
         │
         ▼
[Server]
  ├── Greeting detection → clear session if "hi"/"hello"
  ├── Append user message to SESSIONS[patient_id]
  └── RAG Pipeline:
        ├── Language detect → Cache check
        ├── Bridge Layer (NLU + translation)
        ├── Context rewriter
        ├── VectorDB retrieval + re-ranking
        ├── Patient context injection
        ├── LLM generation (Gemini 2.5 Flash)
        └── Style layer (Sinhala translation if needed)
         │
         ▼
[Server returns { response, sources, nlu_analysis }]
         │
         ▼
[Bot message appended to state + AsyncStorage]
         │
         ▼
[FlatList auto-scrolls to bot message]
[Markdown renderer displays response]
[Source tags shown below message]
```

### 15.2 Voice Chat Flow

```
[User presses and holds mic button]
  ├── Haptic feedback (heavy impact)
  ├── Audio mode: allowsRecordingIOS = true
  └── HIGH_QUALITY recording starts
         │
[Recording overlay visible]
  ├── Real-time volume meter (100ms interval)
  ├── Visual feedback: "Perfect Volume" / "Speak Louder"
  └── Pulse animation on mic icon
         │
[User releases button]
  ├── Haptic feedback (light impact)
  ├── Recording stops → URI obtained
  └── "Voice Message" added to local state
         │
         ▼
[Loading animation: "Listening to audio..." → "Translating Sinhala..."
 → "Analyzing symptoms..." → "Checking safety..." → "Formulating advice..."]
         │
         ▼
[fetch POST "/chat/audio" with FormData (file + patient_id)]
  ├── 60-second AbortController timeout
         │
         ▼
[Server]
  ├── Save temp file
  ├── Normalize audio (-20dBFS via pydub)
  ├── Whisper STT (Groq Cloud) → transcription
  ├── Gibberish/hallucination filter
  ├── RAG pipeline → response text
  ├── TTS generation → MP3 audio
  └── Return: MP3 body + Base64 headers
         │
         ▼
[Client decodes Base64 headers via custom base64Decode()]
  ├── X-Transcription-B64 → user's spoken text
  ├── X-Response-B64 → bot's response text
  └── X-Sources-B64 → source attribution list
         │
         ▼
[Language check on response text]
  ├── Sinhala: Download audio blob → write to cache dir → play via expo-av
  └── English: Use expo-speech locally (faster, no download)
         │
         ▼
[Bot message appended with decoded text and sources]
```

### 15.3 TTS Playback Flow

```
[User taps "Read Aloud" on bot message]
         │
         ▼
[Stop any currently playing audio]
         │
         ▼
[Detect language: Sinhala Unicode check]
         │
         ├── English:
         │     └── expo-speech.speak({
         │           text, language: "en-US",
         │           pitch: 1.0, rate: 1.0
         │         })  → Instant playback
         │
         └── Sinhala:
               ├── Show TTS loading indicator
               ├── fetch POST "/chat/tts" { text }
               │         │
               │         ▼ (Server)
               │   ├── Check tts_cache/ for MD5 match
               │   ├── Miss: Gemini TTS (Kore voice) → PCM → WAV → MP3
               │   │   Fallback: Edge-TTS si-LK-ThiliniNeural
               │   └── Return MP3 stream
               │         │
               ├── Download blob → base64 → write to FileSystem.cacheDirectory
               ├── Play via expo-av Audio.Sound
               └── On finish: cleanup temp file, restore audio mode
```

---

## 16. Session & State Management

### 16.1 Client-Side (Mobile App)

| Storage          | Key                      | Data                                                        | Lifecycle                      |
| ---------------- | ------------------------ | ----------------------------------------------------------- | ------------------------------ |
| **AsyncStorage** | `chat_messages_{userID}` | Array of message objects (text, sender, timestamp, sources) | Persistent across app restarts |

**Operations:**

- **Load**: `useEffect` on mount → reads from AsyncStorage → shows welcome message if empty
- **Save**: `useEffect` on `messages` change → writes to AsyncStorage after every update
- **Clear**: Removes AsyncStorage key + resets to welcome message

### 16.2 Server-Side (AI Engine)

| Storage                         | Key          | Data                               | Lifecycle                         |
| ------------------------------- | ------------ | ---------------------------------- | --------------------------------- |
| **In-memory dict** (`SESSIONS`) | `patient_id` | Array of `{role, content}` objects | Volatile — lost on server restart |

**Operations:**

- **Sliding window**: Last 10 messages per patient
- **Auto-clear**: On greeting detection ("hi", "hello", "ayubowan", "kohomada")
- **Manual clear**: Via `POST /chat/clear`
- **LLM context**: Last 4 turns sent to Gemini for conversation continuity

---

## 17. Caching Mechanisms

| Cache                  | Type              | Key                                  | Location                             | Purpose                                         |
| ---------------------- | ----------------- | ------------------------------------ | ------------------------------------ | ----------------------------------------------- |
| **RAG Response Cache** | In-memory dict    | MD5(`patient_id:version:lang:query`) | `RAGEngine.cache`                    | Avoid re-running pipeline for identical queries |
| **Translation Cache**  | JSON file         | Source text                          | `data/translation_cache.json`        | Cache Singlish→English translations             |
| **TTS Audio Cache**    | File-based        | MD5(`text + engine`)                 | `tts_cache/{hash}_{lang}.mp3`        | Avoid re-generating same TTS audio              |
| **Client Audio Cache** | Temp files        | Auto-generated                       | `FileSystem.cacheDirectory`          | Store downloaded TTS blobs for playback         |
| **Embedding Cache**    | ChromaDB internal | Document ID                          | `vectordb/chroma_db/`                | Persistent vector storage                       |
| **LaBSE Anchor Cache** | In-memory tensor  | Pre-computed                         | `SinhalaNLUEngine.intent_embeddings` | Pre-encoded intent anchor embeddings            |

---

## 18. Error Handling & Resilience

### 18.1 Frontend Error Handling

| Scenario                    | Handling                                                                 |
| --------------------------- | ------------------------------------------------------------------------ |
| Network timeout             | `Alert.alert()` + error message bubble (red-tinted with `isError: true`) |
| Audio upload failure        | 60s AbortController timeout → error message                              |
| Base64 decode failure       | Fallback to raw string, log warning                                      |
| TTS server failure          | Falls back to local `expo-speech` with `si-LK` locale                    |
| Backend clear failure       | Logged as non-critical warning, doesn't block UI                         |
| Recording permission denied | Alert shown, recording not started                                       |

### 18.2 Backend Error Handling

| Scenario                     | Handling                                                                    |
| ---------------------------- | --------------------------------------------------------------------------- |
| Embedding API failure        | Returns `[0.0] × 1536` dummy vectors (never crashes)                        |
| LLM API failure              | Returns generic fallback message                                            |
| Gemini TTS failure           | Falls back to Edge-TTS `si-LK-ThiliniNeural`                                |
| Whisper hallucination        | Gibberish filter (foreign scripts, ghost words) + retry (2 attempts)        |
| Query rewriter hallucination | Length check (>4× = hallucinated), self-intro check → return original query |
| ChromaDB query failure       | Graceful degradation, returns empty context                                 |
| File I/O error               | Async cleanup with error logging                                            |
| Audio normalization failure  | Process with original audio                                                 |

---

## 19. Project File Reference

### 19.1 Frontend (Mobile App)

| File                                      | Lines | Purpose                                           |
| ----------------------------------------- | ----- | ------------------------------------------------- |
| `mobile-app/src/screens/ChatbotScreen.js` | 1,780 | Main chatbot UI — messages, input, recording, TTS |
| `mobile-app/src/api/axiosConfig.js`       | ~30   | Centralized API URL config + axios instance       |
| `mobile-app/src/screens/HomeScreen.js`    | —     | Navigation entry point ("AI Assistant" card)      |
| `mobile-app/App.js`                       | —     | Stack navigator with Chatbot screen registration  |
| `mobile-app/package.json`                 | —     | All frontend dependencies                         |

### 19.2 Backend — AI Engine Core

| File                                   | Lines | Purpose                                                            |
| -------------------------------------- | ----- | ------------------------------------------------------------------ |
| `ai-engine/server.py`                  | 403   | FastAPI server — 4 chat endpoints, TTS, session management         |
| `ai-engine/src/chatbot/rag_engine.py`  | 301   | **Orchestrator** — coordinates NLU → retrieval → LLM → translation |
| `ai-engine/src/chatbot/llm_engine.py`  | 611   | LLM integration — Gemini 2.5 Flash, translation, query rewriting   |
| `ai-engine/src/chatbot/nlu_engine.py`  | 738   | English NLU — spaCy + SciSpaCy + LaBSE + Negex                     |
| `ai-engine/src/chatbot/sinhala_nlu.py` | 171   | Sinhala NLU — LaBSE zero-shot cross-lingual intent                 |
| `ai-engine/src/chatbot/config.py`      | 503   | Central configuration — paths, entities, abbreviations, settings   |

### 19.3 Backend — Input/Output

| File                                     | Lines | Purpose                                                        |
| ---------------------------------------- | ----- | -------------------------------------------------------------- |
| `ai-engine/src/chatbot/patient_input.py` | 194   | STT handler — Groq Whisper + Silero VAD + hallucination filter |
| `ai-engine/src/chatbot/patient_data.py`  | 100   | Mock patient database (2 patients: `default_patient`, `lasal`) |
| `ai-engine/src/chatbot/tts_engine.py`    | 90    | Edge-TTS engine with caching (CLI mode)                        |

### 19.4 Backend — Vector Database

| File                                               | Lines | Purpose                                                              |
| -------------------------------------------------- | ----- | -------------------------------------------------------------------- |
| `ai-engine/src/chatbot/query_vectordb.py`          | 240   | Base ChromaDB query interface with interactive REPL                  |
| `ai-engine/src/chatbot/enhanced_query_vectordb.py` | 172   | NLU-enhanced search + TinyBERT cross-encoder re-ranking              |
| `ai-engine/src/chatbot/build_vectordb.py`          | 453   | ChromaDB builder (incremental) with OpenAI embeddings                |
| `ai-engine/src/chatbot/openai_embeddings.py`       | 183   | OpenAI embedding API via OpenRouter (SentenceTransformer-compatible) |
| `ai-engine/src/chatbot/pdf_extractor.py`           | 687   | PDF/TXT → cleaned, chunked, enriched text                            |
| `ai-engine/src/chatbot/prepare_vectordb.py`        | 496   | Chunk quality filtering + ChromaDB format preparation                |
| `ai-engine/src/chatbot/analyze_chunks.py`          | 290   | Chunk statistics analysis and reporting                              |
| `ai-engine/src/chatbot/ingest_hospitals.py`        | 45    | Hospital data ingestion pipeline                                     |

### 19.5 Backend — Utilities & Standalone

| File                                   | Lines | Purpose                                                          |
| -------------------------------------- | ----- | ---------------------------------------------------------------- |
| `ai-engine/src/chatbot/run_chatbot.py` | 155   | CLI chatbot runner (text/voice/sinhala modes, Google Maps agent) |
| `ai-engine/src/utils/logger.py`        | 26    | `ConsoleLogger` — timestamped emoji-prefixed console output      |

### 19.6 Data & Storage

| Path                                     | Purpose                                              |
| ---------------------------------------- | ---------------------------------------------------- |
| `ai-engine/vectordb/chroma_db/`          | ChromaDB persistent storage (4,114 chunks)           |
| `ai-engine/tts_cache/`                   | Cached TTS MP3 files (MD5-keyed)                     |
| `ai-engine/temp_inputs/`                 | Temporary audio upload storage                       |
| `ai-engine/data/sinhala_med_dict.json`   | Sinhala medical dictionary (Sinhala → English terms) |
| `ai-engine/data/english_to_sinhala.json` | English → Sinhala generation glossary                |
| `ai-engine/data/translation_cache.json`  | Persistent translation cache (Singlish → English)    |
| `ai-engine/data/`                        | Training data, CSVs, and processed documents         |

---

## 20. Dependencies

### 20.1 Mobile App (Key Packages)

```json
{
  "expo": "~54.0.30",
  "react": "19.1.0",
  "react-native": "0.81.5",
  "expo-av": "~16.0.8",
  "expo-speech": "~14.0.8",
  "expo-file-system": "~19.0.21",
  "expo-haptics": "~15.0.8",
  "axios": "^1.13.2",
  "@react-native-async-storage/async-storage": "^2.2.0",
  "react-native-markdown-display": "^7.0.2",
  "@react-navigation/native": "^6.1.9",
  "@react-navigation/stack": "^6.3.20",
  "react-native-safe-area-context": "bundled",
  "react-native-gesture-handler": "bundled",
  "react-native-screens": "bundled",
  "lottie-react-native": "~7.3.1",
  "buffer": "^6.0.3",
  "expo-constants": "bundled",
  "expo-status-bar": "bundled",
  "expo-image-picker": "^17.0.10"
}
```

### 20.2 AI Engine (Python — `requirements.txt`)

| Category            | Packages                                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **API Server**      | `fastapi`, `uvicorn`, `python-multipart`, `aiofiles`                                                                     |
| **Vector Database** | `chromadb>=0.4.18`                                                                                                       |
| **NLU / NLP**       | `spacy>=3.7.2`, `scispacy>=0.5.4`, `negspacy>=1.0.4`, `sentence-transformers>=2.2.2`, `nltk>=3.8.1`, `langdetect>=1.0.9` |
| **LLM / AI**        | `google-genai`, `groq>=1.0.0`                                                                                            |
| **Audio**           | `edge-tts>=6.1.9`, `pydub`, `torch`, `torchaudio`, `sounddevice`, `soundfile>=0.13.0`                                    |
| **PDF Processing**  | `pdfplumber`, `PyPDF2`                                                                                                   |
| **ML / DL**         | `tensorflow>=2.13.0`, `tf-keras>=2.20.0`, `scikit-learn>=1.3.0`, `opencv-python>=4.5.0`, `pillow>=9.0.0`                 |
| **Data**            | `numpy>=1.24.3,<2.0.0`, `pandas>=2.0.3`                                                                                  |
| **Web/Text**        | `beautifulsoup4>=4.12.2`, `lxml>=4.9.3`, `requests>=2.31.0`                                                              |
| **Utilities**       | `python-dotenv>=1.0.0`, `tqdm>=4.66.1`                                                                                   |

**SciSpaCy biomedical model (installed separately):**

```
pip install https://s3-us-west-2.amazonaws.com/ai2-s2-scispacy/releases/v0.5.4/en_ner_bc5cdr_md-0.5.4.tar.gz
```

---

## 21. Environment Variables

**File:** `ai-engine/.env`

| Variable             | Purpose                                               | Used By                                              |
| -------------------- | ----------------------------------------------------- | ---------------------------------------------------- |
| `OPENROUTER_API_KEY` | OpenRouter API key for Gemini LLM + OpenAI Embeddings | `llm_engine.py`, `openai_embeddings.py`, `config.py` |
| `GOOGLE_API_KEY`     | Google GenAI API key for Gemini TTS                   | `server.py`                                          |
| `GROQ_API_KEY`       | Groq Cloud API key for Whisper STT                    | `patient_input.py`                                   |

---

## 22. Setup & Installation

### 22.1 Prerequisites

- **Python** 3.9+ with pip
- **Node.js** 18+ with npm
- **Expo CLI** (`npm install -g expo-cli`)
- **FFmpeg** (for audio processing with pydub)

### 22.2 AI Engine Setup

```bash
# Navigate to AI engine directory
cd ai-engine

# Create and activate virtual environment
python -m venv .venv
source .venv/bin/activate  # Linux/Mac
# .\.venv\Scripts\Activate.ps1  # Windows PowerShell

# Install Python dependencies
pip install -r requirements.txt

# Install SciSpaCy biomedical model
pip install https://s3-us-west-2.amazonaws.com/ai2-s2-scispacy/releases/v0.5.4/en_ner_bc5cdr_md-0.5.4.tar.gz

# Download spaCy English model
python -m spacy download en_core_web_sm

# Download NLTK data
python -c "import nltk; nltk.download('punkt'); nltk.download('punkt_tab')"

# Create .env file with API keys
echo "OPENROUTER_API_KEY=your_key_here" > .env
echo "GOOGLE_API_KEY=your_key_here" >> .env
echo "GROQ_API_KEY=your_key_here" >> .env

# Start the server
python server.py
# Server runs on http://0.0.0.0:8001
```

### 22.3 Mobile App Setup

```bash
# Navigate to mobile app directory
cd mobile-app

# Install dependencies
npm install

# Update API URL in src/api/axiosConfig.js
# Change IP to your server's IP address

# Start Expo development server
npx expo start
```

### 22.4 Building the Vector Database (First Time)

```bash
cd ai-engine

# 1. Place PDF/TXT medical documents in data/raw/

# 2. Extract and chunk documents
python -m src.chatbot.pdf_extractor

# 3. Prepare chunks for vectorization
python -m src.chatbot.prepare_vectordb

# 4. Build ChromaDB with embeddings
python -m src.chatbot.build_vectordb

# Verify: should report 4,114 chunks in collection
```

---

## 23. Known Limitations & Future Improvements

### 23.1 Current Limitations

| Limitation                      | Impact                                                                                    | Severity |
| ------------------------------- | ----------------------------------------------------------------------------------------- | -------- |
| **Mock patient data**           | Only 2 hardcoded patients (`default_patient`, `lasal`); unknown IDs get generic responses | Medium   |
| **In-memory sessions**          | `SESSIONS` dict lost on server restart; no session persistence                            | Medium   |
| **Hardcoded IP**                | `172.28.26.45` in `axiosConfig.js` must be manually changed per network                   | Medium   |
| **No API authentication**       | All chatbot endpoints lack JWT/auth middleware                                            | Medium   |
| **CORS wildcard**               | `allow_origins=["*"]` not suitable for production                                         | Low      |
| **No offline support**          | Chatbot requires server connectivity for all operations except local English TTS          | Medium   |
| **Single-server**               | No load balancing or horizontal scaling; API calls are the bottleneck                     | Low      |
| **Timeout mismatch**            | Audio: 60s (fetch), Text: 120s (axios) — inconsistent                                     | Low      |
| **Dead code**                   | `arrayBufferToBase64` function in ChatbotScreen (uses unavailable `window.btoa`)          | Low      |
| **welcomeMessage not memoized** | Recreated every render, makes `clearChatHistory` useCallback ineffective                  | Low      |

### 23.2 Recommended Improvements

| Priority   | Improvement                   | Description                                                |
| ---------- | ----------------------------- | ---------------------------------------------------------- |
| **High**   | Environment-based API config  | Use `.env` with `react-native-dotenv` for IP configuration |
| **High**   | JWT authentication            | Protect all chatbot endpoints with JWT middleware          |
| **High**   | Database-backed sessions      | Redis or MongoDB for persistent chat sessions              |
| **High**   | Real patient data integration | Connect to MongoDB/FHIR for actual patient records         |
| **Medium** | Production CORS               | Restrict `allow_origins` to specific mobile app origins    |
| **Medium** | Error retry with backoff      | Exponential backoff for API calls                          |
| **Medium** | Offline message queuing       | Queue messages when offline, send when connected           |
| **Medium** | Consistent timeouts           | Align text and audio endpoint timeouts                     |
| **Low**    | Remove dead code              | Remove `arrayBufferToBase64` function                      |
| **Low**    | Memoize welcomeMessage        | Use `useMemo` for welcome message constant                 |
| **Low**    | WebSocket upgrade             | Replace polling with WebSocket for real-time chat          |

---

## Summary

The Nephro-AI Chatbot is a sophisticated, multi-layered medical AI assistant combining:

- **7 AI/ML models** (Gemini 2.5 Flash, LaBSE, TinyBERT, Whisper, Silero VAD, SciSpaCy, Negex)
- **Bilingual support** via a Sandwich Translation Architecture (Sinhala ↔ English)
- **RAG retrieval** over 4,114 medical document chunks with cross-encoder re-ranking
- **Multi-modal I/O** (text, voice, TTS) across a React Native mobile interface
- **~6,000 lines of Python** backend code + **~1,800 lines of JavaScript** frontend code
- **3 external API services** (OpenRouter, Groq Cloud, Google GenAI) + local ChromaDB

The system is designed as a research prototype with a clear path to production through database integration, authentication, and session persistence improvements.

---

_Last updated: February 2026_


CICD Check 2 