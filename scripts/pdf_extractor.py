"""
PDF Knowledge Extractor for Kidney Care Vector Database
Extracts, cleans, normalizes, chunks, and prepares medical text for vectorization
"""

import os
import re
import json
from pathlib import Path
from typing import List, Dict, Tuple
from datetime import datetime

import PyPDF2
import pdfplumber
from langdetect import detect
import nltk
from nltk.tokenize import sent_tokenize

# Download required NLTK data
try:
    nltk.data.find('tokenizers/punkt')
except LookupError:
    nltk.download('punkt')

try:
    nltk.data.find('tokenizers/punkt_tab')
except LookupError:
    nltk.download('punkt_tab')


class PDFKnowledgeExtractor:
    """Extract and process medical knowledge from PDF documents"""
    
    def __init__(self, pdf_path: str, output_dir: str = None):
        """
        Initialize the PDF extractor
        
        Args:
            pdf_path: Path to the PDF file
            output_dir: Directory to save processed chunks (default: data/processed)
        """
        self.pdf_path = pdf_path
        self.output_dir = output_dir or "data/processed"
        self.metadata = {}
        self.chunks = []
        
        # Create output directory
        os.makedirs(self.output_dir, exist_ok=True)
        
    def extract_text(self) -> str:
        """Extract raw text from PDF using multiple methods"""
        print(f"📄 Extracting text from: {self.pdf_path}")
        
        full_text = []
        
        # Method 1: Try pdfplumber (better for complex layouts)
        try:
            with pdfplumber.open(self.pdf_path) as pdf:
                self.metadata['total_pages'] = len(pdf.pages)
                print(f"   Total pages: {self.metadata['total_pages']}")
                
                for i, page in enumerate(pdf.pages, 1):
                    text = page.extract_text()
                    if text:
                        full_text.append(text)
                    
                    if i % 10 == 0:
                        print(f"   Processed {i}/{self.metadata['total_pages']} pages...")
        
        except Exception as e:
            print(f"⚠️  pdfplumber failed: {e}")
            print("   Trying PyPDF2...")
            
            # Fallback to PyPDF2
            try:
                with open(self.pdf_path, 'rb') as file:
                    pdf_reader = PyPDF2.PdfReader(file)
                    self.metadata['total_pages'] = len(pdf_reader.pages)
                    
                    for page in pdf_reader.pages:
                        text = page.extract_text()
                        if text:
                            full_text.append(text)
            except Exception as e2:
                print(f"❌ PyPDF2 also failed: {e2}")
                return ""
        
        combined_text = "\n".join(full_text)
        self.metadata['raw_text_length'] = len(combined_text)
        print(f"✅ Extracted {len(combined_text)} characters")
        
        return combined_text
    
    def clean_text(self, text: str) -> str:
        """Clean and normalize extracted text"""
        print("\n🧹 Cleaning text...")
        
        # Remove excessive whitespace
        text = re.sub(r'\s+', ' ', text)
        
        # Remove page numbers (common patterns)
        text = re.sub(r'\n\s*\d+\s*\n', '\n', text)
        text = re.sub(r'Page \d+', '', text, flags=re.IGNORECASE)
        
        # Fix hyphenated words at line breaks
        text = re.sub(r'(\w+)-\s+(\w+)', r'\1\2', text)
        
        # Remove multiple periods (often from table of contents)
        text = re.sub(r'\.{3,}', '', text)
        
        # Remove URLs (keep DOI for reference)
        text = re.sub(r'http[s]?://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\\(\\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+', '', text)
        
        # Normalize quotes
        text = text.replace('"', '"').replace('"', '"')
        text = text.replace(''', "'").replace(''', "'")
        
        # Remove excessive punctuation
        text = re.sub(r'([!?])\1+', r'\1', text)
        
        # Fix spacing around punctuation
        text = re.sub(r'\s+([.,!?;:])', r'\1', text)
        text = re.sub(r'([.,!?;:])\s*', r'\1 ', text)
        
        # Remove special characters but keep medical symbols
        # Keep: %, ±, ≥, ≤, °, μ, α, β, etc.
        text = re.sub(r'[^\w\s.,!?;:()\-±≥≤°μαβγδ%/]', '', text)
        
        # Normalize whitespace again
        text = re.sub(r'\s+', ' ', text)
        text = text.strip()
        
        self.metadata['cleaned_text_length'] = len(text)
        print(f"✅ Cleaned text: {len(text)} characters")
        
        return text
    
    def extract_metadata_from_content(self, text: str) -> Dict:
        """Extract metadata from document content"""
        print("\n📋 Extracting metadata...")
        
        metadata = {
            'source_file': os.path.basename(self.pdf_path),
            'extraction_date': datetime.now().isoformat(),
            'document_type': 'medical_guideline',
            'language': 'en'
        }
        
        # Try to detect language
        try:
            sample = text[:1000] if len(text) > 1000 else text
            metadata['language'] = detect(sample)
        except:
            pass
        
        # Extract title (usually in first few lines)
        lines = text.split('\n')[:20]
        for line in lines:
            if len(line) > 20 and len(line) < 200:
                metadata['title'] = line.strip()
                break
        
        # Look for KDIGO specific information
        if 'KDIGO' in text[:2000]:
            metadata['organization'] = 'KDIGO'
            metadata['guideline_type'] = 'Clinical Practice Guideline'
        
        # Extract year
        year_match = re.search(r'20\d{2}', text[:1000])
        if year_match:
            metadata['year'] = year_match.group()
        
        # Look for keywords
        keywords = []
        keyword_patterns = [
            r'chronic kidney disease', r'CKD', r'GFR', r'dialysis',
            r'kidney function', r'renal', r'nephrology', r'KDIGO',
            r'proteinuria', r'albuminuria', r'eGFR'
        ]
        
        for pattern in keyword_patterns:
            if re.search(pattern, text[:5000], re.IGNORECASE):
                keywords.append(pattern)
        
        metadata['keywords'] = keywords
        
        print(f"✅ Metadata extracted: {metadata.get('title', 'Unknown')[:50]}...")
        
        return metadata
    
    def is_useful_content(self, text: str) -> bool:
        """Filter out non-useful content like TOC, references, etc."""
        
        # Too short
        if len(text.split()) < 20:
            return False
        
        # Mostly numbers (likely a table or list)
        words = text.split()
        number_ratio = sum(1 for w in words if w.replace('.', '').isdigit()) / len(words)
        if number_ratio > 0.5:
            return False
        
        # Common non-content indicators
        skip_patterns = [
            r'^table of contents',
            r'^references\s*$',
            r'^bibliography\s*$',
            r'^index\s*$',
            r'^appendix\s+[a-z]',
            r'^\d+\s*$',  # Just page numbers
            r'^figure \d+',
            r'^table \d+',
        ]
        
        text_lower = text.lower().strip()
        for pattern in skip_patterns:
            if re.match(pattern, text_lower):
                return False
        
        # Must contain some medical/kidney-related content
        medical_terms = [
            'kidney', 'renal', 'ckd', 'gfr', 'dialysis', 'patient',
            'disease', 'treatment', 'clinical', 'medical', 'health',
            'therapy', 'diagnosis', 'symptom', 'recommendation'
        ]
        
        has_medical_term = any(term in text_lower for term in medical_terms)
        
        return has_medical_term
    
    def chunk_text(self, text: str, chunk_size: int = 500, overlap: int = 50) -> List[Dict]:
        """
        Split text into meaningful chunks with overlap
        
        Args:
            text: Cleaned text to chunk
            chunk_size: Target number of words per chunk
            overlap: Number of words to overlap between chunks
        """
        print(f"\n✂️  Chunking text (chunk_size={chunk_size}, overlap={overlap})...")
        
        # Split into sentences
        sentences = sent_tokenize(text)
        
        chunks = []
        current_chunk = []
        current_word_count = 0
        chunk_id = 0
        
        for sentence in sentences:
            sentence = sentence.strip()
            if not sentence:
                continue
            
            words = sentence.split()
            word_count = len(words)
            
            # If adding this sentence exceeds chunk size, save current chunk
            if current_word_count + word_count > chunk_size and current_chunk:
                chunk_text = ' '.join(current_chunk)
                
                # Only save if it's useful content
                if self.is_useful_content(chunk_text):
                    chunks.append({
                        'chunk_id': chunk_id,
                        'text': chunk_text,
                        'word_count': current_word_count,
                        'char_count': len(chunk_text),
                        'sentence_count': len(current_chunk)
                    })
                    chunk_id += 1
                
                # Keep last few sentences for overlap
                overlap_sentences = []
                overlap_words = 0
                for s in reversed(current_chunk):
                    s_words = len(s.split())
                    if overlap_words + s_words <= overlap:
                        overlap_sentences.insert(0, s)
                        overlap_words += s_words
                    else:
                        break
                
                current_chunk = overlap_sentences
                current_word_count = overlap_words
            
            current_chunk.append(sentence)
            current_word_count += word_count
        
        # Add final chunk
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
        """Add metadata to each chunk"""
        print("\n🏷️  Adding metadata to chunks...")
        
        for i, chunk in enumerate(chunks):
            # Add document-level metadata
            chunk['metadata'] = {
                **doc_metadata,
                'chunk_index': i,
                'total_chunks': len(chunks),
                'position': f"{i+1}/{len(chunks)}"
            }
            
            # Extract section if possible (look for headers)
            text = chunk['text']
            section_match = re.match(r'^([A-Z][A-Za-z\s]+:|\d+\.\s+[A-Z][A-Za-z\s]+)', text)
            if section_match:
                chunk['metadata']['section'] = section_match.group().strip()
            
            # Identify content type
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
            
            # Extract key medical terms
            medical_entities = []
            patterns = {
                'CKD': r'\bCKD\b',
                'GFR': r'\b[e]?GFR\b',
                'dialysis': r'\bdialysis\b',
                'proteinuria': r'\bproteinuria\b',
                'albuminuria': r'\balbuminuria\b',
                'hypertension': r'\bhypertension\b',
                'diabetes': r'\bdiabetes\b'
            }
            
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


def main():
    """Main execution function"""
    
    # Configuration
    PDF_PATH = "data/raw/KDIGO-2024-CKD-Guideline.pdf"
    OUTPUT_DIR = "data/processed"
    CHUNK_SIZE = 500  # words per chunk
    OVERLAP = 50      # words overlap between chunks
    
    # Initialize extractor
    extractor = PDFKnowledgeExtractor(PDF_PATH, OUTPUT_DIR)
    
    # Process the PDF
    output_file = extractor.process(
        chunk_size=CHUNK_SIZE,
        overlap=OVERLAP,
        save_format='json'
    )
    
    return output_file


if __name__ == "__main__":
    main()
