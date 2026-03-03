"""
PORTION ESTIMATOR MODULE
=========================
Uses pre-calibrated compartment masks to automatically estimate
food portion sizes from a meal photo.

ALGORITHM:
  1. Load the pre-calibrated compartment masks (from auto_calibrate.py)
  2. For each YOLO-detected food, find which compartment it's in
  3. Count how many pixels the food fills within that compartment
  4. Convert fill-ratio → volume (ml) → weight (grams) using:
       weight = (food_pixels / compartment_pixels) × compartment_volume_ml × food_density
  
REQUIREMENTS:
  - plate_calibration.json  (from auto_calibrate.py)
  - compartment_masks.npz   (from auto_calibrate.py)
  - User photo taken with plate aligned to overlay
"""

import cv2
import numpy as np
import json
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# ──────────────────────────────────────────────────────────────
# FOOD DENSITY DATABASE (g/ml)
# ──────────────────────────────────────────────────────────────
# These are approximate densities for common Sri Lankan foods
# Source: USDA + local nutritional references
FOOD_DENSITY = {
    # Rice & Carbs
    "white rice":       1.10,   # cooked white rice is ~1.1 g/ml
    "red rice":         1.08,
    "fried rice":       1.05,
    "roti":             0.85,
    "string hoppers":   0.50,
    "pittu":            0.80,
    "hoppers":          0.45,
    
    # Curries & Protein
    "chicken":          0.95,
    "fish curry":       0.90,
    "dahl curry":       1.05,
    "Beans curry":      0.90,
    "egg":              1.03,
    "cutlet":           0.85,
    "tempered sprats":  0.80,
    
    # Vegetables & Sides
    "mallum":           0.55,
    "mallum - gotukola":      0.55,
    "mallum - mukunuwenna":   0.55,
    "mallum - murunga":       0.55,
    "mallum - kathurumurunga": 0.55,
    "mallum - asamodagam":    0.55,
    "beetroot":         0.85,
    "Pol sambol":       0.75,
    "Pol sambol - tempered":  0.75,
    "Pol sambol - lime added": 0.75,
    
    # Fruits
    "avacado":          0.60,
    "pineapple":        0.65,
    
    # Default fallback
    "_default":         0.85,
}


