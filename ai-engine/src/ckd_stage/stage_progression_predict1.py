import sys
import json
import os
import h5py
import numpy as np
from datetime import datetime
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
os.environ.setdefault("TF_USE_LEGACY_KERAS", "1")
import tensorflow as tf
from tensorflow.keras.models import load_model

MODEL_PATH = os.path.join(
    os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")),
    "models",
    "ckd_timeaware_dual_output_model.h5",
)

TIME_STEPS = 3
BLEND_ALPHA = 0.65  # visit_n = alpha * current_visit_pred + (1-alpha) * previous_output

LAB_FEATURES = [
    "creatinine",
    "bun",
    "albumin",
    "egfr",
    "hemoglobin",
    "potassium",
    "sodium",
    "anchor_age",
    "urea",
]

US_FEATURES = [
    "area_px",
    "length_px",
]

STAGE_LABELS_6 = ["1", "2", "3.1", "3.2", "4", "5"]
STAGE_LABELS_5 = ["1", "2", "3", "4", "5"]


@tf.keras.utils.register_keras_serializable(package="Compat")
class NotEqual(tf.keras.layers.Layer):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._allow_non_tensor_positional_args = True

    def call(self, inputs, rhs=0.0):
        right = rhs
        if not tf.is_tensor(right):
            right = tf.constant(right, dtype=getattr(inputs, "dtype", None) or tf.float32)
        return tf.math.not_equal(inputs, right)


def _load_model_from_patched_h5(path, custom_objects):
    with h5py.File(path, "r") as model_file:
        model_config = model_file.attrs.get("model_config")

    if model_config is None:
        raise RuntimeError("Missing model_config in H5 file")

    if isinstance(model_config, bytes):
        model_config = model_config.decode("utf-8")

    config_dict = json.loads(model_config)
    layers = config_dict.get("config", {}).get("layers", [])

    patched = False
    for layer in layers:
        layer_config = layer.get("config", {}) or {}

        dtype_value = layer_config.get("dtype")
        if isinstance(dtype_value, dict):
            dtype_name = (
                (dtype_value.get("config") or {}).get("name")
                or dtype_value.get("name")
                or "float32"
            )
            layer_config["dtype"] = dtype_name
            layer["config"] = layer_config
            patched = True

        if layer.get("class_name") == "InputLayer":
            if "batch_shape" in layer_config and "batch_input_shape" not in layer_config:
                layer_config["batch_input_shape"] = layer_config.get("batch_shape")
                layer_config.pop("batch_shape", None)
                layer["config"] = layer_config
                patched = True

        if layer.get("class_name") != "NotEqual":
            continue
        inbound_nodes = layer.get("inbound_nodes", [])
        for node in inbound_nodes:
            args = node.get("args", [])
            kwargs = node.get("kwargs", {}) or {}
            if len(args) >= 2 and isinstance(args[1], (int, float)):
                kwargs["rhs"] = float(args[1])
                node["args"] = [args[0]]
                node["kwargs"] = kwargs
                patched = True

    config_json = json.dumps(config_dict)
    model = tf.keras.models.model_from_json(config_json, custom_objects=custom_objects)
    model.load_weights(path)

    if not patched:
        return model
    return model


@tf.keras.utils.register_keras_serializable(package="Compat")
class Any(tf.keras.layers.Layer):
    def __init__(self, axis=None, keepdims=False, **kwargs):
        super().__init__(**kwargs)
        self._allow_non_tensor_positional_args = True
        self.axis = axis
        self.keepdims = keepdims

    def call(self, inputs):
        tensor = tf.cast(inputs, tf.bool)
        return tf.reduce_any(tensor, axis=self.axis, keepdims=self.keepdims)

    def get_config(self):
        config = super().get_config()
        config.update({"axis": self.axis, "keepdims": self.keepdims})
        return config


