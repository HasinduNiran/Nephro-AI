# 🏥 Nephro-AI - AI-Powered Kidney Care Knowledge System

## ✅ Project Status: FULLY OPERATIONAL

An intelligent medical knowledge system for chronic kidney disease (CKD) care, featuring semantic search, RAG capabilities, and a comprehensive medical knowledge base with **537 documents** from multiple authoritative sources.

---

## 🎯 Overview

**Nephro-AI** is a Final Year Research Project (Y4S1) that leverages vector databases and AI to provide accurate, evidence-based kidney care information. The system combines medical guidelines, research papers, and patient education materials into a searchable knowledge base.

### Key Features

- ✅ **Semantic Search**: Find relevant medical information using natural language queries
- ✅ **537 Medical Documents**: Comprehensive knowledge from authoritative sources including KDIGO 2024 guidelines
- ✅ **RAG-Ready**: Prepared for integration with LLMs (GPT-4, Claude, etc.)
- ✅ **Incremental Updates**: Smart database building that avoids reprocessing
- ✅ **Rich Metadata**: Content classification and medical entity tagging
- ✅ **Fast Queries**: Sub-second semantic search response time
- ✅ **Medical NLU**: Natural Language Understanding for intent detection and entity extraction

---

## 📊 Current Statistics

| Metric              | Value                                                        |
| ------------------- | ------------------------------------------------------------ |
| **Total Documents** | 537 chunks                                                   |
| **Source Files**    | 45 medical documents                                         |
| **Embedding Model** | OpenAI text-embedding-3-small (1536D)                        |
| **Database Type**   | ChromaDB (persistent)                                        |
| **Query Speed**     | < 1 second                                                   |
| **Content Types**   | 7 types (recommendation, evidence, dietary, treatment, etc.) |

---

## 🚀 Quick Start

### 1. Setup Environment

```powershell
# Activate virtual environment
.\.venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt
```

### 2. Query the Database

**Interactive Mode:**

```powershell
python scripts/query_vectordb.py
```

Then type your questions:

```
🔍 Query: What are the stages of CKD?
🔍 Query: What dietary changes are recommended?
🔍 Query: When should dialysis be considered?
```

**Direct Query:**

```powershell
python scripts/query_vectordb.py --query "What is chronic kidney disease?"
```

### 3. View Statistics

```powershell
python scripts/query_vectordb.py --stats
```

---

## 📁 Project Structure

```
Nephro-AI/
├── 📄 README.md                          ← This file
├── 📄 config.py                          ← Central configuration
├── 📄 requirements.txt                   ← Python dependencies
├── 📄 nlu_engine.py                      ← NLU system (NEW!)
│
├── 📂 data/
│   ├── 📂 raw/                           ← Original knowledge sources
│   │   └── medical_knowledge/
│   │       ├── diseases/
│   │       ├── treatments/
│   │       ├── diagnostics/
│   │       ├── medications/
│   │       ├── nutrition/
│   │       └── prevention/
│   │
│   ├── 📂 processed/                     ← Processed chunks
│   │   ├── *_chunks.json
│   │   ├── *_metadata.json
│   │   └── all_chunks_readable.txt
│   │
│   └── 📂 vectordb_ready/                ← Vectorization-ready docs
│       └── documents/
│           └── *_vectordb_ready.json     ← 45 files (537 chunks)
│
├── 📂 scripts/                           ← Automation scripts
│   ├── pdf_extractor.py                  ← Extract PDF → chunks
│   ├── prepare_vectordb.py               ← Quality filtering
│   ├── build_vectordb.py                 ← Build vector DB ✅
│   ├── query_vectordb.py                 ← Query interface ✅
│   ├── openai_embeddings.py              ← Embedding generation ✅
│   ├── analyze_chunks.py                 ← Statistical analysis
│   └── nlu_engine.py                     ← NLU system (NEW!)
│
└── 📂 vectordb/                          ← Vector database
    └── 📂 chroma_db/                     ← ChromaDB storage ✅
        ├── chroma.sqlite3                ← Database file
        └── [embedding data]              ← 537 documents indexed
```

---

## 💻 Available Scripts

| Script                  | Purpose                          | Command                                       |
| ----------------------- | -------------------------------- | --------------------------------------------- |
| **query_vectordb.py**   | Query the database               | `python scripts/query_vectordb.py "question"` |
| **build_vectordb.py**   | Build/rebuild database           | `python scripts/build_vectordb.py`            |
| **pdf_extractor.py**    | Process new PDFs                 | `python scripts/pdf_extractor.py`             |
| **prepare_vectordb.py** | Prepare chunks for vectorization | `python scripts/prepare_vectordb.py`          |
| **analyze_chunks.py**   | Analyze processed data           | `python scripts/analyze_chunks.py`            |

---

## 🔍 Query Examples

### Basic Queries

```
What is chronic kidney disease?
What are the stages of CKD?
How is GFR measured?
What are treatment options for stage 3 CKD?
When should dialysis be considered?
```

### Advanced Queries

```
filter:recommendation diabetes management
filter:evidence GFR measurement accuracy
filter:dietary sodium restriction
```

### Metadata Filters

Available content types:

- `recommendation` - Clinical recommendations
- `evidence` - Research evidence
- `definition` - Medical definitions
- `dietary` - Nutritional guidance
- `treatment` - Treatment options
- `reference` - Citations and references
- `general` - General information

---

