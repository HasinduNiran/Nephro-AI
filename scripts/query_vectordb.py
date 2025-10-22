"""
ChromaDB Vector Database Query Interface
Interactive query tool for the medical knowledge vector database
"""

import json
import chromadb
from chromadb.config import Settings
from pathlib import Path
import sys


class VectorDBQuery:
    """Query interface for ChromaDB vector database"""
    
    def __init__(
        self,
        db_path: str = "vectordb/chroma_db",
        collection_name: str = "nephro_ai_medical_kb"
    ):
        """
        Initialize query interface
        
        Args:
            db_path: Path to ChromaDB directory
            collection_name: Name of the collection to query
        """
        self.db_path = db_path
        self.collection_name = collection_name
        
        # Initialize client
        try:
            self.client = chromadb.PersistentClient(
                path=db_path,
                settings=Settings(anonymized_telemetry=False)
            )
            
            # Get collection
            self.collection = self.client.get_collection(collection_name)
            
            print("=" * 70)
            print(" NEPHRO-AI VECTOR DATABASE QUERY INTERFACE")
            print("=" * 70)
            print(f" Collection: {collection_name}")
            print(f" Documents: {self.collection.count()}")
            print(f" Database: {db_path}")
            print("=" * 70 + "\n")
            
        except Exception as e:
            print(f" Error connecting to database: {e}")
            print(f"   Make sure you've run 'python scripts/build_vectordb.py' first")
            sys.exit(1)
    
    def query(
        self,
        query_text: str,
        n_results: int = 5,
        where: dict = None,
        include_metadata: bool = True
    ):
        """
        Query the vector database
        
        Args:
            query_text: Search query
            n_results: Number of results to return
            where: Metadata filter (e.g., {"content_type": "recommendation"})
            include_metadata: Whether to include metadata in results
        
        Returns:
            Query results
        """
        results = self.collection.query(
            query_texts=[query_text],
            n_results=n_results,
            where=where
        )
        
        return results
    
    def display_results(self, results, query_text: str):
        """Display query results in a readable format"""
        
        print(f"\n Query: \"{query_text}\"")
        print(f" Found {len(results['documents'][0])} results\n")
        print("=" * 70)
        
        for i, (doc, metadata, distance) in enumerate(zip(
            results['documents'][0],
            results['metadatas'][0],
            results['distances'][0]
        ), 1):
            print(f"\n Result {i} (Similarity: {1 - distance:.3f})")
            print(f"    Type: {metadata.get('content_type', 'N/A')}")
            print(f"   ️  Entities: {metadata.get('medical_entities', 'N/A')}")
            print(f"   📏 Words: {metadata.get('word_count', 'N/A')}")
            print(f"\n   {doc[:300]}...")
            
            if i < len(results['documents'][0]):
                print("\n" + "-" * 70)
        
        print("\n" + "=" * 70)
    
    def interactive_mode(self):
        """Interactive query mode"""
        
        print(" Interactive Query Mode")
        print("   Type your question or 'quit' to exit")
        print("   Type 'help' for commands\n")
        
        while True:
            try:
                query = input(" Query: ").strip()
                
                if not query:
                    continue
                
                if query.lower() in ['quit', 'exit', 'q']:
                    print("\n Goodbye!")
                    break
                
                if query.lower() == 'help':
                    self.print_help()
                    continue
                
                if query.lower() == 'stats':
                    self.print_statistics()
                    continue
                
                # Parse advanced queries
                n_results = 5
                where_filter = None
                
                # Check for filters in query (e.g., "filter:recommendation query text")
                if query.startswith('filter:'):
                    parts = query.split(' ', 2)
                    if len(parts) >= 3:
                        filter_type = parts[1]
                        query = parts[2]
                        where_filter = {"content_type": filter_type}
                
                # Check for result count (e.g., "top10 query text")
                if query.startswith('top'):
                    parts = query.split(' ', 1)
                    if len(parts[0]) > 3:
                        try:
                            n_results = int(parts[0][3:])
                            query = parts[1] if len(parts) > 1 else ""
                        except:
                            pass
                
                # Execute query
                results = self.query(query, n_results=n_results, where=where_filter)
                self.display_results(results, query)
                
            except KeyboardInterrupt:
                print("\n\n Goodbye!")
                break
            except Exception as e:
                print(f" Error: {e}")
    
    def print_help(self):
        """Print help information"""
        print("\n" + "=" * 70)
        print("📖 HELP - Available Commands")
        print("=" * 70)
        print("\n Basic Query:")
        print("   Just type your question naturally")
        print("   Example: What is chronic kidney disease?")
        
        print("\n Advanced Queries:")
        print("   top<N> <query>          - Get top N results")
        print("   Example: top10 kidney failure symptoms")
        
        print("\n️  Filtered Queries:")
        print("   filter:<type> <query>   - Filter by content type")
        print("   Types: recommendation, evidence, definition, reference")
        print("   Example: filter:recommendation diabetes treatment")
        
        print("\n Special Commands:")
        print("   stats    - Show collection statistics")
        print("   help     - Show this help message")
        print("   quit     - Exit the program")
        
        print("=" * 70 + "\n")
    
    def print_statistics(self):
        """Print collection statistics"""
        
        count = self.collection.count()
        sample = self.collection.get(limit=count)
        
        # Analyze content types
        content_types = {}
        for metadata in sample['metadatas']:
            ctype = metadata.get('content_type', 'unknown')
            content_types[ctype] = content_types.get(ctype, 0) + 1
        
        print("\n" + "=" * 70)
        print(" COLLECTION STATISTICS")
        print("=" * 70)
        print(f"\n Total Documents: {count}")
        
        print(f"\n Content Type Distribution:")
        for ctype, ccount in sorted(content_types.items(), key=lambda x: x[1], reverse=True):
            percentage = (ccount / count) * 100
            bar = "█" * int(percentage / 2)
            print(f"   {ctype:20} {bar} {ccount} ({percentage:.1f}%)")
        
        print("=" * 70 + "\n")
    
    def run_sample_queries(self):
        """Run sample queries from file"""
        
        sample_file = "data/processed/sample_queries.txt"
        
        if not Path(sample_file).exists():
            print(f"️  Sample queries file not found: {sample_file}")
            return
        
        print(" Running sample queries...\n")
        
        with open(sample_file, 'r', encoding='utf-8') as f:
            queries = [line.strip() for line in f if line.strip() and not line.startswith('=')]
        
        # Run first 5 queries as examples
        for i, query in enumerate(queries[:5], 1):
            print(f"\n{'='*70}")
            print(f"Sample Query {i}/{min(5, len(queries))}")
            print(f"{'='*70}")
            
            results = self.query(query, n_results=3)
            self.display_results(results, query)
            
            if i < min(5, len(queries)):
                input("\nPress Enter for next query...")


def main():
    """Main entry point"""
    
    import sys
    
    # Initialize query interface
    db_query = VectorDBQuery()
    
    # Check command line arguments
    if len(sys.argv) > 1:
        if sys.argv[1] == '--sample':
            # Run sample queries
            db_query.run_sample_queries()
        elif sys.argv[1] == '--stats':
            # Show statistics
            db_query.print_statistics()
        else:
            # Single query mode
            query_text = ' '.join(sys.argv[1:])
            results = db_query.query(query_text)
            db_query.display_results(results, query_text)
    else:
        # Interactive mode
        db_query.interactive_mode()


if __name__ == "__main__":
    main()
