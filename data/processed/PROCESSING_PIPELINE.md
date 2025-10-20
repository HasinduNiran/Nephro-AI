# PDF Processing Pipeline Documentation

## 📋 Overview

This pipeline extracts, cleans, normalizes, chunks, and prepares medical knowledge from PDF documents for vectorization in ChromaDB.

## 🔄 Processing Pipeline

```
PDF Document
    ↓
1. Extract Text (pdfplumber + PyPDF2)
    ↓
2. Clean & Normalize Text
    ↓
3. Extract Metadata
    ↓
4. Split into Chunks (with overlap)
    ↓
5. Add Metadata to Chunks
    ↓
6. Filter Quality Chunks
    ↓
7. Prepare for VectorDB
    ↓
Ready for ChromaDB Ingestion
```

## 📁 Generated Files

### From `pdf_extractor.py`:
- **`KDIGO-2024-CKD-Guideline_chunks.json`** - All extracted chunks with metadata
- **`KDIGO-2024-CKD-Guideline_metadata.json`** - Document-level metadata

### From `analyze_chunks.py`:
- **`KDIGO-2024-CKD-Guideline_readable.txt`** - Human-readable version of chunks

### From `prepare_vectordb.py`:
- **`vectordb_ready_chunks.json`** - Filtered, high-quality chunks ready for ChromaDB
- **`vectordb_preparation_summary.json`** - Processing statistics
- **`sample_queries.txt`** - Sample queries for testing

## 📊 Processing Results

### KDIGO 2024 CKD Guideline Processing:

**Source Document:**
- Total Pages: 199
- Raw Text: 936,183 characters
- Cleaned Text: 944,430 characters

**Initial Chunking:**
- Total Chunks: 243
- Average Chunk Size: 486.4 words
- Chunk Range: 190-500 words

**Quality Filtering:**
- High-Quality Chunks: 197
- Removed Low-Quality: 46

**Content Distribution:**
- Recommendations: 59.3%
- References: 20.6%
- Evidence: 16.0%
- Definitions: 2.9%
- General: 1.2%

**Medical Entity Coverage:**
- CKD: 206 occurrences
- GFR: 155 occurrences
- Diabetes: 85 occurrences
- Albuminuria: 58 occurrences
- Dialysis: 50 occurrences
- Hypertension: 35 occurrences

## 🛠️ Text Processing Steps

### 1. **Text Extraction**
- Primary: pdfplumber (better for complex layouts)
- Fallback: PyPDF2
- Preserves medical symbols: %, ±, ≥, ≤, °, μ, α, β

### 2. **Text Cleaning**
- Remove excessive whitespace
- Fix hyphenated words at line breaks
- Remove page numbers and headers
- Normalize quotes and punctuation
- Remove URLs (preserve DOI)
- Fix spacing issues

### 3. **Text Normalization**
- Standardize medical terminology
- Preserve abbreviations (CKD, GFR, eGFR, etc.)
- Keep numerical values and ranges
- Maintain clinical measurement units

### 4. **Chunking Strategy**
- **Method**: Sentence-based with overlap
- **Size**: 500 words per chunk (target)
- **Overlap**: 50 words between chunks
- **Benefit**: Maintains context across boundaries

### 5. **Metadata Enrichment**
Each chunk includes:
- `chunk_id`: Unique identifier
- `source_file`: Original PDF name
- `content_type`: recommendation, definition, evidence, general
- `medical_entities`: CKD, GFR, diabetes, etc.
- `section`: Document section (if detected)
- `word_count`: Number of words
- `organization`: KDIGO
- `year`: 2024

### 6. **Quality Filtering**
Chunks are filtered based on:
- Word count (50-600 words)
- Presence of medical entities
- Medical keyword density
- Exclusion of reference-heavy sections
- Content relevance

## 🎯 Quality Criteria

### ✅ Included Content:
- Clinical recommendations
- Disease definitions and descriptions
- Treatment guidelines
- Diagnostic criteria
- Evidence-based statements
- Risk factors and management strategies

### ❌ Excluded Content:
- Table of contents
- Pure reference lists
- Page numbers only
- Figure/table captions without context
- Copyright notices
- Author affiliations
- Content with <50 words
- Sections with >50% citations

## 📝 Metadata Schema

