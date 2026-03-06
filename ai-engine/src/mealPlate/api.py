"""
Meal Plate API Module
FastAPI endpoints for meal plate analysis
"""

from fastapi import APIRouter, UploadFile, File, HTTPException, Form
from pydantic import BaseModel
from typing import List, Optional, Dict
from datetime import datetime

from .predictor import predict_image_with_portions

# Create router
router = APIRouter(prefix="/mealPlate", tags=["Meal Plate"])


# Pydantic models
class FoodItem(BaseModel):
    food_id: str
    food_name: str
    portion_size: float
    portion_unit: str


class MealAnalysisRequest(BaseModel):
    foods: List[FoodItem]
    ckd_stage: str
    meals_per_day: int = 3


class NutrientWalletUpdate(BaseModel):
    user_id: str
    meal_nutrients: Dict[str, float]
    ckd_stage: str


# Endpoints
@router.post("/detect-foods")
async def detect_foods(
    image: UploadFile = File(...),
    confidence_threshold: float = Form(0.5)
):
    """
    Detect foods in an uploaded meal plate image
    """
    try:
        image_bytes = await image.read()
        detected_foods = predict_image_with_portions(image_bytes)
        has_auto = any(f.get("estimated_grams", 0) > 0 for f in detected_foods)
        return {
            "success": True,
            "detected_foods": detected_foods,
            "count": len(detected_foods),
            "hasAutoPortions": has_auto
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/search-foods")
async def search_foods(query: str):
    return {"success": True, "results": [], "count": 0}


@router.post("/calculate-nutrients")
async def calculate_nutrients(food_item: FoodItem):
    raise HTTPException(status_code=501, detail="Not implemented")


@router.post("/analyze-meal")
async def analyze_meal(request: MealAnalysisRequest):
    raise HTTPException(status_code=501, detail="Not implemented")


@router.post("/check-wallet")
async def check_nutrient_wallet(
    current_consumed: Dict[str, float],
    ckd_stage: str
):
    raise HTTPException(status_code=501, detail="Not implemented")


@router.get("/ckd-limits/{stage}")
async def get_ckd_limits(stage: str):
    raise HTTPException(status_code=501, detail="Not implemented")


@router.get("/portion-units")
async def get_portion_units():
    """
    Get available portion units
    """
    return {
        "success": True,
        "units": [
            {"value": "cup", "label": "Cup"},
            {"value": "serving_spoon", "label": "Serving Spoon"},
            {"value": "tablespoon", "label": "Tablespoon"},
            {"value": "piece", "label": "Piece(s)"}
        ]
    }
