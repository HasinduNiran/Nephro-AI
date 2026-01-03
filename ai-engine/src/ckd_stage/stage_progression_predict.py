"""
LSTM-based CKD Stage Progression Prediction
Supports two inference paths:
- Lab-only model: best_model_lab_only.keras + scaler.pkl
- Lab + Ultrasound fusion model: best_model_lab_fusion.keras + scaler1.pkl
"""

import sys
import os
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
import json
import numpy as np
import joblib
import tensorflow as tf
from tensorflow.keras.models import load_model

# Paths
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MODELS_DIR = os.path.join(BASE_DIR, "models")

LAB_MODEL_PATH = os.path.join(MODELS_DIR, "best_model_lab_only.keras")
LAB_SCALER_PATH = os.path.join(MODELS_DIR, "scaler.pkl")

FUSION_MODEL_PATH = os.path.join(MODELS_DIR, "best_model_lab_fusion.keras")
FUSION_SCALER_PATH = os.path.join(MODELS_DIR, "scaler1.pkl")

# Feature orders
LAB_FEATURES_BASE = [
    "creatinine",
    "bun",
    "albumin",
    "egfr",
    "hemoglobin",
    "potassium",
    "sodium",
    "anchor_age",
    "urea",  # optional placeholder if present; will be zero if missing
]

FUSION_FEATURES_BASE = LAB_FEATURES_BASE + [
    "area_px",
    "length_px",
]

TIME_STEPS = 3  # use last 3 timepoints; single point will be repeated


def _load_scaler(path):
    if not os.path.exists(path):
        return None, f"Scaler file not found at: {path}"
    try:
        return joblib.load(path), None
    except Exception as exc:  # noqa: BLE001
        return None, f"Error loading scaler: {str(exc)}"


def load_model_and_scaler(use_ultrasound=False):
    preferred_model = FUSION_MODEL_PATH if use_ultrasound else LAB_MODEL_PATH
    preferred_scaler_path = FUSION_SCALER_PATH if use_ultrasound else LAB_SCALER_PATH
    fallback_scaler_path = LAB_SCALER_PATH if use_ultrasound else FUSION_SCALER_PATH

    if not os.path.exists(preferred_model):
        return None, None, f"Model file not found at: {preferred_model}"

    try:
        model = load_model(preferred_model, compile=False)
    except Exception as exc:  # noqa: BLE001
        return None, None, f"Error loading model: {str(exc)}"

    scaler, err = _load_scaler(preferred_scaler_path)
    if err or (hasattr(model, "input_shape") and scaler and getattr(scaler, "n_features_in_", -1) != model.input_shape[-1]):
        # Attempt fallback scaler if dimension mismatch
        alt_scaler, alt_err = _load_scaler(fallback_scaler_path)
        if not alt_err and alt_scaler and getattr(alt_scaler, "n_features_in_", -1) == model.input_shape[-1]:
            scaler, err = alt_scaler, None
            sys.stderr.write(
                f"[warn] Swapped to fallback scaler {fallback_scaler_path} to match model input dims\n"
            )
        elif err:
            return None, None, err
        elif getattr(scaler, "n_features_in_", -1) != model.input_shape[-1]:
            return None, None, (
                f"Scaler feature count {getattr(scaler, 'n_features_in_', 'unknown')} "
                f"does not match model expected {model.input_shape[-1]}"
            )

    return model, scaler, None


def egfr_to_stage_label(egfr_value):
    if egfr_value >= 90:
        return "1"   # G1
    if egfr_value >= 60:
        return "2"   # G2
    if egfr_value >= 45:
        return "3.1" # G3a
    if egfr_value >= 30:
        return "3.2" # G3b
    if egfr_value >= 15:
        return "4"   # G4
    return "5"       # G5


def _safe_float(val, default=0.0):
    try:
        if val is None:
            return default
        return float(val)
    except Exception:  # noqa: BLE001
        return default


def build_feature_vector(lab_point, us_point, use_ultrasound, expected_dim=None):
    age_val = _safe_float(lab_point.get("anchor_age") or lab_point.get("age"), 50.0)
    base = {
        "creatinine": _safe_float(lab_point.get("creatinine")),
        "bun": _safe_float(lab_point.get("bun")),
        "albumin": _safe_float(lab_point.get("albumin")),
        "egfr": _safe_float(lab_point.get("egfr", lab_point.get("gfr")), 60.0),
        "hemoglobin": _safe_float(lab_point.get("hemoglobin")),
        "potassium": _safe_float(lab_point.get("potassium")),
        "sodium": _safe_float(lab_point.get("sodium")),
        "anchor_age": age_val,
        "urea": _safe_float(lab_point.get("urea")),
    }

    feature_list = LAB_FEATURES_BASE

    if use_ultrasound:
        area_px = _safe_float(us_point.get("area_px")) if us_point else 0.0
        length_px = _safe_float(us_point.get("length_px")) if us_point else 0.0

        if us_point:
            k_len = _safe_float(us_point.get("kidney_length"), 0.0)
            k_wid = _safe_float(us_point.get("kidney_width"), 0.0)
            if length_px == 0.0 and k_len > 0:
                length_px = k_len
            if area_px == 0.0 and k_len > 0 and k_wid > 0:
                area_px = k_len * k_wid

        base.update({"area_px": area_px, "length_px": length_px})
        feature_list = FUSION_FEATURES_BASE

    vec = [base.get(k, 0.0) for k in feature_list]

    target_dim = expected_dim or len(vec)
    if len(vec) < target_dim:
        vec = vec + [0.0] * (target_dim - len(vec))
    elif len(vec) > target_dim:
        vec = vec[:target_dim]

    return np.array(vec, dtype=np.float32)


