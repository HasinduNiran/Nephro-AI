# Nephro-AI: Real Patient Risk Classification Dataset

## 📊 Overview

This project creates a comprehensive patient dataset from the **MIMIC-IV Medical Database** with vital signs, medical conditions, and risk classifications for kidney disease analysis. The dataset contains **3,620 real patients** with complete medical records.

## 🗂️ Dataset Files

### Main Dataset

- **File**: `nephro_ai_REAL_patients_risk_classified.csv`
- **Size**: 144 KB
- **Records**: 3,620 patients
- **Source**: MIMIC-IV Medical Database (Real patient data)

### Dataset Structure

| Column          | Type    | Description                          | Example  |
| --------------- | ------- | ------------------------------------ | -------- |
| `patient_id`    | Integer | Unique patient identifier            | 10000032 |
| `age`           | Integer | Patient age in years (18-91)         | 52       |
| `spo2`          | Float   | Oxygen saturation (%)                | 96.30    |
| `bp_systolic`   | Integer | Systolic blood pressure (mmHg)       | 89       |
| `heart_rate`    | Integer | Heart rate (beats per minute)        | 96       |
| `hypertension`  | Binary  | Hypertension diagnosis (0=No, 1=Yes) | 0        |
| `diabetes`      | Binary  | Diabetes diagnosis (0=No, 1=Yes)     | 0        |
| `risk_category` | String  | Risk classification                  | Low Risk |

## 📈 Dataset Statistics

### Risk Distribution

- 🟢 **Low Risk**: 2,158 patients (59.6%)
- 🟡 **Medium Risk**: 1,067 patients (29.5%)
- 🔴 **High Risk**: 395 patients (10.9%)

### Patient Demographics

- **Mean Age**: 63.2 years
- **Age Range**: 18-91 years
- **Median Age**: 65 years

### Vital Signs (Averages)

- **SpO2**: 96.50% (oxygen saturation)
- **Blood Pressure**: 119.9 mmHg (systolic)
- **Heart Rate**: 84.2 bpm

### Medical Conditions Prevalence

- **Hypertension**: 1,496 patients (41.3%)
- **Diabetes**: 686 patients (19.0%)
- **Both Conditions**: 599 patients (16.5%)

## 🔬 Data Extraction Process

### 1. **Patient Demographics**

- **Source**: `patients.csv.gz` (MIMIC-IV)
- **Initial Load**: 20,000 patients
- **Fields**: Patient ID, Age, Gender

### 2. **Medical Diagnoses**

- **Source**: `diagnoses_icd.csv.gz` (MIMIC-IV)
- **Method**: ICD code pattern matching
- **Hypertension Codes**:
  - ICD-10: I10, I11, I12, I13, I15
  - ICD-9: 401, 402, 403, 404, 405
- **Diabetes Codes**:
  - ICD-10: E10 (Type 1), E11 (Type 2)
  - ICD-9: 250

### 3. **Vital Signs**

- **Source**: `chartevents.csv.gz` (3.3 GB file)
- **Processing**: Chunked reading for memory efficiency
- **MIMIC-IV Item IDs**:
  - SpO2: 220277
  - Systolic BP: 220179, 220050
  - Heart Rate: 220045
- **Aggregation**: Mean values per patient

### 4. **Data Filtering**

- Started with 20,000 patients
- Filtered to 3,626 patients with vital signs
- Final dataset: 3,620 patients with complete data

## 🎯 Risk Classification Algorithm

The risk score is calculated using a multi-parameter scoring system (0-12 points):

### Scoring Criteria

#### SpO2 (Oxygen Saturation)

- < 90%: **+3 points** (High risk)
- 90-94%: **+2 points** (Medium risk)
- ≥ 95%: **0 points** (Normal)

#### Blood Pressure (Systolic)

- ≥ 160 mmHg: **+3 points** (High risk)
- 140-159 mmHg: **+2 points** (Elevated)
- 130-139 mmHg: **+1 point** (Slightly elevated)
- < 130 mmHg: **0 points** (Normal)

#### Heart Rate

- > 100 or < 60 bpm: **+2 points** (Abnormal)
- 91-100 bpm: **+1 point** (Elevated)
- 60-90 bpm: **0 points** (Normal)

#### Medical Conditions

- Hypertension: **+2 points**
- Diabetes: **+2 points**
- Both (Comorbidity): **+2 additional points**

### Risk Categories

- 🔴 **High Risk**: Total score ≥ 7
- 🟡 **Medium Risk**: Total score 3-6
- 🟢 **Low Risk**: Total score < 3

## 📁 Project Files

### Dataset Files

- `nephro_ai_REAL_patients_risk_classified.csv` - Main dataset (real data)
- `nephro_ai_5000_patients_risk_classified.csv` - Synthetic dataset (archived)

### Code Files

- `dataset_creation.ipynb` - Complete data extraction and processing code
- `check_distribution.py` - Distribution analysis utility

### Documentation Files

- `README.md` - This file
- `REAL_DATASET_DOCUMENTATION.md` - Detailed dataset documentation
- `HYPERTENSION_DIABETES_LABELING_REAL_DATA.md` - Diagnosis labeling explanation
- `RISK_LABELING_EXPLANATION.md` - Risk classification details
- `QUICK_START.md` - Quick start guide
- `README_DATASET_COLLECTION.md` - Data collection notes

### Data Source Files (Required)

- `patients.csv.gz` - MIMIC-IV patient demographics
- `diagnoses_icd.csv.gz` - MIMIC-IV diagnoses
- `chartevents.csv.gz` - MIMIC-IV vital signs (3.3 GB)
- `admissions.csv.gz` - MIMIC-IV admissions data
- `labevents.csv.gz` - MIMIC-IV lab events

## 🚀 Quick Start

