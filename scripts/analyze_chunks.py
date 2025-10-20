"""
Chunk Analysis and Visualization Tool
Analyzes the processed chunks and generates reports
"""

import json
import os
from collections import Counter
from pathlib import Path


def analyze_chunks(chunks_file: str):
    """Analyze the processed chunks and generate statistics"""
    
    print("=" * 70)
    print("📊 CHUNK ANALYSIS REPORT")
    print("=" * 70)
    
    # Load chunks
    with open(chunks_file, 'r', encoding='utf-8') as f:
        chunks = json.load(f)
    
    print(f"\n📦 Total Chunks: {len(chunks)}")
    
    # Word count statistics
    word_counts = [chunk['word_count'] for chunk in chunks]
    print(f"\n📝 Word Count Statistics:")
    print(f"   Average: {sum(word_counts) / len(word_counts):.1f} words")
    print(f"   Min: {min(word_counts)} words")
    print(f"   Max: {max(word_counts)} words")
    print(f"   Median: {sorted(word_counts)[len(word_counts)//2]} words")
    
    # Content type distribution
    content_types = [chunk['metadata'].get('content_type', 'unknown') for chunk in chunks]
    type_counts = Counter(content_types)
    print(f"\n🏷️  Content Type Distribution:")
    for content_type, count in type_counts.most_common():
        percentage = (count / len(chunks)) * 100
        print(f"   {content_type}: {count} ({percentage:.1f}%)")
    
    # Medical entities
    all_entities = []
    for chunk in chunks:
        entities = chunk['metadata'].get('medical_entities', [])
        all_entities.extend(entities)
    
    entity_counts = Counter(all_entities)
    print(f"\n🔬 Top Medical Entities:")
    for entity, count in entity_counts.most_common(10):
        print(f"   {entity}: {count} occurrences")
    
    # Sample chunks
    print(f"\n📄 Sample Chunks:")
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
        print(f"\n📑 Top Sections:")
        for section, count in section_counts.most_common(10):
            print(f"   {section[:50]}: {count} chunks")
    
    print("\n" + "=" * 70)
    print("✅ ANALYSIS COMPLETE")
    print("=" * 70)


def export_to_txt(chunks_file: str, output_file: str = None):
    """Export chunks to a readable text file"""
    
    if not output_file:
        base_name = Path(chunks_file).stem.replace('_chunks', '')
        output_file = str(Path(chunks_file).parent / f"{base_name}_readable.txt")
    
    with open(chunks_file, 'r', encoding='utf-8') as f:
        chunks = json.load(f)
    
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write("=" * 70 + "\n")
        f.write("KDIGO 2024 CKD GUIDELINE - PROCESSED KNOWLEDGE BASE\n")
        f.write("=" * 70 + "\n\n")
        
        for chunk in chunks:
            f.write(f"\n{'=' * 70}\n")
            f.write(f"CHUNK {chunk['chunk_id']} of {len(chunks)-1}\n")
            f.write(f"{'=' * 70}\n")
            f.write(f"Position: {chunk['metadata']['position']}\n")
            f.write(f"Content Type: {chunk['metadata'].get('content_type', 'N/A')}\n")
            f.write(f"Words: {chunk['word_count']}\n")
            
            if chunk['metadata'].get('section'):
                f.write(f"Section: {chunk['metadata']['section']}\n")
            
            if chunk['metadata'].get('medical_entities'):
                f.write(f"Medical Entities: {', '.join(chunk['metadata']['medical_entities'])}\n")
            
            f.write(f"\n{'-' * 70}\n")
            f.write(f"{chunk['text']}\n")
            f.write(f"{'-' * 70}\n\n")
    
    print(f"💾 Exported readable version to: {output_file}")
    return output_file


def main():
    """Main execution"""
    
    chunks_file = "data/processed/KDIGO-2024-CKD-Guideline_chunks.json"
    
    if not os.path.exists(chunks_file):
        print(f"❌ Error: {chunks_file} not found!")
        print("   Please run pdf_extractor.py first.")
        return
    
    # Analyze chunks
    analyze_chunks(chunks_file)
    
    # Export to readable text
    print("\n")
    export_to_txt(chunks_file)


if __name__ == "__main__":
    main()
