import os
import re
import json
import sys
import logging
import numpy as np
from pathlib import Path
from typing import List, Dict, Tuple
from datetime import datetime
import tkinter as tk
from tkinter import filedialog
import concurrent.futures
import time
import io
import tempfile
from tqdm import tqdm
from google import genai

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
    from docling.document_converter import DocumentConverter, PdfFormatOption
    from docling.datamodel.pipeline_options import PdfPipelineOptions
    from docling.datamodel.base_models import InputFormat
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
        self.domain_anchor_terms = config.get_domain_anchor_terms()
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

        When *dynamic_ocr* is enabled (default), the pipeline:
          1. Pre-scans every page with pdfplumber (~0.1s/page) to classify
             pages as native-text vs scanned-image.
          2. Groups consecutive same-type pages into **contiguous blocks**,
             preserving the document's original narrative order.
          3. Processes each block with the correct Docling mode
             (fast no-OCR for native blocks, slow OCR for scanned blocks).
          4. Joins all block Markdown strings in original page order so
             headers, tables, and paragraphs stay exactly where the medical
             authors intended them.

        Falls back to a single Docling pass when dynamic_ocr is disabled.

        Returns:
            Markdown string with headers, tables, and structure preserved,
            or empty string on failure.
        """
        if not DOCLING_AVAILABLE:
            print("   [DOCLING] ✗ Not installed — skipping Markdown extraction")
            return ""

        if not self.docling_config.get('enabled', True):
            print("   [DOCLING] ✗ Disabled in config — skipping")
            return ""

        ocr_enabled    = self.docling_config.get('ocr_enabled', False)
        dynamic_ocr    = self.docling_config.get('dynamic_ocr', True) and ocr_enabled
        timeout_native = self.docling_config.get('timeout_seconds_native', 120)
        timeout_ocr    = self.docling_config.get('timeout_seconds_ocr', 300)
        timeout_single = self.docling_config.get('timeout_seconds', 300)

        tmp_paths: List[str] = []   # every temp PDF created; cleaned up in finally

        try:
            # ── Dynamic OCR Routing (Contiguous Block) ───────────────────
            if dynamic_ocr:
                print("   [DOCLING] Mode: Dynamic OCR Routing (contiguous block)")
                blocks = self._prescan_pages()
                total  = sum(len(b['pages']) for b in blocks)
                n_nat  = sum(len(b['pages']) for b in blocks if b['type'] == 'native')
                n_scan = sum(len(b['pages']) for b in blocks if b['type'] == 'scanned')
                self.metadata['total_pages']   = total
                self.metadata['native_pages']  = n_nat
                self.metadata['scanned_pages'] = n_scan

                print(f"   [PRESCAN] {total} pages → {n_nat} native (digital) | "
                      f"{n_scan} scanned (image) | {len(blocks)} block(s)")

                # Fast path: entire document is one type — skip temp-PDF overhead
                if len(blocks) == 1 and blocks[0]['type'] == 'native':
                    print("   [DOCLING] ⚡ All pages native — single fast pass (OCR OFF)")
                    markdown_text = self._docling_convert(
                        self.pdf_path, ocr=False, timeout=timeout_native)

                elif len(blocks) == 1 and blocks[0]['type'] == 'scanned':
                    print("   [DOCLING] ⚡ All pages scanned — single OCR pass (OCR ON)")
                    markdown_text = self._docling_convert(
                        self.pdf_path, ocr=True, timeout=timeout_ocr)

                else:
                    # Mixed document: process each contiguous block in document order
                    print("   [DOCLING] Mixed document — processing blocks in page order:")
                    md_parts: List[str] = []
                    for i, block in enumerate(blocks, 1):
                        pages   = block['pages']
                        is_ocr  = block['type'] == 'scanned'
                        timeout = timeout_ocr if is_ocr else timeout_native
                        mode    = "OCR ON " if is_ocr else "OCR OFF"
                        page_range = (f"{pages[0]+1}-{pages[-1]+1}"
                                      if len(pages) > 1 else str(pages[0]+1))

                        print(f"     Block {i}/{len(blocks)}: pages {page_range} "
                              f"[{block['type'].upper()}, {len(pages)} pg, {mode}]")

                        tmp = self._extract_page_subset(pages)
                        tmp_paths.append(tmp)

                        md = self._docling_convert(tmp, ocr=is_ocr, timeout=timeout)
                        if md.strip():
                            md_parts.append(md)
                            print(f"       ✓ {len(md):,} chars extracted")
                        else:
                            print(f"       ✗ No text returned for this block")

                    markdown_text = "\n\n".join(md_parts)

                self.metadata['extraction_method'] = 'docling_dynamic_ocr'

            # ── Single-pass fallback (dynamic_ocr disabled) ──────────────
            else:
                label = 'ON' if ocr_enabled else 'OFF'
                print(f"   [DOCLING] Mode: Single-pass (OCR {label})")
                markdown_text = self._docling_convert(
                    self.pdf_path, ocr=ocr_enabled, timeout=timeout_single)
                self.metadata['extraction_method'] = 'docling'
                try:
                    with open(self.pdf_path, 'rb') as f:
                        self.metadata['total_pages'] = len(PyPDF2.PdfReader(f).pages)
                except Exception:
                    self.metadata['total_pages'] = 'N/A'

            # ── Validate combined output ─────────────────────────────────
            if not markdown_text or len(markdown_text.strip()) < 100:
                print("   [DOCLING] ✗ Returned insufficient text (< 100 chars) — will fallback")
                return ""

            self.metadata['raw_text_length'] = len(markdown_text)
            print(f"   [DOCLING] ✓ Extraction complete — {len(markdown_text):,} chars "
                  f"(method: {self.metadata['extraction_method']})")
            return markdown_text

        except Exception as e:
            print(f"   [DOCLING] ✗ Extraction failed: {e}")
            return ""

        finally:
            for tmp in tmp_paths:
                try:
                    os.unlink(tmp)
                except OSError:
                    pass

    # ── Dynamic OCR helper methods ────────────────────────────────────────

    def _prescan_pages(self) -> List[Dict]:
        """
        Streaming pre-scan using PyPDF2 to classify every page as 'native'
        (has a text layer) or 'scanned' (image-only / near-empty), then groups
        consecutive same-type pages into contiguous blocks so document order is
        perfectly preserved after the split-convert-merge cycle.

        WHY PyPDF2 and NOT pdfplumber here:
            pdfplumber creates a detailed Python object for every character on
            every page (X/Y coords, font, bounding box).  For a 1,000-page
            medical textbook that balloons to 12 GB of System RAM — triggering
            the Linux OOM Killer and crashing the Colab session.

            PyPDF2 is a low-level binary parser.  It reads the raw text byte-
            stream, returns a plain string, and immediately discards all page
            objects.  RAM usage stays flat at ~500 MB regardless of document
            size — safe for 10,000-page books on Colab's 12.7 GB RAM limit.

        Returns:
            List of block dicts in original page order, each containing:
                'type'  : 'native' | 'scanned'
                'pages' : list[int]  – consecutive 0-based page indices

            Example for a 10-page PDF where pages 4-5 are scanned:
            [
                {'type': 'native',  'pages': [0, 1, 2, 3]},
                {'type': 'scanned', 'pages': [4, 5]},
                {'type': 'native',  'pages': [6, 7, 8, 9]},
            ]
        """
        threshold = self.docling_config.get('ocr_char_threshold', 100)
        blocks: List[Dict] = []

        try:
            with open(self.pdf_path, 'rb') as fh:
                reader = PyPDF2.PdfReader(fh)
                total_pages = len(reader.pages)
                print(f"   [PRESCAN] Scanning {total_pages} pages for text layer (streaming / low-RAM)...", flush=True)

                for idx in tqdm(range(total_pages), desc="   [PRESCAN]", unit="pg"):
                    # extract_text() returns a plain string then the page object
                    # is immediately eligible for garbage collection — RAM stays
                    # flat (~500 MB) even on a 3,000-page textbook.
                    text  = reader.pages[idx].extract_text() or ""
                    ptype = 'native' if len(text.strip()) >= threshold else 'scanned'

                    # Extend current block if same type, otherwise start a new block
                    if blocks and blocks[-1]['type'] == ptype:
                        blocks[-1]['pages'].append(idx)
                    else:
                        blocks.append({'type': ptype, 'pages': [idx]})

        except Exception as e:
            print(f"   Pre-scan failed ({e}), treating all pages as scanned")
            try:
                with open(self.pdf_path, 'rb') as f:
                    total = len(PyPDF2.PdfReader(f).pages)
            except Exception:
                total = 0
            blocks = [{'type': 'scanned', 'pages': list(range(total))}]

        # ── Split oversized blocks to prevent OOM ──────────────────────────
        max_pages = self.docling_config.get('max_block_pages', 20)
        split_blocks: List[Dict] = []
        for block in blocks:
            pages = block['pages']
            if len(pages) <= max_pages:
                split_blocks.append(block)
            else:
                for start in range(0, len(pages), max_pages):
                    split_blocks.append({
                        'type':  block['type'],
                        'pages': pages[start:start + max_pages]
                    })

        if len(split_blocks) != len(blocks):
            print(f"   [PRESCAN] Block cap ({max_pages} pg): "
                  f"{len(blocks)} raw → {len(split_blocks)} safe blocks", flush=True)

        return split_blocks

    def _extract_page_subset(self, page_indices: List[int]) -> str:
        """
        Write a temporary PDF containing only the given 0-based page indices.
        Returns the temp file path. Caller is responsible for cleanup via os.unlink.
        """
        with open(self.pdf_path, 'rb') as fh:
            reader = PyPDF2.PdfReader(fh)
            writer = PyPDF2.PdfWriter()
            for idx in page_indices:
                writer.add_page(reader.pages[idx])
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix='.pdf')
            writer.write(tmp)
            tmp.close()
        return tmp.name

    def _docling_convert(self, pdf_path: str, ocr: bool, timeout: int) -> str:
        """
        Run Docling on *pdf_path* with or without OCR, respecting *timeout* seconds.
        Calls VLM image captioning only on the OCR pass (where image placeholders appear).
        Returns Markdown string, or empty string on failure/timeout.
        """
        pipeline_options = PdfPipelineOptions(do_ocr=ocr)
        converter = DocumentConverter(
            format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options)}
        )

        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(converter.convert, pdf_path)
            try:
                result = future.result(timeout=timeout)
            except concurrent.futures.TimeoutError:
                label = "OCR" if ocr else "native"
                print(f"       ✗ [DOCLING] {label} pass TIMED OUT after {timeout}s")
                return ""
            except Exception as e:
                label = "OCR" if ocr else "native"
                print(f"       ✗ [DOCLING] {label} pass ERROR: {e}")
                return ""

        md = result.document.export_to_markdown() or ""

        # VLM captioning only on the OCR pass — that's where image placeholders live
        if ocr and md:
            md = self._caption_images_in_markdown(result, md)

        return md

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

        print(f"\n{'='*60}")
        print(f" [EXTRACT] Starting extraction")
        print(f" [EXTRACT] File: {self.pdf_path}")
        print(f"{'='*60}")

        # ── Plain text files ─────────────────────────────────────────
        if self.pdf_path.lower().endswith('.txt'):
            print(" [EXTRACT] Method: plaintext file (direct read)")
            try:
                with open(self.pdf_path, 'r', encoding='utf-8') as f:
                    text = f.read()
                self.metadata['total_pages'] = 1
                self.metadata['raw_text_length'] = len(text)
                self.metadata['extraction_method'] = 'plaintext_file'
                print(f" [EXTRACT] ✓ SUCCESS — {len(text):,} chars (plaintext_file)")
                return text
            except Exception as e:
                print(f" [EXTRACT] ✗ FAILED to read text file: {e}")
                return ""

        # ── PDF: try Docling first ────────────────────────────────────
        if self.pdf_path.lower().endswith('.pdf'):
            print(" [EXTRACT] Method attempt 1/3: Docling (layout-aware Markdown)")
            markdown_text = self.extract_text_as_markdown()
            if markdown_text:
                self.extraction_format = 'markdown'
                print(f" [EXTRACT] ✓ SUCCESS via Docling — "
                      f"{len(markdown_text):,} chars (format: Markdown)")
                return markdown_text
            else:
                print(" [EXTRACT] ✗ Docling returned no text — falling back to pdfplumber")

        # ── Fallback 1: pdfplumber ────────────────────────────────────
        print(" [EXTRACT] Method attempt 2/3: pdfplumber (plaintext fallback)")
        self.metadata['extraction_method'] = 'pdfplumber'
        full_text = []

        try:
            with pdfplumber.open(self.pdf_path) as pdf:
                self.metadata['total_pages'] = len(pdf.pages)
                print(f"   [pdfplumber] {self.metadata['total_pages']} pages detected")

                for i, page in enumerate(pdf.pages, 1):
                    text = page.extract_text()
                    if text:
                        full_text.append(text)
                    if i % 10 == 0:
                        print(f"   [pdfplumber] Scanned {i}/{self.metadata['total_pages']} pages...")

            chars = sum(len(t) for t in full_text)
            if chars == 0:
                print("   [pdfplumber] ✗ Extracted 0 chars (likely image-only PDF) — falling back to PyPDF2")
            else:
                print(f"   [pdfplumber] ✓ Extracted {chars:,} chars from "
                      f"{len(full_text)}/{self.metadata['total_pages']} pages")

        except Exception as e:
            print(f"   [pdfplumber] ✗ FAILED: {e} — falling back to PyPDF2")
            self.metadata['extraction_method'] = 'pypdf2'

            # ── Fallback 2: PyPDF2 ────────────────────────────────────
            print(" [EXTRACT] Method attempt 3/3: PyPDF2 (last-resort fallback)")
            try:
                with open(self.pdf_path, 'rb') as file:
                    pdf_reader = PyPDF2.PdfReader(file)
                    self.metadata['total_pages'] = len(pdf_reader.pages)
                    print(f"   [PyPDF2] {self.metadata['total_pages']} pages detected")

                    for page in pdf_reader.pages:
                        text = page.extract_text()
                        if text:
                            full_text.append(text)

                    chars = sum(len(t) for t in full_text)
                    if chars == 0:
                        print("   [PyPDF2] ✗ Extracted 0 chars — all fallbacks exhausted")
                    else:
                        print(f"   [PyPDF2] ✓ Extracted {chars:,} chars")

            except Exception as e2:
                print(f"   [PyPDF2] ✗ FAILED: {e2}")
                print(" [EXTRACT] ✗ ALL METHODS FAILED — returning empty")
                return ""

        combined_text = "\n".join(full_text)
        self.metadata['raw_text_length'] = len(combined_text)

        if len(combined_text) == 0:
            print(f" [EXTRACT] ✗ FAILED — 0 chars extracted by all methods")
        else:
            print(f" [EXTRACT] ✓ SUCCESS via {self.metadata['extraction_method']} — "
                  f"{len(combined_text):,} chars (format: plaintext)")

        return combined_text

    def clean_text(self, text: str) -> str:
        """
        Unified, line-aware cleaner for ALL extraction paths.

        Works safely on both Docling Markdown (structured headers, tables) and
        pdfplumber/TXT plaintext (no Markdown syntax). In the plaintext case no
        lines start with '#' or '|', so every line falls into the body-text
        branch and receives the same safe operations.

        The chunker routing in process() remains separate:
          extraction_format == 'markdown'  → chunk_text_by_headers()
          extraction_format == 'plaintext' → chunk_text()  (fixed-size)
        This prevents pdfplumber output (no headers) from being sent to
        chunk_text_by_headers(), which would treat the whole document as one
        giant section and crash semantic_sub_chunk() with a Payload Too Large error.

        Applies cleaning operations per line category to prevent destructive
        regex from silently corrupting Markdown tables, headers, or clinical
        values such as "eGFR = 60" or "Stage 3 [see Table 2]".

        Line categories:
            header  — starts with '#'               → whitespace normalisation only
            table   — starts with '|'               → whitespace normalisation only
            list    — starts with '- ','* ','+','N.'→ URL removal + punct dedup
            body    — everything else               → all safe operations

        NOTE: Abbreviation expansion is intentionally NOT applied to ingested text.
        Expansion preserves source fidelity and happens only at query time inside
        the NLU engine.
        """
        print("\n Cleaning text (unified line-aware cleaner)...")

        URL_RE           = re.compile(r'https?://[^\s]+')
        HYPHEN_LB_RE     = re.compile(r'(\w+)-\s*\n\s*(\w+)')
        DOT_LEADER_RE    = re.compile(r'\.{3,}')
        REPEATED_PUNCT_RE = re.compile(r'([!?])\1+')
        LONE_PAGENUM_RE  = re.compile(r'^\d{1,4}$')
        LIST_ITEM_RE     = re.compile(r'^\s*(?:[-*+]|\d+\.)\s')

        # --- Pass 1: fix soft hyphens split across line-breaks (full-string op;
        #     must run before splitting into lines because the newline is part of it)
        text = HYPHEN_LB_RE.sub(r'\1\2', text)

        # --- Normalise smart/curly quotes and dashes (safe on all content types)
        text = (
            text
            .replace('\u201c', '"').replace('\u201d', '"')   # curly double quotes
            .replace('\u2018', "'").replace('\u2019', "'")   # curly single quotes
            .replace('\u2013', '-').replace('\u2014', '--')  # en-dash / em-dash
        )

        # --- Pass 2: line-by-line processing
        lines = text.split('\n')
        cleaned_lines = []
        for line in lines:
            stripped = line.strip()

            # Drop lines that are purely a bare page number (1–4 digits, nothing else).
            # This replaces the risky full-string r'\n\s*\d+\s*\n' regex that could
            # silently delete lab values or list items that happen to sit on their own line.
            if LONE_PAGENUM_RE.match(stripped):
                continue

            is_header = stripped.startswith('#')
            is_table  = stripped.startswith('|')
            is_list   = bool(LIST_ITEM_RE.match(stripped))

            if is_header or is_table:
                # Structural lines: only collapse internal horizontal whitespace.
                # Never touch '=', '[', ']', '|' or any clinical symbol.
                line = re.sub(r'[ \t]+', ' ', line).strip()

            elif is_list:
                # List items: remove URLs and deduplicate punctuation;
                # preserve all structural characters.
                line = URL_RE.sub('', line)
                line = REPEATED_PUNCT_RE.sub(r'\1', line)
                line = re.sub(r'[ \t]+', ' ', line).strip()

            else:
                # Body text: apply all safe operations.
                # 'Page N' is unambiguous here (inline, not a standalone number)
                # so it is safe to strip on body lines only.
                line = re.sub(r'Page\s+\d+', '', line, flags=re.IGNORECASE)
                line = DOT_LEADER_RE.sub('', line)      # strip TOC dot leaders
                line = URL_RE.sub('', line)
                line = REPEATED_PUNCT_RE.sub(r'\1', line)
                line = re.sub(r'[ \t]+', ' ', line).strip()

            cleaned_lines.append(line)

        # --- Pass 3: collapse excess blank lines (preserve single blank separators)
        text = '\n'.join(cleaned_lines)
        text = re.sub(r'\n{3,}', '\n\n', text)
        text = text.strip()

        self.metadata['cleaned_text_length'] = len(text)
        print(f" Cleaned text: {len(text)} characters")

        return text

    # expand_abbreviations() removed from the ingestion path.
    # clean_text() removed: all extraction paths now set extraction_format='markdown'
    # and route through clean_markdown_text() for unified, line-aware cleaning.
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

        # ── Step 0: Read native PDF metadata ────────────────────────────
        # Almost every PDF carries an invisible /Info dictionary with Title,
        # Author, CreationDate, etc.  PyPDF2 exposes it through reader.metadata.
        # We try this FIRST and let heuristic extraction fill gaps only.
        native_title = None
        native_author = None
        native_year = None

        try:
            with open(self.pdf_path, 'rb') as f:
                reader = PyPDF2.PdfReader(f)
                pdf_meta = reader.metadata or {}

                raw_title = pdf_meta.get('/Title') or pdf_meta.get('title') or ''
                if isinstance(raw_title, str) and len(raw_title.strip()) > 5:
                    native_title = raw_title.strip()

                raw_author = pdf_meta.get('/Author') or pdf_meta.get('author') or ''
                if isinstance(raw_author, str) and len(raw_author.strip()) > 1:
                    native_author = raw_author.strip()

                # /CreationDate is typically "D:20240315..." or "2024-03-15"
                raw_date = str(pdf_meta.get('/CreationDate') or pdf_meta.get('creationdate') or '')
                date_year_match = re.search(r'((?:19|20)\d{2})', raw_date)
                if date_year_match:
                    native_year = date_year_match.group(1)
        except Exception:
            pass  # PDF metadata is optional; continue with heuristics

        # ── Step 1: Language detection ──────────────────────────────────
        try:
            sample = text[:1000] if len(text) > 1000 else text
            metadata['language'] = detect(sample)
        except Exception:
            pass  # Keep default if detection fails

        # ── Step 2: Title extraction ────────────────────────────────────
        # Priority: native PDF /Title  →  first Markdown H1  →  first
        # substantial line that doesn't look like boilerplate.
        TITLE_NOISE = re.compile(
            r'copyright|all rights reserved|doi:|http|www\.|issn|'
            r'volume \d|issue \d|published by|downloaded from|'
            r'^\s*page\s+\d|table of contents',
            re.IGNORECASE
        )

        if native_title and not TITLE_NOISE.search(native_title):
            metadata['title'] = native_title
        else:
            # Try Markdown H1 first (Docling output starts with # Title)
            h1_match = re.search(r'^#\s+(.{10,200})', text, re.MULTILINE)
            if h1_match and not TITLE_NOISE.search(h1_match.group(1)):
                metadata['title'] = h1_match.group(1).strip()
            else:
                # Fallback: scan the first 20 lines for a clean candidate
                for line in text.split('\n')[:20]:
                    clean_line = re.sub(r'^#+\s*', '', line).strip()
                    if 20 < len(clean_line) < 200 and not TITLE_NOISE.search(clean_line):
                        metadata['title'] = clean_line
                        break

        # ── Step 3: Author ──────────────────────────────────────────────
        if native_author:
            metadata['author'] = native_author

        # ── Step 4: Publication year ────────────────────────────────────
        # Priority: native /CreationDate  →  explicit textual patterns
        # such as "Published 2024", "(2023)", "© 2022"  →  bare 4-digit
        # year in first 1500 chars (with validation range 1990–2030).
        if native_year:
            metadata['year'] = native_year
        else:
            # Try explicit contextual patterns first — much safer than bare digits
            contextual_year = re.search(
                r'(?:published|updated|revised|copyright|©|\()\s*((?:19|20)\d{2})',
                text[:2000],
                re.IGNORECASE
            )
            if contextual_year:
                metadata['year'] = contextual_year.group(1)
            else:
                # Bare 4-digit fallback, but validate it looks like an actual year
                bare_year = re.search(r'\b((?:19|20)\d{2})\b', text[:1500])
                if bare_year:
                    yr = int(bare_year.group(1))
                    if 1990 <= yr <= 2030:
                        metadata['year'] = str(yr)

        # ── Step 5: Organization detection ──────────────────────────────
        header_text = text[:3000]
        ORGS = {
            'KDIGO': ('KDIGO', 'Clinical Practice Guideline'),
            'KDOQI': ('KDOQI', 'Clinical Practice Guideline'),
            'NKF':   ('NKF',   'Clinical Practice Guideline'),
            'ERA':   ('ERA',   'Clinical Practice Guideline'),
            'ISN':   ('ISN',   'Clinical Practice Guideline'),
            'ADA':   ('ADA',   'Clinical Practice Guideline'),
            'AHA':   ('AHA',   'Clinical Practice Guideline'),
            'WHO':   ('WHO',   'Clinical Practice Guideline'),
        }
        for tag, (org_name, gtype) in ORGS.items():
            if tag in header_text:
                metadata['organization'] = org_name
                metadata['guideline_type'] = gtype
                break

        # ── Step 6: Keyword extraction ──────────────────────────────────
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

        print(f" Metadata extracted: {metadata.get('title', 'Unknown')[:50]}...")

        return metadata

    def is_useful_content(self, text: str) -> bool:

        # --- Structural classification ---
        # Count lines beginning with '|' to detect Markdown tables (Docling output).
        # Three or more such lines reliably indicates a real table, not a stray pipe.
        lines = text.split('\n')
        table_line_count = sum(1 for ln in lines if ln.strip().startswith('|'))
        is_md_table = table_line_count >= 3

        # Filter 1: Too short to be meaningful.
        # Markdown tables are fully exempt — a 2-row lab-value table may have very
        # few words by .split() but contains critical structured clinical data.
        # All other chunks require at least 8 words (minimum for a complete clinical
        # statement, e.g. "Target blood pressure is < 130/80 mmHg.").
        if not is_md_table and len(text.split()) < 8:
            return False

        # Filter 2: Mostly numbers → likely a bare figure or numeric artifact.
        # Markdown tables are fully exempt: lab-value comparison tables produced by
        # Docling are intentionally number-heavy and are the highest-value chunks
        # in this pipeline. Applying a number-ratio threshold to them would silently
        # delete Stage 3 vs. Stage 4 eGFR / potassium / calcium comparison tables.
        if not is_md_table:
            words = text.split()
            # Strip trailing punctuation before testing (catches "60." "4.5," etc.)
            number_ratio = sum(
                1 for w in words
                if w.strip('.,;:)(%').replace('.', '').replace(',', '').isdigit()
            ) / len(words)
            if number_ratio > 0.5:
                return False

        # Filter 3: Common non-content section headers and structural artifacts.
        # '^table \d+' is tightened to '^table \d+\s*$' (standalone caption only)
        # to avoid matching prose like "Table 4 summarises dietary limits...".
        # The entire check is bypassed for Markdown tables because they start with
        # '|', not a word, so none of these patterns could match anyway.
        if not is_md_table:
            skip_patterns = [
                r'^table of contents',   # TOC pages
                r'^references\s*$',      # Reference sections
                r'^bibliography\s*$',    # Bibliography pages
                r'^index\s*$',           # Index pages
                r'^appendix\s+[a-z]',   # Appendix sections
                r'^\d+\s*$',            # Standalone page numbers
                r'^figure \d+',         # Figure captions
                r'^table \d+\s*$',      # Standalone table captions only (tightened)
            ]
            # Strip Markdown header markers before matching
            text_for_check = re.sub(r'^#+\s*', '', text).strip()
            text_lower = text_for_check.lower()
            for pattern in skip_patterns:
                if re.match(pattern, text_lower):
                    return False

        # Filter 4: Domain-relevance gate.
        # Primary check: any of the 120+ specific MEDICAL_ENTITIES terms.
        # Fallback check: any of the 20 broad DOMAIN_ANCHOR_TERMS (clinical lab
        # vocabulary like "mmol/l", "serum", "glomerulus").  A chunk that fails the
        # specific list but passes the broad list is kept — this prevents dropping
        # valid clinical content just because a term was not in MEDICAL_ENTITIES.
        text_lower = text.lower()
        has_medical_term = any(entity.lower() in text_lower for entity in self.medical_entities)
        if not has_medical_term:
            has_medical_term = any(term in text_lower for term in self.domain_anchor_terms)

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

            # ── Content type classification (multi-label) ───────────────
            # Medical text is rarely one category. "We recommend a low-sodium
            # diet based on clinical trials" is recommendation + dietary +
            # evidence.  Store ALL matching categories as a comma-separated
            # string so ChromaDB can accept it (flat schema: str/int/float/bool
            # only — lists crash the insert).
            text = chunk['text']
            text_lower = text.lower()
            matched_types = []

            for ctype, keywords in self.content_type_keywords.items():
                matches = sum(1 for keyword in keywords if keyword.lower() in text_lower)
                if matches > 0:
                    matched_types.append(ctype)

            # Comma-separated multi-label string; falls back to "general"
            chunk['metadata']['content_type'] = ', '.join(matched_types) if matched_types else 'general'

            # ── Medical entity detection ────────────────────────────────
            medical_entities = []

            for entity in self.medical_entities:
                pattern = r'\b' + re.escape(entity.lower()) + r'\b'
                if re.search(pattern, text_lower):
                    medical_entities.append(entity)

            # Deduplicate, cap at 10, and flatten to a comma-separated string
            # so ChromaDB's flat metadata schema doesn't crash on a Python list.
            medical_entities = list(dict.fromkeys(medical_entities))[:10]

            chunk['metadata']['medical_entities'] = ', '.join(medical_entities) if medical_entities else ''
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
        # Both extraction formats route through the same line-aware clean_text().
        # The chunker routing in Step 4 stays separate to prevent unstructured
        # plaintext from entering chunk_text_by_headers().
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
