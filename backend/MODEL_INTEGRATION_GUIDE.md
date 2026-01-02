# CKD Risk Prediction Model Integration Guide

## Overview
This document explains the integration of the new CKD risk prediction model (Stacking Classifier with XGBoost + Random Forest) with the Node.js backend and React Native mobile app.

## Model Details

### Training Notebook
Location: `ai-engine/notebooks/Trained new model.ipynb`

### Model Architecture
- **Algorithm**: Stacking Classifier
  - Base Models: XGBoost, Random Forest
  - Meta Model: Logistic Regression
- **Model Files**: 
  - `ai-engine/models/ckd_model.pkl`
  - `ai-engine/models/label_encoder.pkl`

### Input Features
The model uses the following features:

#### Primary Features (Required)
1. **age** - Patient age (years)
2. **bp_systolic** - Systolic blood pressure (mmHg)
3. **bp_diastolic** - Diastolic blood pressure (mmHg)
4. **diabetes_level** - Blood sugar level (mg/dL)

#### Derived Features (Auto-calculated)
5. **age_bp_sys** - age × bp_systolic
6. **age_bp_dia** - age × bp_diastolic
7. **age_sugar** - age × diabetes_level
8. **bp_sys_sugar** - bp_systolic × diabetes_level
9. **bp_dia_sugar** - bp_diastolic × diabetes_level
10. **bp_sys_dia** - bp_systolic × bp_diastolic
11. **pulse_pressure** - bp_systolic - bp_diastolic (cardiovascular indicator)
12. **mean_arterial_pressure** - (bp_systolic + 2 × bp_diastolic) / 3

#### Categorical Features (Auto-calculated)
13. **bp_sys_category** - Systolic BP stage (0: <120, 1: 120-129, 2: 130-139, 3: ≥140)
14. **bp_dia_category** - Diastolic BP stage (0: <80, 1: 80-89, 2: ≥90)
15. **age_group** - Age group (0: <30, 1: 30-60, 2: >60)
16. **diabetes_category** - Diabetes stage (0: <100, 1: 100-125, 2: ≥126)

### Output
- **risk_level**: "Low", "Medium", or "High"
- **risk_score**: Numeric score (33, 66, or 100)

## Implementation Changes

### 1. Python Prediction Script (`ai-engine/src/risk_prediction/api_predict.py`)

**Key Changes:**
- Updated to use new model with 16 features (4 primary + 8 interactions + 4 categorical)
- Added bp_diastolic as a required input
- Includes pulse_pressure and mean_arterial_pressure calculations
- Changed from boolean diabetes to continuous `diabetes_level`
- Automatic feature engineering (interactions and binning)
- Returns both `risk_level` and `risk_score`

**Backward Compatibility:**
- If `diabetes_level` is not provided, converts boolean `diabetes` flag to estimated value:
  - `diabetes=true` → `diabetes_level=150` mg/dL
  - `diabetes=false` → `diabetes_level=90` mg/dL

### 2. Backend Controller (`backend/controllers/predictController.js`)
both `bp_systolic` and `bp_diastolic` as required
- Accepts `diabetes_level` as optional continuous value
- Falls back to boolean `diabetes` flag if `diabetes_level` not provided
- All three primary fields (age, bp_systolic, bp_diastolic) are`diabetes_level` not provided
- Made SPO2 and heart_rate optional (not used by current model)
- Only `age` and `bp_systolic` are strictly required

**API Request Format:**
```javascript
POST /predict
{
  "age": 45,                    // Required
  "bp_systolic": 135,          // Required
  "bp_diastolic": 85,          // Required
  "diabetes_level": 110,       // Optional (continuous)
  "diabetes": true             // Optional (boolean, used if diabetes_level not provided)
}
```

**API Response Format:**
```javascript
{
  "risk_level": "Medium",      // Low, Medium, or High
  "risk_score": 66            // 33, 66, or 100
}
```

### 3. Mobile App (`mobile-app/src/screens/RiskPredictionScreen.js`)

**Key Changes:**
- Added input field for Diastolic Blood Pressure (required)
- Blood Sugar Level remains optional
- Only numeric input fields - no checkboxes
- Updated validation to require systolic, diastolic, and age
- Automatically sends both BP values to backend
- Updated info card to explain importance of both BP values

**User Experience:**
- **Minimum Input**: Age + Systolic BP + Diastolic BP
- **Recommended**: Age + Systolic BP + Diastolic BP + Blood Sugar Level
- **Why Both BP Values**: Systolic and diastolic blood pressure provide comprehensive cardiovascular health assessment

## Testing

### Manual Testing Script
Run the test script to verify the API:

```bash
cd backend
node test_prediction.js
```

This tests:
1. Low risk patient (young, normal BP, normal sugar)
2. Medium risk patient (middle-aged, elevated BP, prediabetic)
3. High risk patient (senior, high BP, diabetic)
4. Backward compatibility with boolean flags
5. Error handling for missing fields

### Expected Test Results
- **Test 1**: Should return "Low" risk
- **Test 2**: Should return "Medium" risk
- **Test 3**: Should return "High" risk
- **Test 4**: Should convert boolean to diabetes_level and predict
- **Test 5**: Should return error for missing required fields

## Running the System

### 1. Start Backend Server
```bash
cd backend
npm install  # if not already done
node server.js
```

### 2. Test Prediction
```bash
node test_prediction.js
```

### 3. Start Mobile App
```bash
cd mobile-app
npm install  # if not already done
npm start
```

## Migration Notes

### For Existing Users
- Old API requests (with boolean `diabetes`/`hypertension`) will still work
- Backend automatically converts boolean flags to estimated blood sugar levels
- No breaking changes to existing integrations

### For New Integrations
- Recommend using `diabetes_level` (continuous) instead of boolean flag
- Provides more accurate predictions
- Blood sugar can be measured with glucometer

## Model Performance

From training notebook:
- Uses noise injection to simulate real-world measurement variability
- Fine-tuned hyperparameters using RandomizedSearchCV
- Feature importance ranking available in training logs

## Future Improvements

1. **Add More Features**: Include additional clinical parameters
2. **Real-time Monitoring**: Connect with wearable devices
3. **Explainability**: Add SHAP values for prediction interpretation
4. **Multi-class Probability**: Return confidence scores for each risk level
5. **Model Versioning**: Track model versions in production

## Support

For issues or questions:
- Check the training notebook: [Trained new model.ipynb](file:///c:/Research/Nephro-AI/ai-engine/notebooks/Trained%20new%20model.ipynb)
- Review the API predict script: [api_predict.py](../ai-engine/src/risk_prediction/api_predict.py)
- Contact the development team

---

**Last Updated**: January 2, 2026
**Model Version**: 1.0 (Stacking Classifier)
