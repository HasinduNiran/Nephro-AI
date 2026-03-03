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
# LOAD PORTION ESTIMATOR (module-level functions)
# ---------------------------------------------------------
try:
    from .portion_estimator import (
        standardize_image,
        create_food_mask,
        estimate_portion,
        estimate_all_portions,
        _masks as portion_masks,
    )
    _portion_ready = bool(portion_masks)
    if _portion_ready:
        print("[predictor] Portion estimator: LOADED (direct proportion)")
    else:
        print("[predictor] Portion estimator: no masks found")
except Exception as e:
    _portion_ready = False
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
                
                detected_items.append(item)
        
        # 3. Estimate portions using direct proportion (if masks loaded)
        if _portion_ready and detected_items:
            try:
                yolo_boxes = [
                    {"food": d["food"], "bbox": d["bbox"], "confidence": d["confidence"]}
                    for d in detected_items
                ]
                estimates = estimate_all_portions(cv_img, yolo_boxes)
                
                # Merge estimation results back into detected_items
                for item, est in zip(detected_items, estimates):
                    item["estimated_grams"]    = est.get("estimated_grams", 0)
                    item["compartment"]        = est.get("compartment")
                    item["fill_ratio"]         = est.get("fill_ratio", 0)
                    item["estimated_volume_ml"] = est.get("food_volume_ml", 0)
                    item["food_pixels"]        = est.get("food_pixels", 0)
                    item["compartment_pixels"] = est.get("compartment_pixels", 0)
                    item["density_g_per_ml"]   = est.get("density_g_per_ml", 0)
                    item["portion_confidence"] = est.get("confidence", 0)
            except Exception as pe:
                print(f"Portion estimation error: {pe}")
        
        return detected_items
    
    except Exception as e:
        print(f"Error during prediction: {e}")
        return []