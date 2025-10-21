"""
ChromaDB Vector Database Builder
Builds a vector database from processed medical knowledge chunks
"""

import json
import os
import sys
from pathlib import Path
from datetime import datetime
from typing import List, Dict

import chromadb
from chromadb.config import Settings
from sentence_transformers import SentenceTransformer
from tqdm import tqdm


class VectorDBBuilder:
    """Build ChromaDB vector database from processed chunks"""
    
    def __init__(
        self,
        data_file: str = "data/processed/vectordb_ready_chunks.json",
        db_path: str = "vectordb/chroma_db",
        collection_name: str = "kdigo_ckd_guidelines",
        model_name: str = "all-MiniLM-L6-v2"
    ):
        """
        Initialize vector database builder
        
        Args:
            data_file: Path to processed chunks JSON
            db_path: Directory for ChromaDB storage
            collection_name: Name for the collection
            model_name: Sentence transformer model to use
        """
        self.data_file = data_file
        self.db_path = db_path
        self.collection_name = collection_name
        self.model_name = model_name
        
        # Create DB directory
        os.makedirs(db_path, exist_ok=True)
        
        print("=" * 70)
        print("🏗️  CHROMADB VECTOR DATABASE BUILDER")
        print("=" * 70)
        print(f"📁 Data file: {data_file}")
        print(f"💾 Database path: {db_path}")
        print(f"📦 Collection: {collection_name}")
        print(f"🤖 Embedding model: {model_name}")
        print("=" * 70 + "\n")
    
    def load_data(self) -> Dict:
        """Load processed chunks from JSON"""
        print("📂 Loading processed data...")
        
        if not os.path.exists(self.data_file):
            print(f"❌ Error: Data file not found: {self.data_file}")
            sys.exit(1)
        
        with open(self.data_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        num_docs = len(data.get('documents', []))
        print(f"✅ Loaded {num_docs} documents")
        print(f"   - Documents: {len(data.get('documents', []))}")
        print(f"   - Metadata entries: {len(data.get('metadatas', []))}")
        print(f"   - IDs: {len(data.get('ids', []))}")
        
        # Validate data
        if num_docs == 0:
            print("❌ Error: No documents found in data file")
            sys.exit(1)
        
        if len(data['documents']) != len(data['metadatas']) != len(data['ids']):
            print("❌ Error: Mismatched lengths in data")
            sys.exit(1)
        
        return data
    
    def initialize_chromadb(self):
        """Initialize ChromaDB client and collection"""
        print("\n🔌 Initializing ChromaDB...")
        
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
            print(f"⚠️  Collection '{self.collection_name}' already exists")
            response = input("   Delete and recreate? (y/n): ").lower().strip()
            
            if response == 'y':
                self.client.delete_collection(self.collection_name)
                print(f"   🗑️  Deleted existing collection")
            else:
                print("   ℹ️  Using existing collection (will add documents)")
        
        # Load embedding model
        print(f"\n🤖 Loading embedding model: {self.model_name}...")
        print("   (This may take a minute on first run)")
        self.embedding_model = SentenceTransformer(self.model_name)
        print(f"✅ Model loaded successfully")
        print(f"   - Embedding dimension: {self.embedding_model.get_sentence_embedding_dimension()}")
        
        # Create or get collection
        self.collection = self.client.get_or_create_collection(
            name=self.collection_name,
            metadata={
                "description": "KDIGO 2024 Clinical Practice Guideline for CKD",
                "created_at": datetime.now().isoformat(),
                "embedding_model": self.model_name,
                "embedding_dimension": self.embedding_model.get_sentence_embedding_dimension()
            }
        )
        
        print(f"✅ Collection '{self.collection_name}' ready")
        print(f"   - Current document count: {self.collection.count()}")
    
    def generate_embeddings(self, documents: List[str], batch_size: int = 32) -> List[List[float]]:
        """
        Generate embeddings for documents
        
        Args:
            documents: List of text documents
            batch_size: Batch size for encoding
            
        Returns:
            List of embedding vectors
        """
        print(f"\n🧮 Generating embeddings for {len(documents)} documents...")
        print(f"   Batch size: {batch_size}")
        
        embeddings = []
        
        # Process in batches with progress bar
        for i in tqdm(range(0, len(documents), batch_size), desc="Encoding"):
            batch = documents[i:i + batch_size]
            batch_embeddings = self.embedding_model.encode(
                batch,
                show_progress_bar=False,
                normalize_embeddings=True  # Normalize for better similarity search
            )
            embeddings.extend(batch_embeddings.tolist())
        
        print(f"✅ Generated {len(embeddings)} embeddings")
        return embeddings
    
    def add_to_collection(self, data: Dict, batch_size: int = 100):
        """
        Add documents to ChromaDB collection
        
        Args:
            data: Dictionary with documents, metadatas, and ids
            batch_size: Batch size for adding to ChromaDB
        """
        documents = data['documents']
        metadatas = data['metadatas']
        ids = data['ids']
        
        print(f"\n📥 Adding {len(documents)} documents to collection...")
        print(f"   Batch size: {batch_size}")
        
        # Generate embeddings
        embeddings = self.generate_embeddings(documents, batch_size=32)
        
        # Add to collection in batches
        print("\n💾 Storing in ChromaDB...")
        for i in tqdm(range(0, len(documents), batch_size), desc="Storing"):
            batch_end = min(i + batch_size, len(documents))
            
            self.collection.add(
                documents=documents[i:batch_end],
                metadatas=metadatas[i:batch_end],
                ids=ids[i:batch_end],
                embeddings=embeddings[i:batch_end]
            )
        
        print(f"✅ Successfully added all documents")
        print(f"   Total documents in collection: {self.collection.count()}")
    
    def verify_collection(self):
        """Verify the collection was created successfully"""
        print("\n🔍 Verifying collection...")
        
        count = self.collection.count()
        metadata = self.collection.metadata
        
        print(f"✅ Collection verified")
        print(f"   - Name: {self.collection.name}")
        print(f"   - Document count: {count}")
        print(f"   - Metadata: {metadata}")
        
        # Test a simple query
        print("\n🧪 Testing query functionality...")
        test_results = self.collection.query(
            query_texts=["What is chronic kidney disease?"],
            n_results=3
        )
        
        print(f"✅ Query test successful")
        print(f"   - Retrieved {len(test_results['documents'][0])} results")
        print(f"\n   Sample result:")
        print(f"   {test_results['documents'][0][0][:200]}...")
    
    def print_statistics(self):
        """Print collection statistics"""
        print("\n" + "=" * 70)
        print("📊 COLLECTION STATISTICS")
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
        
        print(f"\n📄 Documents: {count}")
        print(f"   - Average words: {sum(word_counts) / len(word_counts):.0f}")
        print(f"   - Min words: {min(word_counts)}")
        print(f"   - Max words: {max(word_counts)}")
        
        print(f"\n📋 Content Types:")
        for ctype, ccount in sorted(content_types.items(), key=lambda x: x[1], reverse=True):
            percentage = (ccount / count) * 100
            print(f"   - {ctype}: {ccount} ({percentage:.1f}%)")
        
        print(f"\n🏷️  Medical Entity Coverage:")
        for entity, ecount in entity_counts.items():
            percentage = (ecount / count) * 100
            entity_name = entity.replace('has_', '').upper()
            print(f"   - {entity_name}: {ecount} ({percentage:.1f}%)")
        
        print("=" * 70)
    
    def save_summary(self):
        """Save build summary to file"""
        summary_file = os.path.join(self.db_path, "build_summary.json")
        
        summary = {
            "build_date": datetime.now().isoformat(),
            "collection_name": self.collection_name,
            "document_count": self.collection.count(),
            "embedding_model": self.model_name,
            "embedding_dimension": self.embedding_model.get_sentence_embedding_dimension(),
            "data_source": self.data_file,
            "database_path": self.db_path,
            "status": "success"
        }
        
        with open(summary_file, 'w', encoding='utf-8') as f:
            json.dump(summary, f, indent=2)
        
        print(f"\n💾 Build summary saved to: {summary_file}")
    
    def build(self):
        """Main build process"""
        start_time = datetime.now()
        
        try:
            # Load data
            data = self.load_data()
            
            # Initialize ChromaDB
            self.initialize_chromadb()
            
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
            print("🎉 SUCCESS! VECTOR DATABASE BUILT")
            print("=" * 70)
            print(f"⏱️  Build time: {duration:.1f} seconds")
            print(f"📦 Collection: {self.collection_name}")
            print(f"📄 Documents: {self.collection.count()}")
            print(f"💾 Location: {os.path.abspath(self.db_path)}")
            print(f"🤖 Model: {self.model_name}")
            print("\n✅ Ready for queries!")
            print("=" * 70)
            
        except Exception as e:
            print(f"\n❌ Error during build: {e}")
            import traceback
            traceback.print_exc()
            sys.exit(1)


def main():
    """Main entry point"""
    
    # Configuration
    builder = VectorDBBuilder(
        data_file="data/processed/vectordb_ready_chunks.json",
        db_path="vectordb/chroma_db",
        collection_name="kdigo_ckd_guidelines",
        model_name="all-MiniLM-L6-v2"
    )
    
    # Build the database
    builder.build()


if __name__ == "__main__":
    main()
