# Kidney Care Vector Database - Data Organization

This directory contains all the data files and knowledge paragraphs for the Nephro-AI vector database.

## 📁 Folder Structure

```
data/
├── raw/                              # Raw text files with knowledge paragraphs
│   └── medical_knowledge/            # Medical knowledge base
│       ├── diseases/                 # Disease information
│       │   ├── chronic_kidney_disease.txt
│       │   ├── acute_kidney_injury.txt
│       │   ├── kidney_stones.txt
│       │   ├── polycystic_kidney_disease.txt
│       │   └── glomerulonephritis.txt
│       │
│       ├── treatments/               # Treatment procedures
│       │   ├── dialysis.txt
│       │   ├── kidney_transplant.txt
│       │   ├── medication_therapy.txt
│       │   └── lifestyle_modifications.txt
│       │
│       ├── diagnostics/              # Diagnostic tests and procedures
│       │   ├── blood_tests.txt
│       │   ├── urine_tests.txt
│       │   ├── imaging.txt
│       │   └── kidney_biopsy.txt
│       │
│       ├── medications/              # Medication information
│       │   ├── blood_pressure_meds.txt
│       │   ├── diuretics.txt
│       │   ├── immunosuppressants.txt
│       │   └── supplements.txt
│       │
│       ├── nutrition/                # Dietary guidelines
│       │   ├── ckd_diet.txt
│       │   ├── dialysis_diet.txt
│       │   ├── low_sodium.txt
│       │   ├── potassium_management.txt
│       │   └── protein_intake.txt
│       │
│       └── prevention/               # Prevention strategies
│           ├── risk_factors.txt
│           ├── early_detection.txt
│           ├── lifestyle_tips.txt
│           └── monitoring.txt
│
├── processed/                        # Processed/cleaned data
│   ├── embeddings/                   # Pre-generated embeddings (optional)
│   └── metadata/                     # Metadata files
│
└── README.md                         # This file

vectordb/
└── chroma_db/                        # ChromaDB persistent storage

scripts/
├── build_vectordb.py                 # Script to build vector database
├── query_vectordb.py                 # Script to query the database
└── update_vectordb.py                # Script to update the database

logs/
└── vectordb_operations.log           # Operation logs
```

## 📝 File Naming Convention

- Use lowercase with underscores: `chronic_kidney_disease.txt`
- Be descriptive and specific
- Group related topics in the same file
- Keep files focused on a single topic/category

## ✍️ Content Guidelines

Each text file should:

1. Contain well-structured paragraphs (3-5 sentences each)
2. Use clear, medical terminology with explanations
3. Include one topic per paragraph when possible
4. Separate paragraphs with blank lines
5. Avoid special formatting (markdown, HTML)

## 📊 File Format

Plain text (.txt) files with UTF-8 encoding:

```
Paragraph 1 about topic A...

Paragraph 2 about topic B...

Paragraph 3 about topic C...
```

## 🔄 Updating the Knowledge Base

1. Add new text files to appropriate subdirectories
2. Run the build script to update the vector database
3. Test queries to ensure proper retrieval
4. Document changes in logs

## 🎯 Categories Explained

- **diseases/**: Information about kidney diseases, symptoms, causes, stages
- **treatments/**: Treatment options, procedures, therapy approaches
- **diagnostics/**: Tests, examinations, diagnostic criteria
- **medications/**: Drug information, dosages, side effects, interactions
- **nutrition/**: Dietary guidelines, meal plans, food restrictions
- **prevention/**: Risk reduction, early warning signs, preventive measures
