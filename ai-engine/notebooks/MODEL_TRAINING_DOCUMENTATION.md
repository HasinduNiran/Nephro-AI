# Kidney Disease Risk Prediction Model Documentation

This document explains the step-by-step process used to train the Kidney Disease Risk Prediction model. The goal is to predict the risk category (Low, Moderate, High) based on limited patient data (Age, Blood Pressure, Diabetes, Hypertension).

## 1. Import Required Libraries

We import necessary libraries for data manipulation (`pandas`, `numpy`), machine learning (`sklearn`, `xgboost`), and model saving (`joblib`).

```python
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split, GridSearchCV
from sklearn.preprocessing import LabelEncoder
from sklearn.ensemble import RandomForestClassifier, VotingClassifier
from xgboost import XGBClassifier
from sklearn.metrics import accuracy_score, classification_report
from imblearn.over_sampling import SMOTE
import joblib
```

## 2. Load Data

We load the dataset containing real patient records.

```python
file_path = "../data/nephro_ai_REAL_patients_risk_classified.csv"
df = pd.read_csv(file_path)

print("Dataset Loaded:")
print(df.head())
```

## 3. Data Preprocessing

### Handle Missing Values

We remove rows with missing values to ensure data integrity.

```python
df = df.dropna()
```

### Encode Categorical Columns

Machine learning models require numerical input. We encode categorical variables like 'diabetes', 'hypertension', and the target 'risk_category' into numbers.

```python
label_enc = LabelEncoder()

# Example columns (adjust based on your dataset)
# Diabetes, Hypertension might be Yes/No
categorical_cols = ["diabetes", "hypertension", "risk_category"]

for col in categorical_cols:
    df[col] = label_enc.fit_transform(df[col])
```

## 4. Feature Engineering

To improve model performance with limited features, we create new "interaction" features and categorize continuous variables.

- **Interaction Terms:** `age * bp` and `diabetes * hypertension` help capture combined effects.
- **Binning:** Grouping Age and Blood Pressure into categories (e.g., "High Stage 1", "Senior") helps the model find non-linear patterns.

```python
# Advanced Feature Engineering
df['age_bp'] = df['age'] * df['bp_systolic']
df['diab_hyper'] = df['diabetes'] * df['hypertension']

# Binning (Categorizing continuous variables)
# BP Stages: Normal (<120), Elevated (120-129), High Stage 1 (130-139), High Stage 2 (>140)
df['bp_category'] = pd.cut(df['bp_systolic'], bins=[0, 120, 130, 140, 300], labels=[0, 1, 2, 3])
# Age Groups: Young (<30), Middle (30-60), Senior (>60)
df['age_group'] = pd.cut(df['age'], bins=[0, 30, 60, 120], labels=[0, 1, 2])

# Convert bins to codes
df['bp_category'] = df['bp_category'].cat.codes
df['age_group'] = df['age_group'].cat.codes

# Select all features
X = df[["age", "bp_systolic", "diabetes", "hypertension", "age_bp", "diab_hyper", "bp_category", "age_group"]]
y = df["risk_category"]
```

## 5. Train/Test Split

We split the data into training (80%) and testing (20%) sets. We use `stratify=y` to maintain the same proportion of risk categories in both sets.

```python
# Reverting SMOTE as it decreased overall accuracy in favor of recall
# We will stick to the original distribution but use stratify to ensure train/test have same proportions
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

print("Training data shape:", X_train.shape)
```

## 6. Model Training & Comparison

We train multiple models to find the best performer.

1.  **Baseline Models:** Standard Random Forest and XGBoost with default settings.
2.  **Fine-Tuned XGBoost:** We use `RandomizedSearchCV` to find the optimal hyperparameters for XGBoost.
3.  **Stacking Classifier:** An ensemble method that combines the best XGBoost and Random Forest models using Logistic Regression as a meta-learner.

```python
from sklearn.ensemble import StackingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import RandomizedSearchCV
from scipy.stats import randint, uniform

# --- 1. Normal (Baseline) Models ---
print("--- 1. Normal (Baseline) Models ---")

# Baseline Random Forest
rf_baseline = RandomForestClassifier(n_estimators=100, random_state=42)
rf_baseline.fit(X_train, y_train)
rf_pred = rf_baseline.predict(X_test)
print(f"Baseline Random Forest Accuracy: {accuracy_score(y_test, rf_pred):.4f}")

# Baseline XGBoost
# Set n_jobs=1 to avoid conflict with RandomizedSearchCV's n_jobs=-1
xgb_baseline = XGBClassifier(objective='multi:softmax', num_class=3, eval_metric='mlogloss', random_state=42, n_jobs=1)
xgb_baseline.fit(X_train, y_train)
xgb_pred = xgb_baseline.predict(X_test)
print(f"Baseline XGBoost Accuracy: {accuracy_score(y_test, xgb_pred):.4f}")

# --- 2. Fine-Tuning XGBoost ---
print("\n--- 2. Fine-Tuning XGBoost ---")
xgb_param_dist = {
    'n_estimators': randint(100, 500),
    'max_depth': randint(3, 10),
    'learning_rate': uniform(0.01, 0.3),
    'subsample': uniform(0.6, 0.4),
    'colsample_bytree': uniform(0.6, 0.4),
    'gamma': uniform(0, 0.5)
}

xgb_search = RandomizedSearchCV(
    xgb_baseline, param_distributions=xgb_param_dist,
    n_iter=20, cv=3, scoring='accuracy', random_state=42, n_jobs=-1, verbose=1
)

xgb_search.fit(X_train, y_train)
best_xgb = xgb_search.best_estimator_
print(f"Best XGB Params: {xgb_search.best_params_}")
best_xgb_pred = best_xgb.predict(X_test)
print(f"Fine-Tuned XGBoost Accuracy: {accuracy_score(y_test, best_xgb_pred):.4f}")

# --- 3. Stacking Classifier ---
print("\n--- 3. Stacking Classifier (Final Model) ---")
estimators = [
    ('xgb', best_xgb),
    ('rf', rf_baseline)
]

model = StackingClassifier(
    estimators=estimators,
    final_estimator=LogisticRegression(),
    cv=5
)

model.fit(X_train, y_train)
print("Stacking Classifier Trained.")
```

