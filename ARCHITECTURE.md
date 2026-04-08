# 🩺 Nephro-AI — Full Architectural Design & Technical Explanation

> **Final Year Research Project**  
> An AI-powered Android mobile application for early Chronic Kidney Disease (CKD) risk prediction, staging, progression forecasting, dietary management, kidney scan analysis, and multilingual health chatbot assistance.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [System Architecture Diagram](#2-system-architecture-diagram)
3. [Technology Stack Summary](#3-technology-stack-summary)
4. [Layer-by-Layer Architecture](#4-layer-by-layer-architecture)
   - [4.1 Mobile App (React Native / Expo)](#41-mobile-app-react-native--expo)
   - [4.2 Backend API (Node.js / Express)](#42-backend-api-nodejs--express)
   - [4.3 AI Engine (Python / FastAPI)](#43-ai-engine-python--fastapi)
5. [Data Models (MongoDB / Mongoose)](#5-data-models-mongodb--mongoose)
6. [AI & ML Subsystems](#6-ai--ml-subsystems)
   - [6.1 CKD Early Risk Prediction](#61-ckd-early-risk-prediction)
   - [6.2 CKD Stage Progression Forecasting](#62-ckd-stage-progression-forecasting)
   - [6.3 Kidney Ultrasound Scan Analysis](#63-kidney-ultrasound-scan-analysis)
   - [6.4 OCR Lab Report Extraction](#64-ocr-lab-report-extraction)
   - [6.5 Meal Analysis & Portion Estimation](#65-meal-analysis--portion-estimation)
   - [6.6 Multilingual RAG Chatbot](#66-multilingual-rag-chatbot)
7. [Google Health Connect Integration](#7-google-health-connect-integration)
8. [Background Health Data Sync Pipeline](#8-background-health-data-sync-pipeline)
9. [API Reference Overview](#9-api-reference-overview)
10. [Navigation & Screen Map](#10-navigation--screen-map)
11. [Security & Authentication](#11-security--authentication)
12. [Communication & Data Flow](#12-communication--data-flow)
13. [Project File Structure](#13-project-file-structure)
14. [Port & Deployment Map](#14-port--deployment-map)

---

## 1. Project Overview

**Nephro-AI** is a three-tier, clinically-oriented mobile health system designed to assist patients and clinicians in early detection and management of Chronic Kidney Disease (CKD). The system integrates:

| Feature | Description |
|---|---|
| **Early Risk Prediction** | Random Forest ML model predicts CKD risk (Low / Medium / High) from vitals with SHAP explainability |
| **CKD Stage Forecasting** | Deep learning (Keras) predicts current CKD stage and 3-month / 6-month progression probability |
| **Kidney Scan Analysis** | U-Net segmentation + SAM (Segment Anything Model) measures kidney dimensions from ultrasound images |
| **Lab Report OCR** | Tesseract OCR + NLP extracts structured values from uploaded lab report images |
| **Meal Analysis** | YOLOv11 object detection + portion estimation identifies food items and calculates nutritional intake |
| **Multilingual Chatbot** | RAG (Retrieval-Augmented Generation) chatbot supporting English and Sinhala (voice & text) |
| **Health Connect Integration** | Imports Blood Pressure readings directly from smartwatches via Google Health Connect on Android |
| **BP & Risk History** | Longitudinal tracking with trend charts across monthly predictions |
| **Nutrient Wallet** | Daily nutrient budget tracker that deducts nutritional intake from a CKD-safe dietary allowance |

---

## 2. System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ANDROID DEVICE (Physical)                            │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │             React Native Mobile App (Expo SDK 54)                    │    │
│  │                                                                      │    │
│  │  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐             │    │
│  │  │  Auth Screens│  │Feature Screens│  │ Chatbot Screen │             │    │
│  │  │  Login/Signup│  │ Risk, Lab,   │  │ Voice + Text   │             │    │
│  │  └──────┬──────┘  │ Meal, Scan,  │  │ TTS Playback   │             │    │
│  │         │         │ BP History   │  └───────┬────────┘             │    │
│  │         │         └──────┬───────┘          │                      │    │
│  │         └────────────────┼──────────────────┘                      │    │
│  │                          │  Axios HTTP Calls                        │    │
│  └──────────────────────────┼──────────────────────────────────────────┘    │
│                             │                                                │
│      Google Health Connect  │  (ADB Reverse: tcp:5000, tcp:8001, tcp:8081)  │
│            ↓                │                                                │
└────────────┼────────────────┼────────────────────────────────────────────────┘
             │                │
             │         ┌──────┴──────────────────────────────────────────────┐
             │         │            DEVELOPER MACHINE (localhost)            │
             │         │                                                      │
             │    ┌────▼───────────────────────────┐                         │
             │    │   Node.js / Express Backend     │  :5000                  │
             │    │                                  │                         │
             │    │  ┌──────────┐  ┌─────────────┐ │                         │
             │    │  │  Routes  │  │ Controllers │ │                         │
             │    │  │ /api/auth│  │ auth, bp,   │ │                         │
             │    │  │ /api/lab │  │ lab, risk,  │ │                         │
             │    │  │ /api/bp  │  │ stage,      │ │                         │
             │    │  │ /api/... │  │ kidneyus,   │ │                         │
             │    │  └──────────┘  │ healthSync  │ │                         │
             │    │                └─────────────┘ │                         │
             │    │  ┌───────────────────────────┐  │                         │
             │    │  │  Mongoose Models / MongoDB │  │                         │
             │    │  │  User, RiskRecord,         │  │                         │
             │    │  │  LabTest, BPRecord,        │  │                         │
             │    │  │  HealthRecord, DailySummary│  │                         │
             │    │  │  KidneyScan, NutrientWallet│  │                         │
             │    │  │  StageProgressionRecord    │  │                         │
             │    │  └───────────────────────────┘  │                         │
             │    │  ┌───────────────────────────┐  │                         │
             │    │  │  Background Services       │  │                         │
             │    │  │  HealthSync Cron Job       │  │                         │
             │    │  │  Tesseract OCR             │  │                         │
             │    │  │  Multer File Upload        │  │                         │
             │    │  └───────────────────────────┘  │                         │
             │    └─────────────────────────────────┘                         │
             │              ↕ HTTP (child_process / axios)                     │
             │    ┌─────────────────────────────────────┐                      │
             │    │   Python / FastAPI AI Engine         │  :8001               │
             │    │                                       │                      │
             │    │  ┌────────────────────────────────┐  │                      │
             │    │  │   RAG Chatbot Pipeline          │  │                      │
             │    │  │   NLU → VectorDB → LLM → TTS   │  │                      │
             │    │  │   (ChromaDB + Gemini + Whisper) │  │                      │
             │    │  └────────────────────────────────┘  │                      │
             │    │  ┌────────────────────────────────┐  │                      │
             │    │  │   CKD Stage Prediction          │  │                      │
             │    │  │   Keras (.keras + .h5 models)   │  │                      │
             │    │  └────────────────────────────────┘  │                      │
             │    │  ┌────────────────────────────────┐  │                      │
             │    │  │   Meal Plate Analysis           │  │                      │
             │    │  │   YOLOv11 + SAM Portion Est.   │  │                      │
             │    │  └────────────────────────────────┘  │                      │
             │    │  ┌────────────────────────────────┐  │                      │
             │    │  │   Ultrasound Scan Analysis      │  │                      │
             │    │  │   U-Net + SAM (mobile_sam.pt)  │  │                      │
             │    │  └────────────────────────────────┘  │                      │
             │    │  ┌────────────────────────────────┐  │                      │
             │    │  │   Early Risk Prediction         │  │                      │
             │    │  │   Random Forest (scikit-learn)  │  │                      │
             │    │  │   + SHAP Explainability         │  │                      │
             │    │  └────────────────────────────────┘  │                      │
             │    └─────────────────────────────────────┘                      │
             │                      ↕                                           │
             │    ┌─────────────────────────────────────┐                      │
             │    │         MongoDB Atlas (Cloud)         │                      │
             │    │   nephro-ai DB: 9 collections         │                      │
             │    └─────────────────────────────────────┘                      │
             └────────────────────────────────────────────────────────────────┘
```

---

## 3. Technology Stack Summary

| Layer | Technology | Version | Purpose |
|---|---|---|---|
| **Mobile App** | React Native | 0.81.5 | Cross-platform Android app |
| **Mobile Framework** | Expo SDK | 54 | Native build toolchain |
| **Navigation** | React Navigation (Stack) | 6.x | Screen transitions |
| **State Management** | React Context API | — | `WalletContext` for nutrient budget |
| **HTTP Client** | Axios | 1.13.x | REST API calls |
| **Health Data** | react-native-health-connect | 3.5.0 | Google Health Connect (BP from watch) |
| **TTS Playback** | expo-av | 16.x | Audio playback of chatbot responses |
| **Camera** | expo-camera, expo-image-picker | 17.x | Meal & scan image capture |
| **Backend** | Node.js + Express | 4.18.x | REST API server |
| **ORM** | Mongoose | 7.6.x | MongoDB schema & queries |
| **Database** | MongoDB Atlas | Cloud | Persistent data storage |
| **Auth** | JWT + bcryptjs | — | Token-based authentication |
| **File Upload** | Multer | 1.4.x | Image uploads (ultrasound, meals) |
| **OCR** | Tesseract.js | 4.1.x | Lab report image-to-text |
| **Scheduler** | node-cron | 4.2.x | Background health data sync jobs |
| **AI Server** | Python + FastAPI + Uvicorn | — | Async REST AI inference |
| **ML Framework** | TensorFlow / Keras | — | Deep learning inference (.keras, .h5) |
| **Classical ML** | scikit-learn | — | Random Forest CKD risk model |
| **Explainability** | SHAP | — | Feature contribution analysis |
| **Object Detection** | YOLOv11 (Ultralytics) | — | Food item detection |
| **Segmentation** | U-Net + SAM (MobileSAM) | — | Kidney & meal portion segmentation |
| **NLU** | LaBSE (sentence-transformers) | — | Sinhala intent detection |
| **Vector DB** | ChromaDB | — | RAG knowledge base |
| **LLM** | Google Gemini API | — | Response generation + Sinhala TTS |
| **Speech-to-Text** | Whisper (OpenAI, small) | — | Voice input transcription |
| **Text-to-Speech** | Gemini TTS + Edge-TTS | — | Sinhala / English voice output |
| **Embeddings** | OpenAI Embeddings | — | ChromaDB document embeddings |

---

## 4. Layer-by-Layer Architecture

### 4.1 Mobile App (React Native / Expo)

The mobile app is the primary user interface, built as a single Android application targeting API 26+ (Android 8+). It is structured as a native Expo app (bare workflow via `npx expo prebuild`) to support `react-native-health-connect` which requires native Android code.

#### Navigation Structure

```
App.js (WalletProvider + NavigationContainer)
│
├── Login          → LoginScreen.js
├── Signup         → SignupScreen.js
├── Home           → HomeScreen.js
│
├── RiskPrediction → RiskPredictionScreen.js
│   └── RiskHistory    → RiskHistoryScreen.js
│
├── FutureCKDStage → FutureCKDStageScreen.js
│   ├── FutureCKDStageResult  → FutureCKDStageResultScreen.js
│   └── FutureCKDStageHistory → FutureCKDStageHistoryScreen.js
│
├── MyProgressPath → MyProgressPathScreen.js
├── BPHistory      → BPHistoryScreen.js
│
├── ScanLab        → ScanLab.js (hub)
│   ├── ScanAnalysis   → ScanAnalysisScreen.js   (ultrasound)
│   ├── ScanResult     → ScanResultScreen.js
│   ├── LabImageUpload → LabImageUploadScreen.js  (OCR lab report)
│   ├── LabAnalysis    → LabAnalysisScreen.js
│   ├── LabResult      → LabResultScreen.js
│   └── ManualLabEntry → ManualLabEntryScreen.js
│
├── DietaryManager → DietaryManagerScreen.js (hub)
│   ├── MealAnalysis   → MealAnalysisScreen.js   (YOLOv11)
│   ├── DietaryPlan    → DietaryPlanScreen.js
│   └── NutrientWallet → NutrientWalletScreen.js
│
└── Chatbot        → ChatbotScreen.js (voice + text + TTS)
```

#### Custom Expo Config Plugins

| Plugin | Purpose |
|---|---|
| `withHealthConnectPermissions.js` | Injects Android permissions for Health Connect (READ_HEALTH_DATA, etc.) into AndroidManifest.xml |
| `withAndroidCxxFix.js` | Patches `android/build.gradle` to fix C++ STL linking errors with NDK 27.1 |

#### State Management: WalletContext

`WalletContext.js` is a React Context provider that manages the **Nutrient Wallet** state globally across screens:
- Daily caloric & nutrient budget (specific to CKD dietary limits)
- Deductions made by `MealAnalysisScreen` after each meal scan
- Persistent balance visible in `NutrientWalletScreen`

---

### 4.2 Backend API (Node.js / Express)

The backend is a REST API server running on **port 5000**. It acts as the central orchestrator between the mobile app, MongoDB, and the AI engine.

#### Route Map

| Route Prefix | File | Controller | Purpose |
|---|---|---|---|
| `/api/auth` | `auth.js` | `authController.js` | Register / Login (JWT) |
| `/api/predict` | `predict.js` | `predictController.js` | CKD early risk prediction proxy |
| `/api/bp-records` | `bp.js` | `bpController.js` | Manual BP record CRUD |
| `/api/health-sync` | `healthSync.js` | `healthSyncController.js` | Health Connect data ingest |
| `/api/lab` | `lab.js` | `labController.js` | OCR lab report + manual lab entry |
| `/api/kidneyus` | `kidneyus.js` | `kidneyusController.js` | Kidney scan history |
| `/api/mealPlate` | `foodRoutes.js` | (inline) | Meal detection proxy to AI engine |
| `/api/stage-progression` | `stageProgression.js` | `stageProgressionController.js` | CKD stage prediction & history |
| `/api/risk-history` | `riskHistory.js` | `riskHistoryController.js` | Risk record CRUD + SHAP data |
| `/api/upload-ultrasound` | (inline in server.js) | — | Multer upload + FastAPI/Python analysis |

#### Key Middleware

- **`cors()`** — Open CORS for mobile app on local network
- **`express.json()`** — JSON body parsing
- **`multer` (diskStorage)** — Saves uploaded images to `/uploads/` directory (max 10MB, jpg/png/bmp)
- **`express.static('/uploads')`** — Serves uploaded images statically

#### Processes Spawned

For ultrasound analysis when the FastAPI service is unavailable, the backend falls back to spawning a Python child process:

```
spawn("python", ["ai-engine/src/ckd_stage/ultrasound_scan.py", imagePath])
```

#### Services

| Service | File | Function |
|---|---|---|
| **Health Sync Cron** | `healthSyncService.js` | Runs on a cron schedule; deduplicates `HealthRecord` → upserts `DailySummary`; computes monthly BP averages |
| **Inference Client** | `utils/inferenceClient.js` | Calls the FastAPI AI engine's `/api/ultrasound/analyze` endpoint; falls back to Python subprocess |

---

### 4.3 AI Engine (Python / FastAPI)

The AI engine is an asynchronous **FastAPI** server running on **port 8001**. It hosts all ML models and the chatbot pipeline. It uses `uvicorn` for async I/O.

#### Endpoint Summary

| Endpoint | Method | Purpose |
|---|---|---|
| `/` | GET | Health check |
| `/login` (also `/api/login`, `/auth/login`) | POST | Session initialization (clears per-patient chat history) |
| `/chat/text` (also `/api/chat/text`) | POST | Text-based chatbot query (RAG pipeline) |
| `/chat/audio` (also `/api/chat/audio`) | POST | Voice chat: STT → RAG → TTS response |
| `/chat/tts` (also `/api/chat/tts`) | POST | Text-to-speech synthesis only |
| `/chat/tts/stream` | POST | Parallel sentence-by-sentence TTS streaming |
| `/chat/clear` | POST | Clear per-patient session + RAG cache |

> **Note:** The risk prediction (`/predict`) and meal plate (`/detect`) endpoints are served by separate module routes mounted via the backend's `foodRoutes.js` and `predictController.js` which internally call the AI engine.

#### Global Engine Objects (startup-loaded)

| Object | Type | Description |
|---|---|---|
| `rag_engine` | `RAGEngine` | Complete RAG chatbot pipeline |
| `stt_engine` | `PatientInputHandler` | Whisper speech-to-text (small model) |
| `gemini_clients` | List of `genai.Client` | Gemini API key pool (round-robin rotation for TTS) |
| `nlg_glossary` | `NLGGlossary` | Sinhala TTS phonetic pre-processor |
| `PREGEN_CACHE` | `dict` | Pre-generated emergency phrase audio (Sinhala + English) |
| `SESSIONS` | `dict` | Per-patient sliding-window chat history (max 10 turns) |

---

## 5. Data Models (MongoDB / Mongoose)

All data is stored in a **MongoDB Atlas** cluster under the `Nephro-AI` database.

### Schema Overview

#### `User`
```
_id, name, email (unique), password (bcrypt-hashed), createdAt
```

#### `HealthRecord` (raw import from Health Connect)
```
userId (ref: User), date (YYYY-MM-DD string), systolic, diastolic,
hba1c, measuredAt, source (e.g. "health_connect"), synced (bool)
```

#### `DailySummary` (deduplicated daily snapshot)
```
userId (ref: User), date, systolic, diastolic, hba1c,
measuredAt, source, lastSyncedAt
```

#### `BPRecord` (manual entry)
```
userId (ref: User), systolic, diastolic, measuredAt, source, note
```

#### `RiskRecord`
```
userId (ref: User), riskLevel (Low/Medium/High), riskScore (0–100),
vitalSigns { spo2, heartRate, bpSystolic, bpDiastolic, age, gender, hba1cLevel, diabetes, hypertension },
shapValues { age, gender, bp_systolic, bp_diastolic, hba1c_level, baseValue },
month (1–12), year,
UNIQUE INDEX: (userId, month, year)
```

#### `LabTest`
```
userId (ref: User), creatinine, egfr, bun, albumin, hemoglobin,
entryMethod ("ocr" | "manual"), reportImagePath, extractedText,
confidence, createdAt
```

#### `KidneyScan`
```
name, kidneyLengthCm, kidneyWidthCm, interpretation, status, imagePath, createdAt
```

#### `NutrientWallet`
```
userId (ref: User), date,
budget { calories, protein, potassium, phosphorus, sodium, fluid },
consumed { calories, protein, potassium, phosphorus, sodium, fluid },
remaining { ... (computed) }
```

#### `StageProgressionRecord`
```
userEmail, userName, visitDate,
inputs { visitDate, age, gender, labs { creatinine, egfr, bun, albumin, hemoglobin }, uploaded { labReport, ultrasound } },
prediction_lab_only, prediction_with_us, ultrasound_info,
eGFR_info { value, source, method },
submissionIndex,
progression_to_next_stage { next_stage, probability, message },
progression_to_next_stage_6_month { ... },
progression_by_stage [{ stage, stage_display, probability }],
progression_by_stage_6_month [{ ... }],
prediction_context
```

---

## 6. AI & ML Subsystems

### 6.1 CKD Early Risk Prediction

**Location:** `ai-engine/src/risk_prediction/api_predict.py`  
**Model:** `models/ckd_model.pkl` (scikit-learn Random Forest)  
**Supporting files:** `models/scaler.pkl`, `models/label_encoder.pkl`

**Input Features:**
| Feature | Type |
|---|---|
| Age | Numeric |
| Gender | Categorical (encoded) |
| BP Systolic | Numeric |
| BP Diastolic | Numeric |
| HbA1c Level | Numeric |
| SpO2 | Numeric |
| Heart Rate | Numeric |
| Diabetes | Boolean |
| Hypertension | Boolean |

**Pipeline:**
1. Mobile app collects vitals + Health Connect BP import
2. `POST /api/predict` → backend `predictController.js` → forwards to AI engine
3. AI engine scales features, runs Random Forest, returns `riskLevel` + `riskScore`
4. **SHAP values** computed for each prediction to explain feature contributions
5. Result stored in `RiskRecord` (one per user per month, compound unique index)
6. SHAP waterfall chart rendered in `RiskHistoryScreen.js`

---

### 6.2 CKD Stage Progression Forecasting

**Location:** `ai-engine/src/ckd_stage/stage_progression_predict.py`  
**Models:**
| Model File | Used When |
|---|---|
| `ckd_model_lab.keras` | Lab values only |
| `ckd_model_lab+us.keras` | Lab values + Ultrasound |
| `best_model_lab_only.keras` | Best performing lab-only |
| `best_model_lab_fusion.keras` | Best performing fusion |
| `ckd_timeaware_dual_output_model.h5` | Time-aware dual-output (3-month + 6-month) |

**Supporting:** `ckd_assets_lab.pkl`, `ckd_assets_lab+us.pkl` (scaler, encoder assets)

**Input:**
- Lab values: creatinine, eGFR, BUN, albumin, hemoglobin
- Optional: ultrasound dimensions (kidney length cm, width cm)
- Optional: uploaded lab report image (OCR-extracted)
- Patient age, gender, visit date

**Output:**
- Current CKD stage (1–5 + No CKD)
- Progression probability to next stage (3-month horizon)
- Progression probability to next stage (6-month horizon)
- Per-stage probability distribution

**Flow:**
```
FutureCKDStageScreen → POST /api/stage-progression/predict
  → stageProgressionController.js → HTTP to AI engine /predict/stage
  → Returns: stage + progression probs → FutureCKDStageResultScreen
  → Saved to StageProgressionRecord in MongoDB
  → FutureCKDStageHistoryScreen renders history
  → MyProgressPathScreen visualizes progression timeline
```

---

### 6.3 Kidney Ultrasound Scan Analysis

**Location:** `ai-engine/src/ckd_stage/ultrasound_scan.py`, `inference_api.py`  
**Models:**
- `models/kidney_unet.h5` — U-Net segmentation for kidney boundary detection
- `models/unet_full_model.h5` — Full U-Net architecture
- `ai-engine/src/mobile_sam.pt` / `ai-engine/mobile_sam.pt` — MobileSAM for precise segmentation

**Pipeline:**
1. User uploads ultrasound image via `ScanAnalysisScreen`
2. `POST /api/upload-ultrasound` (with Multer)
3. Backend first tries FastAPI inference service via `analyzeUltrasoundViaFastApi()`
4. **FastAPI path:** AI engine `/api/ultrasound/analyze` → U-Net + SAM → measurements
5. **Fallback path:** Python subprocess spawned with `ultrasound_scan.py`
6. Returns: `kidney_length_cm`, `kidney_width_cm`, `interpretation`, `status`
7. Saved as `KidneyScan` record; displayed in `ScanResultScreen`

**Measurements derived:**
- Kidney contour via U-Net segmentation
- Pixel-to-cm conversion using calibrated scale
- Echogenicity analysis
- Clinical interpretation (Normal / Mildly Reduced / Severely Reduced)

---

### 6.4 OCR Lab Report Extraction

**Location:** `backend/controllers/labController.js`  
**Library:** `tesseract.js` (Node.js port)  
**Supporting:** `backend/eng.traineddata` (English OCR training data, 23MB)

**Pipeline:**
1. User photographs lab report with phone camera → `LabImageUploadScreen`
2. `POST /api/lab/upload` → Multer saves image → `labController.js`
3. Tesseract.js performs OCR on the image
4. NLP regex patterns extract: creatinine, eGFR, BUN, albumin, hemoglobin values
5. Extracted values shown for user confirmation in `LabResultScreen`
6. Saved to `LabTest` collection with `entryMethod: "ocr"`
7. Alternatively, manual entry via `ManualLabEntryScreen` (`entryMethod: "manual"`)

---

### 6.5 Meal Analysis & Portion Estimation

**Location:** `ai-engine/src/mealPlate/`  
**Model:** `best_model_yolo11m.pt` (YOLOv11 medium, 40MB)  
**Supporting:** `mobile_sam.pt` (MobileSAM), `plate_calibration.json`, `compartment_masks.npz`

**Components:**
| File | Role |
|---|---|
| `predictor.py` | YOLOv11 inference wrapper — detects food items and bounding boxes |
| `portion_estimator.py` | Maps detected food items to portion sizes using plate compartment masks |
| `auto_calibrate.py` | Auto-calibrates plate size from reference empty plate image |
| `calibration.py` | Pixel-to-volume/weight conversion |
| `api.py` | Internal FastAPI mount for meal detection |

**Pipeline:**
```
MealAnalysisScreen → Camera capture → POST /api/mealPlate/detect
  → foodRoutes.js → HTTP to AI engine /detect
  → YOLOv11 detects: [food_item, confidence, bbox]
  → MobileSAM segments each food item
  → Portion estimator computes: weight_g, calories, protein, K, P, Na, fluid
  → Full nutritional breakdown returned to mobile
  → User confirms → NutrientWallet deducted via WalletContext
```

**Plate Compartment System:**
- The system uses a standard hospital/patient meal plate with divided compartments
- `compartment_masks.npz` stores pre-computed compartment segmentation masks
- Each compartment is calibrated to a known volume, enabling accurate portion estimation

---

### 6.6 Multilingual RAG Chatbot

**Location:** `ai-engine/src/chatbot/`  
**Supports:** English (default) + Sinhala (native script + Singlish romanized)

#### Pipeline Architecture

```
User Input (Text/Voice)
        │
        ▼
┌───────────────────┐
│  Language Detection│  ← Unicode range check (U+0D80–U+0DFF) OR keyword scoring
│  "en" | "si"      │
└────────┬──────────┘
         │ [Sinhala Path]              [English Path]
         ▼                                   │
┌────────────────────┐                       │
│ Sinhala NLU (LaBSE)│                       │
│ Intent Detection   │                       │
│ Entity Extraction  │                       │
│ Confidence > 0.6?  │                       │
└────────┬───────────┘                       │
    Yes  │  No                               │
    ▼    ▼                                   │
┌────────┐  ┌──────────────┐               │
│Fast Path│  │Smart Path    │               │
│NLU +   │  │LLM Translate │               │
│MedDict │  │to English    │               │
└────┬───┘  └──────┬───────┘               │
     └─────────────▼───────────────────────┘
                   │
         ┌─────────▼─────────┐
         │ Context Rewriter   │  ← Resolves pronouns from chat history
         │ (LLM-based)        │
         └─────────┬─────────┘
                   │
         ┌─────────▼─────────┐
         │  ChromaDB Vector  │  ← Semantic search on medical PDF knowledge base
         │  Retrieval (RAG)  │
         └─────────┬─────────┘
                   │
         ┌─────────▼─────────┐
         │ Patient Data Layer │  ← Fetches patient record from MongoDB
         │ PatientDataManager │
         └─────────┬─────────┘
                   │
         ┌─────────▼─────────┐
         │   LLM Engine       │  ← Google Gemini API generates response
         │   (gemini-1.5-pro) │    in English
         └─────────┬─────────┘
                   │
         ┌─────────▼─────────┐
         │  Sinhala Style     │  ← Translates response to Sinhala if needed
         │  (LLM translate)   │
         └─────────┬─────────┘
                   │
         ┌─────────▼─────────────────┐
         │  Urgency Flag Scanner      │  ← Detects emergency keywords
         │  NLG Urgency Router        │    → CRITICAL_URGENCY triggers
         └─────────┬─────────────────┘     pre-cached emergency audio
                   │
         ┌─────────▼─────────┐
         │  TTS Engine        │
         │  Sinhala: Gemini   │  ← Round-robin API key pool
         │  English: Edge-TTS │  ← AriaNeural voice
         └───────────────────┘
```

#### ChromaDB Knowledge Base

- Medical PDFs on CKD, nutrition, symptoms, medications are parsed by `pdf_extractor.py`
- Chunked and embedded using OpenAI embeddings (`openai_embeddings.py`)
- Stored in `vectordb/chroma_db/`
- Hospital directory ingested via `ingest_hospitals.py`
- SHA-256 document hashing (`document_tracker.py`) prevents duplicate processing

#### Session Management

- `SESSIONS` dict: per-patient conversation history (sliding window, max 10 messages)
- Cache invalidation: session cleared on greeting words ("hi", "hello", etc.)
- RAG response cache keyed by `{patient_id}:{data_version}:{language}:{query_hash}`

#### TTS System

| Language | Engine | Voice |
|---|---|---|
| Sinhala | Gemini TTS (genai API) | `Kore` |
| Sinhala (fallback) | Edge-TTS | `si-LK-ThiliniNeural` |
| English | Edge-TTS | `en-US-AriaNeural` |

- **Parallel streaming TTS:** Text split into sentences → all generated concurrently → returned as length-framed binary blob
- **TTS cache:** MD5-keyed MP3/WAV files in `tts_cache/` — avoids regeneration
- **Pre-generated emergency phrases** cached at server startup for zero-latency critical responses

---

## 7. Google Health Connect Integration

**Library:** `react-native-health-connect` v3.5.0  
**Android requirement:** API 26+ (Android 8+)  
**Permissions:** Custom injected via `withHealthConnectPermissions.js` Expo plugin

**Data imported:** Blood Pressure readings (systolic + diastolic) from any paired smartwatch that syncs to Health Connect (Samsung Health, Fitbit, Garmin, WearOS, etc.)

**Flow:**

```
User taps "Import BP from Watch"
  → RiskPredictionScreen.js requests Health Connect permission
  → react-native-health-connect reads BloodPressureRecord[]
  → Mobile app sends batch to POST /api/health-sync/ingest
  → healthSyncController.js saves to HealthRecord collection (synced: false)
  → Background cron job processes → DailySummary (deduplicated)
  → BP values auto-populated in risk prediction form
```

**Custom Patch:**  
`scripts/patch-health-connect.js` (auto-run via `postinstall`) patches the `react-native-health-connect` native module to fix compatibility issues with the current Expo SDK version.

---

## 8. Background Health Data Sync Pipeline

**Service:** `backend/services/healthSyncService.js`  
**Scheduler:** `node-cron` (schedule defined in `config/syncConfig.js`)

This is a two-stage MongoDB aggregation pipeline that runs as a background cron job:

```
HealthRecord collection (raw, potentially duplicate reads)
  │
  ▼ Stage 1: Deduplication Aggregation
  ├── $match: { synced: false }         ← Only unprocessed records
  ├── $sort: { measuredAt: -1 }         ← Newest first
  └── $group: (userId + date)           ← One reading per person per day
        └── $first: systolic, diastolic, hba1c
                   (keeps the LATEST reading only)
  │
  ▼ Stage 2: Upsert to DailySummary
  ├── findOneAndUpdate({ userId, date }, $set, { upsert: true })
  ├── BP and HbA1c kept separate (no cross-contamination)
  └── Original HealthRecords marked { synced: true }
  │
  ▼ Stage 3: Monthly Average (on-demand via computeMonthlyBPAverages)
  └── $group by month → avgSystolic, avgDiastolic (rounded integers)
```

**Design decisions:**
- HbA1c is stored alongside BP but **never** mixed into BP averages (separate clinical metrics)
- One-reading-per-day reduces noise from continuous monitoring devices
- `synced` flag enables incremental processing (no re-processing old records)

---

## 9. API Reference Overview

### Backend (Port 5000)

#### Authentication
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Create new user |
| POST | `/api/auth/login` | Login → returns JWT |

#### Risk Prediction
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/predict` | Predict CKD risk (proxied to AI engine) |

#### Blood Pressure
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/bp-records/:userId` | Get all BP records |
| POST | `/api/bp-records` | Add manual BP record |

#### Health Connect Sync
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/health-sync/ingest` | Batch ingest BP readings from Health Connect |
| GET | `/api/health-sync/summary/:userId` | Get daily summaries |

#### Lab Tests
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/lab/upload` | Upload lab report image (OCR) |
| POST | `/api/lab/manual` | Manual lab value entry |
| GET | `/api/lab/:userId` | Get lab history |

#### Kidney Scan
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/upload-ultrasound` | Upload + analyze ultrasound image |
| GET | `/api/kidneyus/:name` | Get scan history by patient name |

#### Stage Progression
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/stage-progression/predict` | Predict current + future CKD stage |
| GET | `/api/stage-progression/history/:email` | Get prediction history |
| DELETE | `/api/stage-progression/:id` | Delete a prediction record |

#### Risk History
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/risk-history/:userId` | Get all risk records |
| POST | `/api/risk-history` | Save new risk record |
| PUT | `/api/risk-history/:id` | Update existing record |

#### Meal Plate
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/mealPlate/detect` | Detect food & estimate portions |

### AI Engine (Port 8001)

| Method | Endpoint | Description |
|---|---|---|
| POST | `/chat/text` | Text chatbot query |
| POST | `/chat/audio` | Voice chatbot query |
| POST | `/chat/tts` | Text-to-speech synthesis |
| POST | `/chat/tts/stream` | Parallel streaming TTS |
| POST | `/chat/clear` | Clear session + cache |

---

## 10. Navigation & Screen Map

| Screen | Route Name | Key Features |
|---|---|---|
| `LoginScreen` | `Login` | JWT auth, navigates to Home |
| `SignupScreen` | `Signup` | User registration |
| `HomeScreen` | `Home` | Feature hub, navigation to all modules |
| `RiskPredictionScreen` | `RiskPrediction` | Vital input form, Health Connect import, risk result + SHAP chart |
| `RiskHistoryScreen` | `RiskHistory` | Monthly risk history list + SHAP breakdown |
| `BPHistoryScreen` | `BPHistory` | BP trend visualization, daily/monthly charts |
| `FutureCKDStageScreen` | `FutureCKDStage` | Lab input, OCR/manual/ultrasound options, stage prediction |
| `FutureCKDStageResultScreen` | `FutureCKDStageResult` | Stage result, progression probability bars, 3-month & 6-month outlook |
| `FutureCKDStageHistoryScreen` | `FutureCKDStageHistory` | Historical stage predictions list |
| `MyProgressPathScreen` | `MyProgressPath` | Timeline visualization of stage progression history |
| `ScanLab` | `ScanLab` | Hub for scan & lab options |
| `ScanAnalysisScreen` | `ScanAnalysis` | Camera capture for ultrasound image |
| `ScanResultScreen` | `ScanResult` | Kidney dimensions + interpretation |
| `LabImageUploadScreen` | `LabImageUpload` | Camera/gallery pick for lab report |
| `LabAnalysisScreen` | `LabAnalysis` | OCR processing progress |
| `LabResultScreen` | `LabResult` | Extracted lab values confirmation |
| `ManualLabEntryScreen` | `ManualLabEntry` | Manual numeric input for lab values |
| `DietaryManagerScreen` | `DietaryManager` | Hub for dietary features |
| `MealAnalysisScreen` | `MealAnalysis` | Camera capture, YOLOv11 detection, nutritional breakdown |
| `DietaryPlanScreen` | `DietaryPlan` | CKD-safe dietary plan/recommendations |
| `NutrientWalletScreen` | `NutrientWallet` | Daily nutrient budget tracker |
| `ChatbotScreen` | `Chatbot` | Voice + text chat, TTS playback, urgency alerts |

---

## 11. Security & Authentication

- **Password hashing:** `bcryptjs` with salt rounds (passwords never stored plaintext)
- **Authentication:** JWT (JSON Web Tokens) via `jsonwebtoken`
  - Token issued on login, expected in `Authorization: Bearer <token>` header
  - Validated by auth middleware on protected routes
- **CORS:** Permissive (`*`) for local development (should be restricted in production)
- **File upload validation:** Multer validates MIME type and extension (image only, 10MB max)
- **Environment variables:** All secrets in `.env` files (not committed to git via `.gitignore`)

---

## 12. Communication & Data Flow

### Mobile ↔ Backend
- Protocol: **HTTP/REST** (via Axios)
- Format: **JSON** (request/response bodies)
- Auth: **JWT Bearer token** in headers

### Backend ↔ AI Engine
- Protocol: **HTTP** (via `axios` in Node.js or child process spawn)
- Format: **JSON** (structured requests/responses)
- Fallback: **Python subprocess** (stdout JSON parsing) for ultrasound analysis

### AI Engine ↔ External APIs
- **Google Gemini API:** LLM text generation + TTS audio generation
- **OpenAI Embeddings API:** ChromaDB vector embedding generation

### ADB Port Forwarding (Development)
```
adb reverse tcp:5000 tcp:5000   # Android → localhost:5000 (Backend)
adb reverse tcp:8001 tcp:8001   # Android → localhost:8001 (AI Engine)
adb reverse tcp:8081 tcp:8081   # Android → localhost:8081 (Metro bundler)
```

---

## 13. Project File Structure

```
Nephro-AI/
│
├── .env                           # Root-level environment vars
├── start-dev.ps1                  # PowerShell script to start all services
├── README.md                      # Setup guide
├── ARCHITECTURE.md                # This document
│
├── backend/                       # Node.js + Express REST API (PORT 5000)
│   ├── server.js                  # Entry point — middleware, routes, Mongoose connect
│   ├── package.json               # Dependencies (express, mongoose, multer, bcrypt, jwt...)
│   ├── .env / .env.example        # DB URL, JWT secret, port
│   ├── eng.traineddata            # Tesseract OCR model (23MB)
│   │
│   ├── config/
│   │   └── syncConfig.js          # Cron schedule + sync service config
│   │
│   ├── controllers/
│   │   ├── authController.js      # Register / Login
│   │   ├── bpController.js        # Manual BP CRUD
│   │   ├── healthSyncController.js # Health Connect ingest
│   │   ├── kidneyusController.js  # Kidney scan history
│   │   ├── labController.js       # OCR + manual lab entry
│   │   ├── predictController.js   # Risk prediction proxy
│   │   ├── riskHistoryController.js # Risk record management
│   │   └── stageProgressionController.js # Stage prediction + history
│   │
│   ├── models/
│   │   ├── User.js
│   │   ├── HealthRecord.js        # Raw Health Connect readings
│   │   ├── DailySummary.js        # Deduplicated daily readings
│   │   ├── BPRecord.js            # Manual BP entries
│   │   ├── RiskRecord.js          # Risk predictions + SHAP
│   │   ├── LabTest.js             # Lab results (OCR or manual)
│   │   ├── KidneyScan.js          # Ultrasound scan results
│   │   ├── NutrientWallet.js      # Daily dietary budget
│   │   └── StageProgressionRecord.js # CKD stage predictions
│   │
│   ├── routes/
│   │   ├── auth.js, bp.js, lab.js, kidneyus.js
│   │   ├── predict.js, riskHistory.js
│   │   ├── stageProgression.js, healthSync.js
│   │   └── foodRoutes.js          # Meal detection routes
│   │
│   ├── services/
│   │   └── healthSyncService.js   # Cron job + deduplication pipeline
│   │
│   ├── utils/
│   │   └── inferenceClient.js     # FastAPI caller for ultrasound
│   │
│   └── uploads/                   # Temporary uploaded images
│
├── ai-engine/                     # Python + FastAPI AI Server (PORT 8001)
│   ├── server.py                  # FastAPI entry point (chatbot + TTS endpoints)
│   ├── requirements.txt           # Python deps
│   ├── .env                       # Gemini API keys, OpenAI key
│   ├── mobile_sam.pt              # MobileSAM segmentation model (40MB)
│   │
│   ├── models/                    # Trained ML model files
│   │   ├── ckd_model.pkl          # Random Forest (early risk)
│   │   ├── scaler.pkl, scaler1.pkl, label_encoder.pkl
│   │   ├── ckd_model_lab.keras    # Keras CKD stage (lab only)
│   │   ├── ckd_model_lab+us.keras # Keras CKD stage (lab + ultrasound)
│   │   ├── best_model_lab_only.keras
│   │   ├── best_model_lab_fusion.keras
│   │   ├── ckd_timeaware_dual_output_model.h5  # Time-aware dual-output
│   │   ├── kidney_unet.h5         # U-Net kidney segmentation
│   │   └── unet_full_model.h5     # Full U-Net
│   │
│   ├── src/
│   │   ├── risk_prediction/
│   │   │   └── api_predict.py     # Random Forest inference + SHAP
│   │   │
│   │   ├── ckd_stage/
│   │   │   ├── stage_progression_predict.py  # Keras stage prediction
│   │   │   ├── ultrasound_scan.py            # Standalone Python scan script
│   │   │   └── inference_api.py              # FastAPI scan endpoint
│   │   │
│   │   ├── mealPlate/
│   │   │   ├── predictor.py       # YOLOv11 food detection
│   │   │   ├── portion_estimator.py # Volume + nutrition estimation
│   │   │   ├── auto_calibrate.py  # Plate size calibration
│   │   │   ├── calibration.py     # Pixel-to-real-world conversion
│   │   │   ├── api.py             # Meal detection endpoint
│   │   │   ├── best_model_yolo11m.pt (40MB)
│   │   │   ├── compartment_masks.npz
│   │   │   └── plate_calibration.json
│   │   │
│   │   ├── chatbot/
│   │   │   ├── rag_engine.py      # RAG orchestrator (NLU → DB → LLM → TTS)
│   │   │   ├── llm_engine.py      # Gemini LLM wrapper + Sinhala translation
│   │   │   ├── nlu_engine.py      # NLU processing pipeline
│   │   │   ├── sinhala_nlu.py     # LaBSE-based Sinhala intent detection
│   │   │   ├── nlg_glossary.py    # TTS phonetic pre-processor + urgency flags
│   │   │   ├── enhanced_query_vectordb.py  # ChromaDB query with NLU
│   │   │   ├── query_vectordb.py  # Base ChromaDB query
│   │   │   ├── patient_data.py    # MongoDB patient record fetcher
│   │   │   ├── patient_input.py   # Whisper STT handler
│   │   │   ├── tts_engine.py      # Standalone TTS utility
│   │   │   ├── build_vectordb.py  # One-time ChromaDB build script
│   │   │   ├── prepare_vectordb.py # PDF chunking + embedding pipeline
│   │   │   ├── pdf_extractor.py   # PDF text + table extraction
│   │   │   ├── document_tracker.py # SHA-256 hash-based dedup
│   │   │   ├── openai_embeddings.py # Embedding generation
│   │   │   ├── ingest_hospitals.py # Hospital directory ingest
│   │   │   └── config.py          # API keys, model settings, feature flags
│   │   │
│   │   └── utils/
│   │       └── logger.py          # ConsoleLogger with section/step formatting
│   │
│   ├── vectordb/
│   │   └── chroma_db/             # Persistent ChromaDB vector store
│   │
│   └── tts_cache/                 # Cached TTS audio files (MP3/WAV)
│
└── mobile-app/                    # React Native Expo App
    ├── App.js                     # Root: WalletProvider + NavigationContainer
    ├── app.json                   # Expo config (package name, plugins, permissions)
    ├── package.json               # Dependencies
    │
    ├── src/
    │   ├── api/                   # Axios base configuration
    │   ├── context/
    │   │   └── WalletContext.js   # Global nutrient budget state
    │   ├── components/
    │   │   ├── CustomButton.js
    │   │   ├── CustomInput.js
    │   │   └── PlateCamera.js     # Camera component for meal capture
    │   └── screens/               # All 22 app screens (see Navigation Map above)
    │
    ├── plugins/
    │   ├── withHealthConnectPermissions.js  # Android Health Connect permissions
    │   └── withAndroidCxxFix.js            # NDK 27 C++ STL fix
    │
    ├── scripts/
    │   └── patch-health-connect.js  # postinstall patch
    │
    └── android/                   # Generated native Android project (gitignored)
```

---

## 14. Port & Deployment Map

| Service | Port | Protocol | Started By |
|---|---|---|---|
| Metro Bundler (React Native) | 8081 | HTTP | `npx expo run:android` |
| Backend API (Node.js) | 5000 | HTTP | `node server.js` |
| AI Engine (FastAPI) | 8001 | HTTP | `python server.py` (uvicorn) |
| MongoDB Atlas | 27017 (cloud) | MongoDB Wire | Managed cloud service |

### ADB Reverse Tunnel (Required Every Session)
```powershell
adb reverse tcp:8081 tcp:8081   # Metro JS bundler
adb reverse tcp:5000 tcp:5000   # Express backend
adb reverse tcp:8001 tcp:8001   # FastAPI AI engine
```

### Developer Quick Start
```bash
# Terminal 1 — Backend
cd backend && node server.js

# Terminal 2 — AI Engine
cd ai-engine && python server.py

# Terminal 3 — Mobile App (with device connected)
cd mobile-app && npx expo run:android

# Terminal 4 — ADB tunnels
adb reverse tcp:8081 tcp:8081
adb reverse tcp:5000 tcp:5000
adb reverse tcp:8001 tcp:8001
```

---

*Generated: April 2026 · Academic Research Project · Nephro-AI*
