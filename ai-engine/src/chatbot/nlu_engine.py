"""
NLU (Natural Language Understanding) Engine for Nephro-AI
Understands patient intents, extracts medical entities, and contextualizes queries
Uses spaCy for English language understanding
"""

import spacy
from spacy.matcher import Matcher, PhraseMatcher
from typing import Dict, List, Tuple, Optional
import re
from pathlib import Path
import json
import sys
import scispacy
from negspacy.negation import Negex

# Add project root to path for config import
sys.path.insert(0, str(Path(__file__).parent.parent))
from config import MEDICAL_ENTITIES, CKD_ABBREVIATIONS, CKD_REVERSE_ABBREVIATIONS


class CKDNLUEngine:
    """
    Natural Language Understanding engine for CKD patient queries
    Identifies intents, extracts medical entities, and provides query context
    """
    
    def __init__(self, model_name: str = "en_ner_bc5cdr_md"):
        """
        Initialize NLU engine with spaCy model
        
        Args:
            model_name: spaCy model to use (default: en_ner_bc5cdr_md for medical terms)
        """
        print("🧠 Initializing Nephro-AI NLU Engine...")
        
        # Load spaCy model
        try:
            self.nlp = spacy.load(model_name)
            print(f"   ✓ Loaded spaCy model: {model_name}")
        except OSError:
            print(f"   ⚠ Model {model_name} not found. Downloading...")
            # For scispacy models, we usually need to install via URL, but if it's a standard model:
            import subprocess
            if "bc5cdr" in model_name:
                url = "https://s3-us-west-2.amazonaws.com/ai2-s2-scispacy/releases/v0.5.4/en_ner_bc5cdr_md-0.5.4.tar.gz"
                subprocess.run(["pip", "install", url])
            else:
                subprocess.run(["python", "-m", "spacy", "download", model_name])
            self.nlp = spacy.load(model_name)
            print(f"   ✓ Downloaded and loaded: {model_name}")
            
        # Add Negex pipe
        if "negex" not in self.nlp.pipe_names:
            self.nlp.add_pipe("negex", config={"ent_types": ["DISEASE", "CHEMICAL"]})
        
        # Initialize matchers
        self.matcher = Matcher(self.nlp.vocab)
        self.phrase_matcher = PhraseMatcher(self.nlp.vocab, attr="LOWER")
        
        # Setup custom patterns
        self._setup_intent_patterns()
        self._setup_medical_entities()
        self._setup_symptom_patterns()
        
        # Load abbreviations
        self.abbreviations = CKD_ABBREVIATIONS
        self.reverse_abbreviations = CKD_REVERSE_ABBREVIATIONS
        
        print("   ✓ NLU Engine ready!")
    
    def _setup_intent_patterns(self):
        """Define intent detection patterns"""
        
        # Question intents
        self.matcher.add("WHAT_IS", [[{"LOWER": "what"}, {"LOWER": {"IN": ["is", "are"]}}]])
        self.matcher.add("HOW_TO", [[{"LOWER": "how"}, {"LOWER": {"IN": ["to", "do", "can"]}}]])
        self.matcher.add("WHY", [[{"LOWER": "why"}]])
        self.matcher.add("WHEN", [[{"LOWER": "when"}]])
        
        # Treatment/recommendation intents
        self.matcher.add("ask_medication", [ # Mapped from TREATMENT
            [{"LOWER": {"IN": ["treatment", "therapy", "medication", "medicine", "drug", "pill"]}}],
            [{"LOWER": "how"}, {"LOWER": "to"}, {"LOWER": "treat"}]
        ])
        
        # Symptom inquiry
        self.matcher.add("ask_symptom", [ # Mapped from SYMPTOM_CHECK
            [{"LOWER": {"IN": ["symptom", "symptoms", "signs"]}}],
            [{"LOWER": "feel"}, {"LOWER": {"IN": ["sick", "bad", "unwell", "tired", "fatigue", "dizzy"]}}],
            [{"TEXT": {"REGEX": "hurt|pain|ache|swelling|edema|nausea|vomit"}}],
            [{"LOWER": "is"}, {"LOWER": "this"}, {"LOWER": "normal"}]
        ])
        
        # Diet/nutrition
        self.matcher.add("ask_diet", [ # Mapped from DIET_INQUIRY
            [{"LOWER": {"IN": ["eat", "food", "diet", "nutrition", "meal", "recipe", "cook"]}}],
            [{"LOWER": "what"}, {"LOWER": {"IN": ["can", "should"]}}, {"LOWER": "i"}, {"LOWER": "eat"}]
        ])

        # Fluid limit
        self.matcher.add("ask_fluid_limit", [
            [{"LOWER": {"IN": ["fluid", "water", "drink", "liquid"]}}, {"LOWER": {"IN": ["limit", "restriction", "amount", "much"]}}],
            [{"LOWER": "how"}, {"LOWER": "much"}, {"LOWER": "water"}]
        ])
        
        # Lab results
        self.matcher.add("get_lab_result", [
            [{"LOWER": {"IN": ["lab", "result", "test", "blood", "urine"]}}, {"LOWER": {"IN": ["result", "report", "value", "level"]}}],
            [{"LOWER": "my"}, {"LOWER": {"IN": ["creatinine", "egfr", "gfr", "potassium", "sodium", "calcium", "albumin"]}}],
            [{"LOWER": "what"}, {"LOWER": "is"}, {"LOWER": "my"}, {"LOWER": {"IN": ["creatinine", "egfr", "gfr"]}}]
        ])
        
        # Diagnosis understanding
        self.matcher.add("DIAGNOSIS_UNDERSTANDING", [
            [{"LOWER": "diagnosed"}, {"LOWER": "with"}],
            [{"LOWER": "have"}, {"LOWER": {"IN": ["ckd", "kidney", "disease"]}}],
            [{"LOWER": "stage"}, {"IS_DIGIT": True}]
        ])
        
        # Emotional concerns
        self.matcher.add("EMOTIONAL_CONCERN", [
            [{"LOWER": {"IN": ["worried", "scared", "anxious", "afraid", "concerned"]}}],
            [{"LOWER": "feeling"}, {"LOWER": {"IN": ["depressed", "hopeless", "overwhelmed"]}}]
        ])
        
        # Lifestyle questions
        self.matcher.add("ask_exercise", [ # Mapped from LIFESTYLE
            [{"LOWER": {"IN": ["exercise", "work", "travel", "activity", "gym", "sport", "walk", "run"]}}],
            [{"LOWER": "can"}, {"LOWER": "i"}, {"LOWER": {"IN": ["work", "exercise", "travel"]}}]
        ])

        # Reminders
        self.matcher.add("set_reminder", [
            [{"LOWER": "remind"}, {"LOWER": "me"}],
            [{"LOWER": "set"}, {"LOWER": "reminder"}],
            [{"LOWER": "alarm"}]
        ])

        # Emergency
        self.matcher.add("ask_emergency", [
            [{"LOWER": {"IN": ["emergency", "ambulance", "hospital", "urgent", "911"]}}],
            [{"LOWER": "call"}, {"LOWER": "doctor"}],
            [{"LOWER": "chest"}, {"LOWER": "pain"}],
            [{"LOWER": "can't"}, {"LOWER": "breathe"}]
        ])
    
    def _setup_medical_entities(self):
        """Define CKD-specific medical entities"""
        
        # Import from config
        # Already imported at top level
        # from config import MEDICAL_ENTITIES
        
        # Create phrase patterns for medical entities
        patterns = [self.nlp.make_doc(entity) for entity in MEDICAL_ENTITIES]
        self.phrase_matcher.add("MEDICAL_ENTITY", patterns)
        
        # Common CKD terms (additional)
        self.ckd_terms = {
            "stages": ["stage 1", "stage 2", "stage 3", "stage 4", "stage 5", "esrd"],
            "symptoms": [
                "fatigue", "swelling", "edema", "nausea", "vomiting", 
                "loss of appetite", "sleep problems", "muscle cramps",
                "itching", "shortness of breath", "confusion", "dizziness", "pain"
            ],
            "tests": [
                "blood test", "urine test", "egfr", "creatinine", "bun",
                "ultrasound", "biopsy", "acr", "albumin", "urine albumin", "potassium", "sodium"
            ],
            "treatments": [
                "dialysis", "hemodialysis", "peritoneal dialysis",
                "kidney transplant", "medication", "ace inhibitors", "arbs"
            ],
            "complications": [
                "anemia", "bone disease", "heart disease", "high blood pressure", "hypertension",
                "hyperkalemia", "acidosis", "fluid overload"
            ]
        }
    
    def _setup_symptom_patterns(self):
        """Define symptom severity patterns"""
        
        self.severity_indicators = {
            "severe": ["severe", "extreme", "unbearable", "terrible", "worst", "intense", "agony"],
            "moderate": ["moderate", "medium", "noticeable", "significant", "bad"],
            "mild": ["mild", "slight", "little", "minor", "small", "bit"],
            "urgent": ["emergency", "urgent", "immediately", "right away", "now", "help", "911"]
        }
    
    def analyze_query(self, query: str) -> Dict:
        """
        Comprehensive NLU analysis of patient query
        
        Args:
            query: Patient's question or statement
            
        Returns:
            Dictionary containing:
                - intent: Primary intent
                - entities: Extracted medical entities
                - symptoms: Identified symptoms
                - severity: Query severity level
                - emotion: Emotional state
                - suggestions: Query enhancement suggestions
        """
        # Expand abbreviations
        expanded_query = self._expand_abbreviations(query)
        doc = self.nlp(expanded_query.lower())
        
        # Extract components
        intent = self._detect_intent(doc)
        entities = self._extract_entities(doc)
        lab_values = self._extract_lab_values(doc)
        symptoms = self._identify_symptoms(doc)
        severity = self._assess_severity(doc)
        emotion = self._detect_emotion(doc)
        risk_factors = self._identify_risk_factors(doc)
        
        # Generate enhanced query suggestions
        suggestions = self._generate_query_enhancements(
            query, intent, entities, symptoms, severity, emotion, risk_factors
        )
        
        analysis = {
            "original_query": query,
            "expanded_query": expanded_query,
            "intent": intent,
            "entities": entities,
            "lab_values": lab_values,
            "symptoms": symptoms,
            "risk_factors": risk_factors,
            "severity": severity,
            "emotion": emotion,
            "query_enhancements": suggestions,
            "requires_urgent_attention": severity == "urgent" or "emergency" in emotion
        }
        
        return analysis
    
    def _detect_intent(self, doc) -> Dict[str, float]:
        """Detect query intent with confidence scores"""
        
        intents = {}
        matches = self.matcher(doc)
        
        for match_id, start, end in matches:
            intent_name = self.nlp.vocab.strings[match_id]
            intents[intent_name] = intents.get(intent_name, 0) + 1
        
        # Normalize to confidence scores
        total = sum(intents.values()) if intents else 1
        intent_scores = {k: v/total for k, v in intents.items()}
        
        # Default to information_seeking if no specific intent
        if not intent_scores:
            intent_scores = {"INFORMATION_SEEKING": 1.0}
        
        return intent_scores
    
    def _extract_entities(self, doc) -> Dict[str, List[str]]:
        """Extract medical entities from query"""
        
        entities = {
            "medical_terms": [],
            "body_parts": [],
            "conditions": [],
            "medications": [],
            "procedures": [],
            "measurements": [],
            "nutrients": [],  # New category
            "foods": []       # New category
        }
        
        # Use spaCy NER (SciSpaCy uses DISEASE and CHEMICAL)
        for ent in doc.ents:
            # Check for negation
            if ent._.negex:
                continue
                
            if ent.label_ == "DISEASE":
                entities["conditions"].append(ent.text)
            elif ent.label_ == "CHEMICAL":
                entities["medications"].append(ent.text)
                # Also check if it's a nutrient
                if any(n in ent.text.lower() for n in ["potassium", "sodium", "phosphorus", "calcium", "protein"]):
                    entities["nutrients"].append(ent.text)
            elif ent.label_ in ["PERCENT", "QUANTITY", "CARDINAL"]:
                entities["measurements"].append(ent.text)
        
        # Use phrase matcher for medical entities
        matches = self.phrase_matcher(doc)
        for match_id, start, end in matches:
            span = doc[start:end]
            term = span.text
            entities["medical_terms"].append(term)
            
            # Categorize specific terms
            if any(n in term for n in ["potassium", "sodium", "phosphorus", "calcium", "protein"]):
                entities["nutrients"].append(term)
            if any(f in term for f in ["diet", "food", "eat", "meal"]):
                entities["foods"].append(term)
        
        # Check against CKD term categories
        text = doc.text.lower()
        for category, terms in self.ckd_terms.items():
            for term in terms:
                if term in text:
                    if category not in entities:
                        entities[category] = []
                    entities[category].append(term)
        
        # Remove empty categories
        entities = {k: list(set(v)) for k, v in entities.items() if v}
        
        return entities

    def _expand_abbreviations(self, text: str) -> str:
        """Expand medical abbreviations"""
        expanded_text = text
        # Sort by length to handle overlapping abbreviations
        sorted_abbrevs = sorted(self.abbreviations.items(), key=lambda x: len(x[0]), reverse=True)
        
        for abbrev, full_term in sorted_abbrevs:
            # Use word boundaries
            pattern = r'\b' + re.escape(abbrev.lower()) + r'\b'
            expanded_text = re.sub(pattern, full_term, expanded_text, flags=re.IGNORECASE)
            
        return expanded_text

    def _extract_lab_values(self, doc) -> List[Dict]:
        """Extract lab values with units"""
        lab_values = []
        text = doc.text.lower()
        
        # Pattern for value extraction: (test name) (is/was/of) (value) (unit)?
        # e.g. "creatinine is 2.5", "gfr of 45", "potassium 5.2"
        
        # Common lab tests to look for
        lab_tests = ["creatinine", "egfr", "gfr", "potassium", "sodium", "calcium", 
                     "phosphorus", "albumin", "hemoglobin", "bun", "urea"]
        
        for test in lab_tests:
            if test in text:
                # Look for number near the test name
                # Simple regex: test name ... number ... (optional unit)
                # Exclude common words from unit capture
                pattern = re.search(rf'{test}.*?(\d+\.?\d*)\s*([a-z/]+)?', text)
                if pattern:
                    value = pattern.group(1)
                    unit = pattern.group(2) if pattern.group(2) else "unknown"
                    
                    # Filter out invalid units (common words)
                    if unit in ["and", "is", "of", "the", "with", "but", "or"]:
                        unit = "unknown"
                    
                    # Verify it's not a stage number (e.g. stage 3)
                    if test == "ckd" or "stage" in text[max(0, pattern.start()-10):pattern.start()]:
                        continue
                        
                    lab_values.append({
                        "test": test,
                        "value": float(value),
                        "unit": unit,
                        "context": pattern.group(0)
                    })
        
        return lab_values

    def _identify_risk_factors(self, doc) -> List[str]:
        """Identify CKD risk factors"""
        risk_factors = []
        text = doc.text.lower()
        
        risks = {
            "diabetes": ["diabetes", "diabetic", "high blood sugar", "sugar"],
            "hypertension": ["hypertension", "high blood pressure", "bp"],
            "family_history": ["family history", "mother", "father", "parent", "genetic"],
            "obesity": ["obese", "overweight", "bmi"],
            "smoking": ["smoke", "smoking", "tobacco"]
        }
        
        for risk, keywords in risks.items():
            # Find which keyword matched
            found_keyword = next((k for k in keywords if k in text), None)
            if found_keyword:
                # Check negation for the specific keyword found
                if not self._check_negation(doc, found_keyword):
                    risk_factors.append(risk)
                    
        return risk_factors

    def _check_negation(self, doc, term: str) -> bool:
        """Check if a term is negated in the text"""
        # Use Negex if available on entities, otherwise fallback to simple check
        # But for arbitrary terms not in entities, we might need a manual check or run negex on custom spans
        
        # Fallback to simple window-based negation for non-entity terms
        text = doc.text.lower()
        negations = ["no", "not", "don't", "dont", "never", "without"]
        
        term_idx = text.find(term)
        if term_idx == -1:
            return False
            
        # Check window before term
        pre_window = text[max(0, term_idx-20):term_idx]
        return any(neg in pre_window.split() for neg in negations)
    
    def _identify_symptoms(self, doc) -> List[Dict[str, str]]:
        """Identify symptoms mentioned in query"""
        
        symptoms = []
        text = doc.text.lower()
        
        for symptom in self.ckd_terms.get("symptoms", []):
            if symptom in text:
                # Find context around symptom
                pattern = re.search(rf'\b\w*{symptom}\w*\b', text)
                if pattern:
                    symptoms.append({
                        "symptom": symptom,
                        "context": pattern.group(0)
                    })
        
        return symptoms
    
    def _assess_severity(self, doc) -> str:
        """Assess severity/urgency of query"""
        
        text = doc.text.lower()
        
        # Check for urgent indicators
        for indicator in self.severity_indicators["urgent"]:
            if indicator in text:
                return "urgent"
        
        # Check for severity levels
        for level in ["severe", "moderate", "mild"]:
            for indicator in self.severity_indicators[level]:
                if indicator in text:
                    return level
        
        return "normal"
    
    def _detect_emotion(self, doc) -> List[str]:
        """Detect emotional state from query"""
        
        emotions = []
        text = doc.text.lower()
        
        emotion_keywords = {
            "anxiety": ["worried", "anxious", "nervous", "scared", "afraid"],
            "sadness": ["sad", "depressed", "hopeless", "down"],
            "confusion": ["confused", "don't understand", "unclear"],
            "urgency": ["urgent", "emergency", "immediate", "help"],
            "frustration": ["frustrated", "annoyed", "tired of"]
        }
        
        for emotion, keywords in emotion_keywords.items():
            if any(keyword in text for keyword in keywords):
                emotions.append(emotion)
        
        return emotions if emotions else ["neutral"]
    
    def _generate_query_enhancements(
        self, 
        query: str, 
        intent: Dict, 
        entities: Dict, 
        symptoms: List, 
        severity: str, 
        emotion: List,
        risk_factors: List = None
    ) -> List[str]:
        """Generate enhanced queries for better vector search"""
        
        enhancements = []
        
        # Base query
        enhancements.append(query)
        
        # Add medical terms explicitly
        if entities.get("medical_terms"):
            medical_query = f"{query} {' '.join(entities['medical_terms'])}"
            enhancements.append(medical_query)
        
        # Expand based on intent
        primary_intent = max(intent.items(), key=lambda x: x[1])[0] if intent else None
        
        if primary_intent == "TREATMENT":
            enhancements.append(f"treatment options for {query}")
            enhancements.append(f"how to manage {query}")
        
        elif primary_intent == "SYMPTOM_CHECK":
            enhancements.append(f"causes of {query}")
            enhancements.append(f"when to see doctor for {query}")
        
        elif primary_intent == "DIET_INQUIRY":
            enhancements.append(f"dietary recommendations for {query}")
            enhancements.append(f"foods to eat and avoid for {query}")
        
        # Add stage-specific queries if stage mentioned
        if entities.get("stages"):
            stage = entities["stages"][0]
            enhancements.append(f"{stage} CKD {query}")
        
        # Add severity context
        if severity in ["severe", "urgent"]:
            enhancements.append(f"urgent {query}")
            enhancements.append(f"when to seek immediate care {query}")
            
        # Add nutrient specific queries
        if entities.get("nutrients"):
            for nutrient in entities["nutrients"]:
                enhancements.append(f"foods high in {nutrient}")
                enhancements.append(f"foods low in {nutrient}")
                
        # Add risk factor context
        if risk_factors:
            for risk in risk_factors:
                enhancements.append(f"{risk} management in CKD")
        
        return list(set(enhancements))  # Remove duplicates
    
    def enhance_vector_search(self, query: str, n_variations: int = 3) -> List[str]:
        """
        Generate query variations for comprehensive vector search
        
        Args:
            query: Original query
            n_variations: Number of query variations to generate
            
        Returns:
            List of query variations
        """
        analysis = self.analyze_query(query)
        enhancements = analysis["query_enhancements"]
        
        return enhancements[:n_variations]
    
    def generate_search_filters(self, query: str) -> Dict:
        """
        Generate ChromaDB metadata filters based on NLU analysis
        
        Args:
            query: User query
            
        Returns:
            Dictionary of metadata filters for ChromaDB
        """
        analysis = self.analyze_query(query)
        filters = {}
        
        # Filter by intent
        intent = analysis["intent"]
        if "TREATMENT" in intent:
            filters["content_type"] = {"$in": ["recommendation", "treatment"]}
        elif "DIET_INQUIRY" in intent:
            filters["content_type"] = {"$in": ["dietary", "recommendation"]}
        elif "SYMPTOM_CHECK" in intent:
            filters["content_type"] = {"$in": ["definition", "general"]}
        
        # Filter by entities
        entities = analysis["entities"]
        if entities.get("stages"):
            # Add stage-specific filtering logic
            pass
        
        return filters if filters else None


