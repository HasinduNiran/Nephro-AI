# 📋 NEPHRO-AI QUICK REFERENCE GUIDE

## 🎯 What Is This Project?

**Nephro-AI** = AI-powered medical knowledge system for kidney disease care

**Input:** Medical PDF documents about kidney disease  
**Output:** Searchable AI database that answers questions instantly  
**Purpose:** Power medical chatbots, clinical decision support, patient education

---

## 🏗️ System Architecture (One Picture)

```
┌─────────────┐
│ PDF Files   │ (Medical guidelines)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Extract &   │ (Read PDFs, clean text, chunk into pieces)
│ Chunk       │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Filter      │ (Keep only high-quality chunks)
│ Quality     │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Generate    │ (Convert text → 1536 numbers via OpenAI API)
│ Embeddings  │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ ChromaDB    │ (Store in vector database)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Query &     │ (Ask questions, get answers)
│ RAG         │
└─────────────┘
```

---

## 📊 Key Statistics

| Metric                  | Value                                 |
| ----------------------- | ------------------------------------- |
| **Documents Processed** | 197 chunks                            |
| **Source**              | KDIGO 2024 CKD Guidelines (199 pages) |
| **Embedding Model**     | OpenAI text-embedding-3-small         |
| **Embedding Dimension** | 1536                                  |
| **Database**            | ChromaDB                              |
| **Query Speed**         | < 100ms                               |
| **Content Coverage**    | 91.9% CKD, 73.6% GFR related          |

---

## 🔑 Key Concepts in 30 Seconds

### Embeddings

**Text → Numbers that capture meaning**

- "kidney disease" = [0.12, 0.34, ..., 0.67] (1536 numbers)
- Similar concepts = Similar numbers
- Enables semantic search (finds related concepts, not just exact words)

### Vector Database (ChromaDB)

**Database for storing and searching embeddings**

- Fast similarity search (< 100ms)
- Finds semantically similar documents
- Supports metadata filtering

### RAG (Retrieval-Augmented Generation)

**Make AI chatbots accurate using your data**

1. **Retrieve** relevant docs from vector DB
2. **Augment** LLM prompt with retrieved context
3. **Generate** accurate, evidence-based answer

---

## 📁 Project Structure

```
Nephro-AI/
├── config.py                  ← Settings & configuration
├── requirements.txt           ← Python dependencies
│
├── data/
│   ├── raw/                   ← Original PDFs
│   ├── processed/             ← Extracted chunks
│   └── vectordb_ready/        ← Filtered, ready chunks
│
├── scripts/
│   ├── pdf_extractor.py       ← Step 1: Extract PDFs
│   ├── prepare_vectordb.py    ← Step 2: Filter quality
│   ├── openai_embeddings.py   ← NEW: OpenAI API wrapper
│   ├── build_vectordb.py      ← Step 3: Build database
│   ├── query_vectordb.py      ← Step 4: Query interface
│   └── rag_example.py         ← RAG demo
│
└── vectordb/
    └── chroma_db/             ← Vector database storage
```

---

## ⚡ Quick Commands

### Setup (One-Time)

```powershell
# Activate environment
.venv\Scripts\Activate.ps1

# Install dependencies
pip install requests

# Test OpenAI embeddings
python scripts\openai_embeddings.py
```

### Rebuild Database (Required After OpenAI Migration)

```powershell
python scripts\build_vectordb.py --rebuild
```

### Query Database

```powershell
# Simple query
python scripts\query_vectordb.py "What is CKD?"

# Interactive mode
python scripts\query_vectordb.py
```

### Sample Queries

```
What is chronic kidney disease?
What are CKD treatment options?
What dietary changes help CKD patients?
When should dialysis be considered?
filter:recommendation diabetes
top10 kidney failure symptoms
stats
```

---

## 🔄 What Changed: OpenAI Migration

### Before (Local Model)

- Model: `all-MiniLM-L6-v2`
- Dimension: 384
- Processing: Local (GPU/CPU)
- Quality: Good

### After (OpenAI API)

- Model: `openai/text-embedding-3-small`
- Dimension: 1536 (4× more nuanced!)
- Processing: Cloud API (OpenRouter)
- Quality: Excellent (state-of-the-art)

### Why Upgrade?

✅ Better medical understanding  
✅ Higher accuracy  
✅ Latest technology  
✅ No local GPU needed

### Cost

~$0.003 per database rebuild (~1 cent for 197 documents)

---

## 🧪 Test It Now!

### 1. Test Embeddings

```powershell
python scripts\openai_embeddings.py
```

**Expected:** ✅ Generated 3 embeddings, dimension 1536

### 2. Rebuild Database

```powershell
python scripts\build_vectordb.py --rebuild
```

**Expected:** ✅ 197 documents added, ~2-5 minutes

### 3. Query

```powershell
python scripts\query_vectordb.py "What is chronic kidney disease?"
```

**Expected:** ✅ 5 relevant results with similarity scores

---

## 🎓 Understanding the Flow

### Example: User asks "What is CKD?"

```
1. User Query
   "What is chronic kidney disease?"

2. Convert to Embedding (OpenAI API)
   [0.007, 0.005, ..., 0.014] ← 1536 numbers

3. Search Vector DB
   Find 5 most similar document embeddings

4. Return Results
   ┌─────────────────────────────────────┐
   │ Result 1 (Similarity: 0.92)         │
   │ "CKD is defined as abnormalities    │
   │ of kidney structure or function..." │
   └─────────────────────────────────────┘

5. For RAG: Use results as context for LLM
   GPT-4 + Context → Accurate answer
```

