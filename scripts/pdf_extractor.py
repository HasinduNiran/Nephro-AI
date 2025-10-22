
"""
PDF Knowledge Extractor for Kidney Care Vector Database
========================================================
This module extracts medical knowledge from PDF documents and prepares them for vector database storage.

Main Features:
- Multi-method PDF text extraction (pdfplumber + PyPDF2 fallback)
- Text cleaning and normalization for medical content
- Intelligent chunking with overlap for context preservation
- Automatic metadata extraction and medical entity detection
- Quality filtering to ensure useful content
- Batch processing support for multiple files

Pipeline Flow:
    PDF → Extract Text → Clean → Chunk → Add Metadata → Filter → Save JSON

Usage:
    python pdf_extractor.py
    (Opens file dialog to select PDF/TXT files)
"""

import os
import re
import json
from pathlib import Path
from typing import List, Dict, Tuple
from datetime import datetime
import tkinter as tk
from tkinter import filedialog
import logging

# Third-party libraries for PDF processing and NLP
import PyPDF2          # Fallback PDF reader
import pdfplumber      # Primary PDF reader (better for complex layouts)
from langdetect import detect  # Automatic language detection
import nltk
from nltk.tokenize import sent_tokenize  # Split text into sentences

# Suppress pdfplumber warnings about graphics/colors that clutter output
logging.getLogger("pdfminer").setLevel(logging.ERROR)
logging.getLogger("pdfplumber").setLevel(logging.ERROR)

# Download required NLTK data if not already present
# punkt: Sentence tokenizer models
try:
    nltk.data.find('tokenizers/punkt')
except LookupError:
    nltk.download('punkt')

# punkt_tab: Additional tokenizer data
try:
    nltk.data.find('tokenizers/punkt_tab')
except LookupError:
    nltk.download('punkt_tab')