def _load_timeaware_model(path):
    if not os.path.exists(path):
        raise FileNotFoundError(f"Model not found: {path}")

    try:
        tf.keras.layers.Layer._allow_non_tensor_positional_args = True
    except Exception:
        pass

    custom_objects = {
        "NotEqual": NotEqual,
        "Any": Any,
    }

    try:
        return load_model(path, compile=False, custom_objects=custom_objects)
    except Exception as exc:
        msg = str(exc)

        should_try_tf_keras = (
            "Unknown layer" in msg
            or "cannot mix tensors and non-tensors" in msg
            or "Only input tensors may be passed as positional arguments" in msg
            or "batch_shape" in msg
        )

        if should_try_tf_keras:
            if "cannot mix tensors and non-tensors" in msg or "batch_shape" in msg:
                try:
                    return _load_model_from_patched_h5(path, custom_objects)
                except Exception:
                    pass

            try:
                import tf_keras  # type: ignore

                return tf_keras.models.load_model(
                    path,
                    compile=False,
                    custom_objects=custom_objects,
                )
            except ModuleNotFoundError as mod_err:
                raise RuntimeError(
                    "Legacy H5 model requires tf-keras compatibility runtime. "
                    "Install with: pip install tf-keras==2.20.1"
                ) from mod_err
            except Exception:
                raise

        raise


def _safe_float(v, d=0.0):
    try:
        if v is None:
            return d
        return float(v)
    except Exception:
        return d


def _softmax(x):
    x = np.asarray(x, dtype=np.float32)
    x = x - np.max(x)
    ex = np.exp(x)
    s = np.sum(ex)
    return ex / s if s > 0 else np.ones_like(ex) / len(ex)


def _parse_date(date_str):
    # supports: YYYY-MM-DD, YYYY/MM/DD, ISO datetime
    if not date_str:
        return None
    for fmt in ("%Y-%m-%d", "%Y/%m/%d"):
        try:
            return datetime.strptime(date_str, fmt)
        except Exception:
            pass
    try:
        return datetime.fromisoformat(str(date_str))
    except Exception:
        return None


def _visit_sort_key(visit):
    parsed = _parse_date((visit or {}).get("date"))
    # Keep visits with real dates first (chronological), placeholders after.
    return (parsed is None, parsed or datetime.max)


def _get_model_stage_output(raw_pred):
    """
    Handles single-output or dual-output model.
    Selects the output tensor likely to be stage probabilities/logits (length 5 or 6).
    """
    if isinstance(raw_pred, (list, tuple)):
        candidates = []
        for arr in raw_pred:
            arr = np.array(arr)
            if arr.ndim >= 2:
                last_dim = arr.shape[-1]
                if last_dim in (5, 6):
                    candidates.append(arr)
        if candidates:
            return candidates[0][0]
        return np.array(raw_pred[0])[0]
    arr = np.array(raw_pred)
    return arr[0] if arr.ndim >= 2 else arr


def _to_stage_probs(stage_vector):
    stage_vector = np.asarray(stage_vector, dtype=np.float32).reshape(-1)
    probs = _softmax(stage_vector)

    if probs.shape[0] == 6:
        d = {
            "stage_1": float(probs[0]),
            "stage_2": float(probs[1]),
            "stage_3.1": float(probs[2]),
            "stage_3.2": float(probs[3]),
            "stage_4": float(probs[4]),
            "stage_5": float(probs[5]),
        }
        return d

    if probs.shape[0] == 5:
        # split stage_3 into 3.1 + 3.2 equally (or adapt with eGFR if you want)
        d = {
            "stage_1": float(probs[0]),
            "stage_2": float(probs[1]),
            "stage_3.1": float(probs[2] * 0.5),
            "stage_3.2": float(probs[2] * 0.5),
            "stage_4": float(probs[3]),
            "stage_5": float(probs[4]),
        }
        return d

    # fallback if model has unexpected dim
    padded = np.zeros(6, dtype=np.float32)
    n = min(6, probs.shape[0])
    padded[:n] = probs[:n]
    if padded.sum() == 0:
        padded[:] = 1 / 6
    else:
        padded = padded / padded.sum()
    return {
        "stage_1": float(padded[0]),
        "stage_2": float(padded[1]),
        "stage_3.1": float(padded[2]),
        "stage_3.2": float(padded[3]),
        "stage_4": float(padded[4]),
        "stage_5": float(padded[5]),
    }


