# 🛠️ Developer Setup Guide

## Quick Start (After Cloning/Pulling)

### Windows (PowerShell)
```powershell
cd ai-engine
.\setup_env.ps1
```

### Linux/macOS
```bash
cd ai-engine
chmod +x setup_env.sh
./setup_env.sh
```

---

## 📦 Dependency Management

### Why `requirements-lock.txt`?

| File | Purpose |
|------|---------|
| `requirements.txt` | Defines minimum compatible versions (for development) |
| `requirements-lock.txt` | **Exact versions** that are tested and working (for reproducibility) |

### 🔴 Problem Without Lock File
```
Developer A: torch==2.0.0 ✅ Works
Developer B: pip install → gets torch==2.5.0 ❌ Breaks due to API changes
```

### ✅ Solution With Lock File
```
Developer A: Creates requirements-lock.txt with exact versions
Developer B: pip install -r requirements-lock.txt → gets torch==2.0.0 ✅ Works
```

---

## 📋 Workflow for Developers

### When Pulling Latest Code
```bash
# 1. Activate your virtual environment
.\.venv\Scripts\Activate.ps1   # Windows
source .venv/bin/activate       # Linux/macOS

# 2. Install locked dependencies
pip install -r requirements-lock.txt
```

### When Adding a New Dependency
```bash
# 1. Install the package
pip install new-package

# 2. Add to requirements.txt (with minimum version)
# Example: new-package>=1.0.0

# 3. Regenerate lock file
pip freeze > requirements-lock.txt

# 4. Commit BOTH files
git add requirements.txt requirements-lock.txt
git commit -m "Add new-package dependency"
```

### When Updating Dependencies
```bash
# 1. Update specific package
pip install --upgrade package-name

# 2. Test everything works!
python server.py

# 3. If tests pass, regenerate lock file
pip freeze > requirements-lock.txt

# 4. Commit the updated lock file
git add requirements-lock.txt
git commit -m "Update package-name to vX.X.X"
```

---

## ⚠️ Troubleshooting

### "Module not found" after pulling
```bash
pip install -r requirements-lock.txt
```

### Conflicts between packages
```bash
# Nuclear option: recreate environment
rm -rf .venv                    # Linux/macOS
Remove-Item -Recurse .venv      # Windows

# Then run setup script again
./setup_env.sh                  # Linux/macOS
.\setup_env.ps1                 # Windows
```

### spaCy model missing
```bash
python -m spacy download en_core_web_sm
```

### Medical NER model missing
```bash
pip install https://s3-us-west-2.amazonaws.com/ai2-s2-scispacy/releases/v0.5.4/en_ner_bc5cdr_md-0.5.4.tar.gz
```

---

## 🐍 Python Version

**Required:** Python 3.10+

Check your version:
```bash
python --version
```

---

## 📁 Files to Commit

| File | Commit? | Notes |
|------|---------|-------|
| `requirements.txt` | ✅ Yes | Human-readable dependencies |
| `requirements-lock.txt` | ✅ Yes | **Critical for reproducibility** |
| `.venv/` | ❌ No | In .gitignore |
| `__pycache__/` | ❌ No | In .gitignore |