### Prerequisites

```bash
pip install pandas numpy matplotlib seaborn jupyter
```

### Load the Dataset

```python
import pandas as pd

# Load the real patient dataset
df = pd.read_csv('nephro_ai_REAL_patients_risk_classified.csv')

# Display basic information
print(f"Total patients: {len(df)}")
print(f"\nRisk distribution:")
print(df['risk_category'].value_counts())

# View sample data
print(df.head())
```

### Filter by Risk Category

```python
# Get high-risk patients
high_risk = df[df['risk_category'] == 'High Risk']
print(f"High-risk patients: {len(high_risk)}")

# Analyze characteristics
print(f"Average age: {high_risk['age'].mean():.1f} years")
print(f"Average SpO2: {high_risk['spo2'].mean():.2f}%")
print(f"Hypertension: {high_risk['hypertension'].sum()} patients")
print(f"Diabetes: {high_risk['diabetes'].sum()} patients")
```

### Analyze Medical Conditions

```python
# Patients with both conditions
both_conditions = df[(df['hypertension'] == 1) & (df['diabetes'] == 1)]
print(f"Patients with both hypertension and diabetes: {len(both_conditions)}")

# Risk distribution for comorbidity patients
print(both_conditions['risk_category'].value_counts())
```

## 📊 Data Visualization Examples

### Risk Distribution Plot

```python
import matplotlib.pyplot as plt
import seaborn as sns

# Risk category distribution
plt.figure(figsize=(10, 6))
risk_counts = df['risk_category'].value_counts()
colors = ['green', 'orange', 'red']
plt.bar(risk_counts.index, risk_counts.values, color=colors)
plt.title('Patient Risk Distribution', fontsize=16, fontweight='bold')
plt.xlabel('Risk Category')
plt.ylabel('Number of Patients')
plt.show()
```

### Vital Signs by Risk Category

```python
# Box plots for vital signs
fig, axes = plt.subplots(1, 3, figsize=(18, 5))

df.boxplot(column='spo2', by='risk_category', ax=axes[0])
axes[0].set_title('SpO2 by Risk Category')
axes[0].set_ylabel('SpO2 (%)')

df.boxplot(column='bp_systolic', by='risk_category', ax=axes[1])
axes[1].set_title('Blood Pressure by Risk Category')
axes[1].set_ylabel('BP Systolic (mmHg)')

df.boxplot(column='heart_rate', by='risk_category', ax=axes[2])
axes[2].set_title('Heart Rate by Risk Category')
axes[2].set_ylabel('Heart Rate (bpm)')

plt.tight_layout()
plt.show()
```

## ⚠️ Data Quality Notes

### Strengths

✅ Real patient data from reputable medical database  
✅ Clinically validated measurements  
✅ Complete data for all required parameters  
✅ Diverse age range (18-91 years)  
✅ Realistic prevalence of medical conditions

### Limitations

⚠️ Some extreme values detected (e.g., SpO2 up to 191%, HR up to 311 bpm)  
⚠️ These may represent measurement errors or specific clinical situations  
⚠️ Dataset contains 3,620 patients (initial goal was 5,000)  
⚠️ Limited to ICU patients from MIMIC-IV database

### Recommendations for Production Use

1. Filter physiologically impossible values (SpO2 > 100%)
2. Review extreme heart rate values (> 200 bpm)
3. Apply domain-specific validation rules
4. Consider additional data cleaning based on use case

## 🔐 Data Privacy & Ethics

- All data is **de-identified** from MIMIC-IV database
- Patient identifiers are anonymized
- Complies with HIPAA privacy regulations
- For research and educational purposes only
- Please follow appropriate data usage guidelines

## 📚 MIMIC-IV Database

### About MIMIC-IV

- **Full Name**: Medical Information Mart for Intensive Care IV
- **Provider**: MIT Laboratory for Computational Physiology
- **Content**: Real ICU patient data from Beth Israel Deaconess Medical Center
- **Access**: Requires PhysioNet credentialing
- **Website**: https://physionet.org/content/mimiciv/

### Citation

If you use this dataset in your research, please cite MIMIC-IV:

```
Johnson, A., Bulgarelli, L., Pollard, T., Horng, S., Celi, L. A., & Mark, R. (2023).
MIMIC-IV (version 2.2). PhysioNet. https://doi.org/10.13026/6mm1-ek67
```

## 🛠️ Technical Details

### Processing Environment

- **Language**: Python 3.12
- **Key Libraries**: pandas, numpy, matplotlib, seaborn
- **Memory Management**: Chunked processing for large files
- **Processing Time**: ~45 seconds for complete extraction

### File Formats

- **Input**: CSV compressed with gzip (.csv.gz)
- **Output**: Standard CSV (.csv)
- **Encoding**: UTF-8

## 📞 Support & Issues

For questions or issues with the dataset:

1. Check the documentation files in this repository
2. Review the Jupyter notebook (`dataset_creation.ipynb`) for code details
3. Refer to MIMIC-IV documentation for source data questions

## 📄 License

This dataset is derived from MIMIC-IV and is subject to the PhysioNet Credentialed Health Data License. Please review the license terms before using this data.

## 🔄 Version History

### Current Version (Real Data)

- **Date**: October 2025
- **Records**: 3,620 patients
- **Source**: MIMIC-IV real patient data
- **File**: `nephro_ai_REAL_patients_risk_classified.csv`

### Previous Version (Synthetic)

- **Records**: 5,000 patients
- **Source**: Synthetically generated data
- **File**: `nephro_ai_5000_patients_risk_classified.csv` (archived)

---

**Created with**: Python, Pandas, MIMIC-IV Database  
**Last Updated**: October 22, 2025  
**Repository**: Nephro-AI  
**Branch**: early_detect
