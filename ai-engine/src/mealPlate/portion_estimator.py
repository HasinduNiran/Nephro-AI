"""
PORTION ESTIMATOR MODULE  -  Direct Proportion + Heaping Factor
====================================================================
The camera overlay locks the plate to a FIXED size and distance, so
compartment pixel areas are one-time constants measured from empty_plate.png
at its native 1524x1557 resolution via watershed segmentation.

ALGORITHM:
  1. YOLO detects food items -> bounding boxes
  2. MobileSAM -> precise binary food mask per detection
  3. Pixel-overlap -> assigns each food to its compartment
  4. fill_ratio = food_pixels / compartment_pixels   (0 ... 1)
  5. Heaping Factor Correction: Compensates for Z-axis overflow for solid foods.
  6. food_volume_ml = fill_ratio x compartment_volume_ml x heaping_multiplier
  7. food_grams     = food_volume_ml x food_density_g_per_ml
"""

import cv2
import numpy as np
import os
import io
from PIL import Image as PILImage, ImageOps
from ultralytics import SAM
from dotenv import load_dotenv

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Initialize MobileSAM globally so it only loads into RAM once.
print("[PortionEstimator] Loading MobileSAM Foundation Model...")
_SAM_PATH = os.path.join(BASE_DIR, "..", "mobile_sam.pt")
try:
    sam_model = SAM(_SAM_PATH)
    print("[PortionEstimator] MobileSAM loaded successfully")
except Exception as e:
    print(f"[PortionEstimator] WARNING: SAM load failed: {e} — portion estimation disabled")
    sam_model = None

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

# Depth correction: accounts for how shallowly a food sits relative to
# the full compartment depth. fill_ratio is 2-D; multiplying by depth_factor
# converts it to an accurate 3-D volume fraction.
# Calibrated from real plate measurements (March 2026).
FOOD_DEPTH_FACTOR = {
    "dahl curry":              0.28,
    "Beans curry":             0.30,
    "fish curry":              0.45,
    "tempered sprats":         0.16,
    "Pol sambol":              0.28,
    "Pol sambol - tempered":   0.28,
    "Pol sambol - lime added": 0.28,
    "mallum":                  0.35,
    "mallum - gotukola":       0.35,
    "mallum - mukunuwenna":    0.35,
    "mallum - murunga":        0.35,
    "mallum - kathurumurunga": 0.35,
    "mallum - asamodagam":     0.35,
    "beetroot":                0.40,
    "chicken":                 0.65,
    "cutlet":                  0.60,
    "egg":                     0.70,
    "white rice":              0.80,
    "red rice":                0.80,
    "fried rice":              0.75,
    "roti":                    0.65,
    "string hoppers":          0.50,
    "pittu":                   0.55,
    "hoppers":                 0.50,
    "avacado":                 0.55,
    "pineapple":               0.50,
    "_default":                0.55,
}

