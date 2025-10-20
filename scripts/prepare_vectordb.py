"""
Vector Database Preparation Script
Prepares processed chunks for ChromaDB vectorization
"""

import json
import os
from datetime import datetime
from typing import List, Dict


class VectorDBPreparator:
    """Prepare chunks for vector database ingestion"""
    
    def __init__(self, chunks_file: str, output_dir: str = "data/processed"):
        """
        Initialize preparator
        
        Args:
            chunks_file: Path to processed chunks JSON
            output_dir: Directory for output files
        """
        self.chunks_file = chunks_file
        self.output_dir = output_dir
        self.chunks = []
        
        os.makedirs(output_dir, exist_ok=True)
    
    def load_chunks(self):
        """Load processed chunks"""
        print(f"📂 Loading chunks from: {self.chunks_file}")
        
        with open(self.chunks_file, 'r', encoding='utf-8') as f:
            self.chunks = json.load(f)
        
        print(f"✅ Loaded {len(self.chunks)} chunks")
        return self.chunks
    
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
        
        for chunk in chunks:
            # Document text
            documents.append(chunk['text'])
            
            # Metadata (ChromaDB requires simple types)
            metadata = {
                'source': chunk['metadata'].get('source_file', 'KDIGO-2024'),
                'chunk_id': chunk['chunk_id'],
                'content_type': chunk['metadata'].get('content_type', 'general'),
                'word_count': chunk['word_count'],
                'has_ckd': 'CKD' in chunk['metadata'].get('medical_entities', []),
                'has_gfr': 'GFR' in chunk['metadata'].get('medical_entities', []),
                'has_diabetes': 'diabetes' in chunk['metadata'].get('medical_entities', []),
                'has_hypertension': 'hypertension' in chunk['metadata'].get('medical_entities', []),
                'has_dialysis': 'dialysis' in chunk['metadata'].get('medical_entities', []),
                'medical_entities': ','.join(chunk['metadata'].get('medical_entities', [])),
                'year': chunk['metadata'].get('year', '2024'),
                'organization': chunk['metadata'].get('organization', 'KDIGO')
            }
            
            if chunk['metadata'].get('section'):
                metadata['section'] = chunk['metadata']['section'][:100]  # Limit length
            
            metadatas.append(metadata)
            
            # Unique ID
            ids.append(f"kdigo_2024_{chunk['chunk_id']}")
        
        print(f"✅ Prepared {len(documents)} documents for ChromaDB")
        
        return {
            'documents': documents,
            'metadatas': metadatas,
            'ids': ids
        }
    
    def save_vectordb_ready(self, prepared_data: Dict, filename: str = None):
        """Save prepared data for vector database"""
        
        if not filename:
            filename = "vectordb_ready_chunks.json"
        
        output_path = os.path.join(self.output_dir, filename)
        
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(prepared_data, f, indent=2, ensure_ascii=False)
        
        print(f"\n💾 Saved vectorDB-ready data to: {output_path}")
        
        # Save summary
        summary = {
            'total_documents': len(prepared_data['documents']),
            'source_file': self.chunks_file,
            'preparation_date': datetime.now().isoformat(),
            'avg_word_count': sum(m['word_count'] for m in prepared_data['metadatas']) / len(prepared_data['metadatas']),
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
        
        summary_path = os.path.join(self.output_dir, 'vectordb_preparation_summary.json')
        with open(summary_path, 'w', encoding='utf-8') as f:
            json.dump(summary, f, indent=2, ensure_ascii=False)
        
        print(f"💾 Saved preparation summary to: {summary_path}")
        
        return output_path
    
    def generate_sample_queries(self, output_file: str = None):
        """Generate sample queries for testing"""
        
        if not output_file:
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
        
        # Load chunks
        self.load_chunks()
        
        # Filter quality chunks
        filtered_chunks = self.filter_quality_chunks()
        
        # Prepare for ChromaDB
        prepared_data = self.prepare_for_chromadb(filtered_chunks)
        
        # Save prepared data
        output_file = self.save_vectordb_ready(prepared_data)
        
        # Generate sample queries
        self.generate_sample_queries()
        
        # Print summary
        print("\n" + "=" * 70)
        print("📊 PREPARATION SUMMARY")
        print("=" * 70)
        print(f"Input file: {self.chunks_file}")
        print(f"Total input chunks: {len(self.chunks)}")
        print(f"Quality filtered chunks: {len(filtered_chunks)}")
        print(f"Documents prepared: {len(prepared_data['documents'])}")
        print(f"Output file: {output_file}")
        print("=" * 70)
        print("✅ PREPARATION COMPLETE - Ready for vectorization!")
        print("=" * 70)
        
        return prepared_data


def main():
    """Main execution"""
    
    chunks_file = "data/processed/KDIGO-2024-CKD-Guideline_chunks.json"
    
    if not os.path.exists(chunks_file):
        print(f"❌ Error: {chunks_file} not found!")
        return
    
    preparator = VectorDBPreparator(chunks_file)
    prepared_data = preparator.process()
    
    return prepared_data


if __name__ == "__main__":
    main()
