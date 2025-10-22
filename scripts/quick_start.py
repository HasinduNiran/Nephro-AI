"""
Quick Start Guide - Using VectorDB Ready Documents
Demonstrates how to load and use the vectorDB-ready chunks from multiple source files
"""

import json
from pathlib import Path
import glob


def load_vectordb_data(vectordb_dir: str = "data/vectordb_ready/documents"):
    """Load all processed chunks ready for vectorization from multiple JSON files"""
    
    print(" Loading vectorDB-ready data from multiple sources...")
    
    # Find all vectordb_ready JSON files
    vectordb_files = glob.glob(f"{vectordb_dir}/*_vectordb_ready.json")
    
    if not vectordb_files:
        print(f" No vectordb_ready files found in {vectordb_dir}")
        return None
    
    print(f"   Found {len(vectordb_files)} source files")
    
    # Combine all data
    all_documents = []
    all_metadatas = []
    all_ids = []
    
    for file_path in vectordb_files:
        with open(file_path, 'r', encoding='utf-8') as f:
            file_data = json.load(f)
            all_documents.extend(file_data['documents'])
            all_metadatas.extend(file_data['metadatas'])
            all_ids.extend(file_data['ids'])
        print(f"   ✓ Loaded {Path(file_path).name}: {len(file_data['documents'])} documents")
    
    data = {
        'documents': all_documents,
        'metadatas': all_metadatas,
        'ids': all_ids
    }
    
    print(f" Total loaded: {len(data['documents'])} documents from {len(vectordb_files)} files")
    
    return data


def explore_chunks(data: dict):
    """Explore the structure and content of chunks"""
    
    print("\n" + "=" * 70)
    print(" EXPLORING CHUNKS")
    print("=" * 70)
    
    # Basic statistics
    print(f"\n Basic Statistics:")
    print(f"   Total documents: {len(data['documents'])}")
    print(f"   Total metadata entries: {len(data['metadatas'])}")
    print(f"   Total IDs: {len(data['ids'])}")
    
    # Sample document
    print(f"\n Sample Document (Chunk 0):")
    print(f"   ID: {data['ids'][0]}")
    print(f"   Text length: {len(data['documents'][0])} characters")
    print(f"   Text preview: {data['documents'][0][:200]}...")
    
    # Sample metadata
    print(f"\n️  Sample Metadata:")
    for key, value in data['metadatas'][0].items():
        print(f"   {key}: {value}")
    
    # Content type distribution
    content_types = {}
    for meta in data['metadatas']:
        ct = meta['content_type']
        content_types[ct] = content_types.get(ct, 0) + 1
    
    print(f"\n Content Type Distribution:")
    for ct, count in sorted(content_types.items(), key=lambda x: x[1], reverse=True):
        print(f"   {ct}: {count} chunks ({count/len(data['documents'])*100:.1f}%)")
    
    # Medical entity coverage
    entity_coverage = {
        'CKD': sum(1 for m in data['metadatas'] if m['has_ckd']),
        'GFR': sum(1 for m in data['metadatas'] if m['has_gfr']),
        'Diabetes': sum(1 for m in data['metadatas'] if m['has_diabetes']),
        'Hypertension': sum(1 for m in data['metadatas'] if m['has_hypertension']),
        'Dialysis': sum(1 for m in data['metadatas'] if m['has_dialysis'])
    }
    
    print(f"\n Medical Entity Coverage:")
    for entity, count in sorted(entity_coverage.items(), key=lambda x: x[1], reverse=True):
        print(f"   {entity}: {count} chunks ({count/len(data['documents'])*100:.1f}%)")