---

## 🚀 Real-World Applications

### 1. Medical Chatbot

```
User: "I have stage 3 CKD. What should I eat?"
→ Query DB → Get dietary guidelines
→ Send to GPT-4 with context
→ Personalized, accurate answer
```

### 2. Clinical Decision Support

```
Doctor: "Treatment options for diabetic CKD patient?"
→ Query with filters (diabetes=true, content_type=recommendation)
→ Show ranked treatment guidelines
```

### 3. Patient Education

```
Patient: "Explain kidney function to me simply"
→ Query for definitions
→ Simplify medical jargon
→ Present patient-friendly explanation
```

### 4. Research Assistant

```
Researcher: "Evidence for low-protein diet in CKD"
→ Query for evidence and studies
→ Cluster by topic
→ Generate literature summary
```

---

## 🔧 Customization

### Add New Documents

```powershell
# 1. Add PDFs to data/raw/
# 2. Extract
python scripts\pdf_extractor.py

# 3. Prepare
python scripts\prepare_vectordb.py

# 4. Incremental build (only new docs)
python scripts\build_vectordb.py
```

### Custom Filters

```python
# Query only recommendations about diabetes
results = collection.query(
    query_texts=["diabetes management"],
    where={
        "content_type": "recommendation",
        "has_diabetes": True
    }
)
```

### Build RAG App

```python
# 1. Retrieve context
context = retrieve_from_vectordb(question)

# 2. Build prompt
prompt = f"Context: {context}\n\nQuestion: {question}"

# 3. Generate with LLM
answer = openai.ChatCompletion.create(
    model="gpt-4",
    messages=[{"role": "user", "content": prompt}]
)
```

---

## 🐛 Troubleshooting

| Issue                    | Solution                                             |
| ------------------------ | ---------------------------------------------------- |
| "Collection not found"   | Run `python scripts\build_vectordb.py --rebuild`     |
| "API request failed 401" | Check API key in `config.py`                         |
| Dimension mismatch       | Must rebuild with `--rebuild` after OpenAI migration |
| Slow queries             | Normal on first run, subsequent queries are cached   |

---

## 📚 Documentation Files

| File                           | Purpose                              |
| ------------------------------ | ------------------------------------ |
| `README.md`                    | Project overview                     |
| `COMPLETE_PROJECT_TUTORIAL.md` | **Deep dive tutorial (START HERE!)** |
| `OPENAI_MIGRATION_GUIDE.md`    | OpenAI embedding migration details   |
| `pipeline_readme.md`           | Data pipeline explanation            |
| `quick_start.md`               | Quick start commands                 |

---

## 🎯 Success Checklist

- [ ] Virtual environment activated
- [ ] Dependencies installed (`pip install requests`)
- [ ] OpenAI embeddings tested (`python scripts\openai_embeddings.py`)
- [ ] Database rebuilt (`python scripts\build_vectordb.py --rebuild`)
- [ ] Queries working (`python scripts\query_vectordb.py "test"`)
- [ ] Understand core concepts (embeddings, vector DB, RAG)
- [ ] Ready to build applications!

---

## 💡 Key Insights

### Why Vector Databases?

Regular databases find **exact matches**  
Vector databases find **similar meanings**

### Why OpenAI Embeddings?

Local models: Good quality, free  
OpenAI: Excellent quality, cheap (~$0.003 per rebuild)

### Why RAG?

LLMs alone: Smart but can hallucinate  
RAG: Smart + Accurate (grounded in your data)

### Why This Matters?

**Healthcare needs accuracy.**  
RAG ensures AI answers are evidence-based.

---

## 🚀 Next Steps

### Learn More

1. Read `COMPLETE_PROJECT_TUTORIAL.md` (comprehensive guide)
2. Run all scripts and understand outputs
3. Experiment with custom queries
4. Modify code and see what happens

### Build Something

1. Create a simple chatbot with RAG
2. Build a web interface (Streamlit)
3. Deploy as API (FastAPI)
4. Integrate with GPT-4 or Claude

### Go Further

1. Add more medical documents
2. Multi-domain collections (diabetes, cardiology)
3. User authentication
4. Cost tracking and optimization
5. Production deployment

---

## 📞 Quick Reference Card

```
┌─────────────────────────────────────────────┐
│ NEPHRO-AI COMMAND REFERENCE                 │
├─────────────────────────────────────────────┤
│ Activate:    .venv\Scripts\Activate.ps1     │
│ Test API:    python scripts\openai_embeddings.py │
│ Rebuild DB:  python scripts\build_vectordb.py --rebuild │
│ Query:       python scripts\query_vectordb.py │
│ RAG Demo:    python scripts\rag_example.py  │
│ Stats:       python scripts\query_vectordb.py (then type 'stats') │
├─────────────────────────────────────────────┤
│ API Key: config.py → OPENROUTER_API_KEY     │
│ Database: vectordb/chroma_db/               │
│ Documents: 197 chunks                       │
│ Dimension: 1536                             │
│ Model: openai/text-embedding-3-small        │
└─────────────────────────────────────────────┘
```

---

**You're ready to build intelligent medical AI applications!** 🎉

For detailed learning: Read `COMPLETE_PROJECT_TUTORIAL.md`  
For migration details: Read `OPENAI_MIGRATION_GUIDE.md`  
For quick start: Run `python scripts\query_vectordb.py`
