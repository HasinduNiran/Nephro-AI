"""
PORTION ESTIMATOR MODULE  -  Multi-Modal 3D Volume Estimation
====================================================================
The camera overlay locks the plate to a FIXED size and distance, so
compartment pixel areas are one-time constants measured from empty_plate.png
at its native 1524x1557 resolution via watershed segmentation.

ALGORITHM:
  1. YOLO detects food items -> bounding boxes
  2. MobileSAM -> precise binary food mask per detection
  3. Pixel-overlap (max-overlap) -> assigns each food to its compartment
  4. raw_fill_ratio = food_pixels / compartment_pixels   (0 ... 1)
  5. Frustum correction for tapered walls:
       corrected_ratio = raw_fill_ratio ^ TAPER_EXPONENT
       (TAPER_EXPONENT > 1 penalises low fill ratios because the sloped
        base is physically smaller than the top-rim area)
  6. MiDaS Monocular Depth Estimation -> depth map of the scene
       dynamic_height_factor = median(food_depth_values) / reference_rim_depth
       (replaces static heaping factor with real-time 3D height sensing;
        clamped to [DEPTH_HEIGHT_MIN, DEPTH_HEIGHT_MAX] for robustness)
  7. food_volume_ml = corrected_ratio x compartment_volume_ml x dynamic_height_factor
  8. food_grams     = food_volume_ml x food_density_g_per_ml
"""

import cv2
import numpy as np
import os
import io
import math
import torch
from PIL import Image as PILImage, ImageOps
from ultralytics import SAM

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Initialize MobileSAM globally so it only loads into RAM once.
print("[PortionEstimator] Loading MobileSAM Foundation Model...")
_SAM_PATH = os.path.join(BASE_DIR, "..", "mobile_sam.pt")
sam_model = SAM(_SAM_PATH)

print("[PortionEstimator] Loading MiDaS Depth Estimation Model...")
midas_model = torch.hub.load("intel-isl/MiDaS", "MiDaS_small", trust_repo=True)
midas_model.eval()
midas_transforms = torch.hub.load("intel-isl/MiDaS", "transforms", trust_repo=True)
transform_depth = midas_transforms.small_transform
print("[PortionEstimator] MiDaS loaded successfully.")

DEBUG_SHOW_MASKS = False

# ======================================================
# HARDCODED CONSTANTS  (from plate_calibration)
# ======================================================

STANDARD_W = 1524
STANDARD_H = 1557

COMPARTMENT_PIXELS = {
    "main_carb": 911005,
    "side_1":    406813,
    "side_2":    262181,
}

COMPARTMENT_CENTROIDS = {
    "main_carb": (449,  777),
    "side_1":    (1144, 1019),
    "side_2":    (1128, 353),
}

COMPARTMENT_VOLUME_ML = {
    "main_carb": 580,
    "side_1":    250,
    "side_2":    165,
}

COMPARTMENT_X_SPLIT = 761
COMPARTMENT_Y_SPLIT = 778

# Frustum correction exponent for tapered melamine plate walls.
# Raises raw_fill_ratio^p to compensate for the narrow base of sloped compartments.
# 1.25 is the empirical baseline for this plate.
# To calibrate for your exact plate (water test):
#   1. Pour a known fraction F of max volume (e.g. 145 ml = 25% of 580 ml main_carb).
#   2. Photograph, read raw_fill_ratio R from the API response.
#   3. Solve:  p = ln(F) / ln(R)
TAPER_EXPONENT = 1.25

# Ridge gap compensation: each compartment mask is dilated outward by this
# many pixels at load time so that food resting on the physical plastic
# divider ridge is never lost into the gap between adjacent masks.
# The NPZ stores raw (undilated) geometry so this value can be retuned
# without re-running calibration.
# At 1524x1557 resolution, 15 px ≈ 7–8 mm of physical plate surface.
MASK_DILATION_PX = 15

# MiDaS height factor bounds: clamp dynamic_height_factor to this range.
# Values below 0.3 indicate near-empty or liquid; above 1.5 indicate unreasonable heaping.
DEPTH_HEIGHT_MIN = 0.3
DEPTH_HEIGHT_MAX = 1.5

# ======================================================
# FOOD DENSITY & HEAPING DATABASE
# ======================================================