class PDFKnowledgeExtractor:
    """
    Main class for extracting and processing medical knowledge from PDF documents.
    
    This class handles the complete pipeline from raw PDF to structured chunks:
    1. Text extraction (multiple methods for reliability)
    2. Text cleaning and normalization
    3. Metadata extraction
    4. Intelligent chunking with overlap
    5. Medical entity detection
    6. Quality filtering
    7. Saving processed data
    
    Attributes:
        pdf_path (str): Path to the source PDF or text file
        output_dir (str): Directory where processed chunks will be saved
        metadata (dict): Document-level metadata (pages, length, title, etc.)
        chunks (list): List of processed text chunks with metadata
    """
    
    def __init__(self, pdf_path: str, output_dir: str = None):
        """
        Initialize the PDF Knowledge Extractor.
        
        Args:
            pdf_path (str): Path to the PDF or text file to process
            output_dir (str, optional): Output directory for processed files. 
                                       Defaults to "data/processed"
        """
        self.pdf_path = pdf_path
        self.output_dir = output_dir or "data/processed"
        self.metadata = {}  # Stores document-level info (pages, length, title, etc.)
        self.chunks = []    # Stores processed text chunks
        
        # Create output directory if it doesn't exist
        os.makedirs(self.output_dir, exist_ok=True)
        
    def extract_text(self) -> str:
        """
        Extract raw text from PDF or text file using multiple methods.
        
        Uses pdfplumber as primary method (better for complex layouts and tables),
        with PyPDF2 as fallback. Also supports plain text files.
        
        Returns:
            str: Extracted raw text from the document
        """
        print(f"📄 Extracting text from: {self.pdf_path}")
        
        # Handle plain text files directly
        if self.pdf_path.lower().endswith('.txt'):
            try:
                with open(self.pdf_path, 'r', encoding='utf-8') as f:
                    text = f.read()
                self.metadata['total_pages'] = 1
                self.metadata['raw_text_length'] = len(text)
                print(f"✅ Extracted {len(text)} characters from text file")
                return text
            except Exception as e:
                print(f"❌ Failed to read text file: {e}")
                return ""
        
        # Process PDF files
        full_text = []  # Collect text from all pages
        
        # Method 1: Try pdfplumber (primary method - better for complex layouts)
        try:
            with pdfplumber.open(self.pdf_path) as pdf:
                self.metadata['total_pages'] = len(pdf.pages)
                print(f"   Total pages: {self.metadata['total_pages']}")
                
                # Extract text from each page
                for i, page in enumerate(pdf.pages, 1):
                    text = page.extract_text()
                    if text:  # Only add if text was successfully extracted
                        full_text.append(text)
                    
                    # Progress indicator for large documents
                    if i % 10 == 0:
                        print(f"   Processed {i}/{self.metadata['total_pages']} pages...")
        
        except Exception as e:
            print(f"⚠️  pdfplumber failed: {e}")
            print("   Trying PyPDF2...")
            
            # Fallback to PyPDF2 (simpler but sometimes more reliable)
            try:
                with open(self.pdf_path, 'rb') as file:
                    pdf_reader = PyPDF2.PdfReader(file)
                    self.metadata['total_pages'] = len(pdf_reader.pages)
                    
                    # Extract text from all pages
                    for page in pdf_reader.pages:
                        text = page.extract_text()
                        if text:
                            full_text.append(text)
            except Exception as e2:
                print(f"❌ PyPDF2 also failed: {e2}")
                return ""  # Both methods failed
        
        combined_text = "\n".join(full_text)
        self.metadata['raw_text_length'] = len(combined_text)
        print(f"✅ Extracted {len(combined_text)} characters")
        
        return combined_text
    
    def clean_text(self, text: str) -> str:
        """
        Clean and normalize extracted text for better processing.
        
        Removes:
        - Excessive whitespace and line breaks
        - Page numbers and headers
        - URLs (while preserving DOIs)
        - Hyphenation artifacts from line breaks
        - Table of contents ellipses
        - Excessive punctuation
        
        Preserves:
        - Medical symbols (%, ±, ≥, ≤, °, μ, α, β, γ, δ)
        - Proper sentence structure
        - Essential punctuation
        
        Args:
            text (str): Raw extracted text
            
        Returns:
            str: Cleaned and normalized text
        """
        print("\n🧹 Cleaning text...")
        
        # Remove excessive whitespace (multiple spaces, tabs, newlines → single space)
        text = re.sub(r'\s+', ' ', text)
        
        # Remove page numbers (common patterns in PDFs)
        text = re.sub(r'\n\s*\d+\s*\n', '\n', text)  # Standalone page numbers
        text = re.sub(r'Page \d+', '', text, flags=re.IGNORECASE)  # "Page N" format
        
        # Fix hyphenated words split across line breaks (e.g., "treat- ment" → "treatment")
        text = re.sub(r'(\w+)-\s+(\w+)', r'\1\2', text)
        
        # Remove multiple periods (often from table of contents: "Section 1.2.....45")
        text = re.sub(r'\.{3,}', '', text)
        
        # Remove URLs but keep DOIs (for academic references)
        text = re.sub(r'http[s]?://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\\(\\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+', '', text)
        
        # Normalize smart quotes to regular quotes
        text = text.replace('"', '"').replace('"', '"')  # Curly double quotes
        text = text.replace(''', "'").replace(''', "'")  # Curly single quotes
        
        # Remove excessive punctuation (e.g., "!!!" → "!", "???" → "?")
        text = re.sub(r'([!?])\1+', r'\1', text)
        
        # Fix spacing around punctuation
        text = re.sub(r'\s+([.,!?;:])', r'\1', text)      # Remove space before punctuation
        text = re.sub(r'([.,!?;:])\s*', r'\1 ', text)     # Ensure space after punctuation
        
        # Remove special characters BUT preserve important medical symbols
        # Keep: %, ±, ≥, ≤, °, μ (micro), α (alpha), β (beta), γ (gamma), δ (delta)
        text = re.sub(r'[^\w\s.,!?;:()\-±≥≤°μαβγδ%/]', '', text)
        
        # Final whitespace normalization
        text = re.sub(r'\s+', ' ', text)
        text = text.strip()
        
        # Store cleaned text length for statistics
        self.metadata['cleaned_text_length'] = len(text)
        print(f"✅ Cleaned text: {len(text)} characters")
        
        return text
    
    def extract_metadata_from_content(self, text: str) -> Dict:
        """
        Extract metadata from document content using pattern matching and heuristics.
        
        Extracts:
        - Source filename and processing date
        - Document title (from first substantial line)
        - Organization (e.g., KDIGO)
        - Publication year
        - Language (auto-detected)
        - Medical keywords present in document
        
        Args:
            text (str): Cleaned document text
            
        Returns:
            Dict: Metadata dictionary with extracted information
        """
        print("\n📋 Extracting metadata...")
        
        # Initialize metadata with basic information
        metadata = {
            'source_file': os.path.basename(self.pdf_path),
            'extraction_date': datetime.now().isoformat(),
            'document_type': 'medical_guideline',
            'language': 'en'  # Default to English
        }
        
        # Auto-detect language from first 1000 characters
        try:
            sample = text[:1000] if len(text) > 1000 else text
            metadata['language'] = detect(sample)
        except:
            pass  # Keep default if detection fails
        
        # Extract title: Look for first substantial line (not too short, not too long)
        lines = text.split('\n')[:20]  # Check first 20 lines
        for line in lines:
            if len(line) > 20 and len(line) < 200:  # Reasonable title length
                metadata['title'] = line.strip()
                break
        
        # Look for KDIGO-specific information (or other organizations)
        if 'KDIGO' in text[:2000]:  # Check in document header
            metadata['organization'] = 'KDIGO'
            metadata['guideline_type'] = 'Clinical Practice Guideline'
        
        # Extract publication year (4-digit year starting with 20XX)
        year_match = re.search(r'20\d{2}', text[:1000])
        if year_match:
            metadata['year'] = year_match.group()
        
        # Identify medical keywords present in document (for categorization)
        keywords = []
        keyword_patterns = [
            r'chronic kidney disease', r'CKD', r'GFR', r'dialysis',
            r'kidney function', r'renal', r'nephrology', r'KDIGO',
            r'proteinuria', r'albuminuria', r'eGFR'
        ]
        
        # Search for each keyword in first 5000 characters
        for pattern in keyword_patterns:
            if re.search(pattern, text[:5000], re.IGNORECASE):
                keywords.append(pattern)
        
        metadata['keywords'] = keywords
        
        print(f"✅ Metadata extracted: {metadata.get('title', 'Unknown')[:50]}...")
        
        return metadata
    
    def is_useful_content(self, text: str) -> bool:
        """
        Determine if a text chunk contains useful medical content.
        
        Filters out:
        - Very short chunks (< 20 words)
        - Chunks that are mostly numbers (tables, lists)
        - Table of contents sections
        - Reference lists and bibliographies
        - Page numbers and figure captions
        - Chunks without medical terminology
        
        Args:
            text (str): Text chunk to evaluate
            
        Returns:
            bool: True if chunk contains useful content, False otherwise
        """
        
        # Filter 1: Too short to be meaningful
        if len(text.split()) < 20:
            return False
        
        # Filter 2: Mostly numbers (likely a table, figure, or numbered list)
        words = text.split()
        number_ratio = sum(1 for w in words if w.replace('.', '').isdigit()) / len(words)
        if number_ratio > 0.5:  # More than 50% numbers
            return False
        
        # Filter 3: Common non-content section headers and artifacts
        skip_patterns = [
            r'^table of contents',      # TOC pages
            r'^references\s*$',          # Reference sections
            r'^bibliography\s*$',        # Bibliography pages
            r'^index\s*$',               # Index pages
            r'^appendix\s+[a-z]',        # Appendix sections
            r'^\d+\s*$',                 # Standalone page numbers
            r'^figure \d+',              # Figure captions
            r'^table \d+',               # Table captions
        ]
        
        text_lower = text.lower().strip()
        for pattern in skip_patterns:
            if re.match(pattern, text_lower):
                return False
        
        # Filter 4: Must contain medical/kidney-related terminology
        # This ensures we keep domain-relevant content
        medical_terms = [
            'kidney', 'renal', 'ckd', 'gfr', 'dialysis', 'patient',
            'disease', 'treatment', 'clinical', 'medical', 'health',
            'therapy', 'diagnosis', 'symptom', 'recommendation'
        ]
        
        has_medical_term = any(term in text_lower for term in medical_terms)
        
        return has_medical_term
    
    def chunk_text(self, text: str, chunk_size: int = 500, overlap: int = 50) -> List[Dict]:
        """
        Split text into meaningful chunks with overlap for context preservation.
        
        Uses sentence-based chunking to:
        - Maintain semantic coherence (doesn't split mid-sentence)
        - Add overlap between chunks to preserve context
        - Filter out non-useful content during chunking
        - Create uniform-sized chunks for better vectorization
        
        Why overlap? Adjacent chunks share context, improving retrieval quality
        when queries span chunk boundaries.
        
        Args:
            text (str): Cleaned text to chunk
            chunk_size (int): Target number of words per chunk (default: 500)
            overlap (int): Number of words to overlap between chunks (default: 50)
            
        Returns:
            List[Dict]: List of chunk dictionaries with text and metadata
        """
        print(f"\n✂️  Chunking text (chunk_size={chunk_size}, overlap={overlap})...")
        
        # Split into sentences using NLTK's sentence tokenizer
        sentences = sent_tokenize(text)
        
        # Initialize chunking variables
        chunks = []                # Final list of processed chunks
        current_chunk = []         # Current chunk being built (list of sentences)
        current_word_count = 0     # Running word count for current chunk
        chunk_id = 0               # Unique identifier for each chunk
        
        # Process each sentence and build chunks
        for sentence in sentences:
            sentence = sentence.strip()
            if not sentence:  # Skip empty sentences
                continue
            
            words = sentence.split()
            word_count = len(words)
            
            # Check if adding this sentence would exceed chunk size
            if current_word_count + word_count > chunk_size and current_chunk:
                # Save current chunk before starting a new one
                chunk_text = ' '.join(current_chunk)
                
                # Quality filter: Only save if it contains useful content
                if self.is_useful_content(chunk_text):
                    chunks.append({
                        'chunk_id': chunk_id,
                        'text': chunk_text,
                        'word_count': current_word_count,
                        'char_count': len(chunk_text),
                        'sentence_count': len(current_chunk)
                    })
                    chunk_id += 1
                
                # Create overlap: Keep last few sentences for context continuity
                # Work backwards from end of current chunk
                overlap_sentences = []
                overlap_words = 0
                for s in reversed(current_chunk):
                    s_words = len(s.split())
                    if overlap_words + s_words <= overlap:
                        overlap_sentences.insert(0, s)  # Maintain order
                        overlap_words += s_words
                    else:
                        break  # Stop when we've collected enough overlap
                
                # Start new chunk with overlap sentences
                current_chunk = overlap_sentences
                current_word_count = overlap_words
            
            # Add sentence to current chunk
            current_chunk.append(sentence)
            current_word_count += word_count
        
        # Don't forget the final chunk!
        if current_chunk:
            chunk_text = ' '.join(current_chunk)
            if self.is_useful_content(chunk_text):
                chunks.append({
                    'chunk_id': chunk_id,
                    'text': chunk_text,
                    'word_count': current_word_count,
                    'char_count': len(chunk_text),
                    'sentence_count': len(current_chunk)
                })
        
        print(f"✅ Created {len(chunks)} chunks")
        
        return chunks
    
    def add_metadata_to_chunks(self, chunks: List[Dict], doc_metadata: Dict) -> List[Dict]:
        """
        Enrich each chunk with metadata for better searchability and categorization.
        
        Adds:
        - Document-level metadata (source, year, organization)
        - Position information (chunk index, total chunks)
        - Content type classification (recommendation, evidence, definition, etc.)
        - Section headers (if detected)
        - Medical entity detection (CKD, GFR, diabetes, etc.)
        
        This metadata enables:
        - Filtered searches (e.g., "show only recommendations")
        - Source attribution
        - Entity-based retrieval
        - Quality assessment
        
        Args:
            chunks (List[Dict]): List of text chunks
            doc_metadata (Dict): Document-level metadata
            
        Returns:
            List[Dict]: Chunks with added metadata
        """
        print("\n🏷️  Adding metadata to chunks...")
        
        for i, chunk in enumerate(chunks):
            # Start with document-level metadata (source file, year, etc.)
            chunk['metadata'] = {
                **doc_metadata,  # Spread operator: include all doc metadata
                'chunk_index': i,
                'total_chunks': len(chunks),
                'position': f"{i+1}/{len(chunks)}"  # Human-readable position
            }
            
            # Try to extract section header (e.g., "Introduction:", "1. Background")
            text = chunk['text']
            section_match = re.match(r'^([A-Z][A-Za-z\s]+:|\d+\.\s+[A-Z][A-Za-z\s]+)', text)
            if section_match:
                chunk['metadata']['section'] = section_match.group().strip()
            
            # Classify content type based on keywords
            text_lower = text.lower()
            if 'recommend' in text_lower:
                chunk['metadata']['content_type'] = 'recommendation'
            elif 'definition' in text_lower or 'defined as' in text_lower:
                chunk['metadata']['content_type'] = 'definition'
            elif 'table' in text_lower or 'figure' in text_lower:
                chunk['metadata']['content_type'] = 'reference'
            elif any(word in text_lower for word in ['study', 'trial', 'evidence']):
                chunk['metadata']['content_type'] = 'evidence'
            else:
                chunk['metadata']['content_type'] = 'general'
            
            # Detect medical entities for targeted retrieval
            medical_entities = []
            patterns = {
                'CKD': r'\bCKD\b',                    # Chronic Kidney Disease
                'GFR': r'\b[e]?GFR\b',                # (estimated) Glomerular Filtration Rate
                'dialysis': r'\bdialysis\b',          # Dialysis treatment
                'proteinuria': r'\bproteinuria\b',    # Protein in urine
                'albuminuria': r'\balbuminuria\b',    # Albumin in urine
                'hypertension': r'\bhypertension\b',  # High blood pressure
                'diabetes': r'\bdiabetes\b'           # Diabetes mellitus
            }
            
            # Check each pattern in the chunk text
            for entity, pattern in patterns.items():
                if re.search(pattern, text, re.IGNORECASE):
                    medical_entities.append(entity)
            
            chunk['metadata']['medical_entities'] = medical_entities
        
        print(f"✅ Metadata added to all chunks")
        
        return chunks
    
    def save_chunks(self, chunks: List[Dict], format: str = 'json'):
        """Save processed chunks to file"""
        
        # Create filename based on source PDF
        base_name = Path(self.pdf_path).stem
        
        if format == 'json':
            output_file = os.path.join(self.output_dir, f"{base_name}_chunks.json")
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(chunks, f, indent=2, ensure_ascii=False)
            print(f"\n💾 Saved JSON chunks to: {output_file}")
        
        elif format == 'txt':
            output_file = os.path.join(self.output_dir, f"{base_name}_chunks.txt")
            with open(output_file, 'w', encoding='utf-8') as f:
                for chunk in chunks:
                    f.write(f"=== CHUNK {chunk['chunk_id']} ===\n")
                    f.write(f"Metadata: {json.dumps(chunk['metadata'], indent=2)}\n")
                    f.write(f"{chunk['text']}\n\n")
            print(f"💾 Saved TXT chunks to: {output_file}")
        
        # Also save metadata summary
        metadata_file = os.path.join(self.output_dir, f"{base_name}_metadata.json")
        summary = {
            **self.metadata,
            'total_chunks': len(chunks),
            'avg_chunk_size': sum(c['word_count'] for c in chunks) / len(chunks) if chunks else 0,
            'processing_date': datetime.now().isoformat()
        }
        
        with open(metadata_file, 'w', encoding='utf-8') as f:
            json.dump(summary, f, indent=2, ensure_ascii=False)
        
        print(f"💾 Saved metadata to: {metadata_file}")
        
        return output_file
    
    def process(self, chunk_size: int = 500, overlap: int = 50, save_format: str = 'json'):
        """
        Full processing pipeline
        
        Args:
            chunk_size: Target words per chunk
            overlap: Overlap words between chunks
            save_format: Output format ('json' or 'txt')
        """
        print("=" * 70)
        print("🚀 STARTING PDF KNOWLEDGE EXTRACTION PIPELINE")
        print("=" * 70)
        
        # Step 1: Extract text
        raw_text = self.extract_text()
        if not raw_text:
            print("❌ Failed to extract text from PDF")
            return None
        
        # Step 2: Clean text
        cleaned_text = self.clean_text(raw_text)
        
        # Step 3: Extract metadata
        doc_metadata = self.extract_metadata_from_content(cleaned_text)
        self.metadata.update(doc_metadata)
        
        # Step 4: Chunk text
        chunks = self.chunk_text(cleaned_text, chunk_size, overlap)
        
        # Step 5: Add metadata
        chunks = self.add_metadata_to_chunks(chunks, doc_metadata)
        
        self.chunks = chunks
        
        # Step 6: Save results
        output_file = self.save_chunks(chunks, save_format)
        
        # Print summary
        print("\n" + "=" * 70)
        print("📊 PROCESSING SUMMARY")
        print("=" * 70)
        print(f"Source: {self.pdf_path}")
        print(f"Total pages: {self.metadata.get('total_pages', 'N/A')}")
        print(f"Raw text length: {self.metadata.get('raw_text_length', 0):,} characters")
        print(f"Cleaned text length: {self.metadata.get('cleaned_text_length', 0):,} characters")
        print(f"Total chunks created: {len(chunks)}")
        if chunks:
            print(f"Average chunk size: {sum(c['word_count'] for c in chunks) / len(chunks):.1f} words")
            print(f"Chunk size range: {min(c['word_count'] for c in chunks)} - {max(c['word_count'] for c in chunks)} words")
        print(f"Output file: {output_file}")
        print("=" * 70)
        print("✅ PROCESSING COMPLETE!")
        print("=" * 70)
        
        return output_file


