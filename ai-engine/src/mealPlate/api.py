"""
Meal Plate API Module
FastAPI endpoints for meal plate analysis
"""

from fastapi import APIRouter, UploadFile, File, HTTPException, Form
from pydantic import BaseModel
from typing import List, Optional, Dict
import os
import uuid
from datetime import datetime

from .food_detector import FoodDetector
from .nutrient_calculator import NutrientCalculator
from .meal_analyzer import MealAnalyzer


# Initialize components
food_detector = FoodDetector()
nutrient_calculator = NutrientCalculator()
meal_analyzer = MealAnalyzer()

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
        # Create temp directory if not exists
        temp_dir = "temp_uploads"
        os.makedirs(temp_dir, exist_ok=True)
        
        # Save uploaded image
        file_extension = os.path.splitext(image.filename)[1]
        temp_filename = f"{uuid.uuid4()}{file_extension}"
        temp_path = os.path.join(temp_dir, temp_filename)
        
        with open(temp_path, "wb") as f:
            content = await image.read()
            f.write(content)
        
        # Detect foods
        detected_foods = food_detector.detect_foods(temp_path, confidence_threshold)
        
        # Clean up temp file
        try:
            os.remove(temp_path)
        except:
            pass
        
        return {
            "success": True,
            "detected_foods": detected_foods,
            "count": len(detected_foods)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/search-foods")
async def search_foods(query: str):
    """
    Search for foods by name
    """
    try:
        results = food_detector.search_foods(query)
        return {
            "success": True,
            "results": results,
            "count": len(results)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/calculate-nutrients")
async def calculate_nutrients(food_item: FoodItem):
    """
    Calculate nutrients for a single food item
    """
    try:
        nutrients = nutrient_calculator.calculate_nutrients(
            food_item.food_id,
            food_item.portion_size,
            food_item.portion_unit
        )
        
        if "error" in nutrients:
            raise HTTPException(status_code=404, detail=nutrients["error"])
        
        return {
            "success": True,
            "nutrients": nutrients
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/analyze-meal")
async def analyze_meal(request: MealAnalysisRequest):
    """
    Analyze entire meal for safety based on CKD stage
    """
    try:
        # Calculate nutrients for each food
        foods_with_nutrients = []
        for food in request.foods:
            nutrients = nutrient_calculator.calculate_nutrients(
                food.food_id,
                food.portion_size,
                food.portion_unit
            )
            foods_with_nutrients.append(nutrients)
        
        # Calculate meal total
        meal_total = nutrient_calculator.calculate_meal_total(foods_with_nutrients)
        
        # Analyze meal safety
        analysis = meal_analyzer.analyze_meal(
            meal_total,
            request.ckd_stage,
            request.meals_per_day
        )
        
        return {
            "success": True,
            "foods": foods_with_nutrients,
            "meal_total": meal_total,
            "analysis": analysis,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/check-wallet")
async def check_nutrient_wallet(
    current_consumed: Dict[str, float],
    ckd_stage: str
):
    """
    Check nutrient wallet status
    """
    try:
        if ckd_stage not in meal_analyzer.ckd_limits:
            raise HTTPException(status_code=400, detail="Invalid CKD stage")
        
        daily_limits = meal_analyzer.ckd_limits[ckd_stage]["daily_limits"]
        wallet_status = meal_analyzer.check_nutrient_wallet(
            current_consumed,
            daily_limits
        )
        
        return {
            "success": True,
            "wallet_status": wallet_status,
            "timestamp": datetime.now().isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/ckd-limits/{stage}")
async def get_ckd_limits(stage: str):
    """
    Get nutrient limits for a CKD stage
    """
    try:
        if stage not in meal_analyzer.ckd_limits:
            raise HTTPException(status_code=404, detail="Invalid CKD stage")
        
        return {
            "success": True,
            "stage": stage,
            "limits": meal_analyzer.ckd_limits[stage]
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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
