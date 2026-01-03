"""
View ChromaDB Database Contents
"""
import chromadb
from chromadb.config import Settings
from collections import Counter

def view_database():
    # Connect to database
    client = chromadb.PersistentClient(
        path='vectordb/chroma_db',
        settings=Settings(anonymized_telemetry=False)
    )
    
    # Get collection
    col = client.get_collection('nephro_ai_medical_kb')
    
    print("=" * 70)
    print("📊 CHROMADB DATABASE VIEWER")
    print("=" * 70)
    print(f"📁 Collection: {col.name}")
    print(f"📄 Total Documents: {col.count()}")
    print(f"🧠 Embedding Model: {col.metadata.get('embedding_model', 'N/A')}")
    print(f"📐 Embedding Dimension: {col.metadata.get('embedding_dimension', 'N/A')}")
    print(f"📅 Created: {col.metadata.get('created_at', 'N/A')}")
    
    # Get all metadata for statistics
    all_data = col.get(limit=col.count(), include=['metadatas'])
    
    # Count content types
    content_types = Counter(m.get('content_type', 'unknown') for m in all_data['metadatas'])
    
    print("\n" + "=" * 70)
    print("📈 CONTENT TYPE DISTRIBUTION")
    print("=" * 70)
    for ctype, count in content_types.most_common():
        pct = (count / col.count()) * 100
        bar = "█" * int(pct / 2)
        print(f"  {ctype:15} : {count:4} ({pct:5.1f}%) {bar}")
    
    # Get sample documents
    sample = col.get(limit=5, include=['documents', 'metadatas'])
    
    print("\n" + "=" * 70)
    print("📝 SAMPLE DOCUMENTS (First 5)")
    print("=" * 70)
    
    for i in range(len(sample['ids'])):
        doc_id = sample['ids'][i]
        meta = sample['metadatas'][i]
        doc = sample['documents'][i][:200]
        
        print(f"\n[{i+1}] ID: {doc_id}")
        print(f"    Type: {meta.get('content_type', 'N/A')}")
        print(f"    Source: {meta.get('source', 'N/A')[:40]}...")
        print(f"    Words: {meta.get('word_count', 'N/A')}")
        print(f"    Has CKD: {meta.get('has_ckd', False)}")
        print(f"    Text: {doc}...")
    
    # Test a query
    print("\n" + "=" * 70)
    print("🔍 TEST QUERY: 'What is CKD?'")
    print("=" * 70)
    
    # We need embeddings for query - use simple get instead
    print("  (Use query_vectordb.py for semantic search)")
    
    print("\n" + "=" * 70)
    print("✅ DATABASE VIEWING COMPLETE")
    print("=" * 70)

if __name__ == "__main__":
    view_database()
