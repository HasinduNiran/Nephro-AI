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
EMBEDDING_MODEL = "openai/text-embedding-3-small"
EMBEDDING_DIMENSION = 1536

# OpenRouter API Settings
OPENROUTER_API_KEY = "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"
OPENROUTER_API_URL = "https://openrouter.ai/api/v1/embeddings"

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
MEDICAL_ENTITIES = [
    # 1. Core CKD & Renal Terms
    "CKD", "chronic kidney disease",
    "acute kidney injury", "AKI",
    "glomerular filtration rate", "GFR", "eGFR",
    "kidney function", "renal function",
    "renal failure", "kidney failure", "end-stage renal disease", "ESRD",
    "nephropathy", "nephron", "nephritis",
    "albuminuria", "proteinuria",
    "creatinine", "urea", "BUN", "cystatin C",

    # 2. Lab and Biochemical Markers
    "sodium", "potassium", "calcium", "phosphate", "phosphorus",
    "magnesium", "chloride", "bicarbonate",
    "uric acid", "hemoglobin", "hematocrit",
    "parathyroid hormone", "PTH", "vitamin D", "calcitriol",
    "iron", "ferritin", "transferrin saturation", "TSAT",
    "blood urea nitrogen", "serum creatinine",

    # 3. Nutrition and Diet Keywords
    "nutrition", "diet", "dietary protein", "low protein diet",
    "sodium restriction", "potassium restriction",
    "phosphate binders", "fluid restriction",
    "caloric intake", "energy intake",
    "nutritional assessment", "malnutrition",
    "plant-based diet", "vegan diet", "renal diet",
    "nutrient intake", "supplements", "micronutrients",
    "dietitian", "renal dietitian",

    # 4. Treatment and Medication-Related Terms
    "ACE inhibitors", "angiotensin converting enzyme inhibitors",
    "ARBs", "angiotensin receptor blockers",
    "diuretics", "loop diuretics", "thiazides",
    "erythropoietin", "ESA", "erythropoiesis stimulating agent",
    "phosphate binders", "calcimimetics",
    "insulin", "antihypertensive", "sodium bicarbonate",
    "statins", "lipid lowering therapy",

    # 5. Dialysis & Transplantation
    "dialysis", "hemodialysis", "peritoneal dialysis",
    "vascular access", "fistula", "catheter",
    "ultrafiltration", "dialysate", "Kt/V", "dialysis adequacy",
    "kidney transplant", "transplant rejection", "immunosuppressants",

    # 6. Complications & Symptoms
    "anemia", "edema", "hyperkalemia", "hypokalemia",
    "hyperphosphatemia", "acidosis", "metabolic acidosis",
    "bone disease", "renal osteodystrophy",
    "pruritus", "fatigue", "muscle cramps",
    "cardiovascular disease", "CVD", "heart failure",
    "neuropathy", "retinopathy", "fluid overload",

    # 7. Lifestyle & Patient Care
    "smoking cessation", "exercise", "physical activity",
    "blood pressure control", "glycemic control",
    "patient education", "adherence", "self management",
    "quality of life", "follow up", "screening", "monitoring",

    # 8. Staging & Classification
    "stage 1", "stage 2", "stage 3", "stage 4", "stage 5",
    "KDIGO", "KDOQI", "guideline", "classification",
    "risk category", "G category", "A category",
    "albumin-creatinine ratio", "ACR"
]