## 7. Evaluation

We evaluate the final Stacking model using Accuracy and a Classification Report (Precision, Recall, F1-Score).

```python
pred = model.predict(X_test)

print("Accuracy:", accuracy_score(y_test, pred))
print("\nClassification Report:\n", classification_report(y_test, pred))
```

## 8. Feature Importance

We analyze which features contributed most to the prediction using the fine-tuned XGBoost model.

```python
# Feature Importance (Using the Fine-Tuned XGBoost model)
# StackingClassifier doesn't have feature_importances_, so we use the best base model
importances = best_xgb.feature_importances_
feature_names = X.columns

# Sort feature importances in descending order
indices = np.argsort(importances)[::-1]

print("Feature Ranking:")
for i in range(len(feature_names)):
    print(f"{feature_names[indices[i]]}: {importances[indices[i]]:.4f}")
```

## 9. Save Model

Finally, we save the trained model and the label encoder to disk so they can be used by the backend API.

```python
import os
os.makedirs("../models", exist_ok=True)

joblib.dump(model, "../models/ckd_model.pkl")
joblib.dump(label_enc, "../models/label_encoder.pkl")
print("Model saved to ../models/ckd_model.pkl")
print("Label Encoder saved to ../models/label_encoder.pkl")
```

---

## 10. What I Can Do - Risk Prediction Features

This section documents the **end-user functionality** available for the Kidney Disease Risk Prediction system.

### 10.1 Predict Risk

Users can predict their kidney disease risk by entering the following vital signs:

| Input Field | Description | Example |
|-------------|-------------|---------|
| **SPO2 (%)** | Blood oxygen saturation level | 98 |
| **Heart Rate (bpm)** | Beats per minute | 72 |
| **Systolic BP (mmHg)** | Blood pressure systolic reading | 130 |
| **Age** | Patient's age in years | 45 |
| **Diabetes** | Toggle: Yes/No | Yes |
| **Hypertension** | Toggle: Yes/No | No |

**Output:**
- **Risk Level**: Low, Medium, or High
- **Risk Score**: A numeric value (0-100) representing the severity

### 10.2 Save Monthly Risk Record

After prediction, users can **save their risk record** for tracking:

- **One record per month**: The system maintains only one record per user per month
- **Auto-update**: If a record already exists for the current month, it gets updated
- **Stored data**: Risk level, risk score, and all vital signs at the time of prediction

### 10.3 View Risk History

Users can view their **complete risk history** including:

- 📋 **Monthly Records List**: All saved predictions organized by month/year
- 📊 **Risk Score Display**: Numeric scores with color-coded risk levels
- 📅 **Timeline View**: Historical data presented chronologically

### 10.4 Trend Analysis with Linear Regression

The system performs **linear regression analysis** using the formula:

```
y = mx + c
```

Where:
- **y** = Risk Score (predicted)
- **x** = Time (month index)
- **m** = Slope (rate of change)
- **c** = Y-intercept

**Trend Interpretation:**

| Slope (m) | Trend | Color | Interpretation |
|-----------|-------|-------|----------------|
| **m > 0** | 📈 Increasing | 🔴 Red | Risk is increasing. Consider consulting your healthcare provider. |
| **m = 0** | ➡️ Steady | 🟠 Orange | Risk is stable. Continue with your current health routine. |
| **m < 0** | 📉 Decreasing | 🟢 Green | Risk is decreasing. Great progress! Keep up the healthy habits. |

### 10.5 Visual Graph Display

The Risk History screen displays:

1. **Data Points**: Actual monthly risk scores plotted on the graph
2. **Connecting Lines**: Blue lines connecting sequential data points
3. **Regression Line**: Colored trend line showing the overall direction (y = mx + c)
4. **Equation Display**: Shows the calculated regression equation and slope value
5. **Y-axis Labels**: Risk score values (0-100)
6. **X-axis Labels**: Month abbreviations (Jan, Feb, Mar, etc.)

### 10.6 Risk Level Color Coding

Throughout the app, risk levels are color-coded for quick identification:

| Risk Level | Color | Hex Code |
|------------|-------|----------|
| **Low** | 🟢 Green | `#2ED573` |
| **Medium** | 🟠 Orange | `#FFA502` |
| **High** | 🔴 Red | `#FF4757` |

### 10.7 Summary of Features

| Feature | Description |
|---------|-------------|
| ✅ **Predict Risk** | Enter vital signs and get instant risk prediction |
| ✅ **Save Record** | Store monthly risk data for trend tracking |
| ✅ **View History** | Access all historical risk predictions |
| ✅ **Trend Graph** | Visual representation of risk over time |
| ✅ **Linear Regression** | Calculate trend direction using y = mx + c |
| ✅ **Slope Analysis** | Understand if risk is increasing, steady, or decreasing |
| ✅ **Color-Coded Alerts** | Quick visual identification of risk severity |
| ✅ **Monthly Updates** | Update existing records within the same month |
