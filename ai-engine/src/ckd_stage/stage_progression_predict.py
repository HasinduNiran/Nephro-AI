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
from functools import lru_cache

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

@lru_cache(maxsize=2)
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
# eGFR SENSITIVITY ADJUSTMENT
# ==========================================================

def calculate_egfr_sensitivity_factor(egfr_value, current_stage):
    """
    Calculate a sensitivity factor based on how close eGFR is to stage boundaries.
    This makes the model more responsive to eGFR changes.
    """
    stage_boundaries = {
        "1": 90,
        "2": 60,
        "3.1": 45,
        "3.2": 30,
        "4": 15,
        "5": 0
    }
    
    if current_stage not in stage_boundaries:
        return 1.0
    
    current_boundary = stage_boundaries[current_stage]
    
    # For G1, look at distance from 90
    if current_stage == "1":
        if egfr_value >= 90:
            # High eGFR, lower risk
            distance = min(30, egfr_value - 90)
            factor = max(0.5, 1.0 - (distance / 100))
        else:
            # Below 90, increased risk
            distance = min(30, 90 - egfr_value)
            factor = min(2.0, 1.0 + (distance / 50))
    
    # For G2, look at both directions
    elif current_stage == "2":
        if egfr_value >= 60:
            # Approaching G1 from below (good)
            distance = min(30, egfr_value - 60)
            # More reduction as eGFR increases toward 90
            factor = max(0.5, 1.0 - (distance / 80))
        else:
            # Dropping toward G3a (bad)
            distance = min(60, 60 - egfr_value)
            # Scale up risk based on how far below 60
            factor = min(2.0, 1.0 + (distance / 40))
    
    # For G3a, focus on deterioration
    elif current_stage == "3.1":
        if egfr_value >= 45:
            # Improving toward G2
            distance = min(45, egfr_value - 45)
            factor = max(0.6, 1.0 - (distance / 60))
        else:
            # Declining toward G3b
            distance = min(45, 45 - egfr_value)
            factor = min(2.0, 1.0 + (distance / 30))
    
    # For G3b, focus on deterioration
    elif current_stage == "3.2":
        if egfr_value >= 30:
            # Improving toward G3a
            distance = min(30, egfr_value - 30)
            factor = max(0.7, 1.0 - (distance / 50))
        else:
            # Declining toward G4
            distance = min(30, 30 - egfr_value)
            factor = min(2.0, 1.0 + (distance / 25))
    
    # For G4
    elif current_stage == "4":
        if egfr_value >= 15:
            # Improving toward G3b
            distance = min(15, egfr_value - 15)
            factor = max(0.8, 1.0 - (distance / 40))
        else:
            # Declining toward G5
            distance = min(15, 15 - egfr_value)
            factor = min(2.0, 1.0 + (distance / 20))
    
    # For G5, only improving matters
    elif current_stage == "5":
        if egfr_value > 15:
            # Improving from G5 (very rare but possible)
            distance = min(15, egfr_value - 15)
            factor = max(0.8, 1.0 - (distance / 30))
        else:
            # Very low eGFR, high risk
            factor = 2.0
    
    else:
        factor = 1.0
    
    return factor

