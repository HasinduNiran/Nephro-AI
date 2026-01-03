import sys
import os
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
import json
import numpy as np
import cv2
import tensorflow as tf
from tensorflow.keras.models import load_model
from tensorflow.keras.utils import custom_object_scope
from PIL import Image
import io
import base64
import tensorflow as tf


def load_model():
    # Use relative path from script location
    script_dir = os.path.dirname(os.path.abspath(__file__))
    model_path = os.path.join(script_dir, "..", "..", "models", "unet_full_model.h5")
    model_path = os.path.abspath(model_path)
    
    if not os.path.exists(model_path):
        safe_print("MODEL FILE NOT FOUND:", model_path)
        return None
    
    try:
        # Fix DTypePolicy error
        with custom_object_scope({'DTypePolicy': tf.keras.mixed_precision.Policy}):
            # Just load the model, don't use save_format
            model = tf.keras.models.load_model(model_path, compile=False)
        safe_print("MODEL LOADED SUCCESSFULLY from:", model_path)
        return model
    except Exception as e:
        safe_print("MODEL LOAD ERROR:")
        import traceback
        traceback.print_exc()
        return None

def preprocess_image(image_path_or_data, target_size=(256, 256)):
    try:
        if isinstance(image_path_or_data, str) and image_path_or_data.startswith('data:image'):
            image_data = image_path_or_data.split(',')[1]
            image_bytes = base64.b64decode(image_data)
            image = Image.open(io.BytesIO(image_bytes)).convert('RGB')
            image = np.array(image)
        else:
            image = cv2.imread(image_path_or_data)
            if image is None:
                raise ValueError(f"Could not load image from {image_path_or_data}")
            image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

        # Resize to model input
        image = cv2.resize(image, target_size)

        # Normalize to [0,1]
        image = image.astype('float32') / 255.0

        # Add batch dimension
        image = np.expand_dims(image, axis=0)  # shape (1, 256, 256, 3)
        return image
    except Exception as e:
        raise Exception(f"Error preprocessing image: {str(e)}")


def measure_kidney_length(segmentation_mask):
    try:
        mask = (segmentation_mask > 0.5).astype(np.uint8) * 255
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            return {"error": "No kidney detected in image"}

        kidney_contour = max(contours, key=cv2.contourArea)
        if len(kidney_contour) >= 5:
            ellipse = cv2.fitEllipse(kidney_contour)
            major_axis = max(ellipse[1])
            minor_axis = min(ellipse[1])
            pixel_to_cm = 0.1
            return {
                "kidney_length_pixels": float(major_axis),
                "kidney_length_cm": round(major_axis * pixel_to_cm, 2),
                "minor_axis_pixels": float(minor_axis),
                "minor_axis_cm": round(minor_axis * pixel_to_cm, 2)
            }
        else:
            x, y, w, h = cv2.boundingRect(kidney_contour)
            major_axis = max(w, h)
            pixel_to_cm = 0.1
            return {
                "kidney_length_pixels": float(major_axis),
                "kidney_length_cm": round(major_axis * pixel_to_cm, 2)
            }
    except Exception as e:
        return {"error": f"Error measuring kidney length: {str(e)}"}


def get_segmentation(image_path_or_data):
    model = load_model()
    if not model:
        return None, None
    try:
        preprocessed_image = preprocess_image(image_path_or_data)
        segmentation_mask = model.predict(preprocessed_image, verbose=0)
        segmentation_mask = np.squeeze(segmentation_mask)
        return segmentation_mask, model
    except Exception as e:
        safe_print("MODEL PREDICTION ERROR:")
        import traceback
        traceback.print_exc()
        return None, None


def predict_kidney_length(image_path_or_data):
    segmentation_mask, model = get_segmentation(image_path_or_data)
    if segmentation_mask is None:
        return {"success": False, "error": "Failed to load model or segment image"}

    length_result = measure_kidney_length(segmentation_mask)
    if "error" in length_result:
        return {"success": False, "error": length_result["error"]}

    kidney_length_cm = length_result["kidney_length_cm"]
    if kidney_length_cm < 8:
        interpretation = "Small kidney - may indicate CKD or atrophy"
        status = "abnormal"
    elif kidney_length_cm <= 14:
        interpretation = "Normal kidney size"
        status = "normal"
    else:
        interpretation = "Enlarged kidney - may indicate acute condition"
        status = "abnormal"

    return {
        "success": True,
        "kidney_length_cm": kidney_length_cm,
        "kidney_length_pixels": length_result["kidney_length_pixels"],
        "kidney_width_cm": length_result.get("minor_axis_cm", 0),
        "kidney_width_pixels": length_result.get("minor_axis_pixels", 0),
        "interpretation": interpretation,
        "status": status
    }


def safe_print(*args, **kwargs):
    """Send debug messages to stderr, not stdout."""
    print(*args, file=sys.stderr, **kwargs)

if __name__ == "__main__":
    try:
        if len(sys.argv) < 2:
            raise ValueError("Please provide image path as argument")
        
        image_path = sys.argv[1]

        # Example: debug info
        safe_print("Loading model...")

        # Call your main function
        result = predict_kidney_length(image_path)

        # Only this print goes to stdout — Postman reads it
        print(json.dumps(result), flush=True)

    except Exception as e:
        # Errors also in JSON format
        print(json.dumps({
            "success": False,
            "error": str(e)
        }), flush=True)