### Document-Level Metadata:
```json
{
  "source_file": "KDIGO-2024-CKD-Guideline.pdf",
  "extraction_date": "2025-10-19T...",
  "document_type": "medical_guideline",
  "organization": "KDIGO",
  "year": "2024",
  "language": "en",
  "total_pages": 199,
  "keywords": ["chronic kidney disease", "CKD", "GFR", ...]
}
```

### Chunk-Level Metadata:
```json
{
  "chunk_id": 0,
  "source": "KDIGO-2024",
  "content_type": "recommendation",
  "word_count": 495,
  "medical_entities": "CKD,GFR,diabetes",
  "has_ckd": true,
  "has_gfr": true,
  "has_diabetes": true,
  "section": "Clinical Practice Guideline",
  "year": "2024",
  "organization": "KDIGO"
}
```

## 🔬 Medical Entity Detection

Automatically detects and tags:
- **CKD**: Chronic Kidney Disease references
- **GFR/eGFR**: Glomerular Filtration Rate
- **Dialysis**: Any dialysis-related content
- **Proteinuria/Albuminuria**: Protein in urine
- **Hypertension**: Blood pressure related
- **Diabetes**: Diabetes-related kidney disease

## 🚀 Usage

### Step 1: Extract and Process PDF
```bash
python scripts/pdf_extractor.py
```
**Output**: Initial chunks with full metadata

### Step 2: Analyze Chunks (Optional)
```bash
python scripts/analyze_chunks.py
```
**Output**: Statistics and readable text file

### Step 3: Prepare for VectorDB
```bash
python scripts/prepare_vectordb.py
```
**Output**: ChromaDB-ready chunks

### Step 4: Build Vector Database (Next Step)
```bash
python scripts/build_vectordb.py  # To be created
```

## 📈 Statistics

| Metric | Value |
|--------|-------|
| Total Pages Processed | 199 |
| Raw Text Extracted | 936,183 chars |
| Initial Chunks Created | 243 |
| Quality Filtered Chunks | 197 |
| Average Chunk Size | 486 words |
| Medical Entities Tagged | 7 types |
| Content Types | 5 categories |

## ⚙️ Configuration

### Chunking Parameters:
```python
CHUNK_SIZE = 500    # Target words per chunk
OVERLAP = 50        # Words overlap between chunks
```

### Quality Filters:
```python
MIN_WORDS = 50      # Minimum words per chunk
MAX_WORDS = 600     # Maximum words per chunk
MIN_MEDICAL_KEYWORDS = 2  # Required medical terms
```

## 🎓 Best Practices

1. **Chunk Size**: 400-600 words optimal for semantic search
2. **Overlap**: 50-100 words prevents context loss
3. **Metadata**: Rich metadata improves filtering and retrieval
4. **Quality Filtering**: Removes noise, improves relevance
5. **Medical Entities**: Enable specialized medical queries

## 🔍 Testing

Sample queries are provided in `sample_queries.txt`:
- General CKD questions
- Diagnosis and staging queries
- Treatment and management
- Risk factors and complications
- Specific populations

## 📚 Next Steps

1. ✅ PDF extraction and processing
2. ✅ Text cleaning and normalization
3. ✅ Chunking with metadata
4. ✅ Quality filtering
5. ✅ VectorDB preparation
6. ⏭️ **Build ChromaDB collection**
7. ⏭️ **Generate embeddings**
8. ⏭️ **Test query functionality**
9. ⏭️ **Integrate with RAG system**

## 🐛 Troubleshooting

### Common Issues:

**Issue**: Text extraction fails
- **Solution**: Check PDF is not encrypted or corrupted

**Issue**: NLTK download errors
- **Solution**: Script auto-downloads required packages

**Issue**: Too many/few chunks
- **Solution**: Adjust CHUNK_SIZE and OVERLAP parameters

**Issue**: Missing medical entities
- **Solution**: Add terms to medical_entities patterns

## 📄 License & Attribution

- Source: KDIGO 2024 Clinical Practice Guideline
- Processing: Custom pipeline for Nephro-AI project
- Purpose: Educational and clinical decision support

---

**Last Updated**: October 19, 2025
**Pipeline Version**: 1.0
**Status**: ✅ Ready for Vectorization
