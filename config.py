"""
Nephro-AI Configuration
Central configuration file for all scripts and modules
"""

from pathlib import Path

# Project Paths
PROJECT_ROOT = Path(__file__).parent
DATA_DIR = PROJECT_ROOT / "data"
RAW_DATA_DIR = DATA_DIR / "raw"
PROCESSED_DATA_DIR = DATA_DIR / "processed"
VECTORDB_READY_DIR = DATA_DIR / "vectordb_ready" / "documents"
VECTORDB_DIR = PROJECT_ROOT / "vectordb"
CHROMA_DB_PATH = VECTORDB_DIR / "chroma_db"
SCRIPTS_DIR = PROJECT_ROOT / "scripts"

# Vector Database Settings
COLLECTION_NAME = "nephro_ai_medical_kb"
EMBEDDING_MODEL = "all-MiniLM-L6-v2"
EMBEDDING_DIMENSION = 384

# Database Metadata
DB_METADATA = {
    "description": "Nephro-AI Medical Knowledge Base",
    "version": "1.0",
    "created_by": "Nephro-AI Team",
    "content_types": ["recommendation", "evidence", "definition", "reference", "general", "dietary"]
}

# Processing Settings
CHUNK_SETTINGS = {
    "min_words": 50,
    "max_words": 600,
    "overlap_sentences": 2
}

# Medical Entities
# 🧠 Comprehensive Medical Entities for CKD + Nutrition Extraction

MEDICAL_ENTITIES = [
    # 🩺 1️⃣ Core CKD & Renal Terms
    "CKD", "chronic kidney disease",
    "acute kidney injury", "AKI",
    "glomerular filtration rate", "GFR", "eGFR",
    "kidney function", "renal function",
    "renal failure", "kidney failure", "end-stage renal disease", "ESRD",
    "nephropathy", "nephron", "nephritis",
    "albuminuria", "proteinuria",
    "creatinine", "urea", "BUN", "cystatin C",

    # 💉 2️⃣ Lab and Biochemical Markers
    "sodium", "potassium", "calcium", "phosphate", "phosphorus",
    "magnesium", "chloride", "bicarbonate",
    "uric acid", "hemoglobin", "hematocrit",
    "parathyroid hormone", "PTH", "vitamin D", "calcitriol",
    "iron", "ferritin", "transferrin saturation", "TSAT",
    "blood urea nitrogen", "serum creatinine",

    # 🍎 3️⃣ Nutrition and Diet Keywords
    "nutrition", "diet", "dietary protein", "low protein diet",
    "sodium restriction", "potassium restriction",
    "phosphate binders", "fluid restriction",
    "caloric intake", "energy intake",
    "nutritional assessment", "malnutrition",
    "plant-based diet", "vegan diet", "renal diet",
    "nutrient intake", "supplements", "micronutrients",
    "dietitian", "renal dietitian",

    # 💊 4️⃣ Treatment and Medication-Related Terms
    "ACE inhibitors", "angiotensin converting enzyme inhibitors",
    "ARBs", "angiotensin receptor blockers",
    "diuretics", "loop diuretics", "thiazides",
    "erythropoietin", "ESA", "erythropoiesis stimulating agent",
    "phosphate binders", "calcimimetics",
    "insulin", "antihypertensive", "sodium bicarbonate",
    "statins", "lipid lowering therapy",

    # ⚕️ 5️⃣ Dialysis & Transplantation
    "dialysis", "hemodialysis", "peritoneal dialysis",
    "vascular access", "fistula", "catheter",
    "ultrafiltration", "dialysate", "Kt/V", "dialysis adequacy",
    "kidney transplant", "transplant rejection", "immunosuppressants",

    # 🧬 6️⃣ Complications & Symptoms
    "anemia", "edema", "hyperkalemia", "hypokalemia",
    "hyperphosphatemia", "acidosis", "metabolic acidosis",
    "bone disease", "renal osteodystrophy",
    "pruritus", "fatigue", "muscle cramps",
    "cardiovascular disease", "CVD", "heart failure",
    "neuropathy", "retinopathy", "fluid overload",

    # 👩‍⚕️ 7️⃣ Lifestyle & Patient Care
    "smoking cessation", "exercise", "physical activity",
    "blood pressure control", "glycemic control",
    "patient education", "adherence", "self management",
    "quality of life", "follow up", "screening", "monitoring",

    # 🧮 8️⃣ Staging & Classification
    "stage 1", "stage 2", "stage 3", "stage 4", "stage 5",
    "KDIGO", "KDOQI", "guideline", "classification",
    "risk category", "G category", "A category",
    "albumin-creatinine ratio", "ACR"
]