class PortionEstimator:
    """
    Estimates portion sizes using calibrated compartment masks.
    """
    
    def __init__(self, calibration_dir=None):
        if calibration_dir is None:
            calibration_dir = BASE_DIR
        
        self.cal_json_path = os.path.join(calibration_dir, "plate_calibration.json")
        self.masks_npz_path = os.path.join(calibration_dir, "compartment_masks.npz")
        
        self.calibration = None
        self.compartment_masks = {}
        self.is_loaded = False
        
        self._load_calibration()
    
    def _load_calibration(self):
        """Load calibration data and masks."""
        if not os.path.exists(self.cal_json_path):
            print(f"[PortionEstimator] WARNING: No calibration file found at {self.cal_json_path}")
            print("  Run auto_calibrate.py first!")
            return
        
        if not os.path.exists(self.masks_npz_path):
            print(f"[PortionEstimator] WARNING: No masks file found at {self.masks_npz_path}")
            return
        
        # Load JSON
        with open(self.cal_json_path, "r") as f:
            self.calibration = json.load(f)
        
        # Load masks
        data = np.load(self.masks_npz_path)
        for name in data.files:
            self.compartment_masks[name] = data[name]
        
        self.is_loaded = True
        print(f"[PortionEstimator] Loaded calibration: {list(self.compartment_masks.keys())}")
        
        # Print summary
        for name, info in self.calibration["compartments"].items():
            vol = self.calibration["volume_ml"].get(name, "?")
            print(f"  {name}: {info['pixel_area']} px, {info['percentage_of_plate']}%, volume={vol} ml")
    
    def standardize_image(self, image):
        """Resize image to match calibration standard resolution."""
        if self.calibration is None:
            return image
        
        target_w = self.calibration["standard_resolution"]["width"]
        target_h = self.calibration["standard_resolution"]["height"]
        
        if image.shape[1] != target_w or image.shape[0] != target_h:
            image = cv2.resize(image, (target_w, target_h), interpolation=cv2.INTER_AREA)
        
        return image
    
    def find_food_in_compartment(self, food_mask):
        """
        Given a binary mask of where a food was detected,
        determine which compartment it belongs to.
        Returns (compartment_name, overlap_pixels).
        """
        best_name = None
        best_overlap = 0
        
        for name, comp_mask in self.compartment_masks.items():
            # Ensure same size
            if comp_mask.shape != food_mask.shape:
                comp_mask = cv2.resize(comp_mask, (food_mask.shape[1], food_mask.shape[0]))
            
            overlap = cv2.bitwise_and(food_mask, comp_mask)
            overlap_pixels = cv2.countNonZero(overlap)
            
            if overlap_pixels > best_overlap:
                best_overlap = overlap_pixels
                best_name = name
        
        return best_name, best_overlap
    
    def estimate_fill_ratio(self, food_mask, compartment_name):
        """
        Calculate what fraction of the compartment is filled by this food.
        """
        comp_mask = self.compartment_masks.get(compartment_name)
        if comp_mask is None:
            return 0.0
        
        if comp_mask.shape != food_mask.shape:
            comp_mask = cv2.resize(comp_mask, (food_mask.shape[1], food_mask.shape[0]))
        
        # Pixels of food within this compartment
        food_in_comp = cv2.bitwise_and(food_mask, comp_mask)
        food_pixels = cv2.countNonZero(food_in_comp)
        comp_total = cv2.countNonZero(comp_mask)
        
        if comp_total == 0:
            return 0.0
        
        return food_pixels / comp_total
    
    def estimate_portion_grams(self, food_name, food_mask):
        """
        Main method: estimate portion weight in grams.
        
        Args:
            food_name: Name of detected food (from YOLO)
            food_mask: Binary mask (same resolution as calibration standard)
            
        Returns:
            dict with portion estimation details
        """
        if not self.is_loaded:
            return {
                "food": food_name,
                "estimated_grams": 0,
                "error": "Calibration not loaded"
            }
        
        # Find which compartment this food is in
        compartment_name, overlap = self.find_food_in_compartment(food_mask)
        
        if compartment_name is None or overlap < 50:
            return {
                "food": food_name,
                "estimated_grams": 0,
                "compartment": None,
                "error": "Food not found in any compartment"
            }
        
        # Calculate fill ratio
        fill_ratio = self.estimate_fill_ratio(food_mask, compartment_name)
        
        # Get compartment volume
        volume_ml = self.calibration["volume_ml"].get(compartment_name, 200)
        
        # Get food density
        density = FOOD_DENSITY.get(food_name, FOOD_DENSITY["_default"])
        
        # Estimate volume filled and weight
        estimated_volume_ml = fill_ratio * volume_ml
        estimated_grams = estimated_volume_ml * density
        
        return {
            "food": food_name,
            "compartment": compartment_name,
            "fill_ratio": round(fill_ratio, 3),
            "estimated_volume_ml": round(estimated_volume_ml, 1),
            "density_g_per_ml": density,
            "estimated_grams": round(estimated_grams, 1),
            "confidence": self._calculate_confidence(fill_ratio, overlap)
        }
    
    def _calculate_confidence(self, fill_ratio, overlap_pixels):
        """
        Heuristic confidence score (0-1) based on:
        - Fill ratio reasonableness (0.05 - 0.95 is normal)
        - Number of overlap pixels (more = more reliable)
        """
        # Fill ratio confidence
        if 0.1 <= fill_ratio <= 0.9:
            fill_conf = 1.0
        elif 0.05 <= fill_ratio < 0.1 or 0.9 < fill_ratio <= 0.95:
            fill_conf = 0.7
        else:
            fill_conf = 0.4
        
        # Overlap confidence
        if overlap_pixels > 5000:
            overlap_conf = 1.0
        elif overlap_pixels > 1000:
            overlap_conf = 0.8
        elif overlap_pixels > 200:
            overlap_conf = 0.6
        else:
            overlap_conf = 0.3
        
        return round((fill_conf * 0.6 + overlap_conf * 0.4), 2)
    
    def estimate_from_yolo_boxes(self, image, yolo_results):
        """
        Convenience method: takes raw YOLO results and estimates all portions.
        
        Args:
            image: BGR image (will be standardized)
            yolo_results: YOLO model results object
            
        Returns:
            List of portion estimates for each detected food
        """
        image = self.standardize_image(image)
        h, w = image.shape[:2]
        
        estimates = []
        
        for result in yolo_results:
            for box in result.boxes:
                class_id = int(box.cls[0])
                food_name = result.names[class_id]
                confidence = float(box.conf[0])
                
                # Get bounding box
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                
                # Create a food mask from the bounding box
                # For better accuracy, we can use color segmentation within the box
                food_mask = self._create_food_mask(image, x1, y1, x2, y2)
                
                estimate = self.estimate_portion_grams(food_name, food_mask)
                estimate["detection_confidence"] = round(confidence, 3)
                estimate["bbox"] = [x1, y1, x2, y2]
                estimates.append(estimate)
        
        return estimates
    
    def _create_food_mask(self, image, x1, y1, x2, y2):
        """
        Create a binary mask for the food region.
        Uses GrabCut within the bounding box for better precision than just the box.
        """
        h, w = image.shape[:2]
        mask = np.zeros((h, w), dtype=np.uint8)
        
        # Ensure coords are within bounds
        x1 = max(0, x1)
        y1 = max(0, y1)
        x2 = min(w, x2)
        y2 = min(h, y2)
        
        box_w = x2 - x1
        box_h = y2 - y1
        
        if box_w < 10 or box_h < 10:
            # Box too small, just fill it
            mask[y1:y2, x1:x2] = 255
            return mask
        
        try:
            # Use GrabCut for precise food segmentation within the box
            gc_mask = np.zeros((h, w), dtype=np.uint8)
            bgd_model = np.zeros((1, 65), dtype=np.float64)
            fgd_model = np.zeros((1, 65), dtype=np.float64)
            
            rect = (x1, y1, box_w, box_h)
            cv2.grabCut(image, gc_mask, rect, bgd_model, fgd_model, 3, cv2.GC_INIT_WITH_RECT)
            
            # Create mask where GrabCut says foreground
            mask = np.where(
                (gc_mask == cv2.GC_FGD) | (gc_mask == cv2.GC_PR_FGD),
                255, 0
            ).astype(np.uint8)
            
        except Exception:
            # Fallback: just use the bounding box
            mask[y1:y2, x1:x2] = 255
        
        return mask
    
    def estimate_from_boxes_simple(self, image_shape, detected_foods_with_boxes):
        """
        Simpler version: takes food names and bounding boxes directly.
        
        Args:
            image_shape: (height, width) of the standardized image
            detected_foods_with_boxes: list of dicts with 'food', 'bbox' [x1,y1,x2,y2]
            
        Returns:
            List of portion estimates
        """
        h, w = image_shape[:2]
        estimates = []
        
        for item in detected_foods_with_boxes:
            food_name = item["food"]
            x1, y1, x2, y2 = item["bbox"]
            
            # Simple rectangular mask
            food_mask = np.zeros((h, w), dtype=np.uint8)
            food_mask[y1:y2, x1:x2] = 255
            
            estimate = self.estimate_portion_grams(food_name, food_mask)
            estimate["bbox"] = [x1, y1, x2, y2]
            estimates.append(estimate)
        
        return estimates


# ──────────────────────────────────────────────────────────────
# STANDALONE TEST
# ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("=== Portion Estimator Test ===\n")
    
    estimator = PortionEstimator()
    
    if not estimator.is_loaded:
        print("Run auto_calibrate.py first to generate calibration data!")
    else:
        # Simulate a food detection: rice filling ~80% of main compartment
        cal = estimator.calibration
        w = cal["standard_resolution"]["width"]
        h = cal["standard_resolution"]["height"]
        
        # Create a test mask that covers ~80% of the main_carb compartment
        main_mask = estimator.compartment_masks.get("main_carb")
        if main_mask is not None:
            # Erode to simulate partial fill
            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
            partial_fill = cv2.erode(main_mask, kernel)
            
            result = estimator.estimate_portion_grams("white rice", partial_fill)
            print(f"Test result: {json.dumps(result, indent=2)}")
