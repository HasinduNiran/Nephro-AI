"""
Enhanced Vector Database Query Interface with NLU
Integrates NLU engine with Vector DB for better search results
"""

import sys
from pathlib import Path
from typing import List, Dict, Any

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from chatbot.query_vectordb import VectorDBQuery
from chatbot.nlu_engine import CKDNLUEngine

class EnhancedVectorQuery(VectorDBQuery):
    """
    Enhanced query interface that uses NLU to improve search results
    """
    
    def __init__(self):
        """Initialize both Vector DB and NLU engine"""
        super().__init__()
        self.nlu = CKDNLUEngine()
        
    def query_with_nlu(
        self,
        query_text: str,
        n_results: int = 5,
        use_intent_filtering: bool = True
    ) -> Dict[str, Any]:
        """
        Perform an enhanced query using NLU analysis
        
        Args:
            query_text: User's natural language query
            n_results: Number of results to return
            use_intent_filtering: Whether to apply metadata filters based on intent
            
        Returns:
            Dictionary containing NLU analysis and search results
        """
        # 1. Analyze query with NLU
        print(f"\n🧠 Analyzing query: '{query_text}'...")
        analysis = self.nlu.analyze_query(query_text)
        
        # 2. Generate enhanced queries
        enhanced_queries = analysis["query_enhancements"]
        if not enhanced_queries:
            enhanced_queries = [query_text]
        
        # 3. Determine filters
        where_filter = None
        if use_intent_filtering:
            where_filter = self.nlu.generate_search_filters(query_text)
            
        # 4. Execute searches for each variation
        all_results = []
        seen_ids = set()
        
        print("📡 Searching vector database...")
        for q in enhanced_queries[:3]: # Limit to top 3 variations
            results = self.query(q, n_results=n_results, where=where_filter)
            
            # Process results
            if results['ids']:
                for i in range(len(results['ids'][0])):
                    doc_id = results['ids'][0][i]
                    if doc_id not in seen_ids:
                        all_results.append({
                            'id': doc_id,
                            'document': results['documents'][0][i],
                            'metadata': results['metadatas'][0][i],
                            'distance': results['distances'][0][i],
                            'query_used': q
                        })
                        seen_ids.add(doc_id)
        
        # 5. Hybrid Re-ranking (Vector + Keyword)
        print("⚖️  Applying Hybrid Search Re-ranking...")
        
        # Collect all entities for keyword matching
        search_entities = []
        if analysis.get('entities'):
            for category, items in analysis['entities'].items():
                search_entities.extend(items)
        
        # Deduplicate and lower case
        search_entities = list(set([e.lower() for e in search_entities]))
        
        for result in all_results:
            doc_text = result['document'].lower()
            original_score = result['distance'] # Lower is better
            
            # Count keyword matches
            matches = sum(1 for entity in search_entities if entity in doc_text)
            
            # Apply Boost: Reduce distance by 10% for each match (up to 50% max boost)
            # We cap the boost to avoid negative distances or overpowering vector search completely
            boost_factor = min(matches * 0.1, 0.5) 
            adjusted_score = original_score * (1.0 - boost_factor)
            
            result['original_score'] = original_score
            result['adjusted_score'] = adjusted_score
            result['matches'] = matches
            
            # Update the main distance field for sorting, but keep original for reference
            result['distance'] = adjusted_score

        # 6. Sort by adjusted relevance
        all_results.sort(key=lambda x: x['distance'])
        
        return {
            'nlu_analysis': analysis,
            'results': all_results[:n_results * 2] # Return more results than requested to show variety
        }

    def display_enhanced_results(self, response: Dict, query_text: str):
        """Display enhanced results with NLU context"""
        
        analysis = response['nlu_analysis']
        results = response['results']
        
        print("\n" + "=" * 70)
        print(f"🧠 NLU ANALYSIS FOR: \"{query_text}\"")
        print("=" * 70)
        
        # Show Intent
        top_intent = max(analysis['intent'].items(), key=lambda x: x[1])
        print(f"\n🎯 Primary Intent: {top_intent[0]} ({top_intent[1]:.1%})")
        
        # Show Entities
        if analysis['entities']:
            print("\n🏥 Detected Entities:")
            for category, items in analysis['entities'].items():
                print(f"   • {category}: {', '.join(items)}")
        
        # Show Emotion/Severity
        print(f"\n😊 Emotion: {', '.join(analysis['emotion'])}")
        print(f"⚠️  Severity: {analysis['severity']}")
        
        if analysis['requires_urgent_attention']:
            print("\n🚨 URGENT ATTENTION RECOMMENDED 🚨")
            
        print("\n" + "=" * 70)
        print(f"📚 SEARCH RESULTS ({len(results)} found)")
        print("=" * 70)
        
        for i, result in enumerate(results, 1):
            print(f"\nResult {i} (Hybrid Score: {1 - result['distance']:.3f})")
            if result.get('matches', 0) > 0:
                print(f"   🚀 Boosted by {result['matches']} keyword match(es)")
            print(f"   Original Vector Score: {1 - result.get('original_score', result['distance']):.3f}")
            print(f"   Source Query: '{result['query_used']}'")
            print(f"   Type: {result['metadata'].get('content_type', 'N/A')}")
            print(f"   Entities: {result['metadata'].get('medical_entities', 'N/A')}")
            print(f"\n   {result['document'][:300]}...")
            print("\n" + "-" * 70)

    def interactive_mode(self):
        """Interactive mode with NLU"""
        print("\n🧠 NEPHRO-AI ENHANCED QUERY SYSTEM")
        print("   Type your question or 'quit' to exit")
        print("   Type 'debug' to toggle detailed NLU output\n")
        
        while True:
            try:
                query = input("\n🔍 Query: ").strip()
                
                if not query:
                    continue
                    
                if query.lower() in ['quit', 'exit', 'q']:
                    break
                
                response = self.query_with_nlu(query)
                self.display_enhanced_results(response, query)
                
            except KeyboardInterrupt:
                break
            except Exception as e:
                print(f"Error: {e}")

def main():
    import argparse
    parser = argparse.ArgumentParser(description="Nephro-AI Enhanced Query System")
    parser.add_argument("--query", type=str, help="Single query to run")
    args = parser.parse_args()
    
    system = EnhancedVectorQuery()
    
    if args.query:
        response = system.query_with_nlu(args.query)
        system.display_enhanced_results(response, args.query)
    else:
        system.interactive_mode()

if __name__ == "__main__":
    main()
