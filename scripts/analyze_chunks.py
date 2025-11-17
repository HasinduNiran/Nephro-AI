"""
Chunk Analysis and Visualization Tool
======================================
Analyzes the processed chunks from vectordb_ready files and generates reports.

This script provides insights into the processed medical knowledge chunks AFTER
they've been filtered and prepared for vectorization but BEFORE they're added
to ChromaDB. It helps you understand the quality and composition of your data.

Key Features:
- Load and analyze all vectordb_ready JSON files
- Calculate statistics (word counts, content types, medical entities)
- Generate human-readable reports
- Export chunks to a readable text file for manual review

Pipeline Position:
    PDF → extract → clean → chunk → filter → prepare → [THIS TOOL ANALYZES HERE] → vectorize → ChromaDB

Usage:
    python scripts/analyze_chunks.py
    
Output:
    - Console report with statistics
    - data/processed/all_chunks_readable.txt (exported chunks)
"""

import json
import os
import glob
from collections import Counter  # Count occurrences efficiently (like word frequency)
from pathlib import Path


def load_all_chunks(vectordb_dir: str = "data/vectordb_ready/documents"):
    """
    Load all chunks from multiple vectordb_ready JSON files.
    
    This function reads all *_vectordb_ready.json files created by prepare_vectordb.py
    and combines them into a single list of chunks for analysis.
    
    vectordb_ready JSON Format:
        {
            'documents': ["text1", "text2", ...],
            'metadatas': [{"source": "...", "has_ckd": true, ...}, ...],
            'ids': ["chunk_0", "chunk_1", ...]
        }
    
    Args:
        vectordb_dir (str): Directory containing vectordb_ready JSON files
                           Default: "data/vectordb_ready/documents"
    
    Returns:
        list: List of chunk dictionaries with structure:
              {
                  'chunk_id': str,        # Unique identifier
                  'text': str,            # Chunk text content
                  'metadata': dict,       # Medical entities, content type, etc.
                  'word_count': int       # Number of words in chunk
              }
    """
    # Find all vectordb_ready JSON files (handles multiple source PDFs)
    vectordb_files = glob.glob(f"{vectordb_dir}/*_vectordb_ready.json")
    
    # Check if files exist
    if not vectordb_files:
        print(f"️ No vectordb_ready files found in {vectordb_dir}")
        return []
    
    all_chunks = []  # Combined list from all files
    
    # Process each vectordb_ready file
    for file_path in vectordb_files:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            
            # Convert ChromaDB format (parallel arrays) to chunk objects
            # This makes it easier to work with each chunk as a complete unit
            for i in range(len(data['documents'])):
                chunk = {
                    'chunk_id': data['ids'][i],           # From ids array
                    'text': data['documents'][i],         # From documents array
                    'metadata': data['metadatas'][i],     # From metadatas array
                    'word_count': len(data['documents'][i].split())  # Calculate on the fly
                }
                all_chunks.append(chunk)
        
        # Progress feedback
        print(f"    Loaded {Path(file_path).name}: {len(data['documents'])} chunks")
    
    return all_chunks


def analyze_chunks(vectordb_dir: str = "data/vectordb_ready/documents"):
    """
    Analyze the processed chunks and generate comprehensive statistics.
    
    This function provides insights into:
    - Total chunk count
    - Word count distribution (average, min, max, median)
    - Content type distribution (recommendation, evidence, definition, etc.)
    - Medical entity coverage (which medical terms appear most)
    - Sample chunks from each category
    - Section distribution (if available)
    
    Args:
        vectordb_dir (str): Directory containing vectordb_ready JSON files
    
    Output:
        Prints formatted report to console
    """
    print("=" * 70)
    print(" CHUNK ANALYSIS REPORT")
    print("=" * 70)
    
    # STEP 1: Load all chunks from all vectordb_ready files
    print(f"\n Loading chunks from {vectordb_dir}...")
    chunks = load_all_chunks(vectordb_dir)
    
    # Exit if no chunks found
    if not chunks:
        return
    
    print(f"\n Total Chunks: {len(chunks)}")
    
    # STEP 2: Word Count Statistics
    # Analyze chunk sizes to understand text distribution
    word_counts = [chunk['word_count'] for chunk in chunks]
    print(f"\n Word Count Statistics:")
    print(f"   Average: {sum(word_counts) / len(word_counts):.1f} words")
    print(f"   Min: {min(word_counts)} words")
    print(f"   Max: {max(word_counts)} words")
    print(f"   Median: {sorted(word_counts)[len(word_counts)//2]} words")
    
    # STEP 3: Content Type Distribution
    # Shows how chunks are classified (recommendation vs evidence vs definition)
    content_types = [chunk['metadata'].get('content_type', 'unknown') for chunk in chunks]
    type_counts = Counter(content_types)  # Count occurrences of each type
    print(f"\n️  Content Type Distribution:")
    for content_type, count in type_counts.most_common():
        percentage = (count / len(chunks)) * 100
        print(f"   {content_type}: {count} ({percentage:.1f}%)")
    
    # STEP 4: Medical Entity Analysis
    # Shows which medical terms appear most frequently across all chunks
    # This helps verify that the chunks contain relevant medical content
    all_entities = []
    for chunk in chunks:
        # Get list of detected medical entities from metadata
        entities = chunk['metadata'].get('medical_entities', [])
        all_entities.extend(entities)  # Combine all entities from all chunks
    
    entity_counts = Counter(all_entities)  # Count frequency of each entity
    print(f"\n Top Medical Entities:")
    for entity, count in entity_counts.most_common(10):  # Show top 10
        print(f"   {entity}: {count} occurrences")
    
    # STEP 5: Sample Chunks
    # Display one example chunk from each content type for manual review
    print(f"\n Sample Chunks:")
    print("\n" + "-" * 70)
    
    # Check each major content type
    for i, chunk_type in enumerate(['recommendation', 'definition', 'evidence', 'general']):
        # Find first chunk of this type (to show as example)
        for chunk in chunks:
            if chunk['metadata'].get('content_type') == chunk_type:
                print(f"\n{i+1}. {chunk_type.upper()} (Chunk #{chunk['chunk_id']})")
                print(f"   Words: {chunk['word_count']}")
                print(f"   Entities: {', '.join(chunk['metadata'].get('medical_entities', []))}")
                print(f"   Text preview: {chunk['text'][:200]}...")
                print("-" * 70)
                break  # Found one example, move to next type
    
    # STEP 6: Section Distribution (if available)
    # Shows which document sections have the most chunks
    # Note: Section metadata is optional and may not be present in all chunks
    sections = [chunk['metadata'].get('section', 'No section') for chunk in chunks if chunk['metadata'].get('section')]
    if sections:
        section_counts = Counter(sections)
        print(f"\n Top Sections:")
        for section, count in section_counts.most_common(10):
            # Truncate long section names to 50 characters for display
            print(f"   {section[:50]}: {count} chunks")
    
    # Report complete
    print("\n" + "=" * 70)
    print(" ANALYSIS COMPLETE")
    print("=" * 70)


