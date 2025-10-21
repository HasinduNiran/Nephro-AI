"""
Vector Database Preparation Script
Prepares processed chunks for ChromaDB vectorization
"""

import json
import os
import glob
from datetime import datetime
from typing import List, Dict, Set
from pathlib import Path


class VectorDBPreparator:
    """Prepare chunks for vector database ingestion"""
    
    def __init__(self, chunks_file: str, output_dir: str = "data/vectordb_ready"):
        """
        Initialize preparator
        
        Args:
            chunks_file: Path to processed chunks JSON
            output_dir: Directory for output files
        """
        self.chunks_file = chunks_file
        self.output_dir = output_dir
        self.chunks = []
        
        # Create organized folder structure
        self.vectordb_dir = os.path.join(output_dir, "documents")
        self.summaries_dir = os.path.join(output_dir, "summaries")
        self.processed_tracker_file = os.path.join(output_dir, '.processed_chunks_tracker.json')
        
        # Create all directories
        os.makedirs(self.vectordb_dir, exist_ok=True)
        os.makedirs(self.summaries_dir, exist_ok=True)
        os.makedirs(output_dir, exist_ok=True)
    
    def get_processed_files(self) -> Set[str]:
        """Get set of already processed chunk files"""
        if os.path.exists(self.processed_tracker_file):
            with open(self.processed_tracker_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return set(data.get('processed_files', []))
        return set()
    
    def mark_as_processed(self, chunk_file: str):
        """Mark a chunk file as processed"""
        processed_files = self.get_processed_files()
        processed_files.add(chunk_file)
        
        tracker_data = {
            'processed_files': list(processed_files),
            'last_updated': datetime.now().isoformat()
        }
        
        with open(self.processed_tracker_file, 'w', encoding='utf-8') as f:
            json.dump(tracker_data, f, indent=2, ensure_ascii=False)
    
    def is_already_processed(self, chunk_file: str) -> bool:
        """Check if a chunk file has already been processed"""
        processed_files = self.get_processed_files()
        return chunk_file in processed_files
    
    def load_chunks(self):
        """Load processed chunks"""
        print(f"📂 Loading chunks from: {self.chunks_file}")
        
        try:
            with open(self.chunks_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            # Check if it's already in vectordb_ready format (has 'documents' key)
            if isinstance(data, dict) and 'documents' in data:
                print(f"⚠️  This file is already in vectorDB-ready format!")
                print(f"   Skipping: {os.path.basename(self.chunks_file)}")
                return []
            
            # Check if it's a list of chunks
            if isinstance(data, list):
                self.chunks = data
                print(f"✅ Loaded {len(self.chunks)} chunks")
                return self.chunks
            else:
                print(f"⚠️  Unexpected file format!")
                print(f"   Expected: list of chunks")
                print(f"   Got: {type(data)}")
                return []
                
        except json.JSONDecodeError as e:
            print(f"❌ Error: Invalid JSON format in {os.path.basename(self.chunks_file)}")
            print(f"   Details: {e}")
            return []
        except Exception as e:
            print(f"❌ Error loading file: {e}")
            return []
    
    def filter_quality_chunks(self, min_words: int = 50, max_words: int = 600) -> List[Dict]:
        """
        Filter chunks based on quality criteria
        
        Args:
            min_words: Minimum words per chunk
            max_words: Maximum words per chunk
        """
        print(f"\n🔍 Filtering quality chunks (min={min_words}, max={max_words} words)...")
        
        filtered = []
        
        for chunk in self.chunks:
            word_count = chunk['word_count']
            
            # Check word count
            if word_count < min_words or word_count > max_words:
                continue
            
            # Check if has medical entities
            if not chunk['metadata'].get('medical_entities'):
                continue
            
            # Check content quality
            text = chunk['text'].lower()
            
            # Skip if mostly references/citations
            if text.count('et al') > 3 or text.count('ibid') > 2:
                continue
            
            # Must contain substantive medical content
            medical_keywords = [
                'kidney', 'renal', 'ckd', 'gfr', 'patient', 'treatment',
                'disease', 'clinical', 'diagnosis', 'therapy', 'risk',
                'recommendation', 'guideline', 'assessment', 'management'
            ]
            
            if sum(1 for kw in medical_keywords if kw in text) < 2:
                continue
            
            filtered.append(chunk)
        
        print(f"✅ Filtered to {len(filtered)} high-quality chunks")
        print(f"   Removed: {len(self.chunks) - len(filtered)} chunks")
        
        return filtered
    
    def prepare_for_chromadb(self, chunks: List[Dict]) -> Dict:
        """
        Prepare chunks in ChromaDB format
        
        Returns:
            Dictionary with documents, metadatas, and ids
        """
        print(f"\n🔧 Preparing {len(chunks)} chunks for ChromaDB...")
        
        documents = []
        metadatas = []
        ids = []
        
        # Get base name for unique IDs
        base_name = Path(self.chunks_file).stem.replace('_chunks', '').replace('-', '_').lower()
        
        for chunk in chunks:
            # Document text
            documents.append(chunk['text'])
            
            # Metadata (ChromaDB requires simple types)
            metadata = {
                'source': chunk['metadata'].get('source_file', os.path.basename(self.chunks_file)),
                'chunk_id': chunk['chunk_id'],
                'content_type': chunk['metadata'].get('content_type', 'general'),
                'word_count': chunk['word_count'],
                'has_ckd': 'CKD' in chunk['metadata'].get('medical_entities', []),
                'has_gfr': 'GFR' in chunk['metadata'].get('medical_entities', []),
                'has_diabetes': 'diabetes' in chunk['metadata'].get('medical_entities', []),
                'has_hypertension': 'hypertension' in chunk['metadata'].get('medical_entities', []),
                'has_dialysis': 'dialysis' in chunk['metadata'].get('medical_entities', []),
                'medical_entities': ','.join(chunk['metadata'].get('medical_entities', [])),
                'year': chunk['metadata'].get('year', datetime.now().year),
                'organization': chunk['metadata'].get('organization', 'Unknown')
            }
            
            if chunk['metadata'].get('section'):
                metadata['section'] = chunk['metadata']['section'][:100]  # Limit length
            
            metadatas.append(metadata)
            
            # Unique ID based on source file
            ids.append(f"{base_name}_{chunk['chunk_id']}")
        
        print(f"✅ Prepared {len(documents)} documents for ChromaDB")
        
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
        
        print(f"\n💾 Saved vectorDB-ready data to: {output_path}")
        
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
        
        print(f"💾 Saved preparation summary to: {summary_path}")
        
        return output_path
    
    def generate_sample_queries(self, output_file: str = None):
        """Generate sample queries for testing"""
        
        if not output_file:
            # Save sample queries in the main output directory
            output_file = os.path.join(self.output_dir, 'sample_queries.txt')
        
        queries = [
            # General CKD queries
            "What is chronic kidney disease?",
            "How is CKD diagnosed?",
            "What are the stages of chronic kidney disease?",
            "What causes chronic kidney disease?",
            
            # GFR related
            "What is GFR and how is it measured?",
            "What is a normal GFR value?",
            "How to calculate eGFR?",
            "What does low GFR mean?",
            
            # Treatment queries
            "What are treatment options for CKD?",
            "When should dialysis be started?",
            "What medications are used for CKD?",
            "How to manage CKD progression?",
            
            # Risk factors
            "What are risk factors for CKD?",
            "How does diabetes affect kidneys?",
            "Can high blood pressure cause kidney disease?",
            
            # Monitoring and management
            "How often should CKD patients be monitored?",
            "What blood tests are needed for CKD?",
            "What dietary changes are recommended for CKD?",
            "How to prevent CKD progression?",
            
            # Complications
            "What are complications of CKD?",
            "How does CKD affect the heart?",
            "What is anemia in CKD?",
            "How to manage phosphorus in CKD?",
            
            # Specific populations
            "How is CKD managed in diabetic patients?",
            "CKD treatment for elderly patients",
            "Pregnancy and chronic kidney disease",
            
            # Advanced topics
            "What is albuminuria?",
            "How to interpret urine protein tests?",
            "What are KDIGO guidelines for CKD?",
            "When is kidney biopsy indicated?"
        ]
        
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write("=" * 70 + "\n")
            f.write("SAMPLE QUERIES FOR VECTORDB TESTING\n")
            f.write("=" * 70 + "\n\n")
            
            for i, query in enumerate(queries, 1):
                f.write(f"{i}. {query}\n")
        
        print(f"📝 Generated {len(queries)} sample queries: {output_file}")
        
        return queries
    
    def process(self):
        """Full preparation pipeline"""
        
        print("=" * 70)
        print("🚀 VECTOR DATABASE PREPARATION PIPELINE")
        print("=" * 70)
        print(f"Processing: {os.path.basename(self.chunks_file)}")
        print("=" * 70)
        
        # Load chunks
        chunks_loaded = self.load_chunks()
        
        # Check if loading failed or file was already processed
        if not chunks_loaded or len(self.chunks) == 0:
            print("\n⚠️  File skipped (empty, invalid, or already in vectorDB format)")
            return None
        
        # Filter quality chunks
        filtered_chunks = self.filter_quality_chunks()
        
        if len(filtered_chunks) == 0:
            print("\n⚠️  No chunks passed quality filtering!")
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
        print("📊 PREPARATION SUMMARY")
        print("=" * 70)
        print(f"Input file: {os.path.basename(self.chunks_file)}")
        print(f"Total input chunks: {len(self.chunks)}")
        print(f"Quality filtered chunks: {len(filtered_chunks)}")
        print(f"Documents prepared: {len(prepared_data['documents'])}")
        print(f"Output file: {os.path.basename(output_file)}")
        print("=" * 70)
        print("✅ PREPARATION COMPLETE!")
        print("=" * 70)
        print(f"\n📂 Output Locations:")
        print(f"   📄 VectorDB file: {self.vectordb_dir}")
        print(f"   📊 Summary file: {self.summaries_dir}")
        print("=" * 70)
        
        return prepared_data


def find_chunk_files(directory: str = "data/processed") -> List[str]:
    """
    Find all *_chunks.json files in the directory
    
    Args:
        directory: Directory to search for chunk files
        
    Returns:
        List of paths to chunk files
    """
    pattern = os.path.join(directory, "*_chunks.json")
    chunk_files = glob.glob(pattern)
    
    # Filter out vectordb_ready files and other processed files
    chunk_files = [
        cf for cf in chunk_files 
        if not os.path.basename(cf).endswith('_vectordb_ready.json') 
        and not os.path.basename(cf).startswith('vectordb_ready')
        and not os.path.basename(cf).startswith('.')
    ]
    
    return sorted(chunk_files)


def main():
    """Main execution - processes all unprocessed chunk files"""
    
    print("=" * 70)
    print("📂 SCANNING FOR CHUNK FILES")
    print("=" * 70)
    
    # Find all chunk files
    chunk_files = find_chunk_files("data/processed")
    
    if not chunk_files:
        print("❌ No *_chunks.json files found in data/processed/")
        print("   Run pdf_extractor.py first to create chunk files.")
        return
    
    print(f"✅ Found {len(chunk_files)} chunk file(s):")
    for i, cf in enumerate(chunk_files, 1):
        print(f"   {i}. {os.path.basename(cf)}")
    print()
    
    # Check which files have been processed
    temp_preparator = VectorDBPreparator(chunk_files[0])  # Just to access tracker methods
    processed_files = temp_preparator.get_processed_files()
    
    # Filter to only unprocessed files
    unprocessed_files = [cf for cf in chunk_files if cf not in processed_files]
    
    if not unprocessed_files:
        print("=" * 70)
        print("✅ ALL FILES ALREADY PROCESSED!")
        print("=" * 70)
        print(f"Total files: {len(chunk_files)}")
        print(f"Already processed: {len(processed_files)}")
        print(f"New files to process: 0")
        print("\nTo reprocess files, delete: data/processed/.processed_chunks_tracker.json")
        print("=" * 70)
        return
    
    print("=" * 70)
    print("📋 PROCESSING STATUS")
    print("=" * 70)
    print(f"Total chunk files: {len(chunk_files)}")
    print(f"Already processed: {len(processed_files)}")
    print(f"New files to process: {len(unprocessed_files)}")
    print("\n🆕 Files to process:")
    for i, cf in enumerate(unprocessed_files, 1):
        print(f"   {i}. {os.path.basename(cf)}")
    print("=" * 70)
    print()
    
    # Process each unprocessed file
    results = []
    successful = 0
    failed = 0
    
    for idx, chunk_file in enumerate(unprocessed_files, 1):
        print("\n" + "=" * 70)
        print(f"📄 PROCESSING FILE {idx}/{len(unprocessed_files)}")
        print("=" * 70)
        
        try:
            preparator = VectorDBPreparator(chunk_file)
            prepared_data = preparator.process()
            
            if prepared_data:
                results.append({
                    'file': chunk_file,
                    'status': 'success',
                    'documents': len(prepared_data['documents'])
                })
                successful += 1
            else:
                results.append({
                    'file': chunk_file,
                    'status': 'skipped',
                    'reason': 'No chunks passed quality filter'
                })
                # Still mark as processed to avoid retry
                preparator.mark_as_processed(chunk_file)
                
        except Exception as e:
            print(f"\n❌ Error processing file: {e}")
            results.append({
                'file': chunk_file,
                'status': 'error',
                'error': str(e)
            })
            failed += 1
    
    # Generate sample queries (only once for all files)
    if successful > 0:
        print("\n" + "=" * 70)
        print("📝 GENERATING SAMPLE QUERIES")
        print("=" * 70)
        temp_preparator = VectorDBPreparator(unprocessed_files[0])
        temp_preparator.generate_sample_queries()
    
    # Print final summary
    print("\n" + "=" * 70)
    print("🎉 BATCH PREPARATION COMPLETE!")
    print("=" * 70)
    print(f"Total files processed: {len(unprocessed_files)}")
    print(f"✅ Successful: {successful}")
    print(f"⚠️  Skipped: {len([r for r in results if r['status'] == 'skipped'])}")
    print(f"❌ Failed: {failed}")
    print(f"📁 Output directory: data/processed")
    print("\n📊 Results:")
    for i, result in enumerate(results, 1):
        filename = os.path.basename(result['file'])
        if result['status'] == 'success':
            print(f"   {i}. ✅ {filename} ({result['documents']} documents)")
        elif result['status'] == 'skipped':
            print(f"   {i}. ⚠️  {filename} - {result.get('reason', 'Skipped')}")
        else:
            print(f"   {i}. ❌ {filename} - Error: {result.get('error', 'Unknown')}")
    print("=" * 70)
    
    return results


if __name__ == "__main__":
    main()
