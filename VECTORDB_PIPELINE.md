# Nephro-AI VectorDB Ingestion Pipeline

## How a Document Gets Into the Knowledge Base — Step by Step

This document traces the full journey of a raw medical document (PDF or TXT) from
disk into the ChromaDB vector database that powers the Nephro-AI chatbot.

---

## Pipeline at a Glance

```
 RAW DOCUMENT (PDF / TXT)
        │
        ▼
┌──────────────────────────┐
│  STEP 1: PDF EXTRACTION  │  ◄── pdf_extractor.py
│  PDFKnowledgeExtractor   │
└──────────────┬───────────┘
               │  data/processed/<name>_chunks.json
               ▼
┌──────────────────────────┐
│  STEP 2: PREPARATION     │  ◄── prepare_vectordb.py
│  VectorDBPreparator      │
└──────────────┬───────────┘
               │  data/vectordb_ready/documents/<name>_vectordb_ready.json
               ▼
┌──────────────────────────┐
│  STEP 3: BUILD VECTORDB  │  ◄── build_vectordb.py
│  VectorDBBuilder         │
└──────────────┬───────────┘
               │  vectordb/chroma_db/  (persisted)
               ▼
       ╔═══════════════╗
       ║  CHROMADB     ║
       ║  Collection:  ║
       ║ nephro_ai_    ║
       ║ medical_kb    ║
       ╚═══════════════╝
```

---

## Step 1 — PDF Extraction (`pdf_extractor.py`)

**Class:** `PDFKnowledgeExtractor`  
**Input:** Any `.pdf` or `.txt` file placed in `ai-engine/data/raw/`  
**Output:** `ai-engine/data/processed/<document_name>_chunks.json`

### 1a. Text Extraction

The extractor tries two PDF parsing libraries in order:

| Method   | Library      | Purpose                                       |
| -------- | ------------ | --------------------------------------------- |
| Primary  | `pdfplumber` | Better for complex layouts, multi-column PDFs |
| Fallback | `PyPDF2`     | Simpler but more widely compatible            |

For `.txt` files, the raw content is read directly.

All page text is concatenated into one large string. The total page count and
raw character count are stored in document-level metadata.

### 1b. Text Cleaning

The raw text goes through a strict normalization pipeline:

1. **Abbreviation Expansion** — Medical abbreviations (e.g., `CKD` → `chronic kidney disease`,
   `eGFR` → `glomerular filtration rate`) are expanded using the full dictionary defined in
   `config.py → get_ckd_abbreviations()`. Longest abbreviations are matched first to prevent
   partial replacements.

2. **Whitespace Normalization** — Multiple spaces, tabs, and newlines are collapsed to a
   single space.

3. **Artifact Removal** — Page numbers, `Page N` strings, URLs, multi-dot ellipses (table of
   contents artifacts), and hyphenated line-break words are cleaned.

4. **Punctuation Normalization** — Smart/curly quotes are replaced with straight quotes.
   Excessive punctuation (`!!!` → `!`) is collapsed.

5. **Symbol Preservation** — Medical symbols (`%`, `±`, `≥`, `≤`, `°`, `μ`, `α`, `β`,
   `γ`, `δ`) are explicitly kept during special-character removal.

### 1c. Metadata Extraction

Document-level metadata is detected automatically from the cleaned text:

| Field             | How Detected                                  |
| ----------------- | --------------------------------------------- |
| `source_file`     | Filename                                      |
| `language`        | `langdetect` on first 1 000 characters        |
| `title`           | First text line between 20 and 200 characters |
| `organization`    | Looks for `KDIGO` in first 2 000 characters   |
| `year`            | First `20XX` four-digit year in the header    |
| `keywords`        | Regex scan for CKD-specific patterns          |
| `extraction_date` | Current ISO timestamp                         |

### 1d. Sentence-Based Chunking

Text is split into sentences using **NLTK's `sent_tokenize`**.  
Chunks are built by accumulating sentences until a word-count ceiling is reached:

| Parameter    | Default   | Source                                            |
| ------------ | --------- | ------------------------------------------------- |
| `chunk_size` | 600 words | `config.CHUNK_SETTINGS['max_words']`              |
| `overlap`    | ~20 words | `config.CHUNK_SETTINGS['overlap_sentences'] × 10` |

**Overlap strategy:** When starting a new chunk, the last few sentences from the
previous chunk are carried over. This prevents context from being lost at chunk
boundaries — critical for multi-sentence medical recommendations.

**Content filter (`is_useful_content`):** A chunk is discarded before saving if it:

- Has fewer than 20 words (too short).
- Is more than 50% numbers (likely a table or figure).
- Matches skip-patterns: table of contents, references, bibliography, index, figure
  captions, standalone page numbers.
- Contains **no medical terminology** from the `MEDICAL_ENTITIES` list in `config.py`.

### 1e. Per-Chunk Metadata Enrichment

