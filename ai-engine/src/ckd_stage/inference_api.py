import os
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"

from typing import Any, Dict, Optional

from fastapi import FastAPI, HTTPException
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
    input_data: Any
    mode: Optional[str] = None


class UltrasoundRequest(BaseModel):
    image_path: str
    manual_ratio: Optional[float] = None


app = FastAPI(title="Nephro-AI Inference API", version="1.0.0")


@app.get("/health")
def health() -> Dict[str, Any]:
    return {"ok": True, "service": "nephro-ai-inference"}


@app.post("/predict-stage")
def predict_stage(req: StagePredictRequest) -> Dict[str, Any]:
    try:
        history = _extract_history(req.input_data)
        if not history:
            raise ValueError("No visit history found. Provide `history` or `lab_data`.")

        mode = req.mode or ("lab+us" if _has_ultrasound_data(req.input_data) else "lab")
        result = predict_progression(history, mode)
        if not result.get("success", False):
            raise ValueError(result.get("error", "Prediction failed"))
        return result
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/analyze-ultrasound")
def analyze_ultrasound(req: UltrasoundRequest) -> Dict[str, Any]:
    try:
        result = predict_kidney_length(req.image_path, req.manual_ratio)
        if not result.get("success", False):
            raise ValueError(result.get("error", "Ultrasound analysis failed"))
        return result
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