def _stage_from_probs(stage_probs):
    order = ["1", "2", "3.1", "3.2", "4", "5"]
    arr = np.array([stage_probs[f"stage_{s}"] for s in order], dtype=np.float32)
    return order[int(np.argmax(arr))]


def _future_progression(stage_probs, current_stage):
    order = ["1", "2", "3.1", "3.2", "4", "5"]
    i = order.index(current_stage)
    next_stage = order[i + 1] if i + 1 < len(order) else None
    next_prob = stage_probs.get(f"stage_{next_stage}", 0.0) if next_stage else 0.0
    any_higher = sum(stage_probs.get(f"stage_{s}", 0.0) for s in order[i + 1:])
    return {
        "current_stage": current_stage,
        "next_stage": next_stage,
        "next_stage_probability": float(next_prob),
        "next_stage_probability_percentage": round(float(next_prob) * 100, 2),
        "any_higher_stage_probability": float(any_higher),
        "any_higher_stage_probability_percentage": round(float(any_higher) * 100, 2),
    }


def _build_visit_vector(visit, use_ultrasound, prev_output_probs, gap_days):
    lab = visit.get("lab", {}) or {}
    us = visit.get("ultrasound", {}) or {}

    age_val = _safe_float(lab.get("anchor_age", lab.get("age", 50.0)), 50.0)

    base = {
        "creatinine": _safe_float(lab.get("creatinine")),
        "bun": _safe_float(lab.get("bun")),
        "albumin": _safe_float(lab.get("albumin")),
        "egfr": _safe_float(lab.get("egfr", lab.get("gfr", 60.0)), 60.0),
        "hemoglobin": _safe_float(lab.get("hemoglobin")),
        "potassium": _safe_float(lab.get("potassium")),
        "sodium": _safe_float(lab.get("sodium")),
        "anchor_age": age_val,
        "urea": _safe_float(lab.get("urea")),
    }

    vec = [base[k] for k in LAB_FEATURES]

    if use_ultrasound:
        area_px = _safe_float(us.get("area_px"))
        length_px = _safe_float(us.get("length_px"))

        if area_px == 0.0 and "kidney_length" in us and "kidney_width" in us:
            area_px = _safe_float(us.get("kidney_length")) * _safe_float(us.get("kidney_width"))
        if length_px == 0.0 and "kidney_length" in us:
            length_px = _safe_float(us.get("kidney_length"))

        vec += [area_px, length_px]

    # Add temporal context + previous visit output (recursive dependency)
    vec += [float(gap_days)]
    vec += [
        float(prev_output_probs["stage_1"]),
        float(prev_output_probs["stage_2"]),
        float(prev_output_probs["stage_3.1"]),
        float(prev_output_probs["stage_3.2"]),
        float(prev_output_probs["stage_4"]),
        float(prev_output_probs["stage_5"]),
    ]

    return np.array(vec, dtype=np.float32)


def _pad_or_trim(vec, target_dim):
    if vec.shape[0] < target_dim:
        pad = np.zeros(target_dim - vec.shape[0], dtype=np.float32)
        return np.concatenate([vec, pad], axis=0)
    if vec.shape[0] > target_dim:
        return vec[:target_dim]
    return vec


def _blend_probs(prev_probs, current_probs, alpha=BLEND_ALPHA):
    keys = ["stage_1", "stage_2", "stage_3.1", "stage_3.2", "stage_4", "stage_5"]
    mixed = {k: alpha * current_probs[k] + (1 - alpha) * prev_probs[k] for k in keys}
    s = sum(mixed.values())
    if s <= 0:
        return {k: 1.0 / len(keys) for k in keys}
    return {k: float(v / s) for k, v in mixed.items()}


