import sys
import os
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"

import json
import warnings
import numpy as np
import pandas as pd
import tensorflow as tf
import pickle
from datetime import datetime

try:
    from sklearn.exceptions import InconsistentVersionWarning
    warnings.filterwarnings("ignore", category=InconsistentVersionWarning)
except Exception:
    pass

warnings.filterwarnings(
    "ignore",
    message="X does not have valid feature names, but StandardScaler was fitted with feature names",
)

# ==========================================================
# LOAD MODEL + ASSETS
# ==========================================================

def load_ckd_model(mode="lab"):
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    models_dir = os.path.join(base_dir, "models")
    model_path = os.path.join(models_dir, f"ckd_model_{mode}.keras")
    assets_path = os.path.join(models_dir, f"ckd_assets_{mode}.pkl")

    if not os.path.exists(model_path):
        return None, None

    model = tf.keras.models.load_model(model_path, compile=False)

    with open(assets_path, "rb") as f:
        assets = pickle.load(f)

    return model, assets


# ==========================================================
# BUILD SEQUENCE FROM VISIT HISTORY
# ==========================================================

def build_sequence(history, assets):
    df = pd.DataFrame(history)

    # Normalize common optional lab aliases (case-insensitive)
    alias_groups = {
        "bun": ["bun", "BUN"],
        "albumin": ["albumin", "Albumin"],
        "hemoglobin": ["hemoglobin", "haemoglobin", "Hemoglobin", "Haemoglobin"],
    }

    for canonical, aliases in alias_groups.items():
        if canonical not in df.columns:
            for alias in aliases:
                if alias in df.columns:
                    df[canonical] = df[alias]
                    break

    df["charttime"] = pd.to_datetime(df["charttime"])
    df = df.sort_values("charttime")

    # Time gap
    df["time_gap"] = df["charttime"].diff().dt.days.fillna(0)

    # eGFR slope
    df["egfr_slope"] = df["egfr"].diff().fillna(0)

    # Forward fill kidney_length if exists
    if "kidney_length" in df.columns:
        df["kidney_length"] = df["kidney_length"].ffill()

    # Optional labs: fill missing with 0.0 so model can still run
    optional_cols = ["bun", "BUN", "albumin", "Albumin", "hemoglobin", "Hemoglobin", "haemoglobin", "Haemoglobin"]
    for col in optional_cols:
        if col not in df.columns:
            df[col] = 0.0

    # Ensure all model-required columns exist (case-insensitive fallback)
    required_cols = list(assets.get("static_cols", [])) + list(assets.get("dynamic_cols", []))
    lower_lookup = {str(c).lower(): c for c in df.columns}

    for col in required_cols:
        if col in df.columns:
            continue
        alt = lower_lookup.get(str(col).lower())
        if alt is not None:
            df[col] = df[alt]
            continue

        # optional clinical features can safely default to 0
        if str(col).lower() in {"bun", "albumin", "hemoglobin", "haemoglobin"}:
            df[col] = 0.0
            continue

        # preserve strictness for truly required non-optional features
        raise ValueError(f"Required feature column missing: {col}")

    # Encode gender
    if "gender" not in df.columns:
        df["gender"] = "M"
    df["gender"] = assets["le_gender"].transform([df["gender"].iloc[0]])[0]

    # Static features
    static_vals = df[assets["static_cols"]].iloc[0].values.reshape(1, -1)
    static_vals = assets["scaler_stat"].transform(static_vals)

    # Dynamic features
    dynamic_vals = df[assets["dynamic_cols"]].values
    dynamic_vals = assets["scaler_dyn"].transform(dynamic_vals)

    # Build padded sequence
    max_len = assets["max_seq_len"]
    seq = dynamic_vals[-max_len:]

    if len(seq) < max_len:
        padding = np.zeros((max_len - len(seq), len(assets["dynamic_cols"])))
        seq = np.vstack([padding, seq])

    seq = np.expand_dims(seq, axis=0)

    return seq, static_vals


# ==========================================================
# RISK CALCULATION
# ==========================================================

def calculate_risks(next_probs, sixm_probs, current_stage_idx):

    # Progression = any stage increase
    progression_risk_next = np.sum(next_probs[current_stage_idx+1:])
    progression_risk_6m = np.sum(sixm_probs[current_stage_idx+1:])

    # Severe progression = jump ≥2 OR G4/G5
    severe_next = np.sum(next_probs[current_stage_idx+2:])
    severe_6m = np.sum(sixm_probs[current_stage_idx+2:])

    return {
        "risk_progression_next_visit": round(float(progression_risk_next), 4),
        "risk_progression_6_month": round(float(progression_risk_6m), 4),
        "risk_severe_progression_next_visit": round(float(severe_next), 4),
        "risk_severe_progression_6_month": round(float(severe_6m), 4)
    }