def find_chunks_by_entity(data: dict, entity: str):
    """Find chunks containing a specific medical entity"""
    
    entity_field = f'has_{entity.lower()}'
    
    matching_chunks = [
        (i, data['ids'][i], data['metadatas'][i])
        for i in range(len(data['documents']))
        if data['metadatas'][i].get(entity_field, False)
    ]
    
    print(f"\n Found {len(matching_chunks)} chunks with {entity}")
    
    if matching_chunks:
        print(f"\n   Sample matches:")
        for i, (idx, chunk_id, metadata) in enumerate(matching_chunks[:3]):
            print(f"   {i+1}. {chunk_id} - {metadata['content_type']}")
            print(f"      Entities: {metadata['medical_entities']}")
            print(f"      Preview: {data['documents'][idx][:100]}...")
    
    return matching_chunks


def find_chunks_by_type(data: dict, content_type: str):
    """Find chunks of a specific content type"""
    
    matching_chunks = [
        (i, data['ids'][i], data['metadatas'][i])
        for i in range(len(data['documents']))
        if data['metadatas'][i]['content_type'] == content_type
    ]
    
    print(f"\n Found {len(matching_chunks)} chunks of type '{content_type}'")
    
    if matching_chunks:
        print(f"\n   Sample matches:")
        for i, (idx, chunk_id, metadata) in enumerate(matching_chunks[:3]):
            print(f"   {i+1}. {chunk_id}")
            print(f"      Entities: {metadata['medical_entities']}")
            print(f"      Words: {metadata['word_count']}")
            print(f"      Preview: {data['documents'][idx][:100]}...")
    
    return matching_chunks


def search_text(data: dict, query: str):
    """Simple text search (case-insensitive)"""
    
    query_lower = query.lower()
    
    matching_chunks = [
        (i, data['ids'][i], data['metadatas'][i])
        for i in range(len(data['documents']))
        if query_lower in data['documents'][i].lower()
    ]
    
    print(f"\n Text search for '{query}': {len(matching_chunks)} matches")
    
    if matching_chunks:
        print(f"\n   Sample matches:")
        for i, (idx, chunk_id, metadata) in enumerate(matching_chunks[:3]):
            # Find the context around the query
            text = data['documents'][idx]
            text_lower = text.lower()
            pos = text_lower.find(query_lower)
            start = max(0, pos - 50)
            end = min(len(text), pos + len(query) + 50)
            context = text[start:end]
            
            print(f"   {i+1}. {chunk_id} - {metadata['content_type']}")
            print(f"      Context: ...{context}...")
    
    return matching_chunks


def main():
    """Main demonstration"""
    
    print("=" * 70)
    print(" VECTORDB-READY CHUNKS - QUICK START GUIDE")
    print("=" * 70)
    
    # Load data
    data = load_vectordb_data()
    
    # Explore structure
    explore_chunks(data)
    
    # Example searches
    print("\n" + "=" * 70)
    print(" EXAMPLE SEARCHES")
    print("=" * 70)
    
    # Search by entity
    find_chunks_by_entity(data, 'CKD')
    
    # Search by content type
    find_chunks_by_type(data, 'recommendation')
    
    # Text search
    search_text(data, 'glomerular filtration rate')
    
    # Next steps
    print("\n" + "=" * 70)
    print(" NEXT STEPS")
    print("=" * 70)
    print("""
To use this data with ChromaDB:

1. Install ChromaDB:
   pip install chromadb

2. Create collection and add documents:
   
   import chromadb
   from chromadb.config import Settings
   
   # Initialize client
   client = chromadb.PersistentClient(path="./vectordb/chroma_db")
   
   # Create collection
   collection = client.create_collection(
       name="nephro_ai_medical_kb",
       metadata={"description": "Nephro-AI Medical Knowledge Base"}
   )
   
   # Add documents
   collection.add(
       documents=data['documents'],
       metadatas=data['metadatas'],
       ids=data['ids']
   )
   
3. Query the collection:
   
   results = collection.query(
       query_texts=["What is chronic kidney disease?"],
       n_results=5
   )

For more details, see the scripts in the scripts/ directory.
    """)
    
    print("=" * 70)
    print(" GUIDE COMPLETE")
    print("=" * 70)


if __name__ == "__main__":
    main()
