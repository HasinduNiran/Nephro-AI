# 🔄 Incremental Vector Database Building

## ✅ What Changed?

Your `build_vectordb.py` script now supports **INCREMENTAL LOADING**!

### Before (Old Behavior):

```bash
python scripts/build_vectordb.py
# Always asked: "Delete and recreate? (y/n)"
# Re-processed ALL files even if already in database
```

### After (New Behavior):

```bash
python scripts/build_vectordb.py
# ✅ Automatically detects existing documents
# ✅ Only adds NEW documents
# ✅ Skips files already in database
# ⚡ Much faster for updates!
```

---

## 📚 How It Works

### Incremental Mode (Default):

1. Connects to existing database
2. Gets list of existing document IDs
3. Scans vectordb_ready files
4. **Skips** documents already in database
5. **Only adds** new documents
6. Fast and efficient! ⚡

### Example Output:

```
📂 Loading vectordb_ready documents...
   Found 46 vectordb_ready files
   🔄 Incremental mode: Skipping 607 existing documents

   ✅ Loading: 1_vectordb_ready.json
   ⏭️  Skipping: KDIGO-2024-CKD-Guideline_vectordb_ready.json (already in database)
   ⏭️  Skipping: nutrition_and_ckd_vectordb_ready.json (already in database)
   ...

✅ Loaded 15 NEW documents from 1 file
   ⏭️  Skipped 607 existing documents
```

---

## 🎯 Usage

### Option 1: Incremental Mode (Recommended - Default)

Only adds new documents:

```bash
python scripts/build_vectordb.py
```

### Option 2: Force Rebuild

Deletes everything and rebuilds from scratch:

```bash
python scripts/build_vectordb.py --rebuild
```

### Show Help:

```bash
python scripts/build_vectordb.py --help
```

---

## 📋 Common Scenarios

### Scenario 1: Adding New PDFs

```bash
# 1. Process new PDF
python scripts/pdf_extractor.py

# 2. Prepare for vector DB
python scripts/prepare_vectordb.py

# 3. Add to database (incremental)
python scripts/build_vectordb.py
# ✅ Only processes the new PDF!
```

### Scenario 2: Database Already Exists

```bash
python scripts/build_vectordb.py

# Output:
✅ Collection 'nephro_ai_medical_kb' already exists
   🔄 Incremental mode: Will add new documents only
   Found 607 existing documents in database

✅ NO NEW DOCUMENTS TO ADD
   All documents are already in the database!
   Total documents: 607
```

### Scenario 3: Force Complete Rebuild

```bash
python scripts/build_vectordb.py --rebuild

# Output:
⚠️  Collection 'nephro_ai_medical_kb' already exists
   🗑️  Deleting existing collection

📂 Loading vectordb_ready documents...
   Found 45 vectordb_ready files
   ✅ Loading: 11-10-0209_2203_patbro_diabckd1-4p5_vectordb_ready.json
   ✅ Loading: 11-10-0513_2401_patbro_traveltip_t1_vectordb_ready.json
   ...
```

---

## ✅ Benefits

1. **⚡ Faster**: Only processes new documents
2. **💾 Safe**: Doesn't delete existing data (by default)
3. **🔄 Automatic**: Detects what's new automatically
4. **📊 Transparent**: Shows exactly what's being added/skipped
5. **🎯 Efficient**: No redundant processing

---

## 🧪 Test It Now!

Try running it to see the incremental behavior:

```bash
# Activate virtual environment first
.\.venv\Scripts\Activate.ps1

# Run incremental build
python scripts/build_vectordb.py
```

You should see:

```
✅ NO NEW DOCUMENTS TO ADD
   All documents are already in the database!
   Total documents: 607
```

---

## 🎓 Technical Details

### How It Detects Duplicates:

- Uses unique document IDs (e.g., `KDIGO-2024-CKD-Guideline_chunk_0`)
- IDs are based on source filename + chunk number
- ChromaDB prevents duplicate IDs automatically
- Script checks existing IDs before loading files

### File-Level Detection:

- If a file's documents are ALL in database → Skip entire file
- If a file has ANY new documents → Load only new ones
- Handles mixed scenarios (some files new, some existing)

---

## 💡 Pro Tips

1. **Always use incremental mode** for daily work
2. **Use `--rebuild`** only when:
   - You changed the embedding model
   - You want to re-process everything
   - Database is corrupted
3. **Monitor output** to see what's being processed

4. **Check final count**:
   ```bash
   python scripts/query_vectordb.py --stats
   ```

---

## 🚨 Important Notes

⚠️ **Incremental mode is now DEFAULT**

- You don't need to do anything special
- Just run the script normally

⚠️ **Document IDs must be unique**

- IDs are auto-generated from filename + chunk number
- Don't manually edit vectordb_ready files

⚠️ **Rebuild when needed**

- If you changed source documents and re-processed them
- Use `--rebuild` to start fresh

---

Enjoy faster, smarter database updates! 🚀