def test_nlu_engine():
    """Test the NLU engine with sample queries"""
    
    print("=" * 70)
    print("🧠 TESTING NEPHRO-AI NLU ENGINE")
    print("=" * 70)
    
    # Initialize engine
    nlu = CKDNLUEngine()
    
    # Test queries
    test_queries = [
        "What is chronic kidney disease?",
        "My kidneys hurt and I'm really worried",
        "What can I eat if I have stage 3 CKD?",
        "I'm feeling tired all the time, is this normal?",
        "When should I start dialysis?",
        "I was just diagnosed with CKD and I'm scared",
        "What foods should I avoid with high potassium?",
        "My creatinine is 2.5 and egfr is 45",
        "I don't have diabetes but my BP is high",
        "Foods for low sodium diet"
    ]
    
    print("\n" + "=" * 70)
    print("ANALYZING PATIENT QUERIES")
    print("=" * 70)
    
    for i, query in enumerate(test_queries, 1):
        print(f"\n{'='*70}")
        print(f"Query {i}: '{query}'")
        print(f"{'='*70}")
        
        # Analyze
        analysis = nlu.analyze_query(query)
        
        # Display results
        print(f"\n📊 INTENT:")
        for intent, score in sorted(analysis['intent'].items(), key=lambda x: x[1], reverse=True):
            print(f"   • {intent}: {score:.2%}")
        
        print(f"\n🏥 MEDICAL ENTITIES:")
        if analysis['entities']:
            for category, items in analysis['entities'].items():
                print(f"   • {category}: {', '.join(items)}")
        else:
            print("   • None detected")
        
        print(f"\n💊 SYMPTOMS:")
        if analysis['symptoms']:
            for symptom in analysis['symptoms']:
                print(f"   • {symptom['symptom']} (context: '{symptom['context']}')")
        else:
            print("   • None detected")
        
        print(f"\n⚠️  SEVERITY: {analysis['severity']}")
        print(f"😊 EMOTION: {', '.join(analysis['emotion'])}")
        
        if analysis.get('lab_values'):
            print(f"\n🧪 LAB VALUES:")
            for lab in analysis['lab_values']:
                print(f"   • {lab['test']}: {lab['value']} {lab['unit']}")
                
        if analysis.get('risk_factors'):
            print(f"\n⚠️  RISK FACTORS: {', '.join(analysis['risk_factors'])}")
        
        print(f"\n🔍 ENHANCED QUERIES:")
        for j, enhanced in enumerate(analysis['query_enhancements'][:3], 1):
            print(f"   {j}. {enhanced}")
        
        if analysis['requires_urgent_attention']:
            print(f"\n🚨 ⚠️  REQUIRES URGENT ATTENTION ⚠️")
    
    print("\n" + "=" * 70)
    print("✅ NLU ENGINE TEST COMPLETE")
    print("=" * 70)


if __name__ == "__main__":
    test_nlu_engine()