def select_files():
    """
    Open a GUI file dialog to select multiple PDF or text files for processing.
    
    Uses tkinter's file dialog for user-friendly file selection.
    Supports:
    - Multiple file selection (Ctrl+Click)
    - PDF and TXT files
    - Starts in data/raw/ directory for convenience
    
    Returns:
        list: List of absolute file paths selected by user, or empty list if cancelled
    """
    print("=" * 70)
    print("📂 FILE SELECTOR")
    print("=" * 70)
    print("Please select one or more PDF/text files to process...")
    print("💡 Tip: Hold Ctrl to select multiple files")
    print()
    
    # Create a hidden root window (required for file dialog)
    root = tk.Tk()
    root.withdraw()                    # Hide the root window
    root.attributes('-topmost', True)  # Bring dialog to front of all windows
    
    # Open file dialog with multiple selection enabled
    file_paths = filedialog.askopenfilenames(  # Note: fileNAMES (plural) for multiple selection
        title="Select PDF/Text Files to Extract (Ctrl+Click for multiple)",
        filetypes=[
            ("PDF and Text files", "*.pdf *.txt"),  # Combined filter
            ("PDF files", "*.pdf"),                  # PDF only
            ("Text files", "*.txt"),                 # TXT only
            ("All files", "*.*")                     # Show all files
        ],
        initialdir=os.path.abspath("data/raw")  # Start in data/raw directory
    )
    
    # Clean up the hidden window
    root.destroy()
    
    # Display selected files
    if file_paths:
        print(f"✅ Selected {len(file_paths)} file(s):")
        for i, fp in enumerate(file_paths, 1):
            print(f"   {i}. {os.path.basename(fp)}")
        print()
        return list(file_paths)  # Convert tuple to list
    else:
        print("❌ No files selected. Exiting...\n")
        return []