After chunking, each chunk receives additional metadata:

| Field                     | Description                                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------------------- |
| `chunk_index`             | Position in the document (0-based)                                                             |
| `total_chunks`            | Total chunks produced from this document                                                       |
| `position`                | Human-readable `N/total` string                                                                |
| `section`                 | Extracted section header if detected                                                           |
| `content_type`            | Classified as `recommendation`, `evidence`, `definition`, `reference`, `dietary`, or `general` |
| `content_type_confidence` | Number of keyword matches for the winning content type                                         |
| `medical_entities`        | List of up to 10 matched medical terms from the master entity list                             |
| `entity_count`            | Total matched entity count                                                                     |

### 1f. Output

Two files are written to `ai-engine/data/processed/`:

- `<name>_chunks.json` — Array of chunk objects, each with `chunk_id`, `text`, `word_count`, `char_count`, `sentence_count`, and `metadata`.
- `<name>_metadata.json` — Document-level summary (pages, character counts, chunk stats, processing timestamp).

---

## Step 2 — VectorDB Preparation (`prepare_vectordb.py`)

**Class:** `VectorDBPreparator`  
**Input:** `ai-engine/data/processed/<name>_chunks.json`  
**Output:** `ai-engine/data/vectordb_ready/documents/<name>_vectordb_ready.json`

This step acts as a **quality gate and format converter**. Not every chunk from
Step 1 is suitable for embedding; this step ensures only high-signal content
enters the database.

### 2a. Duplicate Guard

A tracker file (`.processed_chunks_tracker.json`) records every file that has
already been processed. Re-running the script on the same input is a no-op —
the file is silently skipped, preventing duplicate database entries.

### 2b. Quality Filtering

Each chunk must pass **four filters** to proceed:

| Filter           | Rule                                                                         |
| ---------------- | ---------------------------------------------------------------------------- |
| Word count       | `min_words (50)` ≤ words ≤ `max_words (600)`                                 |
| Medical entities | `metadata.medical_entities` must not be empty                                |
| Citation density | Chunk must not have > 3 `et al` or > 2 `ibid` occurrences                    |
| Entity coverage  | Text must match **at least 2** entries from the full `MEDICAL_ENTITIES` list |

Chunks that fail any filter are dropped. A retention-rate report is printed.

### 2c. ChromaDB Format Conversion

ChromaDB requires data as three parallel arrays: `documents`, `metadatas`, and `ids`.

For each surviving chunk:

- **`documents`** → raw chunk text (the content that will be embedded and searched).
- **`ids`** → unique string: `<document_base_name>_chunk_<N>` ensuring global uniqueness.
- **`metadatas`** → a flattened dictionary of simple types (strings, numbers, booleans only — ChromaDB requirement):

| Metadata Field            | Type   | Description                          |
| ------------------------- | ------ | ------------------------------------ |
| `source`                  | string | Source filename                      |
| `chunk_id`                | int    | Original chunk number                |
| `content_type`            | string | `recommendation` / `evidence` / etc. |
| `content_type_confidence` | int    | Keyword match count                  |
| `word_count`              | int    | Words in this chunk                  |
| `entity_count`            | int    | Number of medical entities           |
| `has_ckd`                 | bool   | Fast filter flag                     |
| `has_gfr`                 | bool   | Fast filter flag                     |
| `has_diabetes`            | bool   | Fast filter flag                     |
| `has_hypertension`        | bool   | Fast filter flag                     |
| `has_dialysis`            | bool   | Fast filter flag                     |
| `medical_entities`        | string | Comma-separated top-10 entities      |

Boolean fast-filter flags allow ChromaDB `where` clauses to cheaply narrow
results before vector similarity is computed.

### 2d. Output

A single JSON file with the structure:

```json
{
  "documents": ["chunk text 1", "chunk text 2", ...],
  "metadatas": [{ ... }, { ... }, ...],
  "ids":       ["doc_chunk_0", "doc_chunk_1", ...]
}
```

---

## Step 3 — Build VectorDB (`build_vectordb.py`)

**Class:** `VectorDBBuilder`  
**Input:** All `*_vectordb_ready.json` files in `ai-engine/data/vectordb_ready/documents/`  
**Output:** Persisted ChromaDB at `ai-engine/vectordb/chroma_db/`

### 3a. Load & Merge

All `*_vectordb_ready.json` files are globbed and loaded. In **incremental mode**
(default), the existing collection's document IDs are fetched first. Any chunk
whose ID already exists in the database is skipped — only genuinely new content
is added.

### 3b. ChromaDB Initialization

A `chromadb.PersistentClient` is created pointing at `vectordb/chroma_db/`.
The collection `nephro_ai_medical_kb` is created or retrieved. Its metadata
records the build timestamp, embedding model name, and dimension.

### 3c. Embedding Generation (`openai_embeddings.py`)

