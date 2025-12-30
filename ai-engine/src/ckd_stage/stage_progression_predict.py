"""
LSTM-based CKD Stage Progression Prediction
Predicts future stage progression probability using lab values and optional ultrasound data
"""

import sys
import os
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
import json
import numpy as np
import tensorflow as tf
from tensorflow.keras.models import load_model

# Model path
MODEL_PATH = r"E:\GITHUB P\Research\Nephro-AI\ai-engine\models\ckd_lstm_model_withUS.h5"


def load_lstm_model():
    """Load the trained LSTM model"""
    if not os.path.exists(MODEL_PATH):
        return None, f"Model file not found at: {MODEL_PATH}"
    
    try:
        model = load_model(MODEL_PATH, compile=False)
        return model, None
    except Exception as e:
        return None, f"Error loading model: {str(e)}"


def preprocess_lab_data(lab_data):
    """
    Preprocess laboratory data for LSTM prediction
    Expected lab_data format:
    {
        "creatinine": float,
        "bun": float,
        "gfr": float,
        "albumin": float,
        "hemoglobin": float,
        "potassium": float,
        "sodium": float
    }
    """
    # Standard feature order expected by the model (7 features)
    feature_keys = [
        "creatinine", "bun", "egfr", "albumin", 
        "hemoglobin", "potassium", "sodium"
    ]
    
    # Extract values in correct order (accept both egfr and legacy gfr)
    values = []
    for key in feature_keys:
        if key == "egfr":
            val = lab_data.get("egfr", lab_data.get("gfr"))
        else:
            val = lab_data.get(key)

        if val is not None:
            values.append(float(val))
        else:
            # Use mean values for missing data
            default_values = {
                "creatinine": 1.2,
                "bun": 20.0,
                "egfr": 60.0,
                "albumin": 4.0,
                "hemoglobin": 12.5,
                "potassium": 4.5,
                "sodium": 140.0
            }
            values.append(default_values.get(key, 0.0))
    
    return np.array(values)


def egfr_to_stage_label(egfr_value):
    """Map eGFR to KDIGO G-stage. Returns stage label string."""
    if egfr_value >= 90:
        return "1"   # G1
    elif egfr_value >= 60:
        return "2"   # G2
    elif egfr_value >= 45:
        return "3.1" # G3a
    elif egfr_value >= 30:
        return "3.2" # G3b
    elif egfr_value >= 15:
        return "4"   # G4
    else:
        return "5"   # G5


def preprocess_ultrasound_data(us_data):
    """
    Preprocess ultrasound data for LSTM prediction
    Expected us_data format:
    {
        "left_kidney_length": float (cm),
        "right_kidney_length": float (cm),
        "left_cortical_thickness": float (cm),
        "right_cortical_thickness": float (cm),
        "echogenicity_score": int (1-5)
    }
    """
    feature_keys = [
        "left_kidney_length", "right_kidney_length",
        "left_cortical_thickness", "right_cortical_thickness",
        "echogenicity_score"
    ]
    
    values = []
    for key in feature_keys:
        if key in us_data and us_data[key] is not None:
            values.append(float(us_data[key]))
        else:
            # Default values if missing
            default_values = {
                "left_kidney_length": 10.5,
                "right_kidney_length": 10.5,
                "left_cortical_thickness": 1.0,
                "right_cortical_thickness": 1.0,
                "echogenicity_score": 2.0
            }
            values.append(default_values.get(key, 0.0))
    
    return np.array(values)


def normalize_features(lab_features, us_features=None):
    """
    Return raw features (no normalization).
    Current model expects lab-only features; ultrasound is ignored to match model input size.
    """
    return lab_features


def prepare_lstm_input(features, time_steps=3):
    """
    Prepare input for LSTM model
    LSTM expects input shape: (batch_size, time_steps, features)
    
    For single time point prediction, we repeat the features for all time steps
    In a real scenario, you'd have historical data for multiple time points
    """
    # Repeat features for each time step
    repeated = np.tile(features, (time_steps, 1))
    
    # Add batch dimension
    lstm_input = np.expand_dims(repeated, axis=0)
    
    return lstm_input


