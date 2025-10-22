"""
Vector Database Preparation Script
====================================
This script prepares processed text chunks for ChromaDB vectorization.

Purpose:
    Acts as a quality filter and formatter between raw chunks and the vector database.
    Ensures only high-quality, relevant medical content is added to the database.

Main Functions:
    - Quality filtering (word count, medical content validation)
    - Format conversion (chunks → ChromaDB-compatible format)
    - Metadata enrichment and simplification
    - Duplicate processing prevention
    - Batch processing with tracking

Pipeline Position:
    pdf_extractor.py → prepare_vectordb.py → build_vectordb.py
    (Raw chunks)      (Quality filter)      (Vector database)

Key Quality Criteria:
    - 50-600 words per chunk
    - Contains medical entities (CKD, GFR, diabetes, etc.)
    - At least 2 medical keywords
    - Not reference-heavy (no excessive citations)

Output Format:
    {
        "documents": ["text1", "text2", ...],
        "metadatas": [{metadata1}, {metadata2}, ...],
        "ids": ["id1", "id2", ...]
    }

Usage:
    python prepare_vectordb.py
    (Automatically finds and processes all *_chunks.json files)
"""

import json
import os
import glob
from datetime import datetime
from typing import List, Dict, Set
from pathlib import Path


class VectorDBPreparator:
    """
    Prepares and filters text chunks for vector database ingestion.
    
    This class handles the quality assurance layer between raw chunks and the vector
    database. It ensures only high-quality, relevant medical content is vectorized.
    
    Responsibilities:
        1. Load raw chunk files from pdf_extractor.py
        2. Apply quality filters (word count, content relevance)
        3. Convert to ChromaDB-compatible format
        4. Generate metadata summaries
        5. Track processed files to avoid duplicates
        6. Organize output in structured directories
    
    Quality Filtering:
        - Word count: 50-600 words (optimal for semantic search)
        - Medical entities: Must contain at least one (CKD, GFR, etc.)
        - Medical keywords: At least 2 relevant terms
        - References: Filters out citation-heavy chunks
    
    Output Structure:
        data/vectordb_ready/
        ├── documents/          # VectorDB-ready JSON files
        ├── summaries/          # Processing statistics
        └── .processed_chunks_tracker.json  # Tracking file
    
    Attributes:
        chunks_file (str): Path to input *_chunks.json file
        output_dir (str): Base output directory
        chunks (list): Loaded chunks from input file
        vectordb_dir (str): Directory for vectordb-ready files
        summaries_dir (str): Directory for summary files
        processed_tracker_file (str): Path to processing tracker
    """
    
    def __init__(self, chunks_file: str, output_dir: str = "data/vectordb_ready"):
        """
        Initialize the VectorDB Preparator.
        
        Args:
            chunks_file (str): Path to processed chunks JSON file from pdf_extractor
            output_dir (str): Directory for output files. Defaults to "data/vectordb_ready"
        """
        self.chunks_file = chunks_file
        self.output_dir = output_dir
        self.chunks = []  # Will store loaded chunks
        
        # Create organized folder structure for better file management
        self.vectordb_dir = os.path.join(output_dir, "documents")  # VectorDB-ready files
        self.summaries_dir = os.path.join(output_dir, "summaries")  # Statistics and summaries
        self.processed_tracker_file = os.path.join(output_dir, '.processed_chunks_tracker.json')  # Tracking
        
        # Create all required directories
        os.makedirs(self.vectordb_dir, exist_ok=True)
        os.makedirs(self.summaries_dir, exist_ok=True)
        os.makedirs(output_dir, exist_ok=True)
    
    def get_processed_files(self) -> Set[str]:
        """
        Retrieve the set of already processed chunk files.
        
        Prevents duplicate processing by tracking which files have already been
        converted to vectordb-ready format. Uses a hidden JSON tracker file.
        
        Returns:
            Set[str]: Set of file paths that have been processed
        """
        if os.path.exists(self.processed_tracker_file):
            with open(self.processed_tracker_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return set(data.get('processed_files', []))
        return set()  # Return empty set if tracker doesn't exist yet
    
    def mark_as_processed(self, chunk_file: str):
        """
        Mark a chunk file as processed to prevent duplicate processing.
        
        Updates the tracker file with the newly processed file path and timestamp.
        
        Args:
            chunk_file (str): Path to the chunk file that was processed
        """
        # Get existing processed files
        processed_files = self.get_processed_files()
        processed_files.add(chunk_file)  # Add current file
        
        # Save updated tracker data
        tracker_data = {
            'processed_files': list(processed_files),
            'last_updated': datetime.now().isoformat()
        }
        
        with open(self.processed_tracker_file, 'w', encoding='utf-8') as f:
            json.dump(tracker_data, f, indent=2, ensure_ascii=False)
    
    def is_already_processed(self, chunk_file: str) -> bool:
        """
        Check if a chunk file has already been processed.
        
        Args:
            chunk_file (str): Path to chunk file to check
            
        Returns:
            bool: True if file was already processed, False otherwise
        """
        processed_files = self.get_processed_files()
        return chunk_file in processed_files
    
    def load_chunks(self):
        """
        Load and validate processed chunks from JSON file.
        
        Performs several validation checks:
        1. Checks if file is already in vectordb-ready format (skip if so)
        2. Validates JSON structure (should be list of chunks)
        3. Loads chunks into memory for processing
        
        Expected input format:
            [
                {
                    "chunk_id": 0,
                    "text": "...",
                    "word_count": 500,
                    "metadata": {...}
                },
                ...
            ]
        
        Returns:
            list: Loaded chunks, or empty list if file should be skipped
        """
        print(f" Loading chunks from: {self.chunks_file}")
        
        try:
            # Load JSON file
            with open(self.chunks_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            # Validation 1: Check if already in vectordb_ready format
            # (has 'documents' key instead of being a list of chunks)
            if isinstance(data, dict) and 'documents' in data:
                print(f"️  This file is already in vectorDB-ready format!")
                print(f"   Skipping: {os.path.basename(self.chunks_file)}")
                return []
            
            # Validation 2: Check if it's a list of chunks (expected format)
            if isinstance(data, list):
                self.chunks = data
                print(f" Loaded {len(self.chunks)} chunks")
                return self.chunks
            else:
                # Unexpected format
                print(f"️  Unexpected file format!")
                print(f"   Expected: list of chunks")
                print(f"   Got: {type(data)}")
                return []
                
        except json.JSONDecodeError as e:
            # Handle JSON parsing errors
            print(f" Error: Invalid JSON format in {os.path.basename(self.chunks_file)}")
            print(f"   Details: {e}")
            return []
        except Exception as e:
            # Handle other file loading errors
            print(f" Error loading file: {e}")
            return []
    
    def filter_quality_chunks(self, min_words: int = 50, max_words: int = 600) -> List[Dict]:
        """
        Apply quality filters to select only high-quality chunks for vectorization.
        
        Quality Criteria:
        1. Word count: Between 50-600 words
           - Too short: Not enough context for semantic search
           - Too long: May contain multiple topics, reducing precision
        
        2. Medical entities: Must contain at least one
           - Ensures medical relevance
           - Examples: CKD, GFR, diabetes, dialysis, etc.
        
        3. Citation filter: Skip reference-heavy chunks
           - Too many "et al" or "ibid" indicates bibliography sections
           - These don't provide useful medical information
        
        4. Medical keywords: At least 2 present
           - Validates substantive medical content
           - Keywords: kidney, renal, patient, treatment, diagnosis, etc.
        
        Typical retention rate: 80-85% of input chunks
        
        Args:
            min_words (int): Minimum words per chunk. Default: 50
            max_words (int): Maximum words per chunk. Default: 600
            
        Returns:
            List[Dict]: Filtered list of high-quality chunks
        """
        print(f"\n Filtering quality chunks (min={min_words}, max={max_words} words)...")
        
        filtered = []  # Store chunks that pass all filters
        
        for chunk in self.chunks:
            word_count = chunk['word_count']
            
            # Filter 1: Word count boundaries
            if word_count < min_words or word_count > max_words:
                continue  # Skip this chunk
            
            # Filter 2: Must have medical entities
            if not chunk['metadata'].get('medical_entities'):
                continue  # Skip chunks without medical entities
            
            # Filter 3: Check content quality
            text = chunk['text'].lower()
            
            # Skip if mostly references/citations (bibliography sections)
            if text.count('et al') > 3 or text.count('ibid') > 2:
                continue  # Too many citations
            
            # Filter 4: Must contain substantive medical content
            # Require at least 2 medical keywords to ensure relevance
            medical_keywords = [
                'kidney', 'renal', 'ckd', 'gfr', 'patient', 'treatment',
                'disease', 'clinical', 'diagnosis', 'therapy', 'risk',
                'recommendation', 'guideline', 'assessment', 'management'
            ]
            
            keyword_count = sum(1 for kw in medical_keywords if kw in text)
            if keyword_count < 2:
                continue  # Not enough medical keywords
            
            # Chunk passed all filters!
            filtered.append(chunk)
        
        # Report filtering results
        print(f" Filtered to {len(filtered)} high-quality chunks")
        print(f"   Removed: {len(self.chunks) - len(filtered)} chunks")
        print(f"   Retention rate: {len(filtered)/len(self.chunks)*100:.1f}%")
        
        return filtered
    
    def prepare_for_chromadb(self, chunks: List[Dict]) -> Dict:
        """
        Convert filtered chunks to ChromaDB-compatible format.
        
        ChromaDB requires three parallel arrays:
        1. documents: List of text strings
        2. metadatas: List of metadata dictionaries (simple types only)
        3. ids: List of unique identifiers
        
        Metadata Transformation:
        - Extracts only ChromaDB-compatible fields (no nested objects)
        - Converts medical_entities list → comma-separated string
        - Adds boolean flags for quick filtering (has_ckd, has_gfr, etc.)
        - Limits text length (section names) to prevent issues
        
        ID Generation:
        - Format: {source_file_name}_{chunk_id}
        - Example: "kdigo_2024_ckd_guideline_0"
        - Ensures uniqueness across all documents
        
        Why this format?
        - ChromaDB performs better with simple metadata types
        - Boolean flags enable fast filtered queries
        - Comma-separated entities preserve searchability
        
        Args:
            chunks (List[Dict]): Filtered chunks to convert
            
        Returns:
            Dict: ChromaDB-ready data with 'documents', 'metadatas', and 'ids' keys
        """
        print(f"\n Preparing {len(chunks)} chunks for ChromaDB...")
        
        # Initialize parallel arrays for ChromaDB
        documents = []   # Text content
        metadatas = []   # Simple metadata dictionaries
        ids = []         # Unique identifiers
        
        # Generate base name for IDs (e.g., "kdigo_2024_ckd_guideline")
        # Remove '_chunks' suffix and normalize separators
        base_name = Path(self.chunks_file).stem.replace('_chunks', '').replace('-', '_').lower()
        
        # Process each chunk
        for chunk in chunks:
            # 1. Add document text
            documents.append(chunk['text'])
            
            # 2. Create simplified metadata (ChromaDB requires simple types)
            metadata = {
                # Basic information
                'source': chunk['metadata'].get('source_file', os.path.basename(self.chunks_file)),
                'chunk_id': chunk['chunk_id'],
                'content_type': chunk['metadata'].get('content_type', 'general'),
                'word_count': chunk['word_count'],
                
                # Boolean flags for fast filtering (better than searching in lists)
                'has_ckd': 'CKD' in chunk['metadata'].get('medical_entities', []),
                'has_gfr': 'GFR' in chunk['metadata'].get('medical_entities', []),
                'has_diabetes': 'diabetes' in chunk['metadata'].get('medical_entities', []),
                'has_hypertension': 'hypertension' in chunk['metadata'].get('medical_entities', []),
                'has_dialysis': 'dialysis' in chunk['metadata'].get('medical_entities', []),
                
                # Convert list to comma-separated string (ChromaDB compatible)
                'medical_entities': ','.join(chunk['metadata'].get('medical_entities', [])),
                
                # Document information
                'year': chunk['metadata'].get('year', datetime.now().year),
                'organization': chunk['metadata'].get('organization', 'Unknown')
            }
            
            # Add section if present (with length limit to prevent issues)
            if chunk['metadata'].get('section'):
                metadata['section'] = chunk['metadata']['section'][:100]  # Limit to 100 chars
            
            metadatas.append(metadata)
            
            # 3. Generate unique ID: {base_name}_{chunk_id}
            ids.append(f"{base_name}_{chunk['chunk_id']}")
        
        print(f" Prepared {len(documents)} documents for ChromaDB")
        print(f"   Format: documents, metadatas, ids (parallel arrays)")
        
        # Return ChromaDB-compatible dictionary
        return {
            'documents': documents,
            'metadatas': metadatas,
            'ids': ids
        }
    
    def save_vectordb_ready(self, prepared_data: Dict, filename: str = None):
        """Save prepared data for vector database"""
        
        # Generate filename based on source chunks file
        base_name = Path(self.chunks_file).stem.replace('_chunks', '')
        
        if not filename:
            filename = f"{base_name}_vectordb_ready.json"
        
        # Save vectorDB-ready data to documents folder
        output_path = os.path.join(self.vectordb_dir, filename)
        
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(prepared_data, f, indent=2, ensure_ascii=False)
        
        print(f"\n Saved vectorDB-ready data to: {output_path}")
        
        # Save summary
        summary = {
            'total_documents': len(prepared_data['documents']),
            'source_file': os.path.basename(self.chunks_file),
            'source_path': self.chunks_file,
            'preparation_date': datetime.now().isoformat(),
            'avg_word_count': sum(m['word_count'] for m in prepared_data['metadatas']) / len(prepared_data['metadatas']) if prepared_data['metadatas'] else 0,
            'content_types': {},
            'medical_entity_coverage': {
                'CKD': sum(1 for m in prepared_data['metadatas'] if m['has_ckd']),
                'GFR': sum(1 for m in prepared_data['metadatas'] if m['has_gfr']),
                'diabetes': sum(1 for m in prepared_data['metadatas'] if m['has_diabetes']),
                'hypertension': sum(1 for m in prepared_data['metadatas'] if m['has_hypertension']),
                'dialysis': sum(1 for m in prepared_data['metadatas'] if m['has_dialysis'])
            }
        }
        
        # Count content types
        for meta in prepared_data['metadatas']:
            ct = meta['content_type']
            summary['content_types'][ct] = summary['content_types'].get(ct, 0) + 1
        
        # Save individual summary to summaries folder
        summary_filename = f"{base_name}_summary.json"
        summary_path = os.path.join(self.summaries_dir, summary_filename)
        with open(summary_path, 'w', encoding='utf-8') as f:
            json.dump(summary, f, indent=2, ensure_ascii=False)
        
        print(f" Saved preparation summary to: {summary_path}")
        
        return output_path
    
    def generate_sample_queries(self, output_file: str = None):
        """
        Generate a comprehensive set of sample queries for testing the vector database.
        
        Purpose:
        - Test database functionality after building
        - Validate retrieval quality
        - Provide examples for users
        - Cover different query types and medical topics
        
        Query Categories:
        - General CKD information (definition, stages, causes)
        - GFR measurements and interpretation
        - Treatment options and medications
        - Risk factors and complications
        - Monitoring and management strategies
        - Specific patient populations
        - Advanced medical topics
        
        Output:
        A text file with 30 sample queries covering all major topics in the
        medical knowledge base.
        
        Args:
            output_file (str, optional): Path to save queries. 
                                        Defaults to data/vectordb_ready/sample_queries.txt
                                        
        Returns:
            list: List of sample query strings
        """
        
        if not output_file:
            # Save sample queries in the main output directory
            output_file = os.path.join(self.output_dir, 'sample_queries.txt')
        
        # Comprehensive set of 30 sample queries covering all major topics
        queries = [
            # General CKD queries (foundational knowledge)
            "What is chronic kidney disease?",
            "How is CKD diagnosed?",
            "What are the stages of chronic kidney disease?",
            "What causes chronic kidney disease?",
            
            # GFR related (kidney function measurement)
            "What is GFR and how is it measured?",
            "What is a normal GFR value?",
            "How to calculate eGFR?",
            "What does low GFR mean?",
            
            # Treatment queries (medical interventions)
            "What are treatment options for CKD?",
            "When should dialysis be started?",
            "What medications are used for CKD?",
            "How to manage CKD progression?",
            
            # Risk factors (prevention and early detection)
            "What are risk factors for CKD?",
            "How does diabetes affect kidneys?",
            "Can high blood pressure cause kidney disease?",
            
            # Monitoring and management (patient care)
            "How often should CKD patients be monitored?",
            "What blood tests are needed for CKD?",
            "What dietary changes are recommended for CKD?",
            "How to prevent CKD progression?",
            
            # Complications (disease outcomes)
            "What are complications of CKD?",
            "How does CKD affect the heart?",
            "What is anemia in CKD?",
            "How to manage phosphorus in CKD?",
            
            # Specific populations (targeted care)
            "How is CKD managed in diabetic patients?",
            "CKD treatment for elderly patients",
            "Pregnancy and chronic kidney disease",
            
            # Advanced topics (specialized knowledge)
            "What is albuminuria?",
            "How to interpret urine protein tests?",
            "What are KDIGO guidelines for CKD?",
            "When is kidney biopsy indicated?"
        ]
        
        # Write queries to file with header
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write("=" * 70 + "\n")
            f.write("SAMPLE QUERIES FOR VECTORDB TESTING\n")
            f.write("=" * 70 + "\n\n")
            
            # Write each query with numbering
            for i, query in enumerate(queries, 1):
                f.write(f"{i}. {query}\n")
        
        print(f" Generated {len(queries)} sample queries: {output_file}")
        
        return queries
    
    def process(self):
        """Full preparation pipeline"""
        
        print("=" * 70)
        print(" VECTOR DATABASE PREPARATION PIPELINE")
        print("=" * 70)
        print(f"Processing: {os.path.basename(self.chunks_file)}")
        print("=" * 70)
        
        # Load chunks
        chunks_loaded = self.load_chunks()
        
        # Check if loading failed or file was already processed
        if not chunks_loaded or len(self.chunks) == 0:
            print("\n️  File skipped (empty, invalid, or already in vectorDB format)")
            return None
        
        # Filter quality chunks
        filtered_chunks = self.filter_quality_chunks()
        
        if len(filtered_chunks) == 0:
            print("\n️  No chunks passed quality filtering!")
            print("   This file will be skipped.")
            return None
        
        # Prepare for ChromaDB
        prepared_data = self.prepare_for_chromadb(filtered_chunks)
        
        # Save prepared data
        output_file = self.save_vectordb_ready(prepared_data)
        
        # Mark as processed
        self.mark_as_processed(self.chunks_file)
        
        # Print summary
        print("\n" + "=" * 70)
        print(" PREPARATION SUMMARY")
        print("=" * 70)
        print(f"Input file: {os.path.basename(self.chunks_file)}")
        print(f"Total input chunks: {len(self.chunks)}")
        print(f"Quality filtered chunks: {len(filtered_chunks)}")
        print(f"Documents prepared: {len(prepared_data['documents'])}")
        print(f"Output file: {os.path.basename(output_file)}")
        print("=" * 70)
        print(" PREPARATION COMPLETE!")
        print("=" * 70)
        print(f"\n Output Locations:")
        print(f"    VectorDB file: {self.vectordb_dir}")
        print(f"    Summary file: {self.summaries_dir}")
        print("=" * 70)
        
        return prepared_data


def find_chunk_files(directory: str = "data/processed") -> List[str]:
    """
    Find all chunk files that need to be processed.
    
    Searches for *_chunks.json files while excluding:
    - Already processed vectordb_ready files
    - Hidden files (starting with '.')
    - System files
    
    This ensures only raw chunk files from pdf_extractor.py are included.
    
    Args:
        directory (str): Directory to search. Default: "data/processed"
        
    Returns:
        List[str]: Sorted list of chunk file paths to process
    """
    # Use glob pattern to find all *_chunks.json files
    pattern = os.path.join(directory, "*_chunks.json")
    chunk_files = glob.glob(pattern)
    
    # Filter out files that shouldn't be processed:
    # 1. Files already in vectordb_ready format (*_vectordb_ready.json)
    # 2. Files starting with 'vectordb_ready' prefix
    # 3. Hidden files (starting with '.')
    chunk_files = [
        cf for cf in chunk_files 
        if not os.path.basename(cf).endswith('_vectordb_ready.json')  # Already processed
        and not os.path.basename(cf).startswith('vectordb_ready')     # Output files
        and not os.path.basename(cf).startswith('.')                  # Hidden files
    ]
    
    return sorted(chunk_files)  # Sort for consistent processing order


def main():
    """
    Main execution function for batch processing of chunk files.
    
    Workflow:
    1. Scan data/processed/ for *_chunks.json files
    2. Check processing tracker to identify new files
    3. Process each unprocessed file through quality filters
    4. Convert to ChromaDB format and save
    5. Generate sample queries (once for all files)
    6. Display comprehensive summary
    
    Features:
    - Duplicate prevention via tracker file
    - Batch processing for efficiency
    - Error handling per file (one failure doesn't stop others)
    - Detailed progress reporting
    - Statistics and results summary
    
    Processing per file:
    - Load → Filter → Convert → Save → Mark as processed
    
    Returns:
        list: Results for each processed file (success/failure status)
    """
    
    print("=" * 70)
    print(" SCANNING FOR CHUNK FILES")
    print("=" * 70)
    
    # Step 1: Find all chunk files in the processed directory
    chunk_files = find_chunk_files("data/processed")
    
    # Validation: Check if any files were found
    if not chunk_files:
        print(" No *_chunks.json files found in data/processed/")
        print("   Run pdf_extractor.py first to create chunk files.")
        return
    
    print(f" Found {len(chunk_files)} chunk file(s):")
    for i, cf in enumerate(chunk_files, 1):
        print(f"   {i}. {os.path.basename(cf)}")
    print()
    
    # Step 2: Check which files have already been processed
    # Create temporary preparator just to access tracker methods
    temp_preparator = VectorDBPreparator(chunk_files[0])
    processed_files = temp_preparator.get_processed_files()
    
    # Filter to only unprocessed files
    unprocessed_files = [cf for cf in chunk_files if cf not in processed_files]
    
    # Check if all files are already processed
    if not unprocessed_files:
        print("=" * 70)
        print(" ALL FILES ALREADY PROCESSED!")
        print("=" * 70)
        print(f"Total files: {len(chunk_files)}")
        print(f"Already processed: {len(processed_files)}")
        print(f"New files to process: 0")
        print("\n Tip: To reprocess files, delete:")
        print("   data/vectordb_ready/.processed_chunks_tracker.json")
        print("=" * 70)
        return
    
    # Display processing status
    print("=" * 70)
    print(" PROCESSING STATUS")
    print("=" * 70)
    print(f"Total chunk files: {len(chunk_files)}")
    print(f"Already processed: {len(processed_files)}")
    print(f"New files to process: {len(unprocessed_files)}")
    print("\n🆕 Files to process:")
    for i, cf in enumerate(unprocessed_files, 1):
        print(f"   {i}. {os.path.basename(cf)}")
    print("=" * 70)
    print()
    
    # Step 3: Process each unprocessed file
    results = []      # Store results for each file
    successful = 0    # Count successful processing
    failed = 0        # Count failed processing
    
    for idx, chunk_file in enumerate(unprocessed_files, 1):
        print("\n" + "=" * 70)
        print(f" PROCESSING FILE {idx}/{len(unprocessed_files)}")
        print("=" * 70)
        
        try:
            # Create preparator for this file
            preparator = VectorDBPreparator(chunk_file)
            
            # Run the full preparation pipeline:
            # Load → Filter → Convert → Save → Track
            prepared_data = preparator.process()
            
            # Check if processing was successful
            if prepared_data:
                results.append({
                    'file': chunk_file,
                    'status': 'success',
                    'documents': len(prepared_data['documents'])
                })
                successful += 1
            else:
                # File was skipped (no chunks passed quality filter)
                results.append({
                    'file': chunk_file,
                    'status': 'skipped',
                    'reason': 'No chunks passed quality filter'
                })
                # Still mark as processed to avoid retrying
                preparator.mark_as_processed(chunk_file)
                
        except Exception as e:
            # Catch any errors during processing
            print(f"\n Error processing file: {e}")
            results.append({
                'file': chunk_file,
                'status': 'error',
                'error': str(e)
            })
            failed += 1
    
    # Step 4: Generate sample queries (only once for all files)
    if successful > 0:
        print("\n" + "=" * 70)
        print(" GENERATING SAMPLE QUERIES")
        print("=" * 70)
        # Use first file's preparator to access output directory
        temp_preparator = VectorDBPreparator(unprocessed_files[0])
        temp_preparator.generate_sample_queries()
    
    # Step 5: Print comprehensive final summary
    print("\n" + "=" * 70)
    print(" BATCH PREPARATION COMPLETE!")
    print("=" * 70)
    print(f"Total files processed: {len(unprocessed_files)}")
    print(f" Successful: {successful}")
    print(f"️  Skipped: {len([r for r in results if r['status'] == 'skipped'])}")
    print(f" Failed: {failed}")
    print(f" Output directory: data/vectordb_ready")
    
    # Display individual file results
    print("\n Results:")
    for i, result in enumerate(results, 1):
        filename = os.path.basename(result['file'])
        
        if result['status'] == 'success':
            # Show success with document count
            print(f"   {i}.  {filename} ({result['documents']} documents)")
        elif result['status'] == 'skipped':
            # Show reason for skipping
            print(f"   {i}. ️  {filename} - {result.get('reason', 'Skipped')}")
        else:
            # Show error message
            print(f"   {i}.  {filename} - Error: {result.get('error', 'Unknown')}")
    
    print("=" * 70)
    print("\n Next Steps:")
    print("   1. Run 'python scripts/build_vectordb.py' to create vector database")
    print("   2. Run 'python scripts/query_vectordb.py' to test queries")
    print("   3. Check data/vectordb_ready/ for output files")
    print("=" * 70)
    
    return results


# Entry point when script is run directly
if __name__ == "__main__":
    main()