def main():
    """
    Main execution function for batch PDF processing.
    
    Workflow:
    1. Prompt user to select files via GUI dialog
    2. Configure processing parameters
    3. Process each file through the extraction pipeline
    4. Generate summary report of results
    
    Returns:
        list: Processing results for each file (success/failure status)
    """
    
    # Step 1: Open file dialog to select files
    file_paths = select_files()
    
    if not file_paths:
        print("⚠️  No files selected. Exiting...")
        return None
    
    # Step 2: Configuration - adjust these parameters as needed
    OUTPUT_DIR = "data/processed"  # Where to save processed chunks
    CHUNK_SIZE = 500              # Target words per chunk (affects retrieval granularity)
    OVERLAP = 50                  # Words to overlap (preserves context between chunks)
    
    print("=" * 70)
    print("⚙️  CONFIGURATION")
    print("=" * 70)
    print(f"Files to process: {len(file_paths)}")
    print(f"Output Directory: {OUTPUT_DIR}")
    print(f"Chunk Size: {CHUNK_SIZE} words")
    print(f"Overlap: {OVERLAP} words")
    print("=" * 70)
    print()
    
    # Step 3: Process each file through the pipeline
    results = []       # Store processing results for each file
    successful = 0     # Count of successfully processed files
    failed = 0         # Count of failed files
    
    for idx, file_path in enumerate(file_paths, 1):
        print("\n" + "=" * 70)
        print(f"📁 PROCESSING FILE {idx}/{len(file_paths)}")
        print("=" * 70)
        print(f"File: {os.path.basename(file_path)}")
        print("=" * 70)
        
        # Validation: Check if file exists
        if not os.path.exists(file_path):
            print(f"❌ Error: File does not exist: {file_path}")
            failed += 1
            continue
        
        # Validation: Check file extension
        if not (file_path.lower().endswith('.pdf') or file_path.lower().endswith('.txt')):
            print(f"❌ Error: File must be PDF or TXT: {file_path}")
            failed += 1
            continue
        
        try:
            # Initialize the extractor for this file
            extractor = PDFKnowledgeExtractor(file_path, OUTPUT_DIR)
            
            # Run the complete processing pipeline:
            # Extract → Clean → Metadata → Chunk → Enrich → Save
            output_file = extractor.process(
                chunk_size=CHUNK_SIZE,
                overlap=OVERLAP,
                save_format='json'  # Save as JSON for vector DB compatibility
            )
            
            # Check if processing was successful
            if output_file:
                results.append({
                    'input': file_path,
                    'output': output_file,
                    'status': 'success'
                })
                successful += 1
                print(f"\n✅ File {idx}/{len(file_paths)} processed successfully!")
            else:
                results.append({
                    'input': file_path,
                    'output': None,
                    'status': 'failed'
                })
                failed += 1
                print(f"\n❌ File {idx}/{len(file_paths)} failed to process!")
                
        except Exception as e:
            # Catch any unexpected errors during processing
            print(f"\n❌ Error processing file: {e}")
            results.append({
                'input': file_path,
                'output': None,
                'status': 'error',
                'error': str(e)
            })
            failed += 1
    
    # Step 4: Print comprehensive summary report
    print("\n" + "=" * 70)
    print("🎉 BATCH PROCESSING COMPLETE!")
    print("=" * 70)
    print(f"Total files: {len(file_paths)}")
    print(f"✅ Successful: {successful}")
    print(f"❌ Failed: {failed}")
    print(f"📁 Output directory: {OUTPUT_DIR}")
    print("\n📊 Results:")
    
    # List each file with its status
    for i, result in enumerate(results, 1):
        status_icon = "✅" if result['status'] == 'success' else "❌"
        filename = os.path.basename(result['input'])
        print(f"   {i}. {status_icon} {filename}")
        
        # Show output file for successful processing
        if result['status'] == 'success':
            print(f"      → {os.path.basename(result['output'])}")
        # Show error message for failed processing
        elif result.get('error'):
            print(f"      → Error: {result['error']}")
    
    print("=" * 70)
    print("\n💡 Next Steps:")
    print("   1. Run 'python scripts/prepare_vectordb.py' to filter and prepare chunks")
    print("   2. Run 'python scripts/build_vectordb.py' to create vector database")
    print("   3. Run 'python scripts/query_vectordb.py' to query the database")
    print("=" * 70)
    
    return results


# Entry point when script is run directly
if __name__ == "__main__":
    main()