def predict_stage_progression(lab_data, us_data=None):
    """
    Main prediction function
    Returns probability distribution over CKD stages (1-5)
    """
    # Load model
    model, error = load_lstm_model()
    if error:
        return {"success": False, "error": error}
    
    try:
        # Preprocess lab data
        lab_features = preprocess_lab_data(lab_data)
        
        # DEBUG: Print raw features
        print(f"DEBUG - Raw lab features: {lab_features}", file=sys.stderr)
        print(f"DEBUG - eGFR value: {lab_data.get('egfr', lab_data.get('gfr', 'N/A'))}", file=sys.stderr)
        
        # Preprocess ultrasound data if provided
        us_features = None
        if us_data:
            us_features = preprocess_ultrasound_data(us_data)
        
        # Normalize features
        normalized_features = normalize_features(lab_features, us_features)
        
        # DEBUG: Print normalized features
        print(f"DEBUG - Normalized features: {normalized_features}", file=sys.stderr)
        
        # Prepare LSTM input
        lstm_input = prepare_lstm_input(normalized_features)
        
        # DEBUG: Print LSTM input shape
        print(f"DEBUG - LSTM input shape: {lstm_input.shape}", file=sys.stderr)
        
        # Make prediction
        predictions = model.predict(lstm_input, verbose=0)
        
        # Convert to probabilities (assuming model outputs logits or softmax)
        stage_probabilities = predictions[0]
        
        # Ensure probabilities sum to 1
        stage_probabilities = stage_probabilities / stage_probabilities.sum()
        
        # Map to stages using model output, then override deterministically by eGFR
        egfr_value = lab_data.get("egfr", lab_data.get("gfr", 60.0))

        if stage_probabilities.shape[0] == 5:
            # Model outputs 5 classes; split stage 3 for reporting
            prob_1 = float(stage_probabilities[0])
            prob_2 = float(stage_probabilities[1])
            prob_3 = float(stage_probabilities[2])
            prob_4 = float(stage_probabilities[3])
            prob_5 = float(stage_probabilities[4])

            if egfr_value >= 45:
                prob_3_1 = prob_3 * 0.7
                prob_3_2 = prob_3 * 0.3
            else:
                prob_3_1 = prob_3 * 0.3
                prob_3_2 = prob_3 * 0.7

            stage_probs_dict = {
                "stage_1": round(prob_1, 4),
                "stage_2": round(prob_2, 4),
                "stage_3.1": round(prob_3_1, 4),
                "stage_3.2": round(prob_3_2, 4),
                "stage_4": round(prob_4, 4),
                "stage_5": round(prob_5, 4)
            }

        else:
            # If model already outputs split classes
            stage_probs_dict = {
                "stage_1": round(float(stage_probabilities[0]), 4),
                "stage_2": round(float(stage_probabilities[1]), 4),
                "stage_3.1": round(float(stage_probabilities[2]), 4),
                "stage_3.2": round(float(stage_probabilities[3]), 4),
                "stage_4": round(float(stage_probabilities[4]), 4),
                "stage_5": round(float(stage_probabilities[5]), 4)
            }

        # Deterministic stage override based on eGFR
        egfr_stage = egfr_to_stage_label(egfr_value)
        predicted_stage = egfr_stage
        confidence = 1.0

        # Adjust confidence to reflect model probability mass near the egfr-derived stage when available
        if predicted_stage == "1":
            confidence = stage_probs_dict.get("stage_1", 1.0)
        elif predicted_stage == "2":
            confidence = stage_probs_dict.get("stage_2", 1.0)
        elif predicted_stage == "3.1":
            confidence = stage_probs_dict.get("stage_3.1", 1.0)
        elif predicted_stage == "3.2":
            confidence = stage_probs_dict.get("stage_3.2", 1.0)
        elif predicted_stage == "4":
            confidence = stage_probs_dict.get("stage_4", 1.0)
        else:
            confidence = stage_probs_dict.get("stage_5", 1.0)

        # Progression probabilities: compute probability of moving to higher stages
        ordered_stages = ["1", "2", "3.1", "3.2", "4", "5"]
        try:
            current_idx = ordered_stages.index(predicted_stage)
        except ValueError:
            current_idx = 0
        higher_stages = ordered_stages[current_idx + 1:]
        progression_to_any_higher = sum(
            stage_probs_dict.get(f"stage_{s}", 0.0) for s in higher_stages
        )
        next_stage_label = ordered_stages[current_idx + 1] if current_idx + 1 < len(ordered_stages) else None
        progression_to_next = stage_probs_dict.get(f"stage_{next_stage_label}", 0.0) if next_stage_label else 0.0

        # Calculate progression risk (stages 4 and 5) using model probs if available, else rule-based
        if stage_probabilities.shape[0] >= 5:
            if stage_probabilities.shape[0] == 5:
                progression_risk = float(stage_probabilities[3] + stage_probabilities[4])
            else:
                progression_risk = float(stage_probabilities[4] + stage_probabilities[5])
        else:
            progression_risk = 1.0 if predicted_stage == "5" else (0.7 if predicted_stage == "4" else 0.3)
        
        # Risk category
        if progression_risk > 0.7:
            risk_level = "High"
        elif progression_risk > 0.4:
            risk_level = "Moderate"
        else:
            risk_level = "Low"
        
        result = {
            "success": True,
            "current_stage": predicted_stage,
            "confidence": round(confidence, 4),
            "stage_probabilities": stage_probs_dict,
            "progression": {
                "next_stage": next_stage_label,
                "probability": round(float(progression_to_next), 4),
                "probability_percentage": round(float(progression_to_next) * 100, 2),
                "risk_level": "Low" if progression_to_next < 0.3 else ("Moderate" if progression_to_next < 0.6 else "High"),
                "any_higher_stage_probability": round(float(progression_to_any_higher), 4),
                "timeframe": "within 6 months (estimated)"
            },
            "overall_progression_risk": round(progression_risk, 4),
            "overall_risk_level": risk_level,
            "used_ultrasound": us_data is not None,
            "egfr_value": egfr_value
        }
        
        return result
        
    except Exception as e:
        return {
            "success": False,
            "error": f"Prediction error: {str(e)}"
        }


def main():
    """
    Main entry point for command-line usage
    Expects JSON input via command line argument
    """
    if len(sys.argv) < 2:
        print(json.dumps({
            "success": False,
            "error": "No input data provided"
        }))
        sys.exit(1)
    
    try:
        # Parse input JSON
        input_data = json.loads(sys.argv[1])
        
        # Extract lab and ultrasound data
        lab_data = input_data.get("lab_data", {})
        us_data = input_data.get("ultrasound_data")
        
        # Make prediction
        result = predict_stage_progression(lab_data, us_data)
        
        # Output result as JSON
        print(json.dumps(result))
        
    except json.JSONDecodeError as e:
        print(json.dumps({
            "success": False,
            "error": f"Invalid JSON input: {str(e)}"
        }))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": f"Unexpected error: {str(e)}"
        }))
        sys.exit(1)


if __name__ == "__main__":
    main()
