import os
import cv2
import numpy as np
from ultralytics import YOLO
from PIL import Image
import io

# ---------------------------------------------------------
# CONFIGURATION
# ---------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "best_model_yolo11m.pt")

print(f"Loading YOLO model from: {MODEL_PATH}")
if not os.path.exists(MODEL_PATH):
    print(f"CRITICAL: File NOT FOUND at {MODEL_PATH}")
    print(f"Directory listing for {BASE_DIR}: {os.listdir(BASE_DIR)}")
else:
    print("File exists. Attempting load...")

# ---------------------------------------------------------
# LOAD MODEL
# ---------------------------------------------------------
try:
    model = YOLO(MODEL_PATH)
except Exception as e:
    print(f"CRITICAL ERROR: Could not load model at {MODEL_PATH}")
    print(f"Details: {e}")
    model = None

# ---------------------------------------------------------
# LOAD PORTION ESTIMATOR (if calibration exists)
# ---------------------------------------------------------
try:
    from .portion_estimator import PortionEstimator
    portion_estimator = PortionEstimator(BASE_DIR)
    if not portion_estimator.is_loaded:
        portion_estimator = None
        print("[predictor] Portion estimator: no calibration data found")
    else:
        print("[predictor] Portion estimator: LOADED")
except Exception as e:
    portion_estimator = None
    print(f"[predictor] Portion estimator not available: {e}")


# ---------------------------------------------------------
# PREDICTION FUNCTION (original - food names only)
# ---------------------------------------------------------
def predict_image_yolo(image_bytes):
    """Original function: returns list of food name strings."""
    if model is None:
        print("Error: Model is not loaded.")
        return []
        
    try:
        img = Image.open(io.BytesIO(image_bytes))
        results = model.predict(img, conf=0.25)
        
        detected_foods = set()
        for result in results:
            for box in result.boxes:
                class_id = int(box.cls[0])
                class_name = model.names[class_id]
                detected_foods.add(class_name)
                
        return list(detected_foods)

    except Exception as e:
        print(f"Error during prediction: {e}")
        return []


# ---------------------------------------------------------
# ENHANCED PREDICTION (with auto portion estimation)
# ---------------------------------------------------------
def predict_image_with_portions(image_bytes):
    """
    Enhanced prediction that returns food names + estimated portions.
    Returns list of dicts:
      {
        "food": str,
        "confidence": float,
        "bbox": [x1, y1, x2, y2],
        "estimated_grams": float,
        "compartment": str,
        "fill_ratio": float
      }
    """
    if model is None:
        print("Error: Model is not loaded.")
        return []
    
    try:
        # 1. Convert bytes to PIL and OpenCV images
        pil_img = Image.open(io.BytesIO(image_bytes))
        cv_img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
        
        # 2. Run YOLO detection
        results = model.predict(pil_img, conf=0.25)
        
        detected_items = []
        
        for result in results:
            for box in result.boxes:
                class_id = int(box.cls[0])
                food_name = model.names[class_id]
                confidence = float(box.conf[0])
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                
                item = {
                    "food": food_name,
                    "confidence": round(confidence, 3),
                    "bbox": [x1, y1, x2, y2],
                    "estimated_grams": 0,
                    "compartment": None,
                    "fill_ratio": 0,
                }
                
                # 3. Estimate portion if calibration is available
                if portion_estimator is not None:
                    try:
                        # Standardize image to calibration resolution
                        std_img = portion_estimator.standardize_image(cv_img)
                        h, w = std_img.shape[:2]
                        
                        # Scale bounding box to standardized resolution
                        orig_h, orig_w = cv_img.shape[:2]
                        sx = w / orig_w
                        sy = h / orig_h
                        sx1 = int(x1 * sx)
                        sy1 = int(y1 * sy)
                        sx2 = int(x2 * sx)
                        sy2 = int(y2 * sy)
                        
                        # Create food mask using GrabCut for precision
                        food_mask = portion_estimator._create_food_mask(
                            std_img, sx1, sy1, sx2, sy2
                        )
                        
                        # Estimate portion
                        estimate = portion_estimator.estimate_portion_grams(
                            food_name, food_mask
                        )
                        
                        item["estimated_grams"] = estimate.get("estimated_grams", 0)
                        item["compartment"] = estimate.get("compartment")
                        item["fill_ratio"] = estimate.get("fill_ratio", 0)
                        item["estimated_volume_ml"] = estimate.get("estimated_volume_ml", 0)
                        item["portion_confidence"] = estimate.get("confidence", 0)
                        
                    except Exception as pe:
                        print(f"Portion estimation error for {food_name}: {pe}")
                
                detected_items.append(item)
        
        return detected_items
    
    except Exception as e:
        print(f"Error during prediction: {e}")
        return []