import os
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, APIRouter, HTTPException
from pydantic import BaseModel

try:
    from .stage_progression_predict import (
        _extract_history,
        _has_ultrasound_data,
        predict_progression,
    )
    from .ultrasound_scan import predict_kidney_length
except Exception:
    from stage_progression_predict import (
        _extract_history,
        _has_ultrasound_data,
        predict_progression,
    )
    from ultrasound_scan import predict_kidney_length


class StagePredictRequest(BaseModel):
    input_data: Any = None
    history: Optional[List[Dict[str, Any]]] = None
    lab_data: Optional[Any] = None
    ultrasound_data: Optional[Any] = None
    mode: Optional[str] = None


class UltrasoundRequest(BaseModel):
    image_path: Optional[str] = None
    image_base64: Optional[str] = None
    manual_ratio: Optional[float] = None


router = APIRouter()


def _model_to_dict(model: BaseModel) -> Dict[str, Any]:
    if hasattr(model, "model_dump"):
        return model.model_dump(exclude_none=True)
    return model.dict(exclude_none=True)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _to_float(value: Any) -> Optional[float]:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except Exception:
        return None


def _to_gender(value: Any) -> str:
    text = str(value or "M").strip().upper()
    if text in {"F", "FEMALE"}:
        return "F"
    return "M"


def _egfr_from_creatinine(creatinine: float, age: float, gender: str) -> float:
    # CKD-EPI 2021 formula
    kappa = 0.7 if gender == "F" else 0.9
    alpha = -0.241 if gender == "F" else -0.302
    female_coeff = 1.012 if gender == "F" else 1.0
    egfr = 142.0 * ((creatinine / kappa) ** alpha) * (0.9938 ** age) * female_coeff
    return round(float(egfr), 1)


def _stage_from_egfr(egfr_value: Any) -> str:
    value = _to_float(egfr_value)
    if value is None:
        return "2"
    if value >= 90:
        return "1"
    if value >= 60:
        return "2"
    if value >= 45:
        return "3.1"
    if value >= 30:
        return "3.2"
    if value >= 15:
        return "4"
    return "5"


def _stage_info(stage: str) -> Dict[str, Any]:
    mapping = {
        "1": {"label": "G1", "description": "Kidney damage with normal/high function", "egfr_range": ">=90"},
        "2": {"label": "G2", "description": "Kidney damage with mild function loss", "egfr_range": "60-89"},
        "3.1": {"label": "G3a", "description": "Mild to moderate loss of function", "egfr_range": "45-59"},
        "3.2": {"label": "G3b", "description": "Moderate to severe loss of function", "egfr_range": "30-44"},
        "4": {"label": "G4", "description": "Severe loss of function", "egfr_range": "15-29"},
        "5": {"label": "G5", "description": "Kidney failure", "egfr_range": "<15"},
    }
    return mapping.get(stage, mapping["2"])


def _build_input_payload(req: StagePredictRequest) -> Dict[str, Any]:
    payload = req.input_data
    if isinstance(payload, dict):
        return payload
    if isinstance(payload, list):
        return {"history": payload}

    req_map = _model_to_dict(req)
    assembled: Dict[str, Any] = {}
    if isinstance(req_map.get("history"), list):
        assembled["history"] = req_map["history"]
    if req_map.get("lab_data") is not None:
        assembled["lab_data"] = req_map["lab_data"]
    if req_map.get("ultrasound_data") is not None:
        assembled["ultrasound_data"] = req_map["ultrasound_data"]
    return assembled


def _normalize_history_point(point: Dict[str, Any]) -> Dict[str, Any]:
    charttime = (
        point.get("charttime")
        or point.get("date")
        or point.get("visitDate")
        or point.get("visit_date")
        or _now_iso()
    )

    creatinine = _to_float(point.get("creatinine", point.get("serum_creatinine")))
    egfr = _to_float(point.get("egfr", point.get("eGFR", point.get("gfr"))))
    age = _to_float(point.get("age", point.get("anchor_age")))
    gender = _to_gender(point.get("gender"))

    if egfr is None and creatinine is not None and age is not None:
        egfr = _egfr_from_creatinine(creatinine, age, gender)

    if egfr is None:
        raise ValueError("Each visit needs egfr/gfr (or creatinine + age + gender).")

    return {
        "charttime": charttime,
        "creatinine": creatinine,
        "bun": _to_float(point.get("bun", point.get("urea"))),
        "egfr": egfr,
        "gfr": egfr,
        "albumin": _to_float(point.get("albumin")),
        "hemoglobin": _to_float(point.get("hemoglobin", point.get("haemoglobin"))),
        "potassium": _to_float(point.get("potassium")),
        "sodium": _to_float(point.get("sodium")),
        "age": age,
        "anchor_age": age,
        "gender": gender,
        "ckd_stage": str(point.get("ckd_stage") or _stage_from_egfr(egfr)),
        "kidney_length": _to_float(point.get("kidney_length", point.get("left_kidney_length"))),
        "kidney_width": _to_float(point.get("kidney_width", point.get("right_kidney_length"))),
        "area_px": _to_float(point.get("area_px")),
        "length_px": _to_float(point.get("length_px")),
        "echogenicity_score": _to_float(point.get("echogenicity_score", point.get("echogenicity"))),
    }


