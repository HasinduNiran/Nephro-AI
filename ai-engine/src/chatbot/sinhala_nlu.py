"""
Sinhala NLU Engine for Nephro-AI
Uses LaBSE (Language-Agnostic BERT) for Zero-Shot Intent Classification.
This allows the system to understand Sinhala intents by comparing them 
mathematically to English anchors, without needing a translator API.
"""

import numpy as np
import sys
import json
from pathlib import Path
from typing import Dict, List, Any
from sentence_transformers import SentenceTransformer, util

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))
from config import MEDICAL_ENTITIES

class SinhalaNLUEngine:
    def __init__(self):
        print("🇱🇰 Initializing Sinhala NLU Engine (LaBSE)...")
        # LaBSE is excellent for Sinhala-English cross-lingual retrieval
        self.model = SentenceTransformer('sentence-transformers/LaBSE')
        
        # 1. Define "Anchor Sentences" for each Intent
        # We don't need Sinhala training data. We use English anchors.
        # The model maps Sinhala inputs to these English concepts in vector space.
        self.intent_anchors = {
            "ask_diet": [
                "What can I eat?", "Is this food good for me?", 
                "Diet plan for CKD", "Can I eat bananas?", "Food restrictions"
            ],
            "ask_symptoms": [
                "I have pain", "My legs are swelling", "I feel dizzy",
                "Symptoms of kidney disease", "Is this normal?"
            ],
            "ask_medication": [
                "Medicine side effects", "Should I take this pill?",
                "Treatment options", "Drugs for pressure"
            ],
            "get_lab_result": [
                "Check my creatinine", "What is my GFR?", 
                "Blood test results", "Is my potassium high?"
            ],
            "ask_emergency": [
                "I cannot breathe", "Severe chest pain", 
                "Emergency help", "Call an ambulance"
            ],
            "greeting": [
                "Hello doctor", "Ayubowan", "Good morning", "Hi"
            ]
        }
        
        # Pre-compute embeddings for anchors for speed
        self.anchor_embeddings = {}
        print("   Computing intent anchor embeddings...")
        for intent, phrases in self.intent_anchors.items():
            self.anchor_embeddings[intent] = self.model.encode(phrases)
            
        # 2. Load Sinhala Medical Dictionary
        try:
            dict_path = Path(__file__).parent.parent / "data" / "sinhala_med_dict.json"
            with open(dict_path, "r", encoding="utf-8") as f:
                self.sinhala_med_dict = json.load(f)
            print(f"   Loaded {len(self.sinhala_med_dict)} terms from dictionary.")
        except FileNotFoundError:
            print("   ⚠️ Dictionary file not found. Using fallback.")
            self.sinhala_med_dict = {
                "වකුගඩු": "Kidney",
                "දියවැඩියාව": "Diabetes",
                "කෙසල්": "Banana",
                "බත්": "Rice",
                "ඉදිමීම": "Swelling",
                "කැක්කුම": "Pain",
                "ලේ": "Blood",
                "පීඩනය": "Pressure"
            }
            
        print("✅ Sinhala NLU Ready!")

    def _detect_intent(self, query_embedding) -> Dict[str, float]:
        """
        Compare user query embedding to intent anchors using Cosine Similarity.
        """
        scores = {}
        
        for intent, anchors in self.anchor_embeddings.items():
            # Calculate cosine similarity between query and all anchors for this intent
            # util.cos_sim returns a matrix, we take the max score
            sim_scores = util.cos_sim(query_embedding, anchors)
            max_score = float(np.max(sim_scores.numpy()))
            scores[intent] = max_score
            
        # Normalize scores (simple softmax-ish or just return raw)
        return scores

    def extract_entities_hybrid(self, text: str) -> Dict[str, List[str]]:
        """
        Extract entities using a Hybrid approach:
        1. Dictionary Lookup (for known medical terms in Sinhala/English)
        2. Heuristic "Singlish" matching
        """
        found_entities = {
            "medical_terms": [],
            "foods": [],
            "symptoms": []
        }
        
        # Simple Sinhala Medical Dictionary (Loaded from JSON)
        # self.sinhala_med_dict is initialized in __init__
        
        # Check for Dictionary Matches
        for si_term, en_term in self.sinhala_med_dict.items():
            if si_term in text:
                if en_term in ["Banana", "Rice"]:
                    found_entities["foods"].append(en_term)
                elif en_term in ["Swelling", "Pain", "Vomiting", "Dizziness", "Fatigue"]:
                    found_entities["symptoms"].append(en_term)
                else:
                    found_entities["medical_terms"].append(en_term)

        # Check for English Medical Entities (Singlish)
        # Using the list from config.py
        lower_text = text.lower()
        for entity in MEDICAL_ENTITIES:
            if entity.lower() in lower_text:
                found_entities["medical_terms"].append(entity)
                
        return found_entities

    def analyze_query(self, query: str) -> Dict[str, Any]:
        """
        Main entry point for Sinhala Analysis
        """
        # 1. Generate Embedding
        query_embedding = self.model.encode(query)
        
        # 2. Predict Intent (Zero-Shot)
        intent_scores = self._detect_intent(query_embedding)
        top_intent = max(intent_scores, key=intent_scores.get)
        confidence = intent_scores[top_intent]
        
        # 3. Extract Entities
        entities = self.extract_entities_hybrid(query)
        
        # 4. Construct a "Translated" Query for the RAG system
        # If confidence is high, we map it to an English query structure
        # This helps the EnhancedVectorQuery find better results
        mapped_query = query
        if confidence > 0.5:
            # We append the detected intent and entities in English to help the RAG search
            # Example: "Mata kesel kanna puluwanda" -> "Can I eat Banana (ask_diet)"
            english_entities = " ".join(entities['medical_terms'] + entities['foods'])
            mapped_query = f"{top_intent.replace('_', ' ')} {english_entities}"

        return {
            "original_query": query,
            "detected_intent": top_intent,
            "confidence": confidence,
            "entities": entities,
            "translated_query": mapped_query, # Used by RAG
            "intent_scores": intent_scores
        }

# Simple Test
if __name__ == "__main__":
    nlu = SinhalaNLUEngine()
    
    # Test 1: Pure Sinhala (Can I eat bananas?)
    q1 = "මට කෙසල් කන්න පුළුවන්ද?" 
    print(f"\nQuery: {q1}")
    print(nlu.analyze_query(q1))

    # Test 2: Singlish / Code Switching (My creatinine is high)
    q2 = "Mage creatinine wadi wela"
    print(f"\nQuery: {q2}")
    print(nlu.analyze_query(q2))