def export_to_txt(vectordb_dir: str = "data/vectordb_ready/documents", output_file: str = None):
    """
    Export all chunks to a human-readable text file for manual review.
    
    This creates a formatted text file where each chunk is displayed with:
    - Sequential number (1, 2, 3...)
    - Unique chunk ID
    - Content type (recommendation, evidence, etc.)
    - Word count
    - Section (if available)
    - Medical entities detected
    - Source file
    - Full text content
    
    Useful for:
    - Manual quality review of chunks
    - Verifying medical content accuracy
    - Understanding chunk structure
    - Debugging extraction issues
    - Sharing chunks with non-technical stakeholders
    
    Args:
        vectordb_dir (str): Directory containing vectordb_ready JSON files
        output_file (str): Output file path. Default: "data/processed/all_chunks_readable.txt"
    
    Returns:
        str: Path to the exported file, or None if no chunks found
    """
    # Set default output path if not provided
    if not output_file:
        output_file = "data/processed/all_chunks_readable.txt"
    
    # Load all chunks
    chunks = load_all_chunks(vectordb_dir)
    
    # Exit if no chunks to export
    if not chunks:
        return None
    
    # Write formatted text file
    with open(output_file, 'w', encoding='utf-8') as f:
        # Write header
        f.write("=" * 70 + "\n")
        f.write("NEPHRO-AI MEDICAL KNOWLEDGE BASE - PROCESSED CHUNKS\n")
        f.write("=" * 70 + "\n\n")
        
        # Write each chunk with full metadata and text
        for idx, chunk in enumerate(chunks):
            # Chunk header
            f.write(f"\n{'=' * 70}\n")
            f.write(f"CHUNK {idx + 1} of {len(chunks)}\n")
            f.write(f"{'=' * 70}\n")
            
            # Basic metadata (always present)
            f.write(f"ID: {chunk['chunk_id']}\n")
            f.write(f"Content Type: {chunk['metadata'].get('content_type', 'N/A')}\n")
            f.write(f"Words: {chunk['word_count']}\n")
            
            # Optional metadata (only if present)
            if chunk['metadata'].get('section'):
                f.write(f"Section: {chunk['metadata']['section']}\n")
            
            if chunk['metadata'].get('medical_entities'):
                f.write(f"Medical Entities: {chunk['metadata']['medical_entities']}\n")
            
            if chunk['metadata'].get('source'):
                f.write(f"Source: {chunk['metadata']['source']}\n")
            
            # Full text content
            f.write(f"\n{'-' * 70}\n")
            f.write(f"{chunk['text']}\n")
            f.write(f"{'-' * 70}\n\n")
    
    print(f" Exported readable version to: {output_file}")
    return output_file


def main():
    """
    Main execution function.
    
    Workflow:
    1. Check if vectordb_ready directory exists
    2. Load and analyze all chunks (print statistics to console)
    3. Export chunks to readable text file for manual review
    
    Exit Conditions:
    - If vectordb_ready directory doesn't exist → print error and exit
    - If no vectordb_ready JSON files found → load_all_chunks() returns empty list
    """
    # Configuration
    vectordb_dir = "data/vectordb_ready/documents"
    
    # Validation: Check if directory exists
    if not os.path.exists(vectordb_dir):
        print(f" Error: {vectordb_dir} not found!")
        print("   Please ensure vectordb_ready files exist.")
        print("   Run 'python scripts/prepare_vectordb.py' first.")
        return
    
    # STEP 1: Analyze chunks and print statistics
    analyze_chunks(vectordb_dir)
    
    # STEP 2: Export to readable text file
    print("\n")
    export_to_txt(vectordb_dir)


if __name__ == "__main__":
    main()