def _stage_from_egfr(egfr_value):
    try:
        v = float(egfr_value)
    except Exception:
        return "2"
    if v >= 90:
        return "1"
    if v >= 60:
        return "2"
    if v >= 45:
        return "3.1"
    if v >= 30:
        return "3.2"
    if v >= 15:
        return "4"
    return "5"


def _normalize_stage_label(value):
    if value is None:
        return None
    text = str(value).strip().lower().replace("stage", "").replace(" ", "")
    text = text.replace("g", "")
    if text in {"3", "3a", "3.0", "3.1", "g3a"}:
        return "3.1"
    if text in {"3b", "3.2", "g3b"}:
        return "3.2"
    if text.endswith(".0"):
        text = text[:-2]
    return text


def _resolve_stage_index(current_stage_raw, stages, egfr_value):
    normalized_map = {}
    for i, stage in enumerate(stages):
        normalized_map[_normalize_stage_label(stage)] = i

    candidate = _normalize_stage_label(current_stage_raw)
    if candidate in normalized_map:
        return candidate, normalized_map[candidate]

    fallback = _stage_from_egfr(egfr_value)
    if fallback in normalized_map:
        return fallback, normalized_map[fallback]

    # final fallback to first class to avoid runtime crash
    first_stage = _normalize_stage_label(stages[0]) if stages else "1"
    return first_stage, 0


# ==========================================================
# MAIN PREDICTION FUNCTION
# ==========================================================

def predict_progression(history, mode="lab"):

    model, assets = load_ckd_model(mode)
    if model is None:
        return {"success": False, "error": "Model not found"}

    seq, static_vals = build_sequence(history, assets)

    # Predict
    next_pred, sixm_pred = model.predict([seq, static_vals], verbose=0)

    next_probs = next_pred[0]
    sixm_probs = sixm_pred[0]

    # Current stage = last visit stage
    stages = assets["stages"]
    current_stage_raw = history[-1].get("ckd_stage")
    egfr_value = history[-1].get("egfr", history[-1].get("gfr"))
    current_stage, current_idx = _resolve_stage_index(current_stage_raw, stages, egfr_value)

    risks = calculate_risks(next_probs, sixm_probs, current_idx)

    return {
        "success": True,
        "mode": mode,
        "current_stage": current_stage,
        "next_visit_stage_probabilities": {
            stage: round(float(prob), 4)
            for stage, prob in zip(stages, next_probs)
        },
        "six_month_stage_probabilities": {
            stage: round(float(prob), 4)
            for stage, prob in zip(stages, sixm_probs)
        },
        **risks
    }


def _has_ultrasound_data(input_json):
    if isinstance(input_json, dict):
        us_block = input_json.get("ultrasound_data")
        if isinstance(us_block, list):
            return any(bool(item) for item in us_block)
        if isinstance(us_block, dict):
            return any(v is not None and v != "" for v in us_block.values())
        if us_block is not None:
            return True

        history = input_json.get("history")
        if isinstance(history, list):
            return any(
                isinstance(v, dict) and any(
                    k in v for k in ("kidney_length", "kidney_width", "area_px", "length_px", "echogenicity_score")
                )
                for v in history
            )

    if isinstance(input_json, list):
        return any(
            isinstance(v, dict) and any(
                k in v for k in ("kidney_length", "kidney_width", "area_px", "length_px", "echogenicity_score")
            )
            for v in input_json
        )

    return False


def _extract_history(input_json):
    if isinstance(input_json, list):
        return input_json

    if isinstance(input_json, dict):
        if isinstance(input_json.get("history"), list):
            return input_json["history"]
        if isinstance(input_json.get("lab_data"), list):
            return input_json["lab_data"]
        if isinstance(input_json.get("lab_data"), dict):
            return [input_json["lab_data"]]

    return []


# ==========================================================
# CLI ENTRY (for Node.js backend)
# ==========================================================

if __name__ == "__main__":
    try:
        input_json = json.loads(sys.argv[1])
        mode = sys.argv[2] if len(sys.argv) > 2 else ("lab+us" if _has_ultrasound_data(input_json) else "lab")
        history = _extract_history(input_json)
        if not history:
            raise ValueError("No visit history found. Provide `history` or `lab_data`.")
        result = predict_progression(history, mode)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))