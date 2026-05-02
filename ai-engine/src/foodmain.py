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
    import traceback
    try:
        image_bytes = await image.read()
        detected_foods = predict_image_yolo(image_bytes)
        print(f"Detected: {detected_foods}")
        return {"foods": detected_foods, "error": None}
    except Exception as e:
        traceback.print_exc()
        print(f"[foodmain] /predict_meal Server Error: {e}")
        return {"foods": [], "error": str(e)}


@app.post("/predict_meal_with_portions")
async def predict_meal_with_portions(image: UploadFile = File(...)):
    """
    Enhanced endpoint: returns food names + auto-estimated portion sizes.
    The image should be taken with the plate aligned to the overlay.
    """
    import traceback
    try:
        image_bytes = await image.read()
        detected_items = predict_image_with_portions(image_bytes)
        food_names = list(set(item.get("food", "unknown") for item in detected_items))

        print(f"Detected with portions: {[(i.get('food'), i.get('estimated_grams', 0)) for i in detected_items]}")

        debug_url = "http://127.0.0.1:5001/debug_image" if os.path.exists(DEBUG_VIS_PATH) else None
        align_url = "http://127.0.0.1:5001/debug_alignment" if os.path.exists(ALIGNMENT_CHECK_PATH) else None
        return {
            "foods": food_names,
            "portions": detected_items,
            "debug_image_url": debug_url,
            "alignment_check_url": align_url,
            "error": None,
        }
    except Exception as e:
        traceback.print_exc()
        print(f"[foodmain] /predict_meal_with_portions Server Error: {e}")
        # Graceful degradation: return 200 with empty results so the mobile
        # app shows the user-friendly fallback flow instead of an axios 500.
        return {
            "foods": [],
            "portions": [],
            "debug_image_url": None,
            "alignment_check_url": None,
            "error": str(e),
        }

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