import sys
import joblib
import pandas as pd
import json
import os

def load_artifacts():
    # Assuming the script is run from the root or backend, we need to find the pkl files
    # Adjust path as necessary. If running from backend via node, paths might be relative to root if cwd is set correctly
    # or absolute. Let's assume the pkl files are in the root 'c:\Research\Nephro-AI\'
    
    base_path = os.path.dirname(os.path.abspath(__file__))
    model_path = os.path.join(base_path, '..', '..', 'models', 'ckd_model.pkl')
    # encoder_path = os.path.join(base_path, 'label_encoder.pkl') # Not strictly needed if we just output the class index or if the model outputs the label directly if it was trained on strings (but notebook says it encoded)
    
    try:
        model = joblib.load(model_path)
        return model
    except FileNotFoundError:
        return None

def predict(data):
    model = load_artifacts()
    if not model:
        return {"error": "Model file not found"}

    # Prepare dataframe
    # Features: spo2, heart_rate, bp_systolic, age, diabetes, hypertension
    try:
        features = pd.DataFrame([data], columns=["spo2", "heart_rate", "bp_systolic", "age", "diabetes", "hypertension"])
        prediction = model.predict(features)[0]
        
        # If the target was encoded, we might want to decode it. 
        # Looking at the notebook: categorical_cols = ["diabetes", "hypertension", "risk_category"]
        # label_enc was used. If we want the string label back, we need the encoder for 'risk_category'.
        # However, the notebook overwrites 'label_enc' in the loop. 
        # Ideally, we should have saved a separate encoder for the target or a dictionary.
        # For now, let's return the prediction value. If it's 0, 1, 2 etc.
        
        # Let's try to load the encoder and see if we can inverse transform if it was the last one fitted on risk_category?
        # The notebook loop: for col in categorical_cols: df[col] = label_enc.fit_transform(df[col])
        # The last col is 'risk_category'. So label_enc should be fitted on 'risk_category'.
        
        base_path = os.path.dirname(os.path.abspath(__file__))
        encoder_path = os.path.join(base_path, '..', '..', 'models', 'label_encoder.pkl')
        try:
            le = joblib.load(encoder_path)
            prediction_label = le.inverse_transform([prediction])[0]
        except:
            prediction_label = str(prediction)

        return {"risk_level": prediction_label}
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    # Expecting arguments passed as JSON string or individual args
    # Let's use sys.argv[1] as a JSON string
    try:
        input_data = json.loads(sys.argv[1])
        result = predict(input_data)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
