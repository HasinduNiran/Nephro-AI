import json
import os
import sys
import glob
from datetime import datetime
from typing import List, Dict, Set
from pathlib import Path

# Add parent directory to path for config import
sys.path.insert(0, str(Path(__file__).parent.parent))

# Import project configuration
# Import project configuration
from chatbot import config


class VectorDBPreparator:
    
    def __init__(self, chunks_file: str, output_dir: str = None):
        
        self.chunks_file = chunks_file
        self.output_dir = output_dir or str(config.VECTORDB_READY_DIR.parent)
        self.chunks = []  # Will store loaded chunks
        
        # Load configuration settings
        self.chunk_settings = config.get_chunk_config()
        self.medical_entities = config.get_medical_entities()
        
        # Create organized folder structure from config
        self.vectordb_dir = str(config.VECTORDB_READY_DIR)
        self.summaries_dir = os.path.join(self.output_dir, "summaries")
        self.processed_tracker_file = os.path.join(self.output_dir, '.processed_chunks_tracker.json')
        
        # Create all required directories
        os.makedirs(self.vectordb_dir, exist_ok=True)
        os.makedirs(self.summaries_dir, exist_ok=True)
        os.makedirs(self.output_dir, exist_ok=True)
    
    def get_processed_files(self) -> Set[str]:
        
        if os.path.exists(self.processed_tracker_file):
            with open(self.processed_tracker_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return set(data.get('processed_files', []))
        return set()  # Return empty set if tracker doesn't exist yet
    
    def mark_as_processed(self, chunk_file: str):
        
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
        
        processed_files = self.get_processed_files()
        return chunk_file in processed_files
    
    def load_chunks(self):
       
        print(f" Loading chunks from: {self.chunks_file}")
        
        try:
            # Load JSON file
            with open(self.chunks_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            # Validation 1: Check if already in vectordb_ready format
            # (has 'documents' key instead of being a list of chunks)
            if isinstance(data, dict) and 'documents' in data:
                print(f"  This file is already in vectorDB-ready format!")
                print(f"   Skipping: {os.path.basename(self.chunks_file)}")
                return []
            
            # Validation 2: Check if it's a list of chunks (expected format)
            if isinstance(data, list):
                self.chunks = data
                print(f" Loaded {len(self.chunks)} chunks")
                return self.chunks
            else:
                # Unexpected format
                print(f"  Unexpected file format!")
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
    
    def filter_quality_chunks(self, min_words: int = None, max_words: int = None) -> List[Dict]:
        """
        Filter chunks based on quality criteria using config settings.
        
        Args:
            min_words: Minimum word count (defaults to config.CHUNK_SETTINGS['min_words'])
            max_words: Maximum word count (defaults to config.CHUNK_SETTINGS['max_words'])
        """
        # Use config defaults if not specified
        min_words = min_words or self.chunk_settings.get('min_words', 50)
        max_words = max_words or self.chunk_settings.get('max_words', 600)
        
        print(f"\n Filtering quality chunks (min={min_words}, max={max_words} words)...")
        
        filtered = []  # Store chunks that pass all filters
        
        for chunk in self.chunks:
            word_count = chunk['word_count']
            
            # Filter 1: Word count boundaries
            if word_count < min_words or word_count > max_words:
                continue
            
            # Filter 2: Must have medical entities
            if not chunk['metadata'].get('medical_entities'):
                continue
            
            # Filter 3: Check content quality
            text = chunk['text'].lower()
            
            # Skip if mostly references/citations (bibliography sections)
            if text.count('et al') > 3 or text.count('ibid') > 2:
                continue
            
            # Filter 4: Must contain substantive medical content using config entities
            # Check against comprehensive medical entities list
            entity_matches = sum(
                1 for entity in self.medical_entities 
                if entity.lower() in text
            )
            if entity_matches < 2:
                continue
            
            # Chunk passed all filters!
            filtered.append(chunk)
        
        # Report filtering results
        print(f" Filtered to {len(filtered)} high-quality chunks")
        print(f"   Removed: {len(self.chunks) - len(filtered)} chunks")
        print(f"   Retention rate: {len(filtered)/len(self.chunks)*100:.1f}%")
        
        return filtered
    
    def prepare_for_chromadb(self, chunks: List[Dict]) -> Dict:
        
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
            chunk_meta = chunk['metadata']
            entities = chunk_meta.get('medical_entities', [])
            entities_lower = [e.lower() for e in entities]
            
            metadata = {
                # Basic information
                'source': chunk_meta.get('source_file', os.path.basename(self.chunks_file)),
                'chunk_id': chunk['chunk_id'],
                'content_type': chunk_meta.get('content_type', 'general'),
                'content_type_confidence': chunk_meta.get('content_type_confidence', 0),
                'word_count': chunk['word_count'],
                'entity_count': chunk_meta.get('entity_count', 0),
                
                # Boolean flags for fast filtering
                'has_ckd': any(e in entities_lower for e in ['ckd', 'chronic kidney disease']),
                'has_gfr': any(e in entities_lower for e in ['gfr', 'egfr', 'glomerular filtration rate']),
                'has_diabetes': 'diabetes' in entities_lower,
                'has_hypertension': 'hypertension' in entities_lower,
                'has_dialysis': 'dialysis' in entities_lower or 'hemodialysis' in entities_lower,
                
                # Convert list to comma-separated string (ChromaDB compatible)
                'medical_entities': ','.join(entities[:10]),  # Limit to top 10
                
                # Document information
                'year': str(chunk_meta.get('year', datetime.now().year)),
                'organization': chunk_meta.get('organization', 'Unknown')
            }
            
            # Add section if present (with length limit)
            if chunk_meta.get('section'):
                metadata['section'] = chunk_meta['section'][:100]
            
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
            print("\n  File skipped (empty, invalid, or already in vectorDB format)")
            return None
        
        # Filter quality chunks
        filtered_chunks = self.filter_quality_chunks()
        
        if len(filtered_chunks) == 0:
            print("\n  No chunks passed quality filtering!")
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


def find_chunk_files(directory: str = None) -> List[str]:
    """
    Find all chunk files in the processed directory.
    
    Args:
        directory: Directory to search (defaults to config.PROCESSED_DATA_DIR)
    """
    directory = directory or str(config.PROCESSED_DATA_DIR)
    
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
    Main function to prepare all chunk files for vector database.
    """
    print("=" * 70)
    print(" SCANNING FOR CHUNK FILES")
    print("=" * 70)
    
    # Step 1: Find all chunk files in the processed directory (from config)
    chunk_files = find_chunk_files()
    
    # Validation: Check if any files were found
    if not chunk_files:
        print(f" No *_chunks.json files found in {config.PROCESSED_DATA_DIR}")
        print("   Run 'python scripts/pdf_extractor.py' first to create chunk files.")
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
        print(f"   {config.VECTORDB_READY_DIR.parent}/.processed_chunks_tracker.json")
        print("=" * 70)
        return
    
    # Display processing status
    print("=" * 70)
    print(" PROCESSING STATUS")
    print("=" * 70)
    print(f"Total chunk files: {len(chunk_files)}")
    print(f"Already processed: {len(processed_files)}")
    print(f"New files to process: {len(unprocessed_files)}")
    print("\n Files to process:")
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
    
    # Step 4: Print comprehensive final summary
    print("\n" + "=" * 70)
    print(" BATCH PREPARATION COMPLETE!")
    print("=" * 70)
    print(f"Total files processed: {len(unprocessed_files)}")
    print(f" Successful: {successful}")
    print(f"️  Skipped: {len([r for r in results if r['status'] == 'skipped'])}")
    print(f" Failed: {failed}")
    print(f" Output directory: {config.VECTORDB_READY_DIR}")
    
    # Display individual file results
    print("\n Results:")
    for i, result in enumerate(results, 1):
        filename = os.path.basename(result['file'])
        
        if result['status'] == 'success':
            # Show success with document count
            print(f"   {i}.  {filename} ({result['documents']} documents)")
        elif result['status'] == 'skipped':
            # Show reason for skipping
            print(f"   {i}.   {filename} - {result.get('reason', 'Skipped')}")
        else:
            # Show error message
            print(f"   {i}.  {filename} - Error: {result.get('error', 'Unknown')}")
    
    print("=" * 70)
    print("\n Next Steps:")
    print("   1. Run 'python scripts/build_vectordb.py' to create vector database")
    print("   2. Run 'python scripts/query_vectordb.py' to test queries")
    print(f"   3. Check {config.VECTORDB_READY_DIR} for output files")
    print("=" * 70)
    
    return results


# Entry point when script is run directly
if __name__ == "__main__":
    main()
