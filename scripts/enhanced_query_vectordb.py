"""
Enhanced Query System with NLU Integration
Combines vector search with natural language understanding
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

import chromadb
from chromadb.config import Settings
from nlu_engine import CKDNLUEngine
from typing import Dict, List
import json


class EnhancedVectorQuery:
    """Enhanced query system with NLU integration"""
    
    def __init__(
        self,
        db_path: str = "vectordb/chroma_db",
        collection_name: str = "nephro_ai_medical_kb"
    ):
        """Initialize enhanced query system"""
        
        print("=" * 70)
        print("🚀 ENHANCED NEPHRO-AI QUERY SYSTEM (WITH NLU)")
        print("=" * 70)
        
        # Initialize vector database
        try:
            self.client = chromadb.PersistentClient(
                path=db_path,
                settings=Settings(anonymized_telemetry=False)
            )
            self.collection = self.client.get_collection(collection_name)
            print(f"✓ Vector Database: {self.collection.count()} documents")
        except Exception as e:
            print(f"✗ Error connecting to database: {e}")
            print(f"  Make sure you've run 'python scripts/build_vectordb.py' first")
            sys.exit(1)
        
        # Initialize NLU engine
        self.nlu = CKDNLUEngine()
        print(f"✓ NLU Engine: Ready")
        
        print("=" * 70 + "\n")
    
    def query_with_nlu(
        self,
        query: str,
        n_results: int = 5,
        use_intent_filtering: bool = True,
        verbose: bool = True
    ) -> Dict:
        """
        Enhanced query using NLU analysis
        
        Args:
            query: User's question
            n_results: Number of results to return
            use_intent_filtering: Apply intent-based metadata filtering
            verbose: Print analysis details
            
        Returns:
            Dictionary containing NLU analysis and search results
        """
        
        # Step 1: NLU Analysis
        if verbose:
            print(f"🧠 Analyzing query with NLU...")
        
        analysis = self.nlu.analyze_query(query)
        
        if verbose:
            self._print_analysis(analysis)
        
        # Step 2: Generate enhanced queries
        enhanced_queries = analysis["query_enhancements"][:3]
        
        # Step 3: Apply intent-based filtering
        filters = None
        if use_intent_filtering:
            filters = self.nlu.generate_search_filters(query)
        
        # Step 4: Multi-query search
        all_results = []
        seen_ids = set()
        
        for enhanced_query in enhanced_queries:
            results = self.collection.query(
                query_texts=[enhanced_query],
                n_results=n_results,
                where=filters
            )
            
            # Deduplicate results
            for i, doc_id in enumerate(results['ids'][0]):
                if doc_id not in seen_ids:
                    seen_ids.add(doc_id)
                    all_results.append({
                        'id': doc_id,
                        'document': results['documents'][0][i],
                        'metadata': results['metadatas'][0][i],
                        'distance': results['distances'][0][i],
                        'source_query': enhanced_query
                    })
        
        # Step 5: Re-rank by relevance
        all_results.sort(key=lambda x: x['distance'])
        
        # Step 6: Return top N
        top_results = all_results[:n_results]
        
        return {
            'nlu_analysis': analysis,
            'enhanced_queries': enhanced_queries,
            'results': top_results,
            'total_unique_results': len(all_results)
        }
    
    def _print_analysis(self, analysis: Dict):
        """Pretty print NLU analysis"""
        
        print(f"\n{'='*70}")
        print(f"📊 NLU ANALYSIS")
        print(f"{'='*70}")
        
        print(f"\n🎯 INTENT:")
        for intent, score in sorted(analysis['intent'].items(), key=lambda x: x[1], reverse=True)[:3]:
            print(f"   • {intent}: {score:.1%}")
        
        if analysis['entities']:
            print(f"\n🏥 MEDICAL ENTITIES:")
            for category, items in list(analysis['entities'].items())[:3]:
                print(f"   • {category}: {', '.join(items[:3])}")
        
        if analysis['symptoms']:
            print(f"\n💊 SYMPTOMS: {', '.join([s['symptom'] for s in analysis['symptoms']])}")
        
        print(f"\n⚠️  SEVERITY: {analysis['severity'].upper()}")
        print(f"😊 EMOTION: {', '.join(analysis['emotion'])}")
        
        if analysis['requires_urgent_attention']:
            print(f"\n🚨 ⚠️  REQUIRES URGENT ATTENTION")
        
        print(f"\n🔍 ENHANCED QUERIES:")
        for i, eq in enumerate(analysis['query_enhancements'][:3], 1):
            print(f"   {i}. {eq}")
        
        print(f"\n{'='*70}\n")
    
    def display_results(self, response: Dict, query: str):
        """Display enhanced query results"""
        
        print(f"{'='*70}")
        print(f"🔍 SEARCH RESULTS FOR: '{query}'")
        print(f"{'='*70}")
        print(f"Found {len(response['results'])} unique results")
        print(f"{'='*70}\n")
        
        for i, result in enumerate(response['results'], 1):
            similarity = 1 - result['distance']
            
            print(f"📄 Result {i} (Similarity: {similarity:.3f})")
            print(f"   Type: {result['metadata'].get('content_type', 'N/A')}")
            print(f"   Entities: {result['metadata'].get('medical_entities', 'N/A')}")
            print(f"   Source Query: '{result['source_query']}'")
            print(f"\n   {result['document'][:300]}...")
            
            if i < len(response['results']):
                print(f"\n{'-'*70}\n")
    
    def interactive_mode(self):
        """Interactive query mode with NLU"""
        
        print("\n" + "=" * 70)
        print("💬 INTERACTIVE MODE (WITH NLU)")
        print("=" * 70)
        print("\nCommands:")
        print("  • Type your question naturally")
        print("  • 'analysis' - Show detailed NLU analysis")
        print("  • 'compare' - Compare with/without NLU")
        print("  • 'quit' - Exit")
        print("=" * 70 + "\n")
        
        while True:
            try:
                query = input("🔍 Query: ").strip()
                
                if not query:
                    continue
                
                if query.lower() == 'quit':
                    print("\n👋 Goodbye!")
                    break
                
                elif query.lower() == 'analysis':
                    prev_query = input("Enter query to analyze: ").strip()
                    if prev_query:
                        analysis = self.nlu.analyze_query(prev_query)
                        self._print_analysis(analysis)
                    continue
                
                elif query.lower() == 'compare':
                    compare_query = input("Enter query to compare: ").strip()
                    if compare_query:
                        self._compare_search_methods(compare_query)
                    continue
                
                # Enhanced search with NLU
                response = self.query_with_nlu(query, n_results=5, verbose=True)
                self.display_results(response, query)
                
                print()
                
            except KeyboardInterrupt:
                print("\n\n👋 Goodbye!")
                break
            except Exception as e:
                print(f"\n❌ Error: {e}\n")
    
    def _compare_search_methods(self, query: str):
        """Compare results with and without NLU"""
        
        print(f"\n{'='*70}")
        print(f"🔬 COMPARING: WITH NLU vs WITHOUT NLU")
        print(f"Query: '{query}'")
        print(f"{'='*70}\n")
        
        # Without NLU (simple search)
        print("📊 Method 1: Simple Vector Search (No NLU)")
        print("-" * 70)
        simple_results = self.collection.query(
            query_texts=[query],
            n_results=5
        )
        
        print(f"Results:")
        for i, (doc, metadata) in enumerate(zip(
            simple_results['documents'][0][:3],
            simple_results['metadatas'][0][:3]
        ), 1):
            print(f"{i}. Type: {metadata['content_type']} - {doc[:100]}...")
        
        # With NLU
        print(f"\n📊 Method 2: Enhanced Search (With NLU)")
        print("-" * 70)
        enhanced_response = self.query_with_nlu(query, n_results=5, verbose=False)
        
        print(f"Enhanced queries used:")
        for i, eq in enumerate(enhanced_response['enhanced_queries'], 1):
            print(f"  {i}. {eq}")
        
        print(f"\nResults:")
        for i, result in enumerate(enhanced_response['results'][:3], 1):
            print(f"{i}. Type: {result['metadata']['content_type']} - {result['document'][:100]}...")
        
        print(f"\n{'='*70}\n")


def main():
    """Main function"""
    import argparse
    
    parser = argparse.ArgumentParser(
        description="Enhanced query system with NLU",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Interactive mode with NLU
  python scripts/enhanced_query_vectordb.py
  
  # Direct query with NLU
  python scripts/enhanced_query_vectordb.py --query "My kidneys hurt and I'm worried"
  
  # Compare search methods
  python scripts/enhanced_query_vectordb.py --compare "What is CKD?"
        """
    )
    
    parser.add_argument(
        '--query',
        type=str,
        help='Direct query (non-interactive)'
    )
    
    parser.add_argument(
        '--compare',
        type=str,
        help='Compare with/without NLU for given query'
    )
    
    args = parser.parse_args()
    
    # Initialize system
    system = EnhancedVectorQuery()
    
    if args.compare:
        # Compare mode
        system._compare_search_methods(args.compare)
    
    elif args.query:
        # Direct query mode
        response = system.query_with_nlu(args.query, verbose=True)
        system.display_results(response, args.query)
    
    else:
        # Interactive mode
        system.interactive_mode()


if __name__ == "__main__":
    main()
