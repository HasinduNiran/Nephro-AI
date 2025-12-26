import os
from ultralytics import YOLO
from PIL import Image
import io

# ---------------------------------------------------------
# CONFIGURATION
# ---------------------------------------------------------
# We use 'r' before the string to handle Windows backslashes correctly
MODEL_PATH = r"E:\University\4th Year\research\Nephro-AI\ai-engine\src\mealPlate\best_model_yolo11m.pt"

print(f"Loading YOLO model from: {MODEL_PATH}")

# ---------------------------------------------------------
# LOAD MODEL
# ---------------------------------------------------------
try:
    # Load the model only once when this file is imported
    model = YOLO(MODEL_PATH)
except Exception as e:
    print(f"CRITICAL ERROR: Could not load model at {MODEL_PATH}")
    print(f"Details: {e}")
    model = None

# ---------------------------------------------------------
# PREDICTION FUNCTION
# ---------------------------------------------------------
def predict_image_yolo(image_bytes):
    if model is None:
        print("Error: Model is not loaded.")
        return []
        
    try:
        # 1. Convert bytes to PIL Image
        img = Image.open(io.BytesIO(image_bytes))
        
        # 2. Run inference
        # conf=0.25 means it will only detect foods with >25% confidence
        results = model.predict(img, conf=0.25)
        
        detected_foods = set()
        
        # 3. Extract class names from results
        for result in results:
            for box in result.boxes:
                class_id = int(box.cls[0])
                class_name = model.names[class_id]
                detected_foods.add(class_name)
                
        return list(detected_foods)

    except Exception as e:
        print(f"Error during prediction: {e}")
        return []