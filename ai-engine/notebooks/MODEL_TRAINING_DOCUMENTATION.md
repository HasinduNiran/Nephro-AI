# Kidney Disease Risk Prediction Model Documentation

This document documents the technical implementation and user requirements for the Kidney Disease Risk Prediction module of Nephro-AI.

## 1. Technical Implementation (Model Training)

The machine learning model was developed using the following process, as recorded in `Trained new model.ipynb`.

### 1.1 Data Loading
We load the balanced dataset containing **3,000 patient records** (1,000 Low, 1,000 Medium, 1,000 High).

```python
file_path = "../data/ckd_balanced_dataset_with_ID.csv"
df = pd.read_csv(file_path)
```

### 1.2 Data Preprocessing
- **Gender Encoding**: Male = `1`, Female = `0`.
- **Target Encoding**: The target variable `risk` is mapped to ordered integers:
  - Low = `0`
  - Medium = `1`
  - High = `2`

### 1.3 Feature Engineering (The "Secret Sauce")
We derived **20 medical features** from the basic inputs to improve accuracy:

**Base Features:**
1. `age`
2. `gender`
3. `bp_systolic` (Systolic Blood Pressure)
4. `bp_diastolic` (Diastolic Blood Pressure)
5. `hba1c_level` (Blood Sugar / Diabetes Indicator)

**Derived Interaction Features:**
- `age_bp_sys`, `age_bp_dia`, `age_hba1c`
- `bp_sys_hba1c`, `bp_dia_hba1c`
- `bp_sys_dia`
- `gender_age`, `gender_bp_sys`, `gender_hba1c`

**Clinical Indicators:**
- `pulse_pressure` = Systolic - Diastolic
- `mean_arterial_pressure` (MAP) = (Systolic + 2*Diastolic) / 3

**Categorical Bins (Based on Medical Guidelines):**
- `bp_sys_category` (Normal, Elevated, High Stage 1, High Stage 2)
- `bp_dia_category` (Normal, Elevated, High)
- `age_group` (Young, Middle, Senior)
- `hba1c_category` (Normal, Prediabetic, Diabetic)

### 1.4 Model Architecture: Stacking Classifier
We utilized an **Ensemble Stacking Classifier** which combines multiple models for superior performance:

- **Base Learner 1**: `XGBoost` (Fine-tuned via RandomizedSearchCV)
- **Base Learner 2**: `RandomForestClassifier`
- **Meta Learner**: `LogisticRegression` (judges the base learners)

### 1.5 Performance Results
The model achieved exceptional results on the test set:

- **Accuracy**: **98.83%**
- **Precision (Weighted)**: 99%
- **Recall (Weighted)**: 99%
- **F1-Score**: 99%

### 1.6 Feature Importance
The most critical factors driving the prediction were:
1. `mean_arterial_pressure` (37%)
2. `bp_sys_dia` (36%)
3. `bp_sys_hba1c` (10%)

---

## 2. User Requirements Specification

This section outlines the functional requirements for the end-user mobile application.

### 2.1 Functional Requirements

**UR-01: Vital Sign Acquisition (Smart Watch Integration)**
- The system shall retrieve **Systolic** and **Diastolic** blood pressure readings directly from the user's connected **Smart Watch** (or HealthKit/Google Fit).
- **Manual Input Fallback**: The user shall be able to manually input these values if no device is connected.

**UR-02: Profile Integration**
- The system shall automatically retrieve the user’s **Age** and **Gender** from their profile to streamline the process.

**UR-03: Real-Time Risk Prediction**
- The user shall receive an **instant prediction** (Low, Medium, High) along with a granular **Risk Score (0-100)**.

**UR-04: Monthly History Tracking**
- The user shall be able to **save** their risk prediction.
- **Constraint**: The system stores only **one record per month** (updating the existing entry if repeated) to ensure consistent long-term trend analysis.

**UR-05: Trend Analysis & Visualization**
- The user shall be presented with a **Risk History Graph**.
- The system shall calculate a linear regression trend line (`y = mx + c`) to indicate if the user's risk is **Increasing**, **Decreasing**, or **Steady**.

### 2.2 User Feedback & Experience

- **Visual Feedback**: Results are color-coded (Green=Low, Orange=Medium, Red=High).
- **Speed**: Prediction occurs in <1 second.
- **Education**: Tooltips provide context for medical terms like "HbA1c".