def adjust_risk_by_egfr(risk, egfr_value, current_stage):
    """
    Adjust the progression risk based on current eGFR value.
    """
    sensitivity_factor = calculate_egfr_sensitivity_factor(egfr_value, current_stage)
    
    # Apply non-linear scaling for more sensitivity
    adjusted_risk = risk * sensitivity_factor
    
    # Ensure risk stays within [0, 1]
    adjusted_risk = max(0.0, min(1.0, adjusted_risk))
    
    return adjusted_risk, sensitivity_factor

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

    # eGFR as numeric
    df["egfr"] = pd.to_numeric(df.get("egfr"), errors="coerce")
    if df["egfr"].isna().all():
        raise ValueError("Required feature column missing or invalid: egfr")
    df["egfr"] = df["egfr"].ffill().bfill()

    # 1) Time gap in days (use 1 day for first visit)
    df["time_gap"] = df["charttime"].diff().dt.days.astype(float)
    df["time_gap"] = df["time_gap"].fillna(1.0)
    df["time_gap"] = df["time_gap"].replace(0, 1.0)

    # 2) eGFR dynamics
    df["egfr_delta"] = df["egfr"].diff().fillna(0.0)
    df["egfr_velocity"] = df["egfr_delta"] / df["time_gap"].replace(0, 1.0)
    df["egfr_slope"] = df["egfr_delta"]

    # Forward fill kidney_length if exists
    if "kidney_length" in df.columns:
        df["kidney_length"] = pd.to_numeric(df["kidney_length"], errors="coerce")
        df["kidney_length"] = df["kidney_length"].ffill().bfill()
        if "kidney_length_delta" in assets.get("dynamic_cols", []):
            df["kidney_length_delta"] = df["kidney_length"].diff().fillna(0.0)

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

    # Dynamic features: prefer velocity-aware feature when model/scaler support it.
    base_dynamic_cols = list(assets.get("dynamic_cols", []))
    if not base_dynamic_cols:
        raise ValueError("Model assets missing dynamic_cols")

    dynamic_features = ["egfr", "time_gap"]
    if "egfr_velocity" in base_dynamic_cols:
        dynamic_features.append("egfr_velocity")
    dynamic_features.extend([c for c in base_dynamic_cols if c not in dynamic_features])

    # Keep exact length/order expected by trained scaler/model.
    if len(dynamic_features) != len(base_dynamic_cols):
        dynamic_features = base_dynamic_cols

    dynamic_vals = df[dynamic_features].values
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

def _extract_recent_egfr_delta(history):
    values = []
    for point in history:
        raw = point.get("egfr", point.get("gfr"))
        try:
            if raw is None:
                continue
            v = float(raw)
            if np.isfinite(v):
                values.append(v)
        except Exception:
            continue

    if len(values) < 2:
        return None

    return values[-1] - values[-2]

def _apply_egfr_trend_guardrail(next_probs, sixm_probs, current_idx, history):
    delta = _extract_recent_egfr_delta(history)
    if delta is None or delta <= 0:
        return next_probs, sixm_probs, {
            "applied": False,
            "reason": "no-positive-egfr-delta",
            "egfr_delta": delta,
            "damp_factor": 1.0,
        }

    if current_idx >= len(next_probs) - 1:
        return next_probs, sixm_probs, {
            "applied": False,
            "reason": "final-stage",
            "egfr_delta": delta,
            "damp_factor": 1.0,
        }

    if delta >= 10:
        damp_factor = 0.60
    elif delta >= 5:
        damp_factor = 0.75
    else:
        damp_factor = 0.90

    def damp_one(dist):
        adjusted = np.array(dist, dtype=float, copy=True)
        worse_slice = adjusted[current_idx + 1:]
        worse_before = float(np.sum(worse_slice))
        adjusted[current_idx + 1:] = worse_slice * damp_factor
        worse_after = float(np.sum(adjusted[current_idx + 1:]))
        reclaimed = max(0.0, worse_before - worse_after)
        adjusted[current_idx] += reclaimed

        total = float(np.sum(adjusted))
        if total > 0:
            adjusted = adjusted / total
        return adjusted

    next_adj = damp_one(next_probs)
    sixm_adj = damp_one(sixm_probs)

    return next_adj, sixm_adj, {
        "applied": True,
        "reason": "positive-egfr-delta",
        "egfr_delta": float(delta),
        "damp_factor": float(damp_factor),
    }

def _normalize_distribution(probs):
    arr = np.array(probs, dtype=float, copy=True)
    arr = np.nan_to_num(arr, nan=0.0, posinf=0.0, neginf=0.0)
    arr[arr < 0] = 0.0
    total = float(np.sum(arr))
    if total <= 0:
        if len(arr) == 0:
            return arr
        return np.ones_like(arr) / float(len(arr))
    return arr / total

def _apply_temperature_scaling(probs, temperature):
    temp = float(temperature)
    if not np.isfinite(temp) or temp <= 0:
        return _normalize_distribution(probs)

    arr = _normalize_distribution(probs)
    eps = 1e-12
    logits = np.log(np.clip(arr, eps, 1.0))
    scaled = logits / temp
    scaled -= np.max(scaled)
    exp_scaled = np.exp(scaled)
    return _normalize_distribution(exp_scaled)