def _normalize_history(input_data: Dict[str, Any]) -> List[Dict[str, Any]]:
    raw_history = _extract_history(input_data)

    if not raw_history and isinstance(input_data, dict):
        lab_data = input_data.get("lab_data")
        if isinstance(lab_data, dict):
            raw_history = [lab_data]
        elif isinstance(lab_data, list):
            raw_history = lab_data

    if not raw_history and isinstance(input_data, dict):
        raw_history = [input_data]

    if not raw_history:
        raise ValueError("No visit history found. Provide history or lab_data.")

    normalized: List[Dict[str, Any]] = []
    for idx, point in enumerate(raw_history, start=1):
        if not isinstance(point, dict):
            raise ValueError(f"Invalid history item at index {idx}: expected object.")
        try:
            normalized.append(_normalize_history_point(point))
        except Exception as exc:
            raise ValueError(f"History item {idx} invalid: {exc}") from exc

    return normalized


def _pick_mode(explicit_mode: Optional[str], input_data: Dict[str, Any], history: List[Dict[str, Any]]) -> str:
    if explicit_mode in {"lab", "lab+us"}:
        return explicit_mode

    if _has_ultrasound_data(input_data):
        return "lab+us"

    for visit in history:
        if any(
            visit.get(key) is not None
            for key in ("kidney_length", "kidney_width", "area_px", "length_px", "echogenicity_score")
        ):
            return "lab+us"
    return "lab"


@router.get("/health")
def health() -> Dict[str, Any]:
    return {"ok": True, "service": "nephro-ai-ckd-inference"}


@router.post("/lab/analyze")
def analyze_lab(req: Dict[str, Any]) -> Dict[str, Any]:
    try:
        payload = req.get("lab_data") if isinstance(req, dict) and isinstance(req.get("lab_data"), dict) else req

        creatinine = _to_float(payload.get("creatinine", payload.get("serum_creatinine")))
        egfr = _to_float(payload.get("egfr", payload.get("eGFR", payload.get("gfr"))))
        age = _to_float(payload.get("age", payload.get("anchor_age")))
        gender = _to_gender(payload.get("gender"))

        source = "reported"
        if egfr is None and creatinine is not None and age is not None:
            egfr = _egfr_from_creatinine(creatinine, age, gender)
            source = "calculated"

        if egfr is None:
            raise ValueError("lab endpoint needs egfr/gfr or (creatinine + age + gender)")

        stage = _stage_from_egfr(egfr)
        info = _stage_info(stage)

        return {
            "success": True,
            "egfr": egfr,
            "creatinine": creatinine,
            "gender": gender,
            "age": age,
            "egfr_source": source,
            "current_stage": stage,
            "ckd_stage": stage,
            "stage_label": info["label"],
            "stage_description": info["description"],
            "stage_egfr_range": info["egfr_range"],
        }
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/predict-stage")
def predict_stage(req: StagePredictRequest) -> Dict[str, Any]:
    try:
        input_data = _build_input_payload(req)
        history = _normalize_history(input_data)

        mode = _pick_mode(req.mode, input_data, history)
        result = predict_progression(history, mode)
        if (not result.get("success", False)) and mode == "lab+us":
            # Graceful fallback when fusion model is unavailable.
            result = predict_progression(history, "lab")

        if not result.get("success", False):
            raise ValueError(result.get("error", "Prediction failed"))

        return result
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/analyze-ultrasound")
def analyze_ultrasound(req: UltrasoundRequest) -> Dict[str, Any]:
    try:
        if req.image_base64:
            image_source = req.image_base64
        elif req.image_path:
            image_source = req.image_path
        else:
            raise ValueError("Provide either image_base64 or image_path")
        result = predict_kidney_length(image_source, req.manual_ratio)
        if not result.get("success", False):
            raise ValueError(result.get("error", "Ultrasound analysis failed"))
        return result
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/stage-progression/predict")
def predict_stage_progression(req: StagePredictRequest) -> Dict[str, Any]:
    # Alias route for explicit naming while keeping old endpoint compatibility.
    return predict_stage(req)


@router.post("/us/analyze")
def analyze_us(req: UltrasoundRequest) -> Dict[str, Any]:
    # Alias route for explicit naming while keeping old endpoint compatibility.
    return analyze_ultrasound(req)


if __name__ == "__main__":
    import uvicorn
    _app = FastAPI(title="Nephro-AI CKD Inference API", version="1.1.0")
    _app.include_router(router)
    uvicorn.run(_app, host="0.0.0.0", port=8002)
