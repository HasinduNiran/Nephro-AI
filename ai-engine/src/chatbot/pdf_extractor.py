import os
import re
import json
import sys
import numpy as np
from pathlib import Path
from typing import List, Dict, Tuple
from datetime import datetime
import tkinter as tk
from tkinter import filedialog
import logging

# Add parent directory to path for config import
sys.path.insert(0, str(Path(__file__).parent.parent))

# Import project configuration
from chatbot import config

# Third-party libraries for PDF processing and NLP
import PyPDF2
import pdfplumber
from langdetect import detect
import nltk
from nltk.tokenize import sent_tokenize  # Split text into sentences

# Docling import guard (optional dependency for layout-aware parsing)
try:
    from docling.document_converter import DocumentConverter
    from docling.datamodel.pipeline_options import PipelineOptions
    DOCLING_AVAILABLE = True
except ImportError:
    DOCLING_AVAILABLE = False

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


    def __init__(self, pdf_path: str, output_dir: str = None):

        self.pdf_path = pdf_path
        self.output_dir = output_dir or str(config.PROCESSED_DATA_DIR)
        self.metadata = {}  # Stores document-level info (pages, length, title, etc.)
        self.chunks = []    # Stores processed text chunks

        # Track extraction format: 'plaintext' (legacy) or 'markdown' (Docling)
        self.extraction_format = 'plaintext'

        # Load configuration settings
        self.medical_entities = config.get_medical_entities()
        self.content_type_keywords = config.get_content_types()
        self.chunk_settings = config.get_chunk_config()
        self.docling_config = config.get_docling_config()
        self.markdown_chunk_config = config.get_markdown_chunk_config()
        self.semantic_chunk_config = config.get_semantic_chunk_config()

        # Lazy-loaded embedding model for semantic sub-chunking
        self._embedding_model = None

        # Create output directory if it doesn't exist
        os.makedirs(self.output_dir, exist_ok=True)

    @property
    def embedding_model(self):
        """Lazy-load embedding model only when semantic sub-chunking is needed."""
        if self._embedding_model is None:
            from chatbot.openai_embeddings import OpenAIEmbeddings
            self._embedding_model = OpenAIEmbeddings(
                api_key=config.OPENROUTER_API_KEY,
                model=config.EMBEDDING_MODEL
            )
            print("   Loaded embedding model for semantic sub-chunking")
        return self._embedding_model

    def _cosine_similarity(self, vec_a, vec_b) -> float:
        """Compute cosine similarity between two vectors."""
        a = np.array(vec_a)
        b = np.array(vec_b)
        dot = np.dot(a, b)
        norm_a = np.linalg.norm(a)
        norm_b = np.linalg.norm(b)
        if norm_a == 0 or norm_b == 0:
            return 0.0
        return float(dot / (norm_a * norm_b))

    def extract_text_as_markdown(self) -> str:
        """
        Extract text from PDF using Docling for layout-aware Markdown output.

        Returns:
            Markdown string with headers, tables, and structure preserved,
            or empty string on failure.
        """
        if not DOCLING_AVAILABLE:
            print("   Docling not installed, skipping Markdown extraction")
            return ""

        if not self.docling_config.get('enabled', True):
            print("   Docling disabled in config, skipping")
            return ""

        print("   Trying Docling layout-aware extraction...")

        ocr_enabled = self.docling_config.get('ocr_enabled', False)
        timeout_seconds = self.docling_config.get('timeout_seconds', 60)

        try:
            pipeline_options = PipelineOptions(do_ocr=ocr_enabled)
            converter = DocumentConverter(pipeline_options=pipeline_options)

            # Wrap the blocking call in a strict timeout so a bad PDF can't hang the pipeline
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
                future = executor.submit(converter.convert, self.pdf_path)
                try:
                    result = future.result(timeout=timeout_seconds)
                except concurrent.futures.TimeoutError:
                    print(f"   Docling timed out after {timeout_seconds}s — falling back to pdfplumber")
                    raise RuntimeError(f"Docling conversion timed out after {timeout_seconds} seconds")

            markdown_text = result.document.export_to_markdown()

            if not markdown_text or len(markdown_text.strip()) < 100:
                print("   Docling returned insufficient text, skipping")
                return ""

            # Replace opaque ![Image]() placeholders with VLM-generated captions
            markdown_text = self._caption_images_in_markdown(result, markdown_text)

            # Set metadata
            self.metadata['extraction_method'] = 'docling'
            self.metadata['raw_text_length'] = len(markdown_text)

            # Estimate page count from the PDF using PyPDF2 (Docling doesn't expose it directly)
            try:
                with open(self.pdf_path, 'rb') as f:
                    reader = PyPDF2.PdfReader(f)
                    self.metadata['total_pages'] = len(reader.pages)
            except Exception:
                self.metadata['total_pages'] = 'N/A'

            print(f"   Docling extracted {len(markdown_text)} characters as Markdown")
            return markdown_text

        except Exception as e:
            print(f"   Docling extraction failed: {e}")
            return ""

    def _caption_images_in_markdown(self, docling_result, markdown_text: str) -> str:
        """
        Replace Docling's opaque ![Image]() placeholders with one-sentence VLM captions
        generated by Gemini. Returns markdown_text unchanged if captioning is disabled,
        GOOGLE_API_KEY is absent, or the document contains no pictures.
        """
        if not self.docling_config.get('vlm_image_captioning', True):
            return markdown_text

        api_key = config.GOOGLE_API_KEY
        if not api_key:
            return markdown_text

        pictures = getattr(getattr(docling_result, 'document', None), 'pictures', [])
        if not pictures:
            return markdown_text

        # Cap at 10 images to avoid burning through API quota on large guideline PDFs
        max_images = 10
        pictures = list(pictures)[:max_images]
        vlm_model = self.docling_config.get('vlm_model', 'gemini-2.5-flash')

        print(f"   Captioning {len(pictures)} figure(s) via {vlm_model}...")

        try:
            genai_client = genai.Client(api_key=api_key)
        except Exception as e:
            print(f"   VLM client init failed: {e} — skipping image captioning")
            return markdown_text

        prompt = (
            "You are a medical imaging assistant. "
            "Describe this figure from a medical document in one concise sentence "
            "suitable for use in a Retrieval-Augmented Generation (RAG) system."
        )

        for i, picture in enumerate(pictures):
            try:
                # Rate-limit: 1-second pause between Gemini API calls
                if i > 0:
                    time.sleep(1)

                # Convert PIL image to PNG bytes
                pil_image = picture.image.pil_image
                buf = io.BytesIO()
                pil_image.save(buf, format="PNG")
                image_bytes = buf.getvalue()

                # Build a Gemini-compatible image Part
                from google.genai import types as genai_types
                image_part = genai_types.Part.from_bytes(data=image_bytes, mime_type="image/png")

                response = genai_client.models.generate_content(
                    model=vlm_model,
                    contents=[image_part, prompt]
                )
                caption = response.text.strip().replace('\n', ' ')

                # Replace the next unused ![...](...)  placeholder with the caption text.
                # Uses regex so it handles any alt-text or path Docling may generate.
                replacement = f"[Figure {i + 1}: {caption}]"
                markdown_text = re.sub(r'!\[.*?\]\(.*?\)', replacement, markdown_text, count=1)
                print(f"   Figure {i + 1}/{len(pictures)} captioned")

            except Exception as e:
                print(f"   Figure {i + 1} captioning failed: {e} — leaving placeholder")
                continue

        return markdown_text

    def extract_text(self) -> str:

        print(f" Extracting text from: {self.pdf_path}")

        # Handle plain text files directly
        if self.pdf_path.lower().endswith('.txt'):
            try:
                with open(self.pdf_path, 'r', encoding='utf-8') as f:
                    text = f.read()
                self.metadata['total_pages'] = 1
                self.metadata['raw_text_length'] = len(text)
                self.metadata['extraction_method'] = 'plaintext_file'
                print(f" Extracted {len(text)} characters from text file")
                return text
            except Exception as e:
                print(f" Failed to read text file: {e}")
                return ""

        # Try Docling first for PDF files (layout-aware Markdown extraction)
        if self.pdf_path.lower().endswith('.pdf'):
            markdown_text = self.extract_text_as_markdown()
            if markdown_text:
                self.extraction_format = 'markdown'
                return markdown_text

        # Fallback: Process PDF files with pdfplumber/PyPDF2 (legacy plaintext)
        self.metadata['extraction_method'] = 'pdfplumber'
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
            print(f"   pdfplumber failed: {e}")
            print("   Trying PyPDF2...")
            self.metadata['extraction_method'] = 'pypdf2'

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
                print(f" PyPDF2 also failed: {e2}")
                return ""  # Both methods failed

        combined_text = "\n".join(full_text)
        self.metadata['raw_text_length'] = len(combined_text)
        print(f" Extracted {len(combined_text)} characters")

        return combined_text

    def clean_markdown_text(self, text: str) -> str:
        """
        Clean Markdown text while preserving structural characters (#, |, -, *).
        Used when extraction_format is 'markdown' (Docling output).
        """
        print("\n Cleaning Markdown text...")

        # NOTE: Abbreviation expansion is intentionally NOT applied to ingested text.
        # Expanding at ingest mutates source fidelity (the LLM would cite inflated terms
        # instead of natural abbreviations) and inflates chunk sizes. Expansion happens
        # only at query time inside the NLU engine.

        # Remove page numbers
        text = re.sub(r'\n\s*\d+\s*\n', '\n', text)
        text = re.sub(r'Page \d+', '', text, flags=re.IGNORECASE)

        # Fix hyphenated words split across lines
        text = re.sub(r'(\w+)-\s*\n\s*(\w+)', r'\1\2', text)

        # Remove multiple periods (TOC artifacts)
        text = re.sub(r'\.{3,}', '', text)

        # Remove URLs but keep DOIs
        text = re.sub(r'http[s]?://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\\(\\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+', '', text)

        # Normalize smart quotes
        text = text.replace('\u201c', '"').replace('\u201d', '"')
        text = text.replace('\u2018', "'").replace('\u2019', "'")

        # Remove excessive punctuation
        text = re.sub(r'([!?])\1+', r'\1', text)

        # Normalize multiple blank lines to double newline (preserve structure)
        text = re.sub(r'\n{3,}', '\n\n', text)

        # Normalize spaces within lines (but preserve newlines)
        lines = text.split('\n')
        cleaned_lines = []
        for line in lines:
            line = re.sub(r'[ \t]+', ' ', line).strip()
            cleaned_lines.append(line)
        text = '\n'.join(cleaned_lines)

        self.metadata['cleaned_text_length'] = len(text)
        print(f" Cleaned Markdown text: {len(text)} characters")

        return text

    def clean_text(self, text: str) -> str:

        # Route to Markdown-safe cleaning if extraction was via Docling
        if self.extraction_format == 'markdown':
            return self.clean_markdown_text(text)

        print("\n Cleaning text...")

        # NOTE: Abbreviation expansion is intentionally NOT applied to ingested text.
        # See clean_markdown_text() comment for rationale.

        # Remove excessive whitespace (multiple spaces, tabs, newlines -> single space)
        text = re.sub(r'\s+', ' ', text)

        # Remove page numbers (common patterns in PDFs)
        text = re.sub(r'\n\s*\d+\s*\n', '\n', text)  # Standalone page numbers
        text = re.sub(r'Page \d+', '', text, flags=re.IGNORECASE)  # "Page N" format

        # Fix hyphenated words split across line breaks (e.g., "treat- ment" -> "treatment")
        text = re.sub(r'(\w+)-\s+(\w+)', r'\1\2', text)

        # Remove multiple periods (often from table of contents: "Section 1.2.....45")
        text = re.sub(r'\.{3,}', '', text)

        # Remove URLs but keep DOIs (for academic references)
        text = re.sub(r'http[s]?://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\\(\\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+', '', text)

        # Normalize smart quotes to regular quotes
        text = text.replace('\u201c', '"').replace('\u201d', '"')  # Curly double quotes
        text = text.replace('\u2018', "'").replace('\u2019', "'")  # Curly single quotes

        # Remove excessive punctuation (e.g., "!!!" -> "!", "???" -> "?")
        text = re.sub(r'([!?])\1+', r'\1', text)

        # Fix spacing around punctuation
        text = re.sub(r'\s+([.,!?;:])', r'\1', text)      # Remove space before punctuation
        text = re.sub(r'([.,!?;:])\s*', r'\1 ', text)     # Ensure space after punctuation

        # Remove special characters BUT preserve important medical symbols
        # Keep: %, +/-, >=, <=, degree, micro, alpha, beta, gamma, delta
        text = re.sub(r'[^\w\s.,!?;:()\-\u00b1\u2265\u2264\u00b0\u03bc\u03b1\u03b2\u03b3\u03b4%/]', '', text)

        # Final whitespace normalization
        text = re.sub(r'\s+', ' ', text)
        text = text.strip()

        # Store cleaned text length for statistics
        self.metadata['cleaned_text_length'] = len(text)
        print(f" Cleaned text: {len(text)} characters")

        return text

    # expand_abbreviations() removed from the ingestion path.
    # Abbreviation expansion is query-time only (see NLUEngine._expand_abbreviations).
    # This preserves source text fidelity, prevents false-positive expansions on
    # medical shorthand like "N/A" or "Vitamin K", and eliminates O(N*M) regex overhead
    # during vectordb ingestion.

    def extract_metadata_from_content(self, text: str) -> Dict:

        print("\n Extracting metadata...")

        # Initialize metadata with basic information
        metadata = {
            'source_file': os.path.basename(self.pdf_path),
            'extraction_date': datetime.now().isoformat(),
            'document_type': 'medical_guideline',
            'language': 'en',  # Default to English
            'extraction_method': self.metadata.get('extraction_method', 'unknown')
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
            # Strip Markdown header markers for title extraction
            clean_line = re.sub(r'^#+\s*', '', line).strip()
            if len(clean_line) > 20 and len(clean_line) < 200:  # Reasonable title length
                metadata['title'] = clean_line
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

        print(f" Metadata extracted: {metadata.get('title', 'Unknown')[:50]}...")

        return metadata

    def is_useful_content(self, text: str) -> bool:


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

        # Strip Markdown header markers before checking patterns
        text_for_check = re.sub(r'^#+\s*', '', text).strip()
        text_lower = text_for_check.lower()
        for pattern in skip_patterns:
            if re.match(pattern, text_lower):
                return False

        # Filter 4: Must contain medical/kidney-related terminology
        # This ensures we keep domain-relevant content
        # Use comprehensive list from config instead of hardcoded terms
        text_lower = text.lower()
        has_medical_term = any(
            entity.lower() in text_lower
            for entity in self.medical_entities
        )

        return has_medical_term

    def semantic_sub_chunk(self, text: str, header_path: str = "") -> List[Dict]:
        """
        Split a long section into sub-chunks based on sentence embedding similarity.
        Groups consecutive sentences that are semantically related.

        Args:
            text: The section text to sub-chunk
            header_path: The header hierarchy path (e.g., "Chapter 1 > Section 1.2")

        Returns:
            List of chunk dicts with text, word_count, and metadata
        """
        cfg = self.semantic_chunk_config
        threshold = cfg.get('similarity_threshold', 0.75)
        min_sentences = cfg.get('min_chunk_sentences', 2)
        max_words = cfg.get('max_chunk_words', 300)

        sentences = sent_tokenize(text)

        if len(sentences) <= min_sentences:
            return [{
                'text': text,
                'word_count': len(text.split()),
                'char_count': len(text),
                'sentence_count': len(sentences),
                'section_path': header_path,
                'chunking_method': 'semantic_single'
            }]

        # Generate embeddings for all sentences
        print(f"      Generating embeddings for {len(sentences)} sentences...")
        embeddings = self.embedding_model.encode(sentences, show_progress_bar=False)

        # Find split points where similarity drops below threshold
        split_indices = [0]  # Always start at beginning
        for i in range(1, len(embeddings)):
            sim = self._cosine_similarity(embeddings[i - 1], embeddings[i])
            if sim < threshold:
                split_indices.append(i)
        split_indices.append(len(sentences))  # End marker

        # Build sub-chunks from split points
        sub_chunks = []
        for idx in range(len(split_indices) - 1):
            start = split_indices[idx]
            end = split_indices[idx + 1]

            # Enforce minimum sentence count: merge small groups with next
            if end - start < min_sentences and idx < len(split_indices) - 2:
                continue  # Will be merged into the next group

            chunk_sentences = sentences[start:end]
            chunk_text = ' '.join(chunk_sentences)
            chunk_words = len(chunk_text.split())

            # If still too large, do a simple word-based split
            if chunk_words > max_words * 2:
                words = chunk_text.split()
                for wi in range(0, len(words), max_words):
                    segment = ' '.join(words[wi:wi + max_words])
                    sub_chunks.append({
                        'text': segment,
                        'word_count': len(segment.split()),
                        'char_count': len(segment),
                        'sentence_count': len(sent_tokenize(segment)),
                        'section_path': header_path,
                        'sub_chunk_index': len(sub_chunks),
                        'chunking_method': 'semantic_word_split'
                    })
            else:
                sub_chunks.append({
                    'text': chunk_text,
                    'word_count': chunk_words,
                    'char_count': len(chunk_text),
                    'sentence_count': len(chunk_sentences),
                    'section_path': header_path,
                    'sub_chunk_index': len(sub_chunks),
                    'chunking_method': 'semantic'
                })

        # Handle edge case: if merging left us with nothing, return the whole text as one chunk
        if not sub_chunks:
            sub_chunks.append({
                'text': text,
                'word_count': len(text.split()),
                'char_count': len(text),
                'sentence_count': len(sentences),
                'section_path': header_path,
                'chunking_method': 'semantic_fallback'
            })

        return sub_chunks

    def chunk_text_by_headers(self, markdown_text: str) -> List[Dict]:
        """
        Chunk Markdown text by header structure (structural chunking).

        Splits on # headers, tracks header hierarchy, and applies:
        - Merge: sections < min_words are merged with the next section
        - Pass-through: sections within [min_words, max_words] become single chunks
        - Sub-chunk: sections > max_words are split via semantic_sub_chunk()

        Args:
            markdown_text: Cleaned Markdown text from Docling

        Returns:
            List of chunk dicts in standard format
        """
        cfg = self.markdown_chunk_config
        split_headers = cfg.get('split_headers', ['#', '##', '###', '####'])
        max_words = cfg.get('max_section_words', 300)
        min_words = cfg.get('min_section_words', 30)
        preserve_header = cfg.get('preserve_header_in_chunk', True)

        print(f"\n   Chunking Markdown by headers (max={max_words}, min={min_words} words)...")

        # Parse Markdown into sections
        lines = markdown_text.split('\n')
        sections = []  # List of (header_level, header_text, body_text)
        current_header = ""
        current_level = 0
        current_body_lines = []

        # Header pattern: one or more # followed by space and text
        header_pattern = re.compile(r'^(#{1,6})\s+(.+)$')

        for line in lines:
            match = header_pattern.match(line)
            if match:
                # Save previous section
                if current_body_lines or current_header:
                    body = '\n'.join(current_body_lines).strip()
                    sections.append((current_level, current_header, body))

                # Check if this header level is in our split list
                hashes = match.group(1)
                header_marker = hashes  # e.g., "##"
                header_text = match.group(2).strip()

                if header_marker in split_headers:
                    current_level = len(hashes)
                    current_header = header_text
                    current_body_lines = []
                else:
                    # Header level not in split list; treat as body content
                    current_body_lines.append(line)
            else:
                current_body_lines.append(line)

        # Don't forget the last section
        if current_body_lines or current_header:
            body = '\n'.join(current_body_lines).strip()
            sections.append((current_level, current_header, body))

        print(f"   Found {len(sections)} sections from headers")

        # Build header hierarchy path for each section using a stack
        header_stack = []  # Stack of (level, header_text)
        chunks = []
        chunk_id = 0
        pending_merge = ""  # Text from sections too short to stand alone
        pending_path = ""

        for level, header, body in sections:
            # Update header stack
            if level > 0:
                # Pop headers at same or deeper level
                while header_stack and header_stack[-1][0] >= level:
                    header_stack.pop()
                header_stack.append((level, header))

            # Build section path from stack
            section_path = ' > '.join(h[1] for h in header_stack)

            # Construct the full section text
            if preserve_header and header:
                section_text = f"{'#' * level} {header}\n{body}" if level > 0 else body
            else:
                section_text = body

            # Prepend any pending merge text
            if pending_merge:
                section_text = pending_merge + '\n' + section_text
                if not section_path:
                    section_path = pending_path
                pending_merge = ""
                pending_path = ""

            section_text = section_text.strip()
            if not section_text:
                continue

            word_count = len(section_text.split())

            # Decision: merge, pass-through, or sub-chunk
            if word_count < min_words:
                # Too short: queue for merging with next section
                pending_merge = section_text
                pending_path = section_path
                continue

            elif word_count <= max_words:
                # Good size: create a single chunk
                if self.is_useful_content(section_text):
                    chunks.append({
                        'chunk_id': chunk_id,
                        'text': section_text,
                        'word_count': word_count,
                        'char_count': len(section_text),
                        'sentence_count': len(sent_tokenize(section_text)),
                        'section_path': section_path,
                        'header_level': level,
                        'chunking_method': 'structural'
                    })
                    chunk_id += 1

            else:
                # Too long: apply semantic sub-chunking
                if self.semantic_chunk_config.get('enabled', True):
                    print(f"      Sub-chunking long section ({word_count} words): {header[:40]}...")
                    sub_chunks = self.semantic_sub_chunk(section_text, section_path)
                    for sc in sub_chunks:
                        if self.is_useful_content(sc['text']):
                            sc['chunk_id'] = chunk_id
                            sc['header_level'] = level
                            chunks.append(sc)
                            chunk_id += 1
                else:
                    # Semantic disabled: simple word-based split
                    words = section_text.split()
                    for wi in range(0, len(words), max_words):
                        segment = ' '.join(words[wi:wi + max_words])
                        if self.is_useful_content(segment):
                            chunks.append({
                                'chunk_id': chunk_id,
                                'text': segment,
                                'word_count': len(segment.split()),
                                'char_count': len(segment),
                                'sentence_count': len(sent_tokenize(segment)),
                                'section_path': section_path,
                                'header_level': level,
                                'chunking_method': 'structural_word_split'
                            })
                            chunk_id += 1

        # Handle any remaining pending merge text
        if pending_merge:
            if self.is_useful_content(pending_merge):
                chunks.append({
                    'chunk_id': chunk_id,
                    'text': pending_merge,
                    'word_count': len(pending_merge.split()),
                    'char_count': len(pending_merge),
                    'sentence_count': len(sent_tokenize(pending_merge)),
                    'section_path': pending_path,
                    'header_level': 0,
                    'chunking_method': 'structural_remainder'
                })

        print(f" Created {len(chunks)} chunks from Markdown headers")

        return chunks

    def chunk_text(self, text: str, chunk_size: int = 500, overlap: int = 50) -> List[Dict]:
        """Legacy fixed-size chunking using NLTK sentence tokenization."""

        print(f"\n   Chunking text (chunk_size={chunk_size}, overlap={overlap})...")

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
                        'sentence_count': len(current_chunk),
                        'chunking_method': 'legacy_fixed_size'
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
                    'sentence_count': len(current_chunk),
                    'chunking_method': 'legacy_fixed_size'
                })

        print(f" Created {len(chunks)} chunks")

        return chunks

    def add_metadata_to_chunks(self, chunks: List[Dict], doc_metadata: Dict) -> List[Dict]:

        print("\n   Adding metadata to chunks...")

        for i, chunk in enumerate(chunks):
            # Start with document-level metadata (source file, year, etc.)
            chunk['metadata'] = {
                **doc_metadata,  # Spread operator: include all doc metadata
                'chunk_index': i,
                'total_chunks': len(chunks),
                'position': f"{i+1}/{len(chunks)}"  # Human-readable position
            }

            # Preserve structural metadata if already set by header chunking
            if 'section_path' in chunk:
                chunk['metadata']['section_path'] = chunk['section_path']
                chunk['metadata']['section'] = chunk['section_path'].split(' > ')[-1] if chunk['section_path'] else ''
            elif 'section' not in chunk.get('metadata', {}):
                # Try to extract section header for legacy chunks
                text = chunk['text']
                section_match = re.match(r'^([A-Z][A-Za-z\s]+:|\d+\.\s+[A-Z][A-Za-z\s]+)', text)
                if section_match:
                    chunk['metadata']['section'] = section_match.group().strip()

            if 'header_level' in chunk:
                chunk['metadata']['header_level'] = chunk['header_level']

            if 'chunking_method' in chunk:
                chunk['metadata']['chunking_method'] = chunk['chunking_method']

            if 'sub_chunk_index' in chunk:
                chunk['metadata']['sub_chunk_index'] = chunk['sub_chunk_index']

            # Classify content type using enhanced keyword matching from config
            text = chunk['text']
            text_lower = text.lower()
            content_type = 'general'  # Default
            max_matches = 0

            # Check each content type and count keyword matches
            for ctype, keywords in self.content_type_keywords.items():
                matches = sum(1 for keyword in keywords if keyword.lower() in text_lower)
                if matches > max_matches:
                    max_matches = matches
                    content_type = ctype

            chunk['metadata']['content_type'] = content_type
            chunk['metadata']['content_type_confidence'] = max_matches

            # Detect medical entities using comprehensive list from config
            medical_entities = []
            text_lower = text.lower()

            # Check each medical entity from config
            for entity in self.medical_entities:
                # Use word boundaries for accurate matching
                pattern = r'\b' + re.escape(entity.lower()) + r'\b'
                if re.search(pattern, text_lower):
                    medical_entities.append(entity)

            # Remove duplicates and limit to top 10 for cleaner metadata
            medical_entities = list(dict.fromkeys(medical_entities))[:10]

            chunk['metadata']['medical_entities'] = medical_entities
            chunk['metadata']['entity_count'] = len(medical_entities)

            # Clean up temporary keys from chunk dict (they live in metadata now)
            for key in ['section_path', 'header_level', 'chunking_method', 'sub_chunk_index']:
                chunk.pop(key, None)

        print(f" Metadata added to all chunks")

        return chunks

    def save_chunks(self, chunks: List[Dict], format: str = 'json'):
        """Save processed chunks to file"""

        # Create filename based on source PDF
        base_name = Path(self.pdf_path).stem

        if format == 'json':
            output_file = os.path.join(self.output_dir, f"{base_name}_chunks.json")
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(chunks, f, indent=2, ensure_ascii=False)
            print(f"\n Saved JSON chunks to: {output_file}")

        elif format == 'txt':
            output_file = os.path.join(self.output_dir, f"{base_name}_chunks.txt")
            with open(output_file, 'w', encoding='utf-8') as f:
                for chunk in chunks:
                    f.write(f"=== CHUNK {chunk['chunk_id']} ===\n")
                    f.write(f"Metadata: {json.dumps(chunk['metadata'], indent=2)}\n")
                    f.write(f"{chunk['text']}\n\n")
            print(f" Saved TXT chunks to: {output_file}")

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

        print(f" Saved metadata to: {metadata_file}")

        return output_file

    def process(self, chunk_size: int = 500, overlap: int = 50, save_format: str = 'json'):

        print("=" * 70)
        print(" STARTING PDF KNOWLEDGE EXTRACTION PIPELINE")
        print("=" * 70)

        # Step 1: Extract text
        raw_text = self.extract_text()
        if not raw_text:
            print(" Failed to extract text from PDF")
            return None

        # Step 2: Clean text
        cleaned_text = self.clean_text(raw_text)

        # Step 3: Extract metadata
        doc_metadata = self.extract_metadata_from_content(cleaned_text)
        self.metadata.update(doc_metadata)

        # Step 4: Chunk text (route based on extraction format)
        if self.extraction_format == 'markdown':
            print("\n   Using structural Markdown chunking (Docling pipeline)")
            chunks = self.chunk_text_by_headers(cleaned_text)
        else:
            print("\n   Using legacy fixed-size chunking (plaintext pipeline)")
            chunks = self.chunk_text(cleaned_text, chunk_size, overlap)

        # Step 5: Add metadata
        chunks = self.add_metadata_to_chunks(chunks, doc_metadata)

        self.chunks = chunks

        # Step 6: Save results
        output_file = self.save_chunks(chunks, save_format)

        # Print summary
        print("\n" + "=" * 70)
        print(" PROCESSING SUMMARY")
        print("=" * 70)
        print(f"Source: {self.pdf_path}")
        print(f"Extraction method: {self.metadata.get('extraction_method', 'N/A')}")
        print(f"Total pages: {self.metadata.get('total_pages', 'N/A')}")
        print(f"Raw text length: {self.metadata.get('raw_text_length', 0):,} characters")
        print(f"Cleaned text length: {self.metadata.get('cleaned_text_length', 0):,} characters")
        print(f"Total chunks created: {len(chunks)}")
        if chunks:
            print(f"Average chunk size: {sum(c['word_count'] for c in chunks) / len(chunks):.1f} words")
            print(f"Chunk size range: {min(c['word_count'] for c in chunks)} - {max(c['word_count'] for c in chunks)} words")
        print(f"Output file: {output_file}")
        print("=" * 70)
        print(" PROCESSING COMPLETE!")
        print("=" * 70)

        return output_file