# CKD Medical Abbreviations & Synonyms
CKD_ABBREVIATIONS = {
    # Common Medical Abbreviations
    "BP": "blood pressure",
    "HR": "heart rate",
    "RR": "respiratory rate",
    "Temp": "temperature",
    "Wt": "weight",
    "Ht": "height",
    "BMI": "body mass index",
    
    # Kidney Function & Lab Tests
    "Cr": "creatinine",
    "SCr": "serum creatinine",
    "BUN": "blood urea nitrogen",
    "eGFR": "estimated glomerular filtration rate",
    "GFR": "glomerular filtration rate",
    "CrCl": "creatinine clearance",
    "Cys-C": "cystatin C",
    "U/A": "urinalysis",
    "UACR": "urine albumin-to-creatinine ratio",
    "UPCR": "urine protein-to-creatinine ratio",
    "ACR": "albumin-creatinine ratio",
    "PCR": "protein-creatinine ratio",
    
    # Electrolytes & Minerals
    "Na": "sodium",
    "K": "potassium",
    "Cl": "chloride",
    "Ca": "calcium",
    "Phos": "phosphate",
    "PO4": "phosphate",
    "Mg": "magnesium",
    "HCO3": "bicarbonate",
    
    # Proteins & Nitrogen
    "Alb": "albumin",
    "TP": "total protein",
    "Prot": "proteinuria",
    "Microalb": "microalbuminuria",
    
    # Blood & Hematology
    "Hb": "hemoglobin",
    "Hct": "hematocrit",
    "RBC": "red blood cell",
    "WBC": "white blood cell",
    "PLT": "platelet",
    "ESA": "erythropoiesis-stimulating agent",
    "EPO": "erythropoietin",
    "TSAT": "transferrin saturation",
    "Ferr": "ferritin",
    
    # Hormones & Vitamins
    "PTH": "parathyroid hormone",
    "iPTH": "intact parathyroid hormone",
    "Vit D": "vitamin D",
    "25-OH-D": "25-hydroxyvitamin D",
    
    # Kidney Diseases & Conditions
    "CKD": "chronic kidney disease",
    "ESRD": "end-stage renal disease",
    "ESKD": "end-stage kidney disease",
    "AKI": "acute kidney injury",
    "ARF": "acute renal failure",
    "CRF": "chronic renal failure",
    "DKD": "diabetic kidney disease",
    "DN": "diabetic nephropathy",
    "PKD": "polycystic kidney disease",
    "ADPKD": "autosomal dominant polycystic kidney disease",
    "GN": "glomerulonephritis",
    "IgAN": "IgA nephropathy",
    "FSGS": "focal segmental glomerulosclerosis",
    "MN": "membranous nephropathy",
    
    # Dialysis & Transplant
    "HD": "hemodialysis",
    "PD": "peritoneal dialysis",
    "CAPD": "continuous ambulatory peritoneal dialysis",
    "CCPD": "continuous cycling peritoneal dialysis",
    "UF": "ultrafiltration",
    "Kt/V": "dialysis adequacy measure",
    "URR": "urea reduction ratio",
    "AVF": "arteriovenous fistula",
    "AVG": "arteriovenous graft",
    "CVC": "central venous catheter",
    "Tx": "transplant",
    "KTx": "kidney transplant",
    "LKD": "living kidney donor",
    "DCD": "donation after circulatory death",
    "DBD": "donation after brain death",
    
    # Medications & Treatments
    "ACEI": "angiotensin-converting enzyme inhibitor",
    "ACE-I": "angiotensin-converting enzyme inhibitor",
    "ARB": "angiotensin receptor blocker",
    "CCB": "calcium channel blocker",
    "BB": "beta blocker",
    "SGLT2i": "sodium-glucose cotransporter-2 inhibitor",
    "DPP4i": "dipeptidyl peptidase-4 inhibitor",
    "GLP1-RA": "glucagon-like peptide-1 receptor agonist",
    "PDE5i": "phosphodiesterase-5 inhibitor",
    "NSAID": "nonsteroidal anti-inflammatory drug",
    "PPI": "proton pump inhibitor",
    "H2RA": "histamine-2 receptor antagonist",
    
    # Cardiovascular
    "HTN": "hypertension",
    "HF": "heart failure",
    "CHF": "congestive heart failure",
    "CAD": "coronary artery disease",
    "CVD": "cardiovascular disease",
    "MI": "myocardial infarction",
    "AF": "atrial fibrillation",
    "AFib": "atrial fibrillation",
    "PVD": "peripheral vascular disease",
    "PAD": "peripheral arterial disease",
    
    # Diabetes & Metabolic
    "DM": "diabetes mellitus",
    "T1DM": "type 1 diabetes mellitus",
    "T2DM": "type 2 diabetes mellitus",
    "HbA1c": "hemoglobin A1c",
    "A1c": "hemoglobin A1c",
    "FBG": "fasting blood glucose",
    "OGTT": "oral glucose tolerance test",
    
    # Complications & Symptoms
    "MBD": "mineral and bone disorder",
    "CKD-MBD": "chronic kidney disease-mineral and bone disorder",
    "SHPT": "secondary hyperparathyroidism",
    "ROD": "renal osteodystrophy",
    "PEW": "protein-energy wasting",
    "RAS": "renal artery stenosis",
    "RLS": "restless leg syndrome",
    "PD": "peritoneal dialysis",
    
    # Guidelines & Organizations
    "KDIGO": "Kidney Disease: Improving Global Outcomes",
    "KDOQI": "Kidney Disease Outcomes Quality Initiative",
    "NKF": "National Kidney Foundation",
    "ERA": "European Renal Association",
    "EDTA": "European Dialysis and Transplant Association",
    "ASN": "American Society of Nephrology",
    "ISN": "International Society of Nephrology",
    
    # Dietary & Nutritional
    "Na+": "sodium",
    "K+": "potassium",
    "Ca2+": "calcium",
    "Mg2+": "magnesium",
    "LPD": "low protein diet",
    "VLPD": "very low protein diet",
    "KA": "ketoanalogue",
    "EAA": "essential amino acids",
    
    # Imaging & Procedures
    "US": "ultrasound",
    "USG": "ultrasonography",
    "CT": "computed tomography",
    "MRI": "magnetic resonance imaging",
    "KUB": "kidney, ureter, bladder",
    "IVP": "intravenous pyelogram",
    "DTPA": "diethylenetriamine pentaacetic acid scan",
    "MAG3": "mercaptoacetyltriglycine scan",
    "Bx": "biopsy",
    
    # Time & Frequency
    "BID": "twice daily",
    "TID": "three times daily",
    "QID": "four times daily",
    "QD": "once daily",
    "QOD": "every other day",
    "PRN": "as needed",
    "HS": "at bedtime",
    "AC": "before meals",
    "PC": "after meals",
    
    # Units & Measurements
    "mg/dL": "milligrams per deciliter",
    "mmol/L": "millimoles per liter",
    "mEq/L": "milliequivalents per liter",
    "g/dL": "grams per deciliter",
    "mL/min": "milliliters per minute",
    "mcg": "microgram",
    "IU": "international unit",
    
    # Other Common Terms
    "Dx": "diagnosis",
    "Sx": "symptoms",
    "Rx": "treatment/prescription",
    "Hx": "history",
    "PE": "physical examination",
    "PMH": "past medical history",
    "FH": "family history",
    "SH": "social history",
    "R/O": "rule out",
    "S/P": "status post",
    "W/U": "workup",
    "F/U": "follow-up",
    "pt": "patient",
    "pts": "patients"
}