**Class:** `OpenAIEmbeddings`  
**Model:** `openai/text-embedding-3-small` (via **OpenRouter API**)  
**Dimension:** 1 536

Each chunk's text is sent to the OpenRouter embedding endpoint in batches of 32.
The API key is read from the `OPENROUTER_API_KEY` environment variable.

Key robustness features:

- Empty/blank texts produce a zero-vector instead of crashing.
- Non-200 HTTP responses return a zero-vector and print an error.
- Results are sorted by the `index` field from the API response to guarantee order.

```
Chunk text  ──►  OpenRouter API  ──►  1536-dim float vector
```

### 3d. Storage in ChromaDB

Embeddings, documents, metadatas, and IDs are upserted into the collection
in batches of 100 using `collection.add(...)`.

```
documents[] + metadatas[] + ids[] + embeddings[]
        └──────────────────────────────────────►  ChromaDB collection
```

After insertion, a verification query (`"What is chronic kidney disease?"`) is
run to confirm the collection is live and searchable.

### 3e. Build Summary

A `build_summary.json` is saved inside `vectordb/chroma_db/` recording:
build date, collection name, document count, embedding model, dimension, and
number of source files consumed.

---

## How Queries Use the VectorDB (`enhanced_query_vectordb.py`)

At runtime the `RAGEngine` calls `EnhancedVectorQuery.query_with_nlu()`:

```
User Query
    │
    ▼
CKDNLUEngine.analyze_query()
    │  → intent classification (diet, medication, symptoms, …)
    │  → entity extraction
    │  → query variant generation
    ▼
generate_search_filters()
    │  → ChromaDB `where` clause using boolean flags (e.g., {"has_ckd": true})
    ▼
VectorDBQuery.query()  [for each query variant]
    │  1. Embed query text → 1 536-dim vector via OpenRouter
    │  2. ChromaDB cosine similarity search
    │  3. Return top-N (document, metadata, distance) tuples
    ▼
CrossEncoder (ms-marco-TinyBERT-L-2-v2)
    │  → Re-rank results by relevance score
    ▼
Top chunks  ──►  LLMEngine (Gemini / OpenRouter)  ──►  Final Response
```

---

## Full File Map

| File                                               | Role                                                 |
| -------------------------------------------------- | ---------------------------------------------------- |
| `ai-engine/src/chatbot/pdf_extractor.py`           | Stage 1 — Extract, clean, chunk, enrich              |
| `ai-engine/src/chatbot/prepare_vectordb.py`        | Stage 2 — Quality filter & format convert            |
| `ai-engine/src/chatbot/build_vectordb.py`          | Stage 3 — Embed & persist to ChromaDB                |
| `ai-engine/src/chatbot/openai_embeddings.py`       | Embedding client (OpenRouter API)                    |
| `ai-engine/src/chatbot/config.py`                  | All paths, model names, entity lists, chunk settings |
| `ai-engine/src/chatbot/enhanced_query_vectordb.py` | Query-time NLU + re-ranking                          |
| `ai-engine/src/chatbot/rag_engine.py`              | Orchestrates query → VectorDB → LLM                  |
| `ai-engine/data/raw/`                              | Drop raw PDFs / TXTs here                            |
| `ai-engine/data/processed/`                        | Stage 1 output: `*_chunks.json`                      |
| `ai-engine/data/vectordb_ready/documents/`         | Stage 2 output: `*_vectordb_ready.json`              |
| `ai-engine/vectordb/chroma_db/`                    | Final persisted ChromaDB                             |

---

## How to Run the Pipeline

```powershell
# Stage 1 — Extract & chunk one or more PDFs (opens a file picker dialog)
python ai-engine/src/chatbot/pdf_extractor.py

# Stage 2 — Filter chunks and prepare for ChromaDB
python ai-engine/src/chatbot/prepare_vectordb.py

# Stage 3 — Generate embeddings and load into ChromaDB
python ai-engine/src/chatbot/build_vectordb.py
```

All three scripts are **incremental by default** — already-processed files are
skipped automatically. You only need to run all three when adding new documents.

---

## Key Design Decisions

| Decision                               | Reason                                                                                |
| -------------------------------------- | ------------------------------------------------------------------------------------- |
| Sentence-based chunking with overlap   | Prevents context loss at chunk borders for multi-sentence guidelines                  |
| Medical entity filtering at two stages | Keeps only domain-relevant content; reduces noise and DB size                         |
| Boolean fast-filter metadata flags     | Allows cheap pre-filtering in ChromaDB `where` clauses before expensive vector search |
| OpenAI `text-embedding-3-small`        | Strong semantic quality at low cost; 1 536 dimensions balance accuracy and storage    |
| Incremental ID-based deduplication     | Safely re-run pipeline without creating duplicate chunks                              |
| CrossEncoder re-ranking at query time  | Corrects approximate nearest-neighbour ranking for higher precision                   |