FOOD_DENSITY = {
    "white rice":     1.0,
    "red rice":       0.85,
    "fried rice":     0.75,
    "roti":           0.55,
    "string hoppers": 0.40,
    "pittu":          0.72,
    "hoppers":        0.38,
    "chicken":         1.5,
    "fish curry":      0.80,
    "dahl curry":      1.25,
    "Beans curry":     0.65,
    "egg":             0.95,
    "cutlet":          0.60,
    "tempered sprats": 0.50,
    "mallum":                   0.35,
    "mallum - gotukola":        0.35,
    "mallum - mukunuwenna":     0.35,
    "mallum - murunga":         0.35,
    "mallum - kathurumurunga":  0.35,
    "mallum - asamodagam":      0.35,
    "beetroot":                 0.70,
    "Pol sambol":               0.45,
    "Pol sambol - tempered":    0.45,
    "Pol sambol - lime added":  0.75,
    "avacado":   0.90,
    "pineapple": 0.85,
    "_default":  0.75,
}

HEAPING_FACTOR = {
    "chicken":    1.4,
    "fish curry": 1.2,
    "dahl curry": 1.0,
    "white rice": 1.1,
    "red rice":   1.1,
    "fried rice": 1.1,
    "_default":   1.0,
}

# ======================================================
# COMPARTMENT MASKS  (loaded once from .npz)
# ======================================================
_masks = {}


def _load_masks():
    global _masks
    npz_path = os.path.join(BASE_DIR, "compartment_masks.npz")
    if not os.path.exists(npz_path):
        print("[PortionEstimator] WARNING: compartment_masks.npz not found - "
              "run calibration first!")
        return
    data = np.load(npz_path)

    # Build dilation kernel once for ridge-gap compensation.
    # Expanding each mask outward ensures food pixels that rest on the
    # physical plastic divider ridge are counted rather than discarded.
    dilation_kernel = cv2.getStructuringElement(
        cv2.MORPH_ELLIPSE,
        (MASK_DILATION_PX * 2 + 1, MASK_DILATION_PX * 2 + 1)
    )

    for name in data.files:
        m = data[name]
        if m.shape[0] != STANDARD_H or m.shape[1] != STANDARD_W:
            m = cv2.resize(m, (STANDARD_W, STANDARD_H), interpolation=cv2.INTER_NEAREST)
        m = cv2.dilate(m, dilation_kernel)
        _masks[name] = m
    print(f"[PortionEstimator] Loaded masks (ridge-dilated +{MASK_DILATION_PX}px): "
          f"{list(_masks.keys())}")
    for name, m in _masks.items():
        px = int(np.count_nonzero(m))
        vol = COMPARTMENT_VOLUME_ML.get(name, "?")
        print(f"  {name}: {px:,} px (dilated), volume={vol} ml")


_load_masks()

# ======================================================
# CORE FUNCTIONS
# ======================================================


def standardize_image(cv_img):
    """Resize any image to the fixed overlay resolution."""
    h, w = cv_img.shape[:2]
    if w != STANDARD_W or h != STANDARD_H:
        cv_img = cv2.resize(cv_img, (STANDARD_W, STANDARD_H),
                            interpolation=cv2.INTER_AREA)
    return cv_img


def standardize_incoming_image(image_bytes):
    """
    EXIF Failsafe + Resize - run on every image received from the mobile app.
    Strips hidden EXIF rotation, converts to BGR, and forces to 1524x1557.
    """
    pil_img = PILImage.open(io.BytesIO(image_bytes))
    pil_img = ImageOps.exif_transpose(pil_img)
    cv_img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
    cv_img = cv2.resize(cv_img, (STANDARD_W, STANDARD_H),
                        interpolation=cv2.INTER_AREA)
    return cv_img


def generate_depth_map(cv_img):
    """
    Run MiDaS on a BGR image and return an inverse-depth map (float32 array)
    at the same resolution as the input (STANDARD_H x STANDARD_W).
    Higher values = closer to camera (i.e. taller / more food).
    """
    img_rgb = cv2.cvtColor(cv_img, cv2.COLOR_BGR2RGB)
    input_batch = transform_depth(img_rgb)
    with torch.no_grad():
        prediction = midas_model(input_batch)
        prediction = torch.nn.functional.interpolate(
            prediction.unsqueeze(1),
            size=(STANDARD_H, STANDARD_W),
            mode="bicubic",
            align_corners=False,
        ).squeeze()
    return prediction.cpu().numpy()


def _get_reference_rim_depth(depth_map):
    """
    Return the 95th-percentile depth value from the full scene as the
    reference 'plate rim level'. Food that rises above the rim will have
    depth values higher than this reference, yielding a ratio > 1.
    """
    return float(np.percentile(depth_map, 95))