def select_files():

    print("=" * 70)
    print(" FILE SELECTOR")
    print("=" * 70)
    print("Please select one or more PDF/text files to process...")
    print(" Tip: Hold Ctrl to select multiple files")
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
        print(f" Selected {len(file_paths)} file(s):")
        for i, fp in enumerate(file_paths, 1):
            print(f"   {i}. {os.path.basename(fp)}")
        print()
        return list(file_paths)  # Convert tuple to list
    else:
        print(" No files selected. Exiting...\n")
        return []


def main():


    # Step 1: Open file dialog to select files
    file_paths = select_files()

    if not file_paths:
        print("   No files selected. Exiting...")
        return None

    # Step 2: Configuration - load from config.py for consistency
    OUTPUT_DIR = str(config.PROCESSED_DATA_DIR)  # Where to save processed chunks
    chunk_config = config.get_chunk_config()
    CHUNK_SIZE = chunk_config.get('max_words', 600)  # Target words per chunk
    OVERLAP = chunk_config.get('overlap_sentences', 2) * 10  # Convert sentences to ~words

    print("=" * 70)
    print("   CONFIGURATION")
    print("=" * 70)
    print(f"Files to process: {len(file_paths)}")
    print(f"Output Directory: {OUTPUT_DIR}")
    print(f"Chunk Size: {CHUNK_SIZE} words (legacy fallback)")
    print(f"Overlap: {OVERLAP} words (legacy fallback)")
    docling_status = "ENABLED" if DOCLING_AVAILABLE and config.get_docling_config().get('enabled') else "DISABLED"
    print(f"Docling extraction: {docling_status}")
    print("=" * 70)
    print()

    # Step 3: Process each file through the pipeline
    results = []       # Store processing results for each file
    successful = 0     # Count of successfully processed files
    failed = 0         # Count of failed files

    for idx, file_path in enumerate(file_paths, 1):
        print("\n" + "=" * 70)
        print(f" PROCESSING FILE {idx}/{len(file_paths)}")
        print("=" * 70)
        print(f"File: {os.path.basename(file_path)}")
        print("=" * 70)

        # Validation: Check if file exists
        if not os.path.exists(file_path):
            print(f" Error: File does not exist: {file_path}")
            failed += 1
            continue

        # Validation: Check file extension
        if not (file_path.lower().endswith('.pdf') or file_path.lower().endswith('.txt')):
            print(f" Error: File must be PDF or TXT: {file_path}")
            failed += 1
            continue

        try:
            # Initialize the extractor for this file
            extractor = PDFKnowledgeExtractor(file_path, OUTPUT_DIR)

            # Run the complete processing pipeline:
            # Extract -> Clean -> Metadata -> Chunk -> Enrich -> Save
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
                    'status': 'success',
                    'method': extractor.metadata.get('extraction_method', 'unknown')
                })
                successful += 1
                print(f"\n File {idx}/{len(file_paths)} processed successfully!")
            else:
                results.append({
                    'input': file_path,
                    'output': None,
                    'status': 'failed'
                })
                failed += 1
                print(f"\n File {idx}/{len(file_paths)} failed to process!")

        except Exception as e:
            # Catch any unexpected errors during processing
            print(f"\n Error processing file: {e}")
            results.append({
                'input': file_path,
                'output': None,
                'status': 'error',
                'error': str(e)
            })
            failed += 1

    # Step 4: Print comprehensive summary report
    print("\n" + "=" * 70)
    print(" BATCH PROCESSING COMPLETE!")
    print("=" * 70)
    print(f"Total files: {len(file_paths)}")
    print(f" Successful: {successful}")
    print(f" Failed: {failed}")
    print(f" Output directory: {OUTPUT_DIR}")
    print("\n Results:")

    # List each file with its status
    for i, result in enumerate(results, 1):
        status_icon = "OK" if result['status'] == 'success' else "FAIL"
        filename = os.path.basename(result['input'])
        method = result.get('method', '')
        method_str = f" [{method}]" if method else ""
        print(f"   {i}. {status_icon} {filename}{method_str}")

        # Show output file for successful processing
        if result['status'] == 'success':
            print(f"      -> {os.path.basename(result['output'])}")
        # Show error message for failed processing
        elif result.get('error'):
            print(f"      -> Error: {result['error']}")

    print("=" * 70)
    print("\n Next Steps:")
    print("   1. Run 'python scripts/prepare_vectordb.py' to filter and prepare chunks")
    print("   2. Run 'python scripts/build_vectordb.py' to create vector database")
    print("   3. Run 'python scripts/query_vectordb.py' to query the database")
    print("=" * 70)

    return results


# Entry point when script is run directly
if __name__ == "__main__":
    main()
