import sys
import joblib
import pandas as pd
import numpy as np
import json
import os

def load_artifacts():
    """Load the trained model and label encoder"""
    base_path = os.path.dirname(os.path.abspath(__file__))
    model_path = os.path.join(base_path, '..', '..', 'models', 'ckd_model.pkl')
    encoder_path = os.path.join(base_path, '..', '..', 'models', 'label_encoder.pkl')
    
    try:
        model = joblib.load(model_path)
        label_encoder = joblib.load(encoder_path)
        return model, label_encoder
    except FileNotFoundError as e:
        return None, None

def predict(data):
    """
    Predict CKD risk based on patient data
    Expected input: age, gender, bp_systolic, bp_diastolic, diabetes_level
    Note: diabetes_level should be blood sugar level (mg/dL), not boolean
    Note: gender should be 'Male' or 'Female' (will be encoded as 1 or 0)
    """
    model, label_encoder = load_artifacts()
    if not model or not label_encoder:
        return {"error": "Model files not found"}

    try:
        # Extract basic features
        age = float(data.get('age', 0))
        bp_systolic = float(data.get('bp_systolic', 0))
        bp_diastolic = float(data.get('bp_diastolic', 0))
        
        # Gender encoding: Male=1, Female=0
        gender_raw = data.get('gender', 'Male')
        if isinstance(gender_raw, str):
            gender = 1 if gender_raw.lower() == 'male' else 0
        else:
            gender = int(gender_raw)  # Already encoded
        
        # diabetes_level should be continuous blood sugar value
        # If boolean diabetes flag is sent, convert to estimated values
        if 'diabetes_level' in data:
            diabetes_level = float(data['diabetes_level'])
        elif 'diabetes' in data:
            # Convert boolean to estimated blood sugar level
            # Normal: ~90, Diabetic: ~150
            diabetes_level = 150.0 if data['diabetes'] else 90.0
        else:
            diabetes_level = 90.0  # Default normal
        
        # Create feature dictionary
        features_dict = {
            'age': age,
            'gender': gender,
            'bp_systolic': bp_systolic,
            'bp_diastolic': bp_diastolic,
            'diabetes_level': diabetes_level
        }
        
        # Create interaction features (matching training)
        features_dict['age_bp_sys'] = age * bp_systolic
        features_dict['age_bp_dia'] = age * bp_diastolic
        features_dict['age_sugar'] = age * diabetes_level
        features_dict['bp_sys_sugar'] = bp_systolic * diabetes_level
        features_dict['bp_dia_sugar'] = bp_diastolic * diabetes_level
        features_dict['bp_sys_dia'] = bp_systolic * bp_diastolic
        features_dict['gender_age'] = gender * age
        features_dict['gender_bp_sys'] = gender * bp_systolic
        features_dict['gender_diabetes'] = gender * diabetes_level
        
        # Calculate pulse pressure and MAP
        features_dict['pulse_pressure'] = bp_systolic - bp_diastolic
        features_dict['mean_arterial_pressure'] = (bp_systolic + 2 * bp_diastolic) / 3
        
        # Create binned features (matching training)
        # Systolic BP Categories
        if bp_systolic < 120:
            bp_sys_category = 0
        elif bp_systolic < 130:
            bp_sys_category = 1
        elif bp_systolic < 140:
            bp_sys_category = 2
        else:
            bp_sys_category = 3
        
        # Diastolic BP Categories
        if bp_diastolic < 80:
            bp_dia_category = 0
        elif bp_diastolic < 90:
            bp_dia_category = 1
        else:
            bp_dia_category = 2
        
        # Age Groups
        if age < 30:
            age_group = 0
        elif age < 60:
            age_group = 1
        else:
            age_group = 2
        
        # Diabetes Level Categories
        if diabetes_level < 100:
            diabetes_category = 0
        elif diabetes_level < 126:
            diabetes_category = 1
        else:
            diabetes_category = 2
        
        features_dict['bp_sys_category'] = bp_sys_category
        features_dict['bp_dia_category'] = bp_dia_category
        features_dict['age_group'] = age_group
        features_dict['diabetes_category'] = diabetes_category
        
        # Create DataFrame with correct column order (matching training)
        features = pd.DataFrame([features_dict], columns=[
            "age", "gender", "bp_systolic", "bp_diastolic", "diabetes_level",
            "age_bp_sys", "age_bp_dia", "age_sugar", "bp_sys_sugar", "bp_dia_sugar", "bp_sys_dia",
            "gender_age", "gender_bp_sys", "gender_diabetes",
            "pulse_pressure", "mean_arterial_pressure",
            "bp_sys_category", "bp_dia_category", "age_group", "diabetes_category"
        ])
        
        # Make prediction
        prediction = model.predict(features)[0]
        
        # Decode prediction using label encoder
        prediction_label = label_encoder.inverse_transform([prediction])[0]
        
        # Calculate continuous risk score using linear combination of features
        # Normalize features to 0-1 scale for scoring
        age_norm = min(age / 100, 1.0)  # Normalize age (max 100)
        bp_sys_norm = min((bp_systolic - 90) / 90, 1.0)  # Normalize systolic BP (90-180 range)
        bp_dia_norm = min((bp_diastolic - 60) / 60, 1.0)  # Normalize diastolic BP (60-120 range)
        diabetes_norm = min((diabetes_level - 70) / 180, 1.0)  # Normalize diabetes (70-250 range)
        
        # Ensure normalized values are between 0 and 1
        age_norm = max(0, min(1, age_norm))
        bp_sys_norm = max(0, min(1, bp_sys_norm))
        bp_dia_norm = max(0, min(1, bp_dia_norm))
        diabetes_norm = max(0, min(1, diabetes_norm))
        
        # Calculate base risk score using weighted linear combination
        # Weights based on clinical importance
        base_score = (
            age_norm * 25 +          # Age contributes 25%
            bp_sys_norm * 30 +       # Systolic BP contributes 30%
            bp_dia_norm * 20 +       # Diastolic BP contributes 20%
            diabetes_norm * 25       # Diabetes level contributes 25%
        )
        
        # Get probability predictions for fine-tuning
        if hasattr(model, 'predict_proba'):
            probabilities = model.predict_proba(features)[0]
            classes = label_encoder.inverse_transform(model.classes_)
            prob_map = dict(zip(classes, probabilities))
            
            # Adjust base score based on model confidence
            low_prob = prob_map.get('Low', 0)
            medium_prob = prob_map.get('Medium', 0)
            high_prob = prob_map.get('High', 0)
            
            # Fine-tune the score based on model prediction
            if prediction_label == 'Low':
                risk_score = base_score * 0.33 + (1 - low_prob) * 15
            elif prediction_label == 'Medium':
                risk_score = 33 + base_score * 0.33 + medium_prob * 10
            else:  # High
                risk_score = 66 + base_score * 0.34 + high_prob * 10
        else:
            # Use base score with category adjustment
            if prediction_label == 'Low':
                risk_score = base_score * 0.33  # Scale to 0-33
            elif prediction_label == 'Medium':
                risk_score = 33 + base_score * 0.33  # Scale to 33-66
            else:  # High
                risk_score = 66 + base_score * 0.34  # Scale to 66-100
        
        # Ensure score is within bounds
        risk_score = max(0, min(100, risk_score))
        risk_score = round(risk_score, 2)
        
        # Determine risk level based on final score
        if risk_score < 33.33:
            risk_level = 'Low'
        elif risk_score < 66.67:
            risk_level = 'Medium'
        else:
            risk_level = 'High'
        
        return {
            "risk_level": risk_level,
            "risk_score": risk_score
        }
        
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    try:
        input_data = json.loads(sys.argv[1])
        result = predict(input_data)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