# Hard safety caps (grams) per compartment to prevent extreme outliers.
MAX_GRAMS_PER_COMPARTMENT = {
    "main_carb": 300,
    "side_1":    160,
    "side_2":    110,
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
    for name in data.files:
        m = data[name]
        if m.shape[0] != STANDARD_H or m.shape[1] != STANDARD_W:
            m = cv2.resize(m, (STANDARD_W, STANDARD_H), interpolation=cv2.INTER_NEAREST)
        _masks[name] = m
    print(f"[PortionEstimator] Loaded masks: {list(_masks.keys())}")
    for name, m in _masks.items():
        px = int(np.count_nonzero(m))
        vol = COMPARTMENT_VOLUME_ML.get(name, "?")
        print(f"  {name}: {px:,} px, volume={vol} ml")


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
    Center-Crop + Resize - run on every image received from the mobile app.

    Guarantees zero geometric distortion:
      1. Fix EXIF rotation so portrait is always portrait.
      2. Smart center-crop to the 1524:1557 calibration aspect ratio -
         slices off background pixels the user never saw inside the overlay.
      3. Scale the cropped region to exactly 1524x1557 (pure scaling, no stretch).
    """
    pil_img = PILImage.open(io.BytesIO(image_bytes))
    pil_img = ImageOps.exif_transpose(pil_img)
    cv_img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)

    h, w = cv_img.shape[:2]
    target_aspect = STANDARD_W / STANDARD_H   # 1524 / 1557 ~= 0.9788
    current_aspect = w / h

    if current_aspect > target_aspect:
        # Image is too wide -> crop left and right edges
        new_w = int(h * target_aspect)
        offset = (w - new_w) // 2
        cropped = cv_img[:, offset:offset + new_w]
    else:
        # Image is too tall (standard phone portrait) -> crop top and bottom
        new_h = int(w / target_aspect)
        offset = (h - new_h) // 2
        cropped = cv_img[offset:offset + new_h, :]

    final_img = cv2.resize(cropped, (STANDARD_W, STANDARD_H),
                           interpolation=cv2.INTER_AREA)
    return final_img


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


def map_food_to_compartment(cx, cy):
    if cx < COMPARTMENT_X_SPLIT:
        return "main_carb"
    elif cy < COMPARTMENT_Y_SPLIT:
        return "side_2"
    else:
        return "side_1"


def _count_food_pixels(food_mask, compartment):
    if compartment in _masks:
        overlap = cv2.bitwise_and(food_mask, _masks[compartment])
        return int(cv2.countNonZero(overlap))
    return int(cv2.countNonZero(food_mask))


def estimate_portion(food_name, food_mask, cx, cy):
    """Direct-proportion estimation with Heaping Factor correction."""
    compartment = map_food_to_compartment(cx, cy)
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
    heaping_mult  = HEAPING_FACTOR.get(food_name, HEAPING_FACTOR["_default"])
    depth_factor  = FOOD_DEPTH_FACTOR.get(food_name, FOOD_DEPTH_FACTOR["_default"])

    fill_ratio     = food_pixels / comp_total_px
    food_volume_ml = fill_ratio * comp_volume * heaping_mult * depth_factor
    food_grams     = food_volume_ml * density

    cap = MAX_GRAMS_PER_COMPARTMENT.get(compartment, 300)
    if food_grams > cap:
        print(f"[Portion] CAP applied: {food_name} in {compartment}: {food_grams:.1f}g -> {cap}g")
        food_grams = float(cap)

    print(
        f"[Portion] {food_name:<26} | {compartment:<10} "
        f"| px={food_pixels:>7,} fill={fill_ratio:.3f} depth={depth_factor} "
        f"heap={heaping_mult} vol={food_volume_ml:.1f}ml -> {food_grams:.1f}g"
    )

    return {
        "food":               food_name,
        "compartment":        compartment,
        "food_pixels":        food_pixels,
        "compartment_pixels": comp_total_px,
        "fill_ratio":         round(fill_ratio, 4),
        "heaping_factor":     heaping_mult,
        "depth_factor":       depth_factor,
        "food_volume_ml":     round(food_volume_ml, 1),
        "density_g_per_ml":   density,
        "estimated_grams":    round(food_grams, 1),
        "confidence":         _confidence(fill_ratio, food_pixels),
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
# ALIGNMENT VERIFICATION  (run on every scan)
# ======================================================

def verify_plate_alignment(std_img, save_path=None):
    """
    Overlays the pre-calibrated compartment masks onto the standardised
    incoming image and saves the result as a JPEG.

    HOW TO USE:
      1. Place an empty plate on the table.
      2. Align it with the green overlay and hit Scan.
      3. Open debug_alignment_check.jpg from the backend folder.
      4. If the coloured zones land exactly inside the plate compartments
         the geometry is locked.  If they spill over, something is off.
    """
    if save_path is None:
        save_path = os.path.join(BASE_DIR, "debug_output", "debug_alignment_check.jpg")

    os.makedirs(os.path.dirname(os.path.abspath(save_path)), exist_ok=True)

    vis = std_img.copy()

    # Distinct BGR colours for each compartment
    comp_colors = {
        "main_carb": (0,   150, 255),  # orange
        "side_1":    (0,   220,   0),  # green
        "side_2":    (255,  80,   0),  # blue
    }

    for comp_name, mask in _masks.items():
        color = comp_colors.get(comp_name, (200, 200, 200))
        color_layer = np.zeros_like(vis)
        color_layer[mask > 0] = color
        cv2.addWeighted(vis, 1.0, color_layer, 0.4, 0, vis)

    # Draw calibration split lines so the compartment boundaries are explicit
    cv2.line(vis, (COMPARTMENT_X_SPLIT, 0),
             (COMPARTMENT_X_SPLIT, STANDARD_H), (255, 255, 255), 2)
    cv2.line(vis, (COMPARTMENT_X_SPLIT, COMPARTMENT_Y_SPLIT),
             (STANDARD_W, COMPARTMENT_Y_SPLIT), (255, 255, 255), 2)

    # Legend
    legend = [("main_carb", comp_colors["main_carb"]),
              ("side_1",    comp_colors["side_1"]),
              ("side_2",    comp_colors["side_2"])]
    for i, (label, color) in enumerate(legend):
        y = 30 + i * 28
        cv2.rectangle(vis, (10, y - 16), (26, y), color, -1)
        cv2.putText(vis, label, (32, y - 2),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)

    cv2.imwrite(save_path, vis)
    print(f"[PortionEstimator] Alignment check saved -> {save_path}")
    return save_path


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
        fill  = est.get("fill_ratio", 0)
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
    Optionally saves a colour debug visualization to debug_save_path.
    Always saves an alignment verification image alongside it.
    """
    std_img = standardize_image(cv_img)
    h, w = std_img.shape[:2]
    orig_h, orig_w = cv_img.shape[:2]
    sx, sy = w / orig_w, h / orig_h

    # --- ALIGNMENT VERIFICATION (proof that masks match the live feed) ---
    try:
        align_dir = os.path.dirname(os.path.abspath(debug_save_path)) if debug_save_path else \
                    os.path.join(BASE_DIR, "debug_output")
        verify_plate_alignment(std_img,
                               save_path=os.path.join(align_dir, "debug_alignment_check.jpg"))
    except Exception as _e:
        print(f"[PortionEstimator] Alignment check failed: {_e}")
    # ----------------------------------------------------------------------

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

        cx = (bx1 + bx2) // 2
        cy = (by1 + by2) // 2

        est = estimate_portion(food_name, food_mask, cx, cy)
        est["detection_confidence"] = det.get("confidence", 0)
        est["bbox"] = [ox1, oy1, ox2, oy2]
        results.append(est)
        debug_items.append((food_mask, est, (bx1, by1, bx2, by2)))

    if debug_save_path:
        try:
            os.makedirs(os.path.dirname(os.path.abspath(debug_save_path)), exist_ok=True)
            if debug_items:
                save_debug_visualization(std_img, debug_items, debug_save_path)
            else:
                # No food detected — overwrite the file with the plain standardised
                # image so the frontend never shows a stale result from a previous scan.
                cv2.imwrite(debug_save_path, std_img)
                print(f"[PortionEstimator] No detections — plain image saved -> {debug_save_path}")
        except Exception as e:
            print(f"[PortionEstimator] Debug visualization failed: {e}")

    return results