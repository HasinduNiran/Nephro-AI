from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
import uvicorn
import sys
import os

# Helper to ensure imports work regardless of where you run the command from
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from mealPlate.predictor import predict_image_yolo, predict_image_with_portions, DEBUG_VIS_PATH, ALIGNMENT_CHECK_PATH

app = FastAPI()

# ---------------------------------------------------------
# CORS SETTINGS (Crucial for Mobile/Node communication)
# ---------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

@app.get("/")
def read_root():
    return {"status": "AI Engine is Running", "module": "Meal Plate Analysis"}

@app.post("/predict_meal")
async def predict_meal(image: UploadFile = File(...)):
    """Original endpoint: returns food names only."""
    try:
        # Read the uploaded file
        image_bytes = await image.read()
        
        # Get predictions
        detected_foods = predict_image_yolo(image_bytes)
        
        print(f"Detected: {detected_foods}") # Log to console for debugging
        return {"foods": detected_foods}
        
    except Exception as e:
        print(f"Server Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/predict_meal_with_portions")
async def predict_meal_with_portions(image: UploadFile = File(...)):
    """
    Enhanced endpoint: returns food names + auto-estimated portion sizes.
    The image should be taken with the plate aligned to the overlay.
    
    Returns:
    {
      "foods": ["white rice", "dahl curry", ...],
      "portions": [
        {
          "food": "white rice",
          "estimated_grams": 367.6,
          "compartment": "main_carb",
          "fill_ratio": 0.955,
          "confidence": 0.84,
          ...
        },
        ...
      ]
    }
    """
    try:
        image_bytes = await image.read()
        
        # Get predictions with portion estimates
        detected_items = predict_image_with_portions(image_bytes)
        
        # Also extract just the food names for backward compatibility
        food_names = list(set(item["food"] for item in detected_items))
        
        print(f"Detected with portions: {[(i['food'], i['estimated_grams']) for i in detected_items]}")
        
        debug_url = "http://127.0.0.1:5001/debug_image" if os.path.exists(DEBUG_VIS_PATH) else None
        align_url = "http://127.0.0.1:5001/debug_alignment" if os.path.exists(ALIGNMENT_CHECK_PATH) else None
        return {
            "foods": food_names,
            "portions": detected_items,
            "debug_image_url": debug_url,
            "alignment_check_url": align_url
        }
        
    except Exception as e:
        print(f"Server Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/debug_image")
def get_debug_image():
    """Serve the latest SAM segmentation visualization."""
    if not os.path.exists(DEBUG_VIS_PATH):
        raise HTTPException(status_code=404, detail="No debug image yet. Scan a plate first.")
    return FileResponse(DEBUG_VIS_PATH, media_type="image/jpeg")


@app.get("/debug_alignment")
def get_debug_alignment():
    """Serve the calibration-mask overlay alignment check image."""
    if not os.path.exists(ALIGNMENT_CHECK_PATH):
        raise HTTPException(status_code=404, detail="No alignment check yet. Scan a plate first.")
    return FileResponse(ALIGNMENT_CHECK_PATH, media_type="image/jpeg")


if __name__ == "__main__":
    # Running on 0.0.0.0 allows external access (required for mobile apps)
    uvicorn.run(app, host="0.0.0.0", port=5001)