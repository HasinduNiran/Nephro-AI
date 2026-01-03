# System Requirements

These are **system-level dependencies** that must be installed separately from Python packages.

## Required System Tools

### 1. Python
- **Version:** 3.10 or higher
- **Check:** `python --version`
- **Install:** https://www.python.org/downloads/

### 2. FFmpeg
- **Purpose:** Audio processing for speech-to-text
- **Check:** `ffmpeg -version`

#### Install FFmpeg

**Windows (Option 1 - Chocolatey):**
```powershell
choco install ffmpeg
```

**Windows (Option 2 - Winget):**
```powershell
winget install Gyan.FFmpeg
```

**Windows (Option 3 - Manual):**
1. Download from: https://www.gyan.dev/ffmpeg/builds/
2. Extract to `C:\ffmpeg`
3. Add `C:\ffmpeg\bin` to PATH

**macOS:**
```bash
brew install ffmpeg
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt update
sudo apt install ffmpeg
```

**Linux (Fedora):**
```bash
sudo dnf install ffmpeg
```

### 3. Git
- **Purpose:** Version control
- **Check:** `git --version`
- **Install:** https://git-scm.com/downloads

---

## Verification

After installation, verify all tools are accessible:

```powershell
# Check Python
python --version
# Expected: Python 3.10.x or higher

# Check FFmpeg
ffmpeg -version
# Expected: ffmpeg version x.x.x

# Check Git
git --version
# Expected: git version x.x.x
```

---

## Python Packages

Python dependencies are managed separately:
- **requirements.txt** - Human-readable package list
- **requirements-lock.txt** - Exact versions (353 packages)

Install with:
```powershell
pip install -r requirements-lock.txt
```