def build_sequence(lab_input, us_input, use_ultrasound, expected_dim=None):
    # Accept single dict or list of dicts
    if isinstance(lab_input, list):
        lab_points = lab_input[-TIME_STEPS:]
    else:
        lab_points = [lab_input]

    if isinstance(us_input, list):
        us_points = us_input[-TIME_STEPS:]
    else:
        us_points = [us_input] if us_input is not None else [None]

    # Align lengths
    while len(lab_points) < TIME_STEPS:
        lab_points = [lab_points[0]] + lab_points
    lab_points = lab_points[-TIME_STEPS:]

    while len(us_points) < TIME_STEPS:
        us_points = [us_points[0]] + us_points
    us_points = us_points[-TIME_STEPS:]

    seq = []
    for lp, up in zip(lab_points, us_points):
        seq.append(build_feature_vector(lp or {}, up or {}, use_ultrasound, expected_dim))

    return np.stack(seq, axis=0)


def predict_stage_progression(lab_data, us_data=None):
    use_ultrasound = us_data is not None
    model, scaler, load_err = load_model_and_scaler(use_ultrasound)
    if load_err:
        return {"success": False, "error": load_err}

    try:
        expected_dim = getattr(scaler, "n_features_in_", None)
        seq = build_sequence(lab_data, us_data, use_ultrasound, expected_dim)
        if expected_dim is None:
            expected_dim = seq.shape[-1]
        seq_scaled = scaler.transform(seq.reshape(-1, seq.shape[-1])).reshape(seq.shape)

        lstm_input = np.expand_dims(seq_scaled, axis=0)

        predictions = model.predict(lstm_input, verbose=0)[0]
        stage_probabilities = predictions / np.sum(predictions)

        egfr_value = _safe_float(
            (lab_data[-1] if isinstance(lab_data, list) else lab_data).get("egfr")
            or (lab_data[-1] if isinstance(lab_data, list) else lab_data).get("gfr"),
            60.0,
        )

        if stage_probabilities.shape[0] == 6:
            stage_probs_dict = {
                "stage_1": round(float(stage_probabilities[0]), 4),
                "stage_2": round(float(stage_probabilities[1]), 4),
                "stage_3.1": round(float(stage_probabilities[2]), 4),
                "stage_3.2": round(float(stage_probabilities[3]), 4),
                "stage_4": round(float(stage_probabilities[4]), 4),
                "stage_5": round(float(stage_probabilities[5]), 4),
            }
        else:
            # fallback: 5-class model, split stage 3 using eGFR
            prob_1, prob_2, prob_3, prob_4, prob_5 = [float(x) for x in stage_probabilities]
            if egfr_value >= 45:
                prob_3_1, prob_3_2 = prob_3 * 0.7, prob_3 * 0.3
            else:
                prob_3_1, prob_3_2 = prob_3 * 0.3, prob_3 * 0.7
            stage_probs_dict = {
                "stage_1": round(prob_1, 4),
                "stage_2": round(prob_2, 4),
                "stage_3.1": round(prob_3_1, 4),
                "stage_3.2": round(prob_3_2, 4),
                "stage_4": round(prob_4, 4),
                "stage_5": round(prob_5, 4),
            }

        predicted_stage = egfr_to_stage_label(egfr_value)
        confidence = stage_probs_dict.get(f"stage_{predicted_stage}", 1.0)

        ordered = ["1", "2", "3.1", "3.2", "4", "5"]
        try:
            idx = ordered.index(predicted_stage)
        except ValueError:
            idx = 0
        next_stage_label = ordered[idx + 1] if idx + 1 < len(ordered) else None
        progression_to_next = stage_probs_dict.get(f"stage_{next_stage_label}", 0.0) if next_stage_label else 0.0
        progression_to_any_higher = sum(stage_probs_dict.get(f"stage_{s}", 0.0) for s in ordered[idx + 1:])

        if stage_probabilities.shape[0] == 6:
            progression_risk = float(stage_probabilities[4] + stage_probabilities[5])
        else:
            progression_risk = float(stage_probabilities[-2] + stage_probabilities[-1])

        if progression_risk > 0.7:
            risk_level = "High"
        elif progression_risk > 0.4:
            risk_level = "Moderate"
        else:
            risk_level = "Low"

        return {
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
                "timeframe": "within 6 months (estimated)",
            },
            "overall_progression_risk": round(progression_risk, 4),
            "overall_risk_level": risk_level,
            "used_ultrasound": use_ultrasound,
            "egfr_value": egfr_value,
        }
    except Exception as exc:  # noqa: BLE001
        return {"success": False, "error": f"Prediction error: {str(exc)}"}


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "No input data provided"}))
        sys.exit(1)

    try:
        input_data = json.loads(sys.argv[1])
        lab_data = input_data.get("lab_data", {})
        us_data = input_data.get("ultrasound_data")
        result = predict_stage_progression(lab_data, us_data)
        print(json.dumps(result))
    except json.JSONDecodeError as exc:  # noqa: BLE001
        print(json.dumps({"success": False, "error": f"Invalid JSON input: {str(exc)}"}))
        sys.exit(1)
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"success": False, "error": f"Unexpected error: {str(exc)}"}))
        sys.exit(1)


if __name__ == "__main__":
    main()