def create_food_mask(cv_img, x1, y1, x2, y2):
    """
    Create a precise binary food mask using MobileSAM with YOLO bbox as prompt.
    Falls back to the raw bbox rect if SAM fails.
    """
    h, w = cv_img.shape[:2]
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w, x2), min(h, y2)
    bw, bh = x2 - x1, y2 - y1

    mask = np.zeros((h, w), dtype=np.uint8)

    if bw < 10 or bh < 10:
        mask[y1:y2, x1:x2] = 255
        return mask

    try:
        results = sam_model.predict(cv_img, bboxes=[[x1, y1, x2, y2]], verbose=False)
        if results and results[0].masks is not None:
            sam_mask = results[0].masks.data[0].cpu().numpy()
            if sam_mask.shape != (h, w):
                sam_mask = cv2.resize(sam_mask, (w, h), interpolation=cv2.INTER_NEAREST)
            mask[sam_mask > 0] = 255
        else:
            mask[y1:y2, x1:x2] = 255
    except Exception as e:
        print(f"[PortionEstimator] SAM error: {e}. Falling back to bbox.")
        mask[y1:y2, x1:x2] = 255

    return mask


def map_food_by_max_overlap(food_mask):
    """
    Assign food to the compartment whose dilated mask overlaps the most food
    pixels. Replaces the old centroid split which mis-assigned food items that
    crossed the divider line (e.g. a large piece of fish whose centre fell in
    main_carb even though most of its mass was in side_1).
    """
    best_compartment = "main_carb"  # safe fallback
    max_pixels = 0
    for comp_name, comp_mask in _masks.items():
        overlap = cv2.bitwise_and(food_mask, comp_mask)
        overlap_pixels = cv2.countNonZero(overlap)
        if overlap_pixels > max_pixels:
            max_pixels = overlap_pixels
            best_compartment = comp_name
    return best_compartment


def _count_food_pixels(food_mask, compartment):
    if compartment in _masks:
        overlap = cv2.bitwise_and(food_mask, _masks[compartment])
        return int(cv2.countNonZero(overlap))
    return int(cv2.countNonZero(food_mask))


def estimate_portion(food_name, food_mask, depth_map, reference_rim_depth):
    """Multi-modal 3D volume estimation: Frustum correction + MiDaS depth."""
    compartment = map_food_by_max_overlap(food_mask)
    food_pixels = _count_food_pixels(food_mask, compartment)

    if food_pixels < 50:
        return {
            "food":            food_name,
            "estimated_grams": 0,
            "compartment":     compartment,
            "error":           "Too few food pixels detected in compartment",
        }

    comp_total_px = COMPARTMENT_PIXELS[compartment]
    comp_volume   = COMPARTMENT_VOLUME_ML[compartment]
    density       = FOOD_DENSITY.get(food_name, FOOD_DENSITY["_default"])
    static_heap   = HEAPING_FACTOR.get(food_name, HEAPING_FACTOR["_default"])

    # Step 4: Raw 2D pixel fill ratio
    raw_fill_ratio = food_pixels / comp_total_px

    # Step 5: Frustum correction — power law compensates for tapered walls.
    # raw_fill_ratio measures the top-rim area; the actual volume is smaller
    # because the compartment base is narrower than the open top.
    corrected_ratio = math.pow(raw_fill_ratio, TAPER_EXPONENT)

    # Step 6: Dynamic 3D height via MiDaS depth map.
    # Median depth inside the food mask is compared to the scene reference
    # (95th-percentile = plate rim level) to derive a real-time height factor.
    # Falls back to the static heaping factor when depth data is unavailable.
    food_depth_pixels = depth_map[food_mask == 255]
    if len(food_depth_pixels) > 0 and reference_rim_depth > 0:
        dynamic_height_factor = float(np.median(food_depth_pixels)) / reference_rim_depth
        dynamic_height_factor = max(DEPTH_HEIGHT_MIN, min(dynamic_height_factor, DEPTH_HEIGHT_MAX))
    else:
        dynamic_height_factor = static_heap

    # Steps 7–8: Volume and mass
    food_volume_ml = corrected_ratio * comp_volume * dynamic_height_factor
    food_grams     = food_volume_ml * density

    return {
        "food":                  food_name,
        "compartment":           compartment,
        "food_pixels":           food_pixels,
        "compartment_pixels":    comp_total_px,
        "raw_fill_ratio":        round(raw_fill_ratio, 4),
        "corrected_ratio":       round(corrected_ratio, 4),
        "taper_exponent":        TAPER_EXPONENT,
        "dynamic_height_factor": round(dynamic_height_factor, 3),
        "static_heaping_factor": static_heap,
        "food_volume_ml":        round(food_volume_ml, 1),
        "density_g_per_ml":      density,
        "estimated_grams":       round(food_grams, 1),
        "confidence":            _confidence(raw_fill_ratio, food_pixels),
    }


