import json
import os
import sys
from pathlib import Path
from datetime import datetime
from typing import List, Dict
import glob

import chromadb
from chromadb.config import Settings
from tqdm import tqdm

# Add parent directory to path for config import
sys.path.insert(0, str(Path(__file__).parent.parent))

# Import project configuration
import config

# Import OpenAI embeddings (via OpenRouter)
from openai_embeddings import OpenAIEmbeddings


class VectorDBBuilder:
    """Build ChromaDB vector database from processed chunks"""
    
    def __init__(
        self,
        vectordb_dir: str = None,
        db_path: str = None,
        collection_name: str = None,
        model_name: str = None,
        api_key: str = None
    ):
      
        self.vectordb_dir = vectordb_dir or str(config.VECTORDB_READY_DIR)
        self.db_path = db_path or str(config.CHROMA_DB_PATH)
        self.collection_name = collection_name or config.COLLECTION_NAME
        self.model_name = model_name or config.EMBEDDING_MODEL
        self.api_key = api_key or config.OPENROUTER_API_KEY
        
        # Create DB directory
        os.makedirs(self.db_path, exist_ok=True)
        
        print("=" * 70)
        print("️  CHROMADB VECTOR DATABASE BUILDER")
        print("=" * 70)
        print(f" VectorDB documents: {vectordb_dir}")
        print(f" Database path: {db_path}")
        print(f" Collection: {collection_name}")
        print(f" Embedding model: {model_name}")
        print("=" * 70 + "\n")
    
    def load_data(self, existing_ids: set = None) -> Dict:
      
        print(" Loading vectordb_ready documents...")
        
        # Find all vectordb_ready JSON files
        if not os.path.exists(self.vectordb_dir):
            print(f" Error: Directory not found: {self.vectordb_dir}")
            print(f"   Please run prepare_vectordb.py first to generate vectordb_ready files")
            sys.exit(1)
        
        vectordb_files = glob.glob(os.path.join(self.vectordb_dir, "*_vectordb_ready.json"))
        
        if not vectordb_files:
            print(f" Error: No vectordb_ready files found in {self.vectordb_dir}")
            print(f"   Please run prepare_vectordb.py first")
            sys.exit(1)
        
        print(f"   Found {len(vectordb_files)} vectordb_ready files")
        
        if existing_ids:
            print(f"    Incremental mode: Skipping {len(existing_ids)} existing documents")
        
        # Merge all data (only new documents)
        all_documents = []
        all_metadatas = []
        all_ids = []
        skipped_count = 0
        new_files_count = 0
        
        for file_path in sorted(vectordb_files):
            filename = os.path.basename(file_path)
            
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            # Filter out existing documents
            file_has_new = False
            for doc, meta, doc_id in zip(
                data.get('documents', []),
                data.get('metadatas', []),
                data.get('ids', [])
            ):
                if existing_ids and doc_id in existing_ids:
                    skipped_count += 1
                else:
                    all_documents.append(doc)
                    all_metadatas.append(meta)
                    all_ids.append(doc_id)
                    file_has_new = True
            
            # Show status
            if file_has_new:
                print(f"    Loading: {filename}")
                new_files_count += 1
            else:
                print(f"   ️  Skipping: {filename} (already in database)")
        
        # Create merged data dictionary
        merged_data = {
            'documents': all_documents,
            'metadatas': all_metadatas,
            'ids': all_ids
        }
        
        num_docs = len(all_documents)
        print(f"\n Loaded {num_docs} NEW documents from {new_files_count} files")
        if skipped_count > 0:
            print(f"   ️  Skipped {skipped_count} existing documents")
        print(f"   - Documents: {len(all_documents)}")
        print(f"   - Metadata entries: {len(all_metadatas)}")
        print(f"   - IDs: {len(all_ids)}")
        
        # Validate data
        if num_docs == 0 and skipped_count == 0:
            print(" Error: No documents found in vectordb_ready files")
            sys.exit(1)
        
        if len(all_documents) != len(all_metadatas) != len(all_ids):
            print(" Error: Mismatched lengths in merged data")
            sys.exit(1)
        
        return merged_data
    
    def initialize_chromadb(self, incremental: bool = True):
       
        print("\n Initializing ChromaDB...")
        
        # Create persistent client
        self.client = chromadb.PersistentClient(
            path=self.db_path,
            settings=Settings(
                anonymized_telemetry=False,
                allow_reset=True
            )
        )
        
        # Check if collection exists
        existing_collections = [col.name for col in self.client.list_collections()]
        
        if self.collection_name in existing_collections:
            if incremental:
                print(f" Collection '{self.collection_name}' already exists")
                print(f"    Incremental mode: Will add new documents only")
            else:
                print(f"️  Collection '{self.collection_name}' already exists")
                response = input("   Delete and recreate? (y/n): ").lower().strip()
                
                if response == 'y':
                    self.client.delete_collection(self.collection_name)
                    print(f"   ️  Deleted existing collection")
                else:
                    print("   ️  Using existing collection (will add documents)")
        
        # Initialize OpenAI embedding model via OpenRouter
        print(f"\n Initializing embedding model: {self.model_name}...")
        
        # Get API settings from config (already imported at top)
        if not self.api_key:
            self.api_key = config.OPENROUTER_API_KEY
        
        api_url = config.OPENROUTER_API_URL
        site_url = getattr(config, 'OPENROUTER_SITE_URL', None)
        site_name = getattr(config, 'OPENROUTER_SITE_NAME', None)
        
        self.embedding_model = OpenAIEmbeddings(
            api_key=self.api_key,
            model=self.model_name,
            api_url=api_url,
            site_url=site_url,
            site_name=site_name
        )
        print(f" Embedding model initialized successfully")
        print(f"   - Embedding dimension: {self.embedding_model.get_sentence_embedding_dimension()}")
        
        # Create or get collection
        self.collection = self.client.get_or_create_collection(
            name=self.collection_name,
            metadata={
                "description": "Nephro-AI Medical Knowledge Base for CKD",
                "created_at": datetime.now().isoformat(),
                "embedding_model": self.model_name,
                "embedding_dimension": self.embedding_model.get_sentence_embedding_dimension()
            }
        )
        
        print(f" Collection '{self.collection_name}' ready")
        print(f"   - Current document count: {self.collection.count()}")
    
    def generate_embeddings(self, documents: List[str], batch_size: int = 100) -> List[List[float]]:
     
        print(f"\n Generating embeddings for {len(documents)} documents...")
        print(f"   API batch size: {batch_size}")
        print(f"   Note: Using OpenAI API via OpenRouter")
        
        # Generate embeddings (API handles batching and progress internally)
        embeddings = self.embedding_model.encode(
            documents,
            batch_size=batch_size,
            show_progress_bar=True,
            normalize_embeddings=False  # OpenAI embeddings are pre-normalized
        )
        
        print(f" Generated {len(embeddings)} embeddings")
        return embeddings
    
    def add_to_collection(self, data: Dict, batch_size: int = 100):
     
        documents = data['documents']
        metadatas = data['metadatas']
        ids = data['ids']
        
        print(f"\n Adding {len(documents)} documents to collection...")
        print(f"   Batch size: {batch_size}")
        
        # Generate embeddings
        embeddings = self.generate_embeddings(documents, batch_size=32)
        
        # Add to collection in batches
        print("\n Storing in ChromaDB...")
        for i in tqdm(range(0, len(documents), batch_size), desc="Storing"):
            batch_end = min(i + batch_size, len(documents))
            
            self.collection.add(
                documents=documents[i:batch_end],
                metadatas=metadatas[i:batch_end],
                ids=ids[i:batch_end],
                embeddings=embeddings[i:batch_end]
            )
        
        print(f" Successfully added all documents")
        print(f"   Total documents in collection: {self.collection.count()}")
    
    def verify_collection(self):
       
        print("\n Verifying collection...")
        
        count = self.collection.count()
        metadata = self.collection.metadata
        
        print(f" Collection verified")
        print(f"   - Name: {self.collection.name}")
        print(f"   - Document count: {count}")
        print(f"   - Metadata: {metadata}")
        
        # Test a simple query using OpenAI embeddings
        print("\n Testing query functionality...")
        test_query = "What is chronic kidney disease?"
        
        # Generate embedding for test query using the same OpenAI model
        test_embedding = self.embedding_model.encode([test_query])[0]
        
        # Query using the generated embedding (not query_texts which uses default model)
        test_results = self.collection.query(
            query_embeddings=[test_embedding],
            n_results=3
        )
        
        print(f" Query test successful")
        print(f"   - Retrieved {len(test_results['documents'][0])} results")
        print(f"\n   Sample result:")
        print(f"   {test_results['documents'][0][0][:200]}...")
    
    def print_statistics(self):
        
        print("\n" + "=" * 70)
        print(" COLLECTION STATISTICS")
        print("=" * 70)
        
        count = self.collection.count()
        
        # Get sample to analyze
        sample = self.collection.get(limit=count)
        
        # Count content types
        content_types = {}
        entity_counts = {
            'has_ckd': 0,
            'has_gfr': 0,
            'has_diabetes': 0,
            'has_dialysis': 0,
            'has_hypertension': 0
        }
        word_counts = []
        
        for metadata in sample['metadatas']:
            # Content type
            ctype = metadata.get('content_type', 'unknown')
            content_types[ctype] = content_types.get(ctype, 0) + 1
            
            # Entity flags
            for entity in entity_counts:
                if metadata.get(entity, False):
                    entity_counts[entity] += 1
            
            # Word count
            word_counts.append(metadata.get('word_count', 0))
        
        print(f"\n Documents: {count}")
        print(f"   - Average words: {sum(word_counts) / len(word_counts):.0f}")
        print(f"   - Min words: {min(word_counts)}")
        print(f"   - Max words: {max(word_counts)}")
        
        print(f"\n Content Types:")
        for ctype, ccount in sorted(content_types.items(), key=lambda x: x[1], reverse=True):
            percentage = (ccount / count) * 100
            print(f"   - {ctype}: {ccount} ({percentage:.1f}%)")
        
        print(f"\n️  Medical Entity Coverage:")
        for entity, ecount in entity_counts.items():
            percentage = (ecount / count) * 100
            entity_name = entity.replace('has_', '').upper()
            print(f"   - {entity_name}: {ecount} ({percentage:.1f}%)")
        
        print("=" * 70)
    
    def save_summary(self):
        
        summary_file = os.path.join(self.db_path, "build_summary.json")
        
        # Count source files
        vectordb_files = glob.glob(os.path.join(self.vectordb_dir, "*_vectordb_ready.json"))
        
        summary = {
            "build_date": datetime.now().isoformat(),
            "collection_name": self.collection_name,
            "document_count": self.collection.count(),
            "embedding_model": self.model_name,
            "embedding_dimension": self.embedding_model.get_sentence_embedding_dimension(),
            "data_source_directory": self.vectordb_dir,
            "source_files_count": len(vectordb_files),
            "database_path": self.db_path,
            "status": "success"
        }
        
        with open(summary_file, 'w', encoding='utf-8') as f:
            json.dump(summary, f, indent=2)
        
        print(f"\n Build summary saved to: {summary_file}")
    
    def build(self, incremental: bool = True):
       
        start_time = datetime.now()
        
        try:
            # Initialize ChromaDB first to check existing documents
            self.initialize_chromadb(incremental=incremental)
            
            # Get existing document IDs if incremental mode
            existing_ids = set()
            if incremental and self.collection.count() > 0:
                print("\n Checking existing documents...")
                existing_docs = self.collection.get(include=[])
                existing_ids = set(existing_docs['ids'])
                print(f"   Found {len(existing_ids)} existing documents in database")
            
            # Load data (only new documents in incremental mode)
            data = self.load_data(existing_ids if incremental else None)
            
            # Skip if no new documents
            if len(data['documents']) == 0:
                print("\n" + "=" * 70)
                print(" NO NEW DOCUMENTS TO ADD")
                print("=" * 70)
                print("   All documents are already in the database!")
                print(f"   Total documents: {self.collection.count()}")
                return
            
            # Add documents
            self.add_to_collection(data)
            
            # Verify
            self.verify_collection()
            
            # Statistics
            self.print_statistics()
            
            # Save summary
            self.save_summary()
            
            # Success message
            duration = (datetime.now() - start_time).total_seconds()
            
            print("\n" + "=" * 70)
            print(" SUCCESS! VECTOR DATABASE BUILT")
            print("=" * 70)
            print(f"️  Build time: {duration:.1f} seconds")
            print(f" Collection: {self.collection_name}")
            print(f" Documents: {self.collection.count()}")
            print(f" Location: {os.path.abspath(self.db_path)}")
            print(f" Model: {self.model_name}")
            print("\n Ready for queries!")
            print("=" * 70)
            
        except Exception as e:
            print(f"\n Error during build: {e}")
            import traceback
            traceback.print_exc()
            sys.exit(1)


def main():
    """Main entry point"""
    import argparse
    
    parser = argparse.ArgumentParser(
        description="Build or update ChromaDB vector database",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Incremental mode (default) - only add new documents
  python scripts/build_vectordb.py
  
  # Force rebuild - delete and recreate database
  python scripts/build_vectordb.py --rebuild
        """
    )
    
    parser.add_argument(
        '--rebuild',
        action='store_true',
        help='Rebuild database from scratch (deletes existing data)'
    )
    
    args = parser.parse_args()
    
    # Configuration
    builder = VectorDBBuilder(
        vectordb_dir="data/vectordb_ready/documents",
        db_path="vectordb/chroma_db",
        collection_name="nephro_ai_medical_kb",
        model_name="openai/text-embedding-3-small"
    )
    
    # Build the database (incremental by default)
    builder.build(incremental=not args.rebuild)


if __name__ == "__main__":
    main()
