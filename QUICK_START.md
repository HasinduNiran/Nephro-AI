# 🚀 QUICK START GUIDE

## Get Started in 3 Steps!

### Step 1: Open Terminal in VS Code

Press `` Ctrl + ` `` or go to **Terminal → New Terminal**

### Step 2: Activate Virtual Environment

```powershell
.venv\Scripts\activate
```

### Step 3: Try Your First Query!

```powershell
python scripts/query_vectordb.py "What is chronic kidney disease?"
```

---

## 🎯 Common Tasks

### Query the Database

```powershell
# Simple question
python scripts/query_vectordb.py "What are CKD stages?"

# Interactive mode (type multiple questions)
python scripts/query_vectordb.py

# Run sample queries
python scripts/query_vectordb.py --sample

# View statistics
python scripts/query_vectordb.py --stats
```

### Test RAG System

```powershell
python scripts/rag_example.py
```

---

## 💬 Interactive Mode Commands

When you run `python scripts/query_vectordb.py`, you can use these:

```
What is chronic kidney disease?              # Normal question
filter:recommendation diabetes treatment     # Filter by type
top10 kidney failure symptoms                # Get 10 results
stats                                        # Show statistics
help                                         # Show help
quit                                         # Exit
```

---

## 📊 What You Have

✅ **197 medical documents** about kidney care  
✅ **Semantic search** - understands meaning, not just keywords  
✅ **Fast queries** - results in under 100ms  
✅ **Smart filtering** - by content type and medical topics

---

## 🎓 Sample Questions to Try

```
What is chronic kidney disease?
What are the stages of CKD?
How is GFR measured?
What dietary changes are recommended for CKD patients?
When should dialysis be considered?
What are the risk factors for kidney disease?
How does diabetes affect the kidneys?
What are treatment options for stage 3 CKD?
```

---

## 📚 Need More Help?

- **README.md** - Complete guide
- **VECTORDB_BUILD_COMPLETE.md** - Technical details
- **FINAL_SUCCESS_SUMMARY.md** - Visual summary

---

## 🎉 You're All Set!

Your vector database is ready. Start asking questions! 🚀
