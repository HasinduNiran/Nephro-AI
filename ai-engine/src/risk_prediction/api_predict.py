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
    Expected input: age, bp_systolic, bp_diastolic, diabetes_level
    Note: diabetes_level should be blood sugar level (mg/dL), not boolean
    """
    model, label_encoder = load_artifacts()
    if not model or not label_encoder:
        return {"error": "Model files not found"}

    try:
        # Extract basic features
        age = float(data.get('age', 0))
        bp_systolic = float(data.get('bp_systolic', 0))
        bp_diastolic = float(data.get('bp_diastolic', 0))
        
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
            "age", "bp_systolic", "bp_diastolic", "diabetes_level",
            "age_bp_sys", "age_bp_dia", "age_sugar", "bp_sys_sugar", "bp_dia_sugar", "bp_sys_dia",
            "pulse_pressure", "mean_arterial_pressure",
            "bp_sys_category", "bp_dia_category", "age_group", "diabetes_category"
        ])
        
        # Make prediction
        prediction = model.predict(features)[0]
        
        # Decode prediction using label encoder
        prediction_label = label_encoder.inverse_transform([prediction])[0]
        
        # Calculate risk score (0-100 scale)
        risk_score_map = {'Low': 33, 'Medium': 66, 'High': 100}
        risk_score = risk_score_map.get(prediction_label, 50)
        
        return {
            "risk_level": prediction_label,
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