def predict_progression_over_visits(visits, use_ultrasound=False):
    """
    visits format:
    [
      {
        "date": "2026-01-10",
        "lab": {...},
        "ultrasound": {...}  # optional if use_ultrasound=False
      },
      ...
    ]
    """
    if not visits:
        return {"success": False, "error": "No visits provided", "results": []}

    model = _load_timeaware_model(MODEL_PATH)

    # sort visits by date
    visits_sorted = sorted(visits, key=_visit_sort_key)

    # infer model expected feature dim
    # expected input shape: (None, TIME_STEPS, feature_dim)
    input_shape = model.input_shape
    if isinstance(input_shape, list):
        input_shape = input_shape[0]
    expected_dim = int(input_shape[-1])

    history_vectors = []
    outputs = []

    prev_date = None
    prev_output_probs = {
        "stage_1": 1 / 6,
        "stage_2": 1 / 6,
        "stage_3.1": 1 / 6,
        "stage_3.2": 1 / 6,
        "stage_4": 1 / 6,
        "stage_5": 1 / 6,
    }

    for idx, visit in enumerate(visits_sorted):
        visit_date = _parse_date(visit.get("date"))
        gap_days = 0 if prev_date is None or visit_date is None else (visit_date - prev_date).days

        # visit1 -> visit1 only
        # visit2 -> visit1_output + visit2
        # visit3 -> visit2_output + visit3 ...
        raw_vec = _build_visit_vector(
            visit=visit,
            use_ultrasound=use_ultrasound,
            prev_output_probs=prev_output_probs,
            gap_days=gap_days,
        )
        vec = _pad_or_trim(raw_vec, expected_dim)

        history_vectors.append(vec)
        history_vectors = history_vectors[-TIME_STEPS:]

        while len(history_vectors) < TIME_STEPS:
            history_vectors.insert(0, history_vectors[0])

        seq = np.stack(history_vectors, axis=0)  # (TIME_STEPS, feature_dim)
        model_in = np.expand_dims(seq, axis=0)   # (1, TIME_STEPS, feature_dim)

        raw_pred = model.predict(model_in, verbose=0)
        stage_out = _get_model_stage_output(raw_pred)
        current_probs = _to_stage_probs(stage_out)

        if idx == 0:
            final_probs = current_probs
            based_on = "visit1 only"
        else:
            final_probs = _blend_probs(prev_output_probs, current_probs, BLEND_ALPHA)
            based_on = f"visit{idx} output + visit{idx+1}"  # idx is 0-based

        current_stage = _stage_from_probs(final_probs)
        future = _future_progression(final_probs, current_stage)

        outputs.append(
            {
                "visit": idx + 1,
                "date": visit.get("date", f"visit_{idx + 1}"),
                "date_gap_days_from_previous_visit": int(gap_days),
                "based_on": based_on,
                "used_ultrasound": bool(use_ultrasound),
                "stage_probabilities": {k: round(v, 4) for k, v in final_probs.items()},
                "future_progression": {
                    "current_stage": future["current_stage"],
                    "next_stage": future["next_stage"],
                    "next_stage_probability": round(future["next_stage_probability"], 4),
                    "next_stage_probability_percentage": future["next_stage_probability_percentage"],
                    "any_higher_stage_probability": round(future["any_higher_stage_probability"], 4),
                    "any_higher_stage_probability_percentage": future["any_higher_stage_probability_percentage"],
                },
            }
        )

        prev_output_probs = final_probs
        prev_date = visit_date or prev_date

    return {"success": True, "model": MODEL_PATH, "results": outputs}


def _normalize_lab_point(raw):
    raw = raw or {}
    return {
        "creatinine": raw.get("creatinine"),
        "bun": raw.get("bun"),
        "albumin": raw.get("albumin"),
        "egfr": raw.get("egfr", raw.get("eGFR", raw.get("gfr"))),
        "gfr": raw.get("gfr", raw.get("egfr", raw.get("eGFR"))),
        "hemoglobin": raw.get("hemoglobin"),
        "potassium": raw.get("potassium"),
        "sodium": raw.get("sodium"),
        "anchor_age": raw.get("anchor_age", raw.get("age")),
        "urea": raw.get("urea"),
    }


