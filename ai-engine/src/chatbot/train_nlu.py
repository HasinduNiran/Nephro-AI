"""
Train a custom spaCy model for Nephro-AI NLU
"""

import spacy
from spacy.tokens import DocBin
from spacy.training import Example
import random
from pathlib import Path
import json

# Define training data
# Format: (text, {"entities": [(start, end, label)], "cats": {intent: 1.0}})
TRAIN_DATA = [
    # ask_diet
    ("What can I eat with CKD?", {"cats": {"ask_diet": 1.0}}),
    ("Is banana good for me?", {"cats": {"ask_diet": 1.0}}),
    ("Can I eat chicken?", {"cats": {"ask_diet": 1.0}}),
    ("low potassium recipes", {"cats": {"ask_diet": 1.0}}),
    ("diet for stage 3", {"cats": {"ask_diet": 1.0}}),
    
    # ask_fluid_limit
    ("How much water can I drink?", {"cats": {"ask_fluid_limit": 1.0}}),
    ("What is my fluid restriction?", {"cats": {"ask_fluid_limit": 1.0}}),
    ("Can I drink coffee?", {"cats": {"ask_fluid_limit": 1.0}}),
    ("fluid limit for dialysis", {"cats": {"ask_fluid_limit": 1.0}}),

    # get_lab_result
    ("What is my creatinine level?", {"cats": {"get_lab_result": 1.0}, "entities": [(11, 21, "TEST")]}),
    ("Show me my eGFR", {"cats": {"get_lab_result": 1.0}, "entities": [(11, 15, "TEST")]}),
    ("latest blood test results", {"cats": {"get_lab_result": 1.0}}),
    ("is my potassium high?", {"cats": {"get_lab_result": 1.0}, "entities": [(6, 15, "TEST")]}),

    # ask_medication
    ("What are the side effects of lisinopril?", {"cats": {"ask_medication": 1.0}, "entities": [(29, 39, "MEDICATION")]}),
    ("Should I take my blood pressure medicine?", {"cats": {"ask_medication": 1.0}}),
    ("medication for high blood pressure", {"cats": {"ask_medication": 1.0}}),

    # ask_symptom
    ("My legs are swelling", {"cats": {"ask_symptom": 1.0}, "entities": [(12, 20, "SYMPTOM")]}),
    ("I feel nauseous", {"cats": {"ask_symptom": 1.0}, "entities": [(7, 15, "SYMPTOM")]}),
    ("is itching normal?", {"cats": {"ask_symptom": 1.0}, "entities": [(3, 10, "SYMPTOM")]}),
    ("chest pain", {"cats": {"ask_symptom": 1.0}, "entities": [(0, 10, "SYMPTOM")]}),

    # set_reminder
    ("Remind me to take pills", {"cats": {"set_reminder": 1.0}}),
    ("Set alarm for 8am", {"cats": {"set_reminder": 1.0}}),
    ("reminder for doctor appointment", {"cats": {"set_reminder": 1.0}}),

    # ask_exercise
    ("Can I go to the gym?", {"cats": {"ask_exercise": 1.0}}),
    ("Is walking good for kidneys?", {"cats": {"ask_exercise": 1.0}}),
    ("exercise for ckd patients", {"cats": {"ask_exercise": 1.0}}),

    # ask_emergency
    ("I have severe chest pain", {"cats": {"ask_emergency": 1.0}, "entities": [(14, 24, "SYMPTOM")]}),
    ("Can't breathe help", {"cats": {"ask_emergency": 1.0}, "entities": [(0, 13, "SYMPTOM")]}),
    ("Should I go to the ER?", {"cats": {"ask_emergency": 1.0}}),
]

def train_model(output_dir="models/ckd_nlu", n_iter=20):
    """Train a custom spaCy model"""
    
    print("🚀 Starting NLU Model Training...")
    
    # Load blank model
    nlp = spacy.blank("en")
    
    # Add text classifier
    if "textcat" not in nlp.pipe_names:
        textcat = nlp.add_pipe("textcat", last=True)
    else:
        textcat = nlp.get_pipe("textcat")
    
    # Add labels
    all_cats = set()
    for _, annotations in TRAIN_DATA:
        for cat in annotations.get("cats", {}):
            all_cats.add(cat)
            textcat.add_label(cat)
            
    # Add NER
    if "ner" not in nlp.pipe_names:
        ner = nlp.add_pipe("ner")
    else:
        ner = nlp.get_pipe("ner")
        
    # Train
    optimizer = nlp.begin_training()
    
    for i in range(n_iter):
        losses = {}
        random.shuffle(TRAIN_DATA)
        
        # Create batches
        for text, annotations in TRAIN_DATA:
            doc = nlp.make_doc(text)
            example = Example.from_dict(doc, annotations)
            nlp.update([example], drop=0.5, losses=losses)
            
        print(f"Iteration {i+1}/{n_iter} - Losses: {losses}")
        
    # Save model
    output_path = Path(output_dir)
    if not output_path.exists():
        output_path.mkdir(parents=True)
        
    nlp.to_disk(output_path)
    print(f"✅ Model saved to {output_path}")

if __name__ == "__main__":
    train_model()
