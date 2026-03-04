# Nephro-AI

An AI-powered mobile application for early CKD (Chronic Kidney Disease) risk prediction, featuring blood pressure import from smartwatches via Google Health Connect, meal planning, chatbot assistance, and kidney scan analysis.

---

## Tech Stack

| Layer       | Technology                           |
| ----------- | ------------------------------------ |
| Mobile App  | React Native 0.81.5, Expo SDK 54     |
| Backend API | Node.js, Express, MongoDB (Mongoose) |
| AI Engine   | Python (Flask), TensorFlow/Keras     |
| Health Data | Google Health Connect (Android)      |

---

## Prerequisites

Make sure the following are installed before you begin:

- [Node.js](https://nodejs.org/) v18+
- [Android Studio](https://developer.android.com/studio) with Android SDK (API 35, NDK 27.1.12297006)
- [Python 3.12+](https://www.python.org/)
- [Git](https://git-scm.com/)
- A physical Android device (API 26+ / Android 8+) with **USB Debugging** enabled  
  _(Health Connect requires a real device — it does not work on emulators)_

---

## 1. Clone the Repository

```bash
git clone https://github.com/HasinduNiran/Nephro-AI.git
cd Nephro-AI
```

---

## 2. Backend Setup

```bash
cd backend
npm install
```

Create your `.env` file from the example:

```bash
cp .env.example .env
```

Edit `backend/.env` and fill in your values:

```env
DATABASE_URL="mongodb+srv://<username>:<password>@<cluster>.mongodb.net/Nephro-AI?retryWrites=true&w=majority"
PORT=5000
JWT_SECRET="your_super_secret_jwt_key_here"
```

Start the backend:

```bash
node server.js
# or for auto-reload during development:
npx nodemon server.js
```

Backend will run on **http://localhost:5000**

---

## 3. AI Engine Setup (Optional — for risk prediction)

```bash
cd ai-engine
python -m venv .venv
# Windows:
.venv\Scripts\activate
# Mac/Linux:
source .venv/bin/activate

pip install -r requirements.txt
python server.py
```

AI engine will run on **http://localhost:8001**

---

## 4. Mobile App Setup

```bash
cd mobile-app
npm install
# ↑ This automatically patches react-native-health-connect (postinstall script runs)
```

### 4a. Configure Android SDK path

Create `mobile-app/android/local.properties` with your SDK path:

**Windows:**

```
sdk.dir=C\:\\Users\\YOUR_USERNAME\\AppData\\Local\\Android\\Sdk
```

**Mac/Linux:**

```
sdk.dir=/Users/YOUR_USERNAME/Library/Android/sdk
```

> Replace `YOUR_USERNAME` with your actual system username. Note the escaped backslashes on Windows.

### 4b. Generate native Android project

```bash
npx expo prebuild
```

This generates the `android/` folder using the custom config plugins included in this repo (Health Connect permissions, C++ STL fix).

### 4c. Build and install on device

Connect your Android device via USB, then:

```bash
npx expo run:android
```

This will:

1. Build the APK (~3-4 minutes first time, ~30 seconds after)
2. Install it on your connected device
3. Start the Metro bundler

---

## 5. Set ADB Reverse Ports

Every time you start the app (or reconnect USB), run these commands so the device can reach your computer's servers:

```bash
adb reverse tcp:8081 tcp:8081   # Metro bundler
adb reverse tcp:5000 tcp:5000   # Backend API
adb reverse tcp:8001 tcp:8001   # AI Engine / Chatbot
```

**Windows full path (if adb is not in PATH):**

```powershell
$adb = "C:\Users\YOUR_USERNAME\AppData\Local\Android\Sdk\platform-tools\adb.exe"
& $adb reverse tcp:8081 tcp:8081
& $adb reverse tcp:5000 tcp:5000
& $adb reverse tcp:8001 tcp:8001
```

---

## 6. Health Connect (BP from Smartwatch)

To use the **"Import BP from Watch"** feature:

1. Install [Health Connect](https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata) on your Android device
2. Sync your smartwatch with its companion app (Samsung Health, Fitbit, Garmin, etc.)
3. Make sure the companion app is connected to Health Connect as a data source
4. Open the app → **Early Risk Prediction** → tap **"Import BP from Watch (Health Connect)"**
5. Grant blood pressure read permission when prompted

> **Requires Android 8+ (API 26+)**. On Android 14+ (API 34+), Health Connect is built into the system.

---

## 7. Project Structure

```
Nephro-AI/
├── backend/               # Node.js + Express REST API
│   ├── controllers/       # Route handlers
│   ├── models/            # Mongoose schemas
│   ├── routes/            # API routes
│   ├── server.js          # Entry point
│   └── .env.example       # Environment variable template
│
├── ai-engine/             # Python AI/ML server
│   ├── src/               # AI modules (risk, chatbot, meal, CKD stage)
│   ├── models/            # Trained Keras/.h5 models
│   ├── server.py          # Flask entry point
│   └── requirements.txt
│
├── mobile-app/            # React Native (Expo) app
│   ├── src/
│   │   ├── screens/       # App screens
│   │   ├── components/    # Reusable UI components
│   │   ├── api/           # Axios config
│   │   └── context/       # React Context providers
│   ├── plugins/           # Custom Expo config plugins
│   │   ├── withHealthConnectPermissions.js
│   │   └── withAndroidCxxFix.js
│   ├── scripts/
│   │   └── patch-health-connect.js  # Auto-applied after npm install
│   └── app.json           # Expo config
│
└── README.md
```

---

## 8. Common Issues

### "Network Error" on login

ADB reverse ports are not set. Run the commands in **Step 5** above.

### "Unable to load script" / blank screen

Metro bundler can't reach the device. Run:

```bash
adb reverse tcp:8081 tcp:8081
```

### Build fails with C++ STL linking errors (NDK 27)

This is handled automatically by `plugins/withAndroidCxxFix.js`. If it happens, clean and rebuild:

```bash
cd mobile-app
npx expo prebuild --clean
npx expo run:android
```

### Health Connect "Permission Denied" immediately

- Make sure Health Connect app is installed from the Play Store
- On Android 14+, it is built-in — open Settings → Health Connect and check permissions

### `local.properties` not found error

You need to create `mobile-app/android/local.properties` manually — see **Step 4a** above.

### App shows old code after changes

Shake device → **Reload**, or press `r` in the Metro terminal.

---

## 8. Developer Quick Start (after initial setup)

Once everything is set up once, starting the full stack is just:

```bash
# Terminal 1 — Backend
cd backend && node server.js

# Terminal 2 — AI Engine
cd ai-engine && python server.py

# Terminal 3 — Mobile App
cd mobile-app && npx expo run:android

# Terminal 4 — ADB ports (run after app starts)
adb reverse tcp:8081 tcp:8081
adb reverse tcp:5000 tcp:5000
adb reverse tcp:8001 tcp:8001
```

---

## License

This project is for academic/research purposes.
