"""
Simple RAG (Retrieval-Augmented Generation) Example
Demonstrates how to use the vector database with an LLM for Q&A
"""

import chromadb
from chromadb.config import Settings
import json


class SimpleRAG:
    """Simple RAG system using ChromaDB"""
    
    def __init__(self, db_path: str = "vectordb/chroma_db"):
        """Initialize RAG system"""
        
        print("🤖 Initializing Nephro-AI RAG System...")
        
        # Connect to ChromaDB
        self.client = chromadb.PersistentClient(
            path=db_path,
            settings=Settings(anonymized_telemetry=False)
        )
        
        # Get collection
        self.collection = self.client.get_collection("kdigo_ckd_guidelines")
        
        print(f"✅ Connected to database")
        print(f"   Documents: {self.collection.count()}")
        print()
    
    def retrieve_context(self, question: str, n_results: int = 5):
        """
        Retrieve relevant context from vector database
        
        Args:
            question: User question
            n_results: Number of results to retrieve
            
        Returns:
            Retrieved documents and metadata
        """
        results = self.collection.query(
            query_texts=[question],
            n_results=n_results
        )
        
        return results
    
    def format_context(self, results):
        """Format retrieved context for LLM prompt"""
        
        context_parts = []
        
        for i, (doc, metadata) in enumerate(zip(
            results['documents'][0],
            results['metadatas'][0]
        ), 1):
            context_parts.append(
                f"[Source {i} - {metadata['content_type']}]\n{doc}\n"
            )
        
        return "\n---\n".join(context_parts)
    
    def generate_prompt(self, question: str, context: str):
        """Generate prompt for LLM"""
        
        prompt = f"""You are a medical AI assistant specializing in kidney care. Answer the question based on the provided context from the KDIGO 2024 Clinical Practice Guideline for Chronic Kidney Disease.

Context from Medical Guidelines:
{context}

Question: {question}

Instructions:
- Answer based ONLY on the provided context
- Be accurate and cite information from the guidelines
- If the context doesn't contain enough information, say so
- Use clear medical terminology but explain complex terms
- Keep the answer concise but comprehensive

Answer:"""
        
        return prompt
    
    def answer_question(self, question: str, n_results: int = 5):
        """
        Answer question using RAG approach
        
        Args:
            question: User question
            n_results: Number of context chunks to retrieve
            
        Returns:
            Dictionary with question, context, and prompt
        """
        
        print(f"❓ Question: {question}\n")
        
        # Step 1: Retrieve relevant context
        print("🔍 Retrieving relevant context...")
        results = self.retrieve_context(question, n_results)
        print(f"✅ Retrieved {len(results['documents'][0])} relevant chunks\n")
        
        # Step 2: Format context
        print("📝 Formatting context...")
        context = self.format_context(results)
        print(f"✅ Context prepared ({len(context)} characters)\n")
        
        # Step 3: Generate prompt
        print("🎯 Generating prompt...")
        prompt = self.generate_prompt(question, context)
        print(f"✅ Prompt ready\n")
        
        # Return all components
        return {
            'question': question,
            'retrieved_chunks': len(results['documents'][0]),
            'context': context,
            'prompt': prompt,
            'metadata': results['metadatas'][0]
        }
    
    def display_rag_output(self, output):
        """Display RAG output in readable format"""
        
        print("=" * 70)
        print("📊 RAG OUTPUT")
        print("=" * 70)
        
        print(f"\n❓ Question:")
        print(f"   {output['question']}\n")
        
        print(f"📚 Retrieved Context:")
        print(f"   {output['retrieved_chunks']} relevant chunks from guidelines\n")
        
        print(f"🏷️  Source Types:")
        types = {}
        for meta in output['metadata']:
            ctype = meta['content_type']
            types[ctype] = types.get(ctype, 0) + 1
        for ctype, count in types.items():
            print(f"   - {ctype}: {count}")
        
        print(f"\n💬 LLM Prompt (ready to send):")
        print("   " + "-" * 66)
        print(output['prompt'][:500] + "...")
        print("   " + "-" * 66)
        
        print("\n" + "=" * 70)
        print("📝 NEXT STEP: Send prompt to LLM (GPT-4, Claude, etc.)")
        print("=" * 70)


def demo():
    """Demo the RAG system"""
    
    # Initialize RAG
    rag = SimpleRAG()
    
    # Example questions
    questions = [
        "What is chronic kidney disease?",
        "What are the stages of CKD?",
        "How is GFR measured?",
        "What dietary changes are recommended for CKD patients?",
        "When should dialysis be considered?"
    ]
    
    print("🎓 RAG DEMONSTRATION")
    print("=" * 70)
    print("\nThis demo shows how to use the vector database for RAG\n")
    
    # Let user choose a question or ask their own
    print("📋 Sample Questions:")
    for i, q in enumerate(questions, 1):
        print(f"   {i}. {q}")
    print("   6. Ask your own question")
    
    try:
        choice = input("\n👉 Choose (1-6): ").strip()
        
        if choice == '6':
            question = input("Your question: ").strip()
        else:
            question = questions[int(choice) - 1]
        
        print("\n" + "=" * 70)
        print("🚀 PROCESSING RAG QUERY")
        print("=" * 70 + "\n")
        
        # Process question
        output = rag.answer_question(question)
        
        # Display output
        rag.display_rag_output(output)
        
        # Show how to integrate with LLM
        print("\n💡 Integration Example:")
        print("""
# To integrate with OpenAI GPT:
import openai

response = openai.ChatCompletion.create(
    model="gpt-4",
    messages=[
        {"role": "system", "content": "You are a medical AI assistant."},
        {"role": "user", "content": output['prompt']}
    ]
)

answer = response.choices[0].message.content
print(answer)

# To integrate with Claude (Anthropic):
import anthropic

client = anthropic.Client(api_key="your-key")
response = client.messages.create(
    model="claude-3-opus-20240229",
    max_tokens=1024,
    messages=[
        {"role": "user", "content": output['prompt']}
    ]
)

answer = response.content[0].text
print(answer)
        """)
        
        # Save output
        save = input("\n💾 Save RAG output to file? (y/n): ").strip().lower()
        if save == 'y':
            filename = "rag_output_example.json"
            with open(filename, 'w', encoding='utf-8') as f:
                json.dump(output, f, indent=2)
            print(f"✅ Saved to {filename}")
        
    except KeyboardInterrupt:
        print("\n\n👋 Exiting...")
    except Exception as e:
        print(f"\n❌ Error: {e}")


if __name__ == "__main__":
    demo()