def _maybe_calibrate_distribution(probs, assets, horizon_key):
    config = assets.get("temperature_scaling", {}) if isinstance(assets, dict) else {}
    temperature = None

    if isinstance(config, dict):
        temperature = config.get(horizon_key, config.get("default"))
    elif config is not None:
        temperature = config

    if temperature is None and isinstance(assets, dict):
        temperature = assets.get(f"temperature_{horizon_key}")

    if temperature is None:
        return _normalize_distribution(probs), {
            "applied": False,
            "method": "none",
        }

    calibrated = _apply_temperature_scaling(probs, temperature)
    return calibrated, {
        "applied": True,
        "method": "temperature",
        "temperature": float(temperature),
    }

def _compute_prediction_quality(stages, probs):
    arr = _normalize_distribution(probs)
    if len(arr) == 0:
        return {
            "top_stage": None,
            "top_probability": 0.0,
            "second_probability": 0.0,
            "margin": 0.0,
            "entropy": 0.0,
            "normalized_entropy": 1.0,
            "is_flat_distribution": True,
            "confidence": 0.0,
            "uncertainty": 1.0,
        }

    order = np.argsort(arr)[::-1]
    top_idx = int(order[0])
    top_prob = float(arr[top_idx])
    second_prob = float(arr[order[1]]) if len(arr) > 1 else 0.0
    margin = max(0.0, top_prob - second_prob)

    eps = 1e-12
    entropy = float(-np.sum(arr * np.log(np.clip(arr, eps, 1.0))))
    max_entropy = float(np.log(len(arr))) if len(arr) > 1 else 1.0
    normalized_entropy = entropy / max_entropy if max_entropy > 0 else 0.0
    normalized_entropy = min(max(normalized_entropy, 0.0), 1.0)

    is_flat = bool(normalized_entropy >= 0.90 or margin <= 0.10)

    return {
        "top_stage": str(stages[top_idx]) if len(stages) > top_idx else None,
        "top_probability": top_prob,
        "second_probability": second_prob,
        "margin": margin,
        "entropy": entropy,
        "normalized_entropy": normalized_entropy,
        "is_flat_distribution": is_flat,
        "confidence": top_prob,
        "uncertainty": normalized_entropy,
    }

def _risk_level_from_probability(value):
    if value < 0.20:
        return "low"
    if value < 0.50:
        return "moderate"
    return "high"