def _normalize_us_point(raw):
    raw = raw or {}
    return {
        "area_px": raw.get("area_px"),
        "length_px": raw.get("length_px"),
        "kidney_length": raw.get("kidney_length", raw.get("left_kidney_length")),
        "kidney_width": raw.get("kidney_width"),
    }


def _build_visits_from_input(lab_data, ultrasound_data=None):
    if isinstance(lab_data, list):
        lab_seq = lab_data
    else:
        lab_seq = [lab_data or {}]

    if ultrasound_data is None:
        us_seq = [None] * len(lab_seq)
    elif isinstance(ultrasound_data, list):
        us_seq = ultrasound_data[-len(lab_seq):]
        while len(us_seq) < len(lab_seq):
            us_seq.insert(0, None)
    else:
        us_seq = [None] * len(lab_seq)
        us_seq[-1] = ultrasound_data

    visits = []
    for idx, (lab_point, us_point) in enumerate(zip(lab_seq, us_seq), start=1):
        date_value = None
        if isinstance(lab_point, dict):
            date_value = lab_point.get("date") or lab_point.get("visit_date") or lab_point.get("createdAt")
        visits.append(
            {
                "date": date_value or f"visit_{idx}",
                "lab": _normalize_lab_point(lab_point),
                "ultrasound": _normalize_us_point(us_point) if us_point else {},
            }
        )
    return visits


def predict_stage_progression(lab_data, us_data=None):
    try:
        visits = _build_visits_from_input(lab_data, us_data)
        use_ultrasound = us_data is not None
        run = predict_progression_over_visits(visits, use_ultrasound=use_ultrasound)
        if not run.get("success"):
            return run

        latest = run["results"][-1] if run.get("results") else None
        if not latest:
            return {"success": False, "error": "No prediction output generated"}

        stage_probs = latest["stage_probabilities"]
        current_stage = latest["future_progression"]["current_stage"]
        confidence = stage_probs.get(f"stage_{current_stage}", 0.0)

        overall_progression_risk = (
            stage_probs.get("stage_4", 0.0) + stage_probs.get("stage_5", 0.0)
        )
        if overall_progression_risk > 0.7:
            overall_risk_level = "High"
        elif overall_progression_risk > 0.4:
            overall_risk_level = "Moderate"
        else:
            overall_risk_level = "Low"

        return {
            "success": True,
            "current_stage": current_stage,
            "confidence": round(float(confidence), 4),
            "stage_probabilities": stage_probs,
            "progression": {
                "next_stage": latest["future_progression"]["next_stage"],
                "probability": latest["future_progression"]["next_stage_probability"],
                "probability_percentage": latest["future_progression"]["next_stage_probability_percentage"],
                "risk_level": "Low"
                if latest["future_progression"]["next_stage_probability"] < 0.3
                else ("Moderate" if latest["future_progression"]["next_stage_probability"] < 0.6 else "High"),
                "any_higher_stage_probability": latest["future_progression"]["any_higher_stage_probability"],
                "timeframe": "within 6 months (estimated)",
            },
            "overall_progression_risk": round(float(overall_progression_risk), 4),
            "overall_risk_level": overall_risk_level,
            "used_ultrasound": use_ultrasound,
            "egfr_value": _safe_float(visits[-1]["lab"].get("egfr"), 60.0),
            "visit_progression": run["results"],
        }
    except Exception as exc:
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
        if not result.get("success"):
            sys.exit(1)
    except json.JSONDecodeError as exc:
        print(json.dumps({"success": False, "error": f"Invalid JSON input: {str(exc)}"}))
        sys.exit(1)
    except Exception as exc:
        print(json.dumps({"success": False, "error": f"Unexpected error: {str(exc)}"}))
        sys.exit(1)


if __name__ == "__main__":
    main()