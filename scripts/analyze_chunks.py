"""
Chunk Analysis and Visualization Tool
Analyzes the processed chunks from vectordb_ready files and generates reports
"""

import json
import os
import glob
from collections import Counter
from pathlib import Path


def load_all_chunks(vectordb_dir: str = "data/vectordb_ready/documents"):
    """Load all chunks from multiple vectordb_ready JSON files"""
    
    vectordb_files = glob.glob(f"{vectordb_dir}/*_vectordb_ready.json")
    
    if not vectordb_files:
        print(f" No vectordb_ready files found in {vectordb_dir}")
        return []
    
    all_chunks = []
    
    for file_path in vectordb_files:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            # Convert to chunk format
            for i in range(len(data['documents'])):
                chunk = {
                    'chunk_id': data['ids'][i],
                    'text': data['documents'][i],
                    'metadata': data['metadatas'][i],
                    'word_count': len(data['documents'][i].split())
                }
                all_chunks.append(chunk)
        
        print(f"   Loaded {Path(file_path).name}: {len(data['documents'])} chunks")
    
    return all_chunks


def analyze_chunks(vectordb_dir: str = "data/vectordb_ready/documents"):
    """Analyze the processed chunks and generate statistics"""
    
    print("=" * 70)
    print(" CHUNK ANALYSIS REPORT")
    print("=" * 70)
    
    # Load all chunks
    print(f"\n Loading chunks from {vectordb_dir}...")
    chunks = load_all_chunks(vectordb_dir)
    
    if not chunks:
        return
    
    print(f"\n Total Chunks: {len(chunks)}")
    
    # Word count statistics
    word_counts = [chunk['word_count'] for chunk in chunks]
    print(f"\n Word Count Statistics:")
    print(f"   Average: {sum(word_counts) / len(word_counts):.1f} words")
    print(f"   Min: {min(word_counts)} words")
    print(f"   Max: {max(word_counts)} words")
    print(f"   Median: {sorted(word_counts)[len(word_counts)//2]} words")
    
    # Content type distribution
    content_types = [chunk['metadata'].get('content_type', 'unknown') for chunk in chunks]
    type_counts = Counter(content_types)
    print(f"\n️  Content Type Distribution:")
    for content_type, count in type_counts.most_common():
        percentage = (count / len(chunks)) * 100
        print(f"   {content_type}: {count} ({percentage:.1f}%)")
    
    # Medical entities
    all_entities = []
    for chunk in chunks:
        entities = chunk['metadata'].get('medical_entities', [])
        all_entities.extend(entities)
    
    entity_counts = Counter(all_entities)
    print(f"\n Top Medical Entities:")
    for entity, count in entity_counts.most_common(10):
        print(f"   {entity}: {count} occurrences")
    
    # Sample chunks
    print(f"\n Sample Chunks:")
    print("\n" + "-" * 70)
    
    for i, chunk_type in enumerate(['recommendation', 'definition', 'evidence', 'general']):
        # Find first chunk of this type
        for chunk in chunks:
            if chunk['metadata'].get('content_type') == chunk_type:
                print(f"\n{i+1}. {chunk_type.upper()} (Chunk #{chunk['chunk_id']})")
                print(f"   Words: {chunk['word_count']}")
                print(f"   Entities: {', '.join(chunk['metadata'].get('medical_entities', []))}")
                print(f"   Text preview: {chunk['text'][:200]}...")
                print("-" * 70)
                break
    
    # Section distribution
    sections = [chunk['metadata'].get('section', 'No section') for chunk in chunks if chunk['metadata'].get('section')]
    if sections:
        section_counts = Counter(sections)
        print(f"\n Top Sections:")
        for section, count in section_counts.most_common(10):
            print(f"   {section[:50]}: {count} chunks")
    
    print("\n" + "=" * 70)
    print(" ANALYSIS COMPLETE")
    print("=" * 70)


def export_to_txt(vectordb_dir: str = "data/vectordb_ready/documents", output_file: str = None):
    """Export chunks to a readable text file"""
    
    if not output_file:
        output_file = "data/processed/all_chunks_readable.txt"
    
    chunks = load_all_chunks(vectordb_dir)
    
    if not chunks:
        return None
    
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write("=" * 70 + "\n")
        f.write("NEPHRO-AI MEDICAL KNOWLEDGE BASE - PROCESSED CHUNKS\n")
        f.write("=" * 70 + "\n\n")
        
        for idx, chunk in enumerate(chunks):
            f.write(f"\n{'=' * 70}\n")
            f.write(f"CHUNK {idx + 1} of {len(chunks)}\n")
            f.write(f"{'=' * 70}\n")
            f.write(f"ID: {chunk['chunk_id']}\n")
            f.write(f"Content Type: {chunk['metadata'].get('content_type', 'N/A')}\n")
            f.write(f"Words: {chunk['word_count']}\n")
            
            if chunk['metadata'].get('section'):
                f.write(f"Section: {chunk['metadata']['section']}\n")
            
            if chunk['metadata'].get('medical_entities'):
                f.write(f"Medical Entities: {chunk['metadata']['medical_entities']}\n")
            
            if chunk['metadata'].get('source'):
                f.write(f"Source: {chunk['metadata']['source']}\n")
            
            f.write(f"\n{'-' * 70}\n")
            f.write(f"{chunk['text']}\n")
            f.write(f"{'-' * 70}\n\n")
    
    print(f" Exported readable version to: {output_file}")
    return output_file


def main():
    """Main execution"""
    
    vectordb_dir = "data/vectordb_ready/documents"
    
    if not os.path.exists(vectordb_dir):
        print(f" Error: {vectordb_dir} not found!")
        print("   Please ensure vectordb_ready files exist.")
        return
    
    # Analyze chunks
    analyze_chunks(vectordb_dir)
    
    # Export to readable text
    print("\n")
    export_to_txt(vectordb_dir)


if __name__ == "__main__":
    main()