def _stage_metadata():
    return [
        {"key": "1", "label": "G1", "description": "Kidney damage with normal or high function", "egfr_range": ">=90"},
        {"key": "2", "label": "G2", "description": "Kidney damage with mild loss of function", "egfr_range": "60-89"},
        {"key": "3.1", "label": "G3a", "description": "Mild to moderate loss of function", "egfr_range": "45-59"},
        {"key": "3.2", "label": "G3b", "description": "Moderate to severe loss of function", "egfr_range": "30-44"},
        {"key": "4", "label": "G4", "description": "Severe loss of function", "egfr_range": "15-29"},
        {"key": "5", "label": "G5", "description": "Kidney failure", "egfr_range": "<15"},
    ]

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

    # Predict from trained LSTM heads
    next_pred, sixm_pred = model.predict([seq, static_vals], verbose=0)

    next_probs = _normalize_distribution(next_pred[0])
    sixm_probs = _normalize_distribution(sixm_pred[0])

    # Optional calibration if temperature settings are provided in assets.
    next_probs, next_calibration = _maybe_calibrate_distribution(next_probs, assets, "next_visit")
    sixm_probs, sixm_calibration = _maybe_calibrate_distribution(sixm_probs, assets, "six_month")

    # Current stage = latest visit stage (fallback to eGFR-based stage if not provided)
    stages = list(assets.get("stages", ["1", "2", "3.1", "3.2", "4", "5"]))
    current_stage_raw = history[-1].get("ckd_stage")
    egfr_value = history[-1].get("egfr", history[-1].get("gfr"))
    
    try:
        egfr_numeric = float(egfr_value)
    except Exception:
        egfr_numeric = None
    
    current_stage, current_idx = _resolve_stage_index(current_stage_raw, stages, egfr_numeric)

    # Guardrail: if recent eGFR trend improves, reduce worsening risk distribution
    next_probs, sixm_probs, trend_adjustment = _apply_egfr_trend_guardrail(
        next_probs,
        sixm_probs,
        current_idx,
        history,
    )

    next_probs = _normalize_distribution(next_probs)
    sixm_probs = _normalize_distribution(sixm_probs)

    # Calculate base risks
    risks = calculate_risks(next_probs, sixm_probs, current_idx)
    
    # Apply eGFR sensitivity adjustment to make risk responsive to current eGFR value
    if egfr_numeric is not None:
        base_progression_risk = risks["risk_progression_next_visit"]
        adjusted_risk, sensitivity_factor = adjust_risk_by_egfr(
            base_progression_risk, 
            egfr_numeric, 
            current_stage
        )
        
        # Update the risk values
        risks["risk_progression_next_visit"] = round(adjusted_risk, 4)
        risks["overall_progression_risk"] = round(adjusted_risk, 4)
        risks["egfr_sensitivity_factor"] = round(sensitivity_factor, 4)
        
        # Also adjust the 6-month risk proportionally
        adjusted_6m_risk = risks["risk_progression_6_month"] * sensitivity_factor
        risks["risk_progression_6_month"] = round(min(1.0, adjusted_6m_risk), 4)
        
        # Adjust severe progression risks
        adjusted_severe_next = risks["risk_severe_progression_next_visit"] * sensitivity_factor
        adjusted_severe_6m = risks["risk_severe_progression_6_month"] * sensitivity_factor
        risks["risk_severe_progression_next_visit"] = round(min(1.0, adjusted_severe_next), 4)
        risks["risk_severe_progression_6_month"] = round(min(1.0, adjusted_severe_6m), 4)
        
        # Apply sensitivity to probability distributions as well for more granular adjustment
        for i in range(len(next_probs)):
            if i > current_idx:  # Worsening stages
                next_probs[i] = next_probs[i] * sensitivity_factor
            elif i < current_idx:  # Improving stages
                next_probs[i] = next_probs[i] * (1 / max(0.5, sensitivity_factor))
        
        # Renormalize
        next_probs = _normalize_distribution(next_probs)
        sixm_probs = _normalize_distribution(sixm_probs)
        
        # Recalculate risks with adjusted distributions
        risks.update(calculate_risks(next_probs, sixm_probs, current_idx))
        risks["egfr_sensitivity_applied"] = True
    else:
        risks["egfr_sensitivity_applied"] = False
        risks["egfr_sensitivity_factor"] = 1.0

    quality = _compute_prediction_quality(stages, next_probs)
    
    overall_progression_risk = float(risks["risk_progression_next_visit"])

    return {
        "success": True,
        "mode": mode,
        "used_ultrasound": mode == "lab+us",
        "current_stage": current_stage,
        "egfr_value": egfr_numeric,
        "stage_reference": _stage_metadata(),
        "confidence": round(float(quality["confidence"]), 4),
        "uncertainty": round(float(quality["uncertainty"]), 4),
        "prediction_quality": {
            "top_stage": quality["top_stage"],
            "top_probability": round(float(quality["top_probability"]), 4),
            "second_probability": round(float(quality["second_probability"]), 4),
            "margin": round(float(quality["margin"]), 4),
            "normalized_entropy": round(float(quality["normalized_entropy"]), 4),
            "is_flat_distribution": bool(quality["is_flat_distribution"]),
        },
        "calibration": {
            "next_visit": next_calibration,
            "six_month": sixm_calibration,
        },
        "next_visit_stage_probabilities": {
            stage: round(float(prob), 4)
            for stage, prob in zip(stages, next_probs)
        },
        "six_month_stage_probabilities": {
            stage: round(float(prob), 4)
            for stage, prob in zip(stages, sixm_probs)
        },
        "trend_adjustment": trend_adjustment,
        "overall_progression_risk": round(overall_progression_risk, 4),
        "overall_risk_level": _risk_level_from_probability(overall_progression_risk),
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