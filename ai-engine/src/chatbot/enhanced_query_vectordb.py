"""
Enhanced Vector Database Query Interface with NLU
Integrates NLU engine with Vector DB for better search results
"""

import sys
from pathlib import Path
from typing import List, Dict, Any
from sentence_transformers import CrossEncoder
import numpy as np

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
        # LOAD A RE-RANKER MODEL (TinyBERT is fast and accurate)
        # This replaces your manual keyword counting logic
        print("⚖️ Loading Cross-Encoder (Re-ranker)...")
        self.cross_encoder = CrossEncoder('cross-encoder/ms-marco-TinyBERT-L-2-v2')
        
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

        # DEBUG: Log raw retrieval results
        print(f"   ↳ 📥 DB RETRIEVAL: Found {len(all_results)} raw candidates.")
        for idx, res in enumerate(all_results):
            print(f"      [{idx+1}] ID: {res['id']} | Dist: {res['distance']:.4f} | Src: {res['query_used']}")
            print(f"          Snippet: {res['document'][:100]}...")

        # 5. RE-RANKING UPGRADE (Cross-Encoder)
        print("⚖️  Applying AI Re-ranking (Cross-Encoder)...")
        
        if all_results:
            # Prepare pairs for the model: [[Query, Doc1], [Query, Doc2], ...]
            ranking_inputs = [[query_text, res['document']] for res in all_results]
            
            # Get AI Scores (0.0 to 1.0)
            scores = self.cross_encoder.predict(ranking_inputs)
            
            # Attach scores to results
            for i, result in enumerate(all_results):
                raw_score = float(scores[i])
                # APPLY SIGMOID: Convert Logits to Probability (0.0 - 1.0)
                probability = 1 / (1 + np.exp(-raw_score))

                result['relevance_score'] = probability
                
                # Update distance for compatibility (1 - score makes it "distance-like")
                result['distance'] = 1.0 - probability
                
            # Sort by AI Score (Highest confidence first)
            all_results.sort(key=lambda x: x['relevance_score'], reverse=True)
            
            # DEBUG: Log re-ranking scores
            print(f"   ↳ 📊 CROSS-ENCODER SCORES:")
            for idx, res in enumerate(all_results):
                print(f"      [{idx+1}] Score: {res['relevance_score']:.4f} | ID: {res['id']}")

            # Filter out "Garbage" (Low relevance)
            # This reduces hallucinations by removing irrelevant retrieved docs
            final_results = [res for res in all_results if res['relevance_score'] > 0.01] # Lowered threshold slightly to be safe

            # DEBUG: Log final filtered count
            print(f"   ↳ ✂️ POST-FILTERING: Kept {len(final_results)} results (Threshold > 0.01).")
        else:
            final_results = []
        
        return {
            'nlu_analysis': analysis,
            'results': final_results[:n_results] 
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
            print(f"\nResult {i} (AI Relevance Score: {result.get('relevance_score', 0):.3f})")
            if result.get('matches', 0) > 0:
                print(f"   🚀 Boosted by {result['matches']} keyword match(es)")
            # print(f"   Original Vector Score: {1 - result.get('original_score', result['distance']):.3f}")
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