## 🤖 RAG Integration

### Python SDK Example

```python
import chromadb
from config import CHROMA_DB_PATH, COLLECTION_NAME

# Connect to database
client = chromadb.PersistentClient(path=CHROMA_DB_PATH)
collection = client.get_collection(COLLECTION_NAME)

# Query
results = collection.query(
    query_texts=["What is CKD?"],
    n_results=5
)

# Process results
for doc, metadata in zip(results['documents'][0], results['metadatas'][0]):
    print(f"Content: {doc}")
    print(f"Type: {metadata['content_type']}")
```

### With OpenAI GPT

```python
import openai
import chromadb
from config import CHROMA_DB_PATH, COLLECTION_NAME

# Retrieve context
client = chromadb.PersistentClient(path=CHROMA_DB_PATH)
collection = client.get_collection(COLLECTION_NAME)
results = collection.query(query_texts=[question], n_results=5)

# Build context
context = "\n".join(results['documents'][0])

# Generate answer
response = openai.ChatCompletion.create(
    model="gpt-4",
    messages=[
        {"role": "system", "content": "You are a medical AI assistant specializing in kidney care."},
        {"role": "user", "content": f"Context: {context}\n\nQuestion: {question}"}
    ]
)

answer = response.choices[0].message.content
```

---

## 🔧 Technical Specifications

- **Database**: ChromaDB (persistent storage)
- **Embedding Model**: OpenAI text-embedding-3-small (1536D via OpenRouter)
- **Similarity Metric**: Cosine similarity
- **Query Latency**: < 1 second
- **Python Version**: 3.12.6
- **Environment**: Virtual environment (.venv)
- **NLU Engine**: spaCy en_core_web_sm

---

## 🎯 Use Cases

### 1. Medical Chatbot

Build a conversational AI that answers kidney care questions using RAG

### 2. Clinical Decision Support

Help doctors find relevant guidelines and recommendations

### 3. Patient Education

Generate patient-friendly explanations of medical conditions

### 4. Research Tool

Search and retrieve evidence-based medical information

### 5. Knowledge Base

Power a searchable medical knowledge repository

---

## 📚 Documentation

- **[PIPELINE_README.md](PIPELINE_README.md)** - Full pipeline guide
- **[INCREMENTAL_BUILD_GUIDE.md](INCREMENTAL_BUILD_GUIDE.md)** - Build system guide
- **[DUPLICATE_HANDLING_EXPLAINED.md](DUPLICATE_HANDLING_EXPLAINED.md)** - Technical details
- **[config.py](config.py)** - Configuration settings

---

## 🔮 Next Steps

### Immediate (Ready to Implement)

- [ ] Build NLU-powered query system
- [ ] Integrate with LLM API (GPT-4/Claude)
- [ ] Build web interface (Streamlit/Gradio)
- [ ] Add conversation history

### Future Enhancements

- [ ] REST API for web/mobile apps
- [ ] User authentication system
- [ ] Multi-language support
- [ ] Advanced analytics dashboard
- [ ] Add more medical guidelines

---

## 🐛 Troubleshooting

### Issue: "Collection not found"

**Solution:** Run `build_vectordb.py` to create the database

```powershell
python scripts/build_vectordb.py
```

### Issue: Import errors

**Solution:** Activate virtual environment and install packages:

```powershell
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### Issue: OpenAI embedding errors

**Solution:** Check your OpenRouter API key in `config.py`

---

## 📞 Commands Cheat Sheet

```powershell
# Activate virtual environment
.\.venv\Scripts\Activate.ps1

# Query database (interactive)
python scripts/query_vectordb.py

# Query database (direct)
python scripts/query_vectordb.py --query "your question"

# View statistics
python scripts/query_vectordb.py --stats

# Rebuild database (if needed)
python scripts/build_vectordb.py

# Process new PDFs
python scripts/pdf_extractor.py

# Analyze chunks
python scripts/analyze_chunks.py
```

---

## 🎉 Success Metrics

| Metric          | Status        |
| --------------- | ------------- |
| PDF Extraction  | ✅ Complete   |
| Data Processing | ✅ 537 chunks |
| Vector Database | ✅ Built      |
| Query System    | ✅ Working    |
| NLU Engine      | ✅ Ready      |
| Documentation   | ✅ Complete   |

---

## 🌟 Project Credits

**Project**: Nephro-AI - AI-Powered Kidney Care System  
**Level**: Final Year Research Project (Y4S1)  
**Repository**: HasinduNiran/Nephro-AI  
**Branch**: Lasal-VDB  
**Status**: 🟢 OPERATIONAL

### Technologies

- ChromaDB - Vector database
- OpenAI Embeddings - Semantic vectors (via OpenRouter)
- spaCy - Natural Language Understanding
- Python 3.12 - Core programming
- KDIGO 2024 - Medical knowledge source

---

## 🎊 System Status

Your vector database is **fully operational** and ready to power intelligent kidney care applications!

**What's Working:**

- ✅ Semantic search across 537 medical documents
- ✅ OpenAI embeddings (1536D) for high-quality search
- ✅ Metadata filtering and ranking
- ✅ RAG-ready for LLM integration
- ✅ Interactive query interface
- ✅ NLU engine for intent detection

**Ready for:**

- 🚀 Chatbot deployment
- 🚀 Clinical decision support
- 🚀 Patient education systems
- 🚀 Medical knowledge APIs

---

**Happy Building! 🎉**