def _confidence(fill_ratio, food_pixels):
    if 0.10 <= fill_ratio <= 0.95:
        fc = 1.0
    elif 0.05 <= fill_ratio < 0.10 or 0.95 < fill_ratio <= 1.0:
        fc = 0.7
    else:
        fc = 0.4
    if food_pixels > 5000:
        pc = 1.0
    elif food_pixels > 1000:
        pc = 0.8
    elif food_pixels > 200:
        pc = 0.6
    else:
        pc = 0.3
    return round(fc * 0.6 + pc * 0.4, 2)


# ======================================================
# HIGH-LEVEL API  (called by predictor.py)
# ======================================================

_MASK_COLORS = [
    (0,   220, 0),
    (0,   140, 255),
    (255, 60,  60),
    (0,   255, 255),
    (255, 0,   200),
    (60,  180, 255),
    (180, 0,   180),
]


def save_debug_visualization(std_img, debug_items, save_path):
    """Save a colour overlay image showing SAM masks, bboxes and labels."""
    vis = std_img.copy()
    overlay = std_img.copy()
    for idx, (food_mask, est, _bbox) in enumerate(debug_items):
        color = _MASK_COLORS[idx % len(_MASK_COLORS)]
        overlay[food_mask == 255] = color
    cv2.addWeighted(overlay, 0.45, vis, 0.55, 0, vis)

    cv2.line(vis, (COMPARTMENT_X_SPLIT, 0),
             (COMPARTMENT_X_SPLIT, STANDARD_H), (255, 255, 255), 3)
    cv2.line(vis, (COMPARTMENT_X_SPLIT, COMPARTMENT_Y_SPLIT),
             (STANDARD_W, COMPARTMENT_Y_SPLIT), (255, 255, 255), 3)

    for idx, (food_mask, est, (bx1, by1, bx2, by2)) in enumerate(debug_items):
        color = _MASK_COLORS[idx % len(_MASK_COLORS)]
        cv2.rectangle(vis, (bx1, by1), (bx2, by2), color, 3)
        food  = est.get("food", "?")
        grams = est.get("estimated_grams", 0)
        comp  = est.get("compartment", "")
        fill  = est.get("raw_fill_ratio", 0)
        line1 = f"{food}  {grams}g"
        line2 = f"[{comp}] fill={fill:.2f}"
        ty = max(by1 - 8, 30)
        (tw1, th1), _ = cv2.getTextSize(line1, cv2.FONT_HERSHEY_SIMPLEX, 0.65, 2)
        (tw2, th2), _ = cv2.getTextSize(line2, cv2.FONT_HERSHEY_SIMPLEX, 0.50, 1)
        cv2.rectangle(vis,
                      (bx1, ty - th1 - 4),
                      (bx1 + max(tw1, tw2) + 4, ty + th2 + 6),
                      (0, 0, 0), -1)
        cv2.putText(vis, line1, (bx1 + 2, ty),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.65, color, 2)
        cv2.putText(vis, line2, (bx1 + 2, ty + th2 + 4),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.50, (220, 220, 220), 1)

    os.makedirs(os.path.dirname(os.path.abspath(save_path)), exist_ok=True)
    cv2.imwrite(save_path, vis)
    print(f"[PortionEstimator] Debug visualization saved -> {save_path}")


def estimate_all_portions(cv_img, yolo_boxes, debug_save_path=None):
    """
    Estimate portions for every YOLO detection in one call.
    Generates a single MiDaS depth map for the whole scene and passes it
    to each estimate_portion call to avoid redundant model inference.
    Optionally saves a colour debug visualization to debug_save_path.
    """
    std_img = standardize_image(cv_img)
    h, w = std_img.shape[:2]
    orig_h, orig_w = cv_img.shape[:2]
    sx, sy = w / orig_w, h / orig_h

    # Run MiDaS once for the entire scene.
    depth_map = generate_depth_map(std_img)
    reference_rim_depth = _get_reference_rim_depth(depth_map)

    results = []
    debug_items = []

    for det in yolo_boxes:
        food_name = det["food"]
        ox1, oy1, ox2, oy2 = det["bbox"]

        bx1 = int(ox1 * sx)
        by1 = int(oy1 * sy)
        bx2 = int(ox2 * sx)
        by2 = int(oy2 * sy)

        food_mask = create_food_mask(std_img, bx1, by1, bx2, by2)

        est = estimate_portion(food_name, food_mask, depth_map, reference_rim_depth)
        est["detection_confidence"] = det.get("confidence", 0)
        est["bbox"] = [ox1, oy1, ox2, oy2]
        results.append(est)
        debug_items.append((food_mask, est, (bx1, by1, bx2, by2)))

    if debug_save_path and debug_items:
        try:
            save_debug_visualization(std_img, debug_items, debug_save_path)
        except Exception as e:
            print(f"[PortionEstimator] Debug visualization failed: {e}")

    return results