# Reverse mapping for expansion (full term -> abbreviation)
CKD_REVERSE_ABBREVIATIONS = {v: k for k, v in CKD_ABBREVIATIONS.items()}


# Content Type Classifications
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

def get_ckd_abbreviations():
    """Get CKD medical abbreviations dictionary"""
    return CKD_ABBREVIATIONS.copy()

def get_reverse_abbreviations():
    """Get reverse mapping (full term -> abbreviation)"""
    return CKD_REVERSE_ABBREVIATIONS.copy()

def expand_abbreviations(text: str) -> str:
    """
    Expand medical abbreviations in text to full terms.
    
    Args:
        text: Input text containing abbreviations
        
    Returns:
        Text with abbreviations expanded
        
    Example:
        >>> expand_abbreviations("Patient has elevated BP and low eGFR")
        "Patient has elevated blood pressure and low estimated glomerular filtration rate"
    """
    import re
    expanded_text = text
    
    # Sort by length (longest first) to avoid partial replacements
    sorted_abbrevs = sorted(CKD_ABBREVIATIONS.items(), key=lambda x: len(x[0]), reverse=True)
    
    for abbrev, full_term in sorted_abbrevs:
        # Use word boundaries to match whole words only
        pattern = r'\b' + re.escape(abbrev) + r'\b'
        expanded_text = re.sub(pattern, full_term, expanded_text, flags=re.IGNORECASE)
    
    return expanded_text

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
