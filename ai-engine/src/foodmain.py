from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import sys
import os

# Helper to ensure imports work regardless of where you run the command from
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from mealPlate.predictor import predict_image_yolo

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

if __name__ == "__main__":
    # Running on 0.0.0.0 allows external access (required for mobile apps)
    uvicorn.run(app, host="0.0.0.0", port=5001)