# Content Type Classifications
# 🧠 Content Type Classifications (CKD + Nutrition Enhanced)
CONTENT_TYPE_KEYWORDS = {
    # Clinical Recommendations & Guidelines
    "recommendation": [
        "recommend", "should", "suggest", "advise",
        "it is recommended", "guideline", "strongly encourage",
        "clinicians should", "patients should"
    ],

    # Evidence and Research Context
    "evidence": [
        "study", "research", "trial", "evidence", "data show",
        "observed", "results", "investigation", "findings",
        "meta-analysis", "randomized", "cohort", "systematic review"
    ],

    # Definitions and Explanations
    "definition": [
        "is defined as", "refers to", "means", "definition",
        "is characterized by", "is described as", "term", "concept"
    ],

    # References, Tables, Figures
    "reference": [
        "et al", "figure", "table", "reference", "citation",
        "source", "dataset", "appendix", "supplementary"
    ],

    # Dietary and Nutritional Content
    "dietary": [
        "diet", "food", "nutrition", "eating", "nutrient",
        "sodium", "potassium", "phosphorus", "protein",
        "fluid", "restriction", "calorie", "energy intake",
        "dietary recommendation", "dietitian", "meal", "supplement"
    ],

    # Treatments and Medications
    "treatment": [
        "treatment", "therapy", "medication", "drug",
        "dosage", "prescribe", "pharmacologic", "administration",
        "antihypertensive", "insulin", "ACE inhibitor", "ARB", "diuretic"
    ],

    # Monitoring, Follow-up, and Evaluation
    "monitoring": [
        "monitor", "follow up", "assessment", "evaluation",
        "measurement", "screening", "track", "observe",
        "check", "routine test", "surveillance"
    ]
}


# Query Settings
DEFAULT_QUERY_RESULTS = 5
MAX_QUERY_RESULTS = 20

# API Settings (for future use)
API_HOST = "0.0.0.0"
API_PORT = 8000
API_TITLE = "Nephro-AI Knowledge API"
API_VERSION = "1.0.0"

# LLM Settings (for future RAG integration)
LLM_SETTINGS = {
    "max_context_tokens": 4000,
    "temperature": 0.7,
    "max_response_tokens": 1000
}

# Logging
LOG_LEVEL = "INFO"
LOG_FORMAT = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"

# Feature Flags
ENABLE_INCREMENTAL_BUILD = True
ENABLE_DUPLICATE_CHECKING = True
ENABLE_METADATA_ENRICHMENT = True

def get_db_config():
    """Get database configuration dictionary"""
    return {
        "path": str(CHROMA_DB_PATH),
        "collection_name": COLLECTION_NAME,
        "embedding_model": EMBEDDING_MODEL,
        "metadata": DB_METADATA
    }

def get_chunk_config():
    """Get chunking configuration dictionary"""
    return CHUNK_SETTINGS.copy()

def get_medical_entities():
    """Get list of medical entities to detect"""
    return MEDICAL_ENTITIES.copy()

def get_content_types():
    """Get content type classification keywords"""
    return CONTENT_TYPE_KEYWORDS.copy()

# Ensure directories exist
def ensure_directories():
    """Create necessary directories if they don't exist"""
    directories = [
        DATA_DIR,
        RAW_DATA_DIR,
        PROCESSED_DATA_DIR,
        VECTORDB_READY_DIR,
        VECTORDB_DIR,
        CHROMA_DB_PATH
    ]
    
    for directory in directories:
        directory.mkdir(parents=True, exist_ok=True)
    
    return True

if __name__ == "__main__":
    print("=" * 70)
    print("NEPHRO-AI CONFIGURATION")
    print("=" * 70)
    print(f"\nProject Root: {PROJECT_ROOT}")
    print(f"Data Directory: {DATA_DIR}")
    print(f"VectorDB Ready: {VECTORDB_READY_DIR}")
    print(f"ChromaDB Path: {CHROMA_DB_PATH}")
    print(f"\nCollection Name: {COLLECTION_NAME}")
    print(f"Embedding Model: {EMBEDDING_MODEL}")
    print(f"Embedding Dimension: {EMBEDDING_DIMENSION}")
    print(f"\nAll configurations loaded successfully!")
