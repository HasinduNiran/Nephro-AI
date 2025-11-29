"""
RAG Engine for Nephro-AI
Orchestrates the flow between NLU, VectorDB, Patient Data, and LLM.
"""

import sys
from pathlib import Path
from typing import Dict, Any

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from chatbot.enhanced_query_vectordb import EnhancedVectorQuery
from chatbot.patient_data import PatientDataManager
from chatbot.llm_engine import LLMEngine

class RAGEngine:
    def __init__(self):
        """Initialize all components"""
        print("⚙️ Initializing RAG Engine...")
        self.vector_db = EnhancedVectorQuery()
        self.patient_data = PatientDataManager()
        self.llm = LLMEngine()
        print("✅ RAG Engine Ready")

    def process_query(self, query: str, patient_id: str = "default_patient") -> Dict[str, Any]:
        """
        Process a user query through the full RAG pipeline
        
        Args:
            query: User's question
            patient_id: ID of the patient (for context)
            
        Returns:
            Dict containing response and metadata
        """
        # 1. Retrieve Patient Context
        patient_context = self.patient_data.get_patient_context_string(patient_id)
        
        # 2. Retrieve Medical Knowledge (using NLU-enhanced search)
        # We use the existing query_with_nlu method which handles NLU analysis + ChromaDB search
        search_results = self.vector_db.query_with_nlu(query)
        
        # Extract document text from results
        context_documents = []
        if search_results and 'results' in search_results:
            for item in search_results['results']:
                if item.get('document'):
                    context_documents.append(item['document'])
        
        # 3. Generate Response with LLM
        print("🧠 Generating response with LLM...")
        llm_response = self.llm.generate_response(
            query=query,
            context_documents=context_documents,
            patient_context=patient_context
        )
        
        return {
            "response": llm_response,
            "source_documents": context_documents[:3], # Return top sources for reference
            "nlu_analysis": search_results.get("nlu_analysis", {})
        }

if __name__ == "__main__":
    # Test
    rag = RAGEngine()
    result = rag.process_query("What should I eat for breakfast?")
    print("\n--- RESPONSE ---\n")
    print(result["response"])
