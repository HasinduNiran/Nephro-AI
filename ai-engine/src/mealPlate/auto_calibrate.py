"""
AUTO-CALIBRATION TOOL for 3-Compartment Plate
===============================================
This script automatically detects the 3 compartments of a standard plate
from the empty plate photo, measures their pixel areas, and saves them
as fixed calibration constants.

USAGE:
  python auto_calibrate.py

OUTPUT:
  - plate_calibration.json   (compartment pixel areas + masks metadata)
  - compartment_masks.npz    (numpy binary masks for each compartment)
  - plate_overlay_transparent.png  (transparent overlay for mobile camera)
  - debug_compartments.png   (visual debug image showing detected regions)

METHODOLOGY:
  1. Detect the plate boundary (largest circular contour)
  2. Create a clean plate-interior mask (erode to remove rim)
  3. Detect the divider ridges via morphological + brightness analysis
  4. Use watershed segmentation to split plate into 3 compartments
  5. Measure pixel area of each compartment
  6. Generate transparent overlay from plate outline + dividers
"""

import cv2
import numpy as np
import json
import os
import sys

# ──────────────────────────────────────────────────────────────
# CONFIGURATION
# ──────────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
EMPTY_PLATE_PATH = os.path.join(BASE_DIR, "empty_plate.png")

# Standard resolution — MUST match portion_estimator.py (1524×1557 calibration)
STANDARD_W = 1524
STANDARD_H = 1557

# Output files
CALIBRATION_JSON = os.path.join(BASE_DIR, "plate_calibration.json")
MASKS_NPZ = os.path.join(BASE_DIR, "compartment_masks.npz")
OVERLAY_PATH = os.path.join(BASE_DIR, "plate_overlay_transparent.png")
DEBUG_PATH = os.path.join(BASE_DIR, "debug_compartments.png")


def load_and_standardize(image_path):
    """
    Load image, fix hidden EXIF rotation, and resize to calibration dimensions.
    Uses PIL ImageOps.exif_transpose so a portrait photo taken on any Android/iOS
    device arrives physically upright regardless of EXIF orientation tag.
    """
    from PIL import Image as PILImage, ImageOps

    pil_img = PILImage.open(image_path)
    pil_img = ImageOps.exif_transpose(pil_img)   # strip EXIF rotation

    # Convert PIL RGB → OpenCV BGR
    img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)

    # Force to calibration resolution
    img = cv2.resize(img, (STANDARD_W, STANDARD_H), interpolation=cv2.INTER_AREA)
    return img


def detect_plate_boundary(gray):
    """
    Find the outer boundary of the plate.
    Returns a binary mask of the plate interior.
    """
    # Threshold to separate plate from background
    blurred = cv2.GaussianBlur(gray, (11, 11), 3)
    _, thresh = cv2.threshold(blurred, 40, 255, cv2.THRESH_BINARY)
    
    # Find the largest contour (the plate)
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        print("ERROR: No plate boundary found!")
        sys.exit(1)
    
    plate_contour = max(contours, key=cv2.contourArea)
    
    # Create filled mask
    plate_mask = np.zeros_like(gray)
    cv2.drawContours(plate_mask, [plate_contour], -1, 255, -1)
    
    # Fit ellipse for reference
    if len(plate_contour) > 5:
        ellipse = cv2.fitEllipse(plate_contour)
        center = (int(ellipse[0][0]), int(ellipse[0][1]))
        axes = (int(ellipse[1][0] / 2), int(ellipse[1][1] / 2))
    else:
        M = cv2.moments(plate_contour)
        center = (int(M["m10"] / M["m00"]), int(M["m01"] / M["m00"]))
        axes = (STANDARD_W // 2, STANDARD_H // 2)
    
    return plate_mask, plate_contour, center, axes


def detect_dividers_watershed(img, gray, plate_mask, center):
    """
    Use watershed-based approach to separate the 3 compartments.
    Works by finding divider ridges that divide the plate.
    """
    h, w = gray.shape
    
    # ── Step 1: Create plate interior (erode rim away) ──
    rim_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (30, 30))
    plate_interior = cv2.erode(plate_mask, rim_kernel)
    
    # ── Step 2: Detect ridges/dividers using multiple methods ──
    blurred = cv2.GaussianBlur(gray, (7, 7), 2)
    
    # Method A: Morphological gradient (highlights edges/ridges)
    grad_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    gradient = cv2.morphologyEx(blurred, cv2.MORPH_GRADIENT, grad_kernel)
    gradient_masked = cv2.bitwise_and(gradient, plate_interior)
    
    # Method B: Local contrast deviation
    # Dividers create local brightness dips/peaks compared to surrounding plate
    local_mean = cv2.blur(blurred, (51, 51))
    local_diff = cv2.absdiff(blurred.astype(np.int16), local_mean.astype(np.int16))
    local_diff = np.uint8(np.clip(local_diff, 0, 255))
    local_diff_masked = cv2.bitwise_and(local_diff, plate_interior)
    
    # Method C: Top-hat transform (finds bright ridges on flat background)
    tophat_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (25, 25))
    tophat = cv2.morphologyEx(blurred, cv2.MORPH_TOPHAT, tophat_kernel)
    blackhat = cv2.morphologyEx(blurred, cv2.MORPH_BLACKHAT, tophat_kernel)
    ridges = cv2.add(tophat, blackhat)
    ridges_masked = cv2.bitwise_and(ridges, plate_interior)
    
    # Combine all ridge detectors
    combined = np.zeros_like(gray, dtype=np.float32)
    combined += gradient_masked.astype(np.float32) * 0.4
    combined += local_diff_masked.astype(np.float32) * 0.3
    combined += ridges_masked.astype(np.float32) * 0.3
    combined = np.uint8(np.clip(combined, 0, 255))
    
    # Threshold to get divider regions
    _, divider_mask = cv2.threshold(combined, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    divider_mask = cv2.bitwise_and(divider_mask, plate_interior)
    
    # Clean up divider mask
    clean_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    divider_mask = cv2.morphologyEx(divider_mask, cv2.MORPH_CLOSE, clean_kernel)
    divider_mask = cv2.morphologyEx(divider_mask, cv2.MORPH_OPEN, clean_kernel)
    
    # ── Step 3: Watershed segmentation ──
    # Create "sure background" (plate interior)
    sure_bg = plate_interior.copy()
    
    # Create "sure foreground" (areas far from dividers)
    dist_transform = cv2.distanceTransform(
        cv2.bitwise_and(plate_interior, cv2.bitwise_not(divider_mask)),
        cv2.DIST_L2, 5
    )
    _, sure_fg = cv2.threshold(dist_transform, 0.3 * dist_transform.max(), 255, 0)
    sure_fg = np.uint8(sure_fg)
    
    # Unknown region (between sure_fg and sure_bg)
    unknown = cv2.subtract(sure_bg, sure_fg)
    
    # Label markers for watershed
    num_labels, markers = cv2.connectedComponents(sure_fg)
    markers = markers + 1  # Background is now 1, not 0
    markers[unknown == 255] = 0  # Unknown region is 0
    
    # Apply watershed
    img_3ch = img.copy()
    markers = cv2.watershed(img_3ch, markers)
    
    print(f"  Watershed found {num_labels} regions")
    
    return markers, num_labels, divider_mask, plate_interior


def extract_compartments(markers, plate_interior, num_labels, center):
    """
    Extract the 3 largest compartment masks from watershed results.
    Labels them by position relative to center.
    """
    # Count pixels per label (skip label 1=background, -1=boundary)
    label_areas = {}
    for label_id in range(2, num_labels + 1):  # Skip background label 1
        mask = (markers == label_id).astype(np.uint8) * 255
        # Only count pixels inside plate interior
        mask = cv2.bitwise_and(mask, plate_interior)
        area = cv2.countNonZero(mask)
        if area > 100:  # Skip tiny noise regions
            label_areas[label_id] = area
    
    # Sort by area descending and take top 3
    sorted_labels = sorted(label_areas.items(), key=lambda x: x[1], reverse=True)
    
    if len(sorted_labels) < 3:
        print(f"  WARNING: Only found {len(sorted_labels)} compartments, expected 3")
        print(f"  Label areas: {sorted_labels}")
    
    # Take the 3 largest
    top_labels = sorted_labels[:3]
    
    compartments = []
    cx, cy = center
    
    for label_id, area in top_labels:
        mask = (markers == label_id).astype(np.uint8) * 255
        mask = cv2.bitwise_and(mask, plate_interior)
        
        # Find centroid of this compartment
        M = cv2.moments(mask)
        if M["m00"] > 0:
            comp_cx = int(M["m10"] / M["m00"])
            comp_cy = int(M["m01"] / M["m00"])
        else:
            comp_cx, comp_cy = cx, cy
        
        # Position relative to plate center
        dx = comp_cx - cx
        dy = comp_cy - cy
        angle = np.degrees(np.arctan2(dy, dx))
        
        compartments.append({
            "label_id": int(label_id),
            "pixel_area": int(area),
            "centroid": (comp_cx, comp_cy),
            "angle_from_center": float(angle),
            "mask": mask
        })
    
    # Sort by angle for consistent labeling
    compartments.sort(key=lambda c: c["angle_from_center"])
    
    # Assign names based on typical 3-compartment plate layout
    # Usually: 1 large section (rice/carb) + 2 smaller sections (protein + vegetable)
    compartments.sort(key=lambda c: c["pixel_area"], reverse=True)
    
    names = []
    if len(compartments) >= 3:
        names = ["main_carb", "side_1", "side_2"]
    elif len(compartments) == 2:
        names = ["main_carb", "side_1"]
    elif len(compartments) == 1:
        names = ["main_carb"]
    
    for i, comp in enumerate(compartments):
        comp["name"] = names[i] if i < len(names) else f"section_{i}"
    
    return compartments


def generate_overlay(img, plate_contour, compartments, divider_mask, center):
    """
    Generate a transparent PNG overlay showing:
    - Plate outline (thin circle)
    - Compartment divider lines
    - Compartment labels
    """
    h, w = img.shape[:2]
    
    # Create RGBA image (fully transparent background)
    overlay = np.zeros((h, w, 4), dtype=np.uint8)
    
    # Draw plate outline in semi-transparent white
    cv2.drawContours(overlay, [plate_contour], -1, (255, 255, 255, 200), 3)
    
    # Draw divider lines in bright green
    divider_colored = np.zeros((h, w, 4), dtype=np.uint8)
    divider_colored[divider_mask > 0] = (0, 255, 0, 180)
    
    # Thin the divider mask for cleaner overlay lines
    thin_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    divider_thin = cv2.erode(divider_mask, thin_kernel)
    overlay[divider_thin > 0] = (0, 255, 0, 180)
    
    # Draw crosshair at center
    cx, cy = center
    cross_size = 15
    cv2.line(overlay, (cx - cross_size, cy), (cx + cross_size, cy), (255, 255, 0, 200), 2)
    cv2.line(overlay, (cx, cy - cross_size), (cx, cy + cross_size), (255, 255, 0, 200), 2)
    
    # Label each compartment
    for comp in compartments:
        label_x, label_y = comp["centroid"]
        label = comp["name"].upper()
        font = cv2.FONT_HERSHEY_SIMPLEX
        font_scale = 0.5
        thickness = 2
        (tw, th), _ = cv2.getTextSize(label, font, font_scale, thickness)
        cv2.putText(overlay, label, (label_x - tw // 2, label_y + th // 2),
                    font, font_scale, (255, 255, 255, 220), thickness)
    
    return overlay


def generate_debug_image(img, compartments, divider_mask, center):
    """Generate a colorful debug image showing all compartments."""
    debug = img.copy()
    
    colors = [
        (0, 150, 255),   # Orange - main carb
        (0, 255, 0),     # Green  - side 1
        (255, 100, 0),   # Blue   - side 2
        (0, 255, 255),   # Yellow
        (255, 0, 255),   # Magenta
    ]
    
    for i, comp in enumerate(compartments):
        color = colors[i % len(colors)]
        # Semi-transparent color fill
        color_mask = np.zeros_like(debug)
        color_mask[comp["mask"] > 0] = color
        debug = cv2.addWeighted(debug, 0.7, color_mask, 0.3, 0)
        
        # Draw centroid
        cx, cy = comp["centroid"]
        cv2.circle(debug, (cx, cy), 8, color, -1)
        
        # Label
        label = f"{comp['name']}: {comp['pixel_area']}px"
        cv2.putText(debug, label, (cx - 80, cy - 15),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
    
    # Draw divider lines
    debug[divider_mask > 0] = (0, 0, 255)
    
    # Draw center
    cv2.circle(debug, center, 6, (0, 255, 255), -1)
    
    return debug


def fallback_geometric_split(plate_mask, center, axes):
    """
    Fallback: If watershed can't find 3 regions, use geometric splitting.
    Splits the plate into 3 compartments using lines from center.
    
    Standard 3-compartment plate layout:
      - Top half = 1 large compartment (rice/carb)
      - Bottom-left = side compartment 1 (protein/curry)
      - Bottom-right = side compartment 2 (vegetable/salad)
    
    The divider is roughly: a horizontal line through center,
    and a vertical line from center downward.
    """
    h, w = plate_mask.shape
    cx, cy = center
    
    print("  Using geometric fallback (3-way split)...")
    
    # Create masks for each compartment
    # Compartment 1: Top half (large - for rice/carb)
    mask1 = np.zeros((h, w), dtype=np.uint8)
    mask1[:cy, :] = 255
    mask1 = cv2.bitwise_and(mask1, plate_mask)
    
    # Compartment 2: Bottom-left (for curry/protein)
    mask2 = np.zeros((h, w), dtype=np.uint8)
    mask2[cy:, :cx] = 255
    mask2 = cv2.bitwise_and(mask2, plate_mask)
    
    # Compartment 3: Bottom-right (for vegetable/salad)
    mask3 = np.zeros((h, w), dtype=np.uint8)
    mask3[cy:, cx:] = 255
    mask3 = cv2.bitwise_and(mask3, plate_mask)
    
    # Erode all masks slightly to create gaps (simulating dividers)
    erode_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (10, 10))
    mask1 = cv2.erode(mask1, erode_kernel)
    mask2 = cv2.erode(mask2, erode_kernel)
    mask3 = cv2.erode(mask3, erode_kernel)
    
    compartments = []
    masks = [(mask1, "main_carb"), (mask2, "side_1"), (mask3, "side_2")]
    
    for mask, name in masks:
        area = cv2.countNonZero(mask)
        M = cv2.moments(mask)
        if M["m00"] > 0:
            comp_cx = int(M["m10"] / M["m00"])
            comp_cy = int(M["m01"] / M["m00"])
        else:
            comp_cx, comp_cy = cx, cy
        
        compartments.append({
            "label_id": masks.index((mask, name)) + 2,
            "pixel_area": int(area),
            "centroid": (comp_cx, comp_cy),
            "angle_from_center": float(np.degrees(np.arctan2(comp_cy - cy, comp_cx - cx))),
            "name": name,
            "mask": mask
        })
    
    # Create a simple divider mask (the gap between compartments)
    all_compartments = cv2.bitwise_or(cv2.bitwise_or(mask1, mask2), mask3)
    divider_mask = cv2.bitwise_and(plate_mask, cv2.bitwise_not(all_compartments))
    
    return compartments, divider_mask


def interactive_seed_selection(img, plate_interior):
    """
    Let the user click one seed point inside each compartment.
    Uses flood-fill from those seeds to accurately segment compartments.
    This is the MOST ACCURATE method.
    """
    print("\n  ╔══════════════════════════════════════════╗")
    print("  ║   INTERACTIVE SEED SELECTION MODE        ║")
    print("  ║                                          ║")
    print("  ║  Click ONCE inside each compartment:     ║")
    print("  ║   1) Click in the LARGEST section (carb) ║")
    print("  ║   2) Click in side section 1 (protein)   ║")
    print("  ║   3) Click in side section 2 (vegetable) ║")
    print("  ║                                          ║")
    print("  ║  Press 'd' when done (after 3 clicks)    ║")
    print("  ║  Press 'r' to reset                      ║")
    print("  ║  Press 'q' to quit                       ║")
    print("  ╚══════════════════════════════════════════╝")
    
    seeds = []
    display = img.copy()
    names = ["MAIN_CARB", "SIDE_1", "SIDE_2"]
    colors = [(0, 150, 255), (0, 255, 0), (255, 100, 0)]
    
    def on_click(event, x, y, flags, param):
        if event == cv2.EVENT_LBUTTONDOWN:
            if len(seeds) < 3:
                if plate_interior[y, x] > 0:
                    seeds.append((x, y))
                    idx = len(seeds) - 1
                    cv2.circle(display, (x, y), 10, colors[idx], -1)
                    cv2.putText(display, names[idx], (x + 15, y + 5),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.7, colors[idx], 2)
                    cv2.imshow("Click each compartment", display)
                    print(f"    Seed {idx + 1}: {names[idx]} at ({x}, {y})")
                else:
                    print("    Click is outside the plate! Try again.")
    
    cv2.imshow("Click each compartment", display)
    cv2.setMouseCallback("Click each compartment", on_click)
    
    while True:
        key = cv2.waitKey(1) & 0xFF
        if key == ord('d') and len(seeds) == 3:
            break
        elif key == ord('r'):
            seeds = []
            display = img.copy()
            cv2.imshow("Click each compartment", display)
            print("    Reset. Click again.")
        elif key == ord('q'):
            cv2.destroyAllWindows()
            return None
    
    cv2.destroyAllWindows()
    
    # Now flood-fill from each seed to get precise compartment masks
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (7, 7), 2)
    
    compartments = []
    comp_names = ["main_carb", "side_1", "side_2"]
    
    for i, (sx, sy) in enumerate(seeds):
        # Create flood-fill mask
        h, w = gray.shape
        ff_mask = np.zeros((h + 2, w + 2), dtype=np.uint8)
        
        # Flood fill with tolerance
        # The tolerance (lo/hi diff) controls how far the fill spreads
        lo_diff = 15  # Allow 15 brightness levels below seed
        hi_diff = 15  # Allow 15 brightness levels above seed
        
        filled = blurred.copy()
        retval, filled, ff_mask, rect = cv2.floodFill(
            filled, ff_mask, (sx, sy), 128,
            loDiff=(lo_diff,), upDiff=(hi_diff,),
            flags=cv2.FLOODFILL_MASK_ONLY | (255 << 8)
        )
        
        # Extract mask (remove the 1-pixel border added by floodFill)
        comp_mask = ff_mask[1:-1, 1:-1]
        comp_mask = cv2.bitwise_and(comp_mask, plate_interior)
        
        area = cv2.countNonZero(comp_mask)
        M = cv2.moments(comp_mask)
        if M["m00"] > 0:
            comp_cx = int(M["m10"] / M["m00"])
            comp_cy = int(M["m01"] / M["m00"])
        else:
            comp_cx, comp_cy = sx, sy
        
        compartments.append({
            "label_id": i + 2,
            "pixel_area": int(area),
            "centroid": (comp_cx, comp_cy),
            "angle_from_center": 0.0,
            "name": comp_names[i],
            "mask": comp_mask,
            "seed": (sx, sy)
        })
        
        print(f"    {comp_names[i]}: {area} pixels ({area / cv2.countNonZero(plate_interior) * 100:.1f}% of plate)")
    
    # Create divider mask (gap between all compartments)
    all_masks = np.zeros_like(gray)
    for comp in compartments:
        all_masks = cv2.bitwise_or(all_masks, comp["mask"])
    divider_mask = cv2.bitwise_and(plate_interior, cv2.bitwise_not(all_masks))
    
    return compartments, divider_mask


def save_calibration(compartments, center, plate_area):
    """Save calibration data to JSON and NPZ files."""
    
    # ── JSON calibration data ──
    cal_data = {
        "standard_resolution": {
            "width": STANDARD_W,
            "height": STANDARD_H
        },
        "plate_center": {"x": center[0], "y": center[1]},
        "total_plate_pixels": int(plate_area),
        "compartments": {}
    }
    
    masks_dict = {}
    
    for comp in compartments:
        name = comp["name"]
        cal_data["compartments"][name] = {
            "pixel_area": comp["pixel_area"],
            "centroid": {"x": comp["centroid"][0], "y": comp["centroid"][1]},
            "percentage_of_plate": round(comp["pixel_area"] / plate_area * 100, 2),
        }
        if "seed" in comp:
            cal_data["compartments"][name]["seed_point"] = {
                "x": comp["seed"][0], "y": comp["seed"][1]
            }
        
        # Save mask as compressed numpy
        masks_dict[name] = comp["mask"]
    
    # Add volume estimation constants
    # A standard 3-compartment plate typically holds:
    #   Main compartment: ~350ml (rice/carb)
    #   Side 1: ~200ml (curry/protein)
    #   Side 2: ~200ml (vegetable/salad)
    # These should be measured with water for YOUR specific plate
    cal_data["volume_ml"] = {
        "main_carb": 350,
        "side_1": 200,
        "side_2": 200,
        "NOTE": "Measure your plate compartments with water and update these values!"
    }
    
    # Save JSON
    with open(CALIBRATION_JSON, "w") as f:
        json.dump(cal_data, f, indent=2)
    print(f"\n  Saved: {CALIBRATION_JSON}")
    
    # Save raw (undilated) masks.
    # Ridge-gap dilation is applied at load time in portion_estimator.py via
    # MASK_DILATION_PX so the expansion amount can be retuned without
    # re-running calibration. Do NOT pre-dilate here.
    np.savez_compressed(MASKS_NPZ, **masks_dict)
    print(f"  Saved: {MASKS_NPZ}")
    
    return cal_data


# ══════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════
def main():
    print("=" * 60)
    print("  3-COMPARTMENT PLATE AUTO-CALIBRATION")
    print("=" * 60)
    
    # ── Step 1: Load and standardize ──
    print(f"\n[1/6] Loading empty plate: {EMPTY_PLATE_PATH}")
    img = load_and_standardize(EMPTY_PLATE_PATH)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    print(f"  Standardized to {STANDARD_W}x{STANDARD_H}")
    
    # ── Step 2: Detect plate boundary ──
    print("\n[2/6] Detecting plate boundary...")
    plate_mask, plate_contour, center, axes = detect_plate_boundary(gray)
    plate_area = cv2.countNonZero(plate_mask)
    print(f"  Plate center: {center}")
    print(f"  Plate area: {plate_area} pixels")
    
    # ── Step 3: Try automatic watershed segmentation ──
    print("\n[3/6] Attempting automatic compartment detection...")
    markers, num_labels, divider_mask, plate_interior = detect_dividers_watershed(
        img, gray, plate_mask, center
    )
    compartments = extract_compartments(markers, plate_interior, num_labels, center)
    
    use_interactive = False
    
    if len(compartments) < 3:
        print(f"\n  Auto-detection found {len(compartments)} regions (need 3)")
        print("  Switching to interactive mode...")
        use_interactive = True
    else:
        # Check if the 3 regions are reasonable (each should be >10% of plate)
        for comp in compartments:
            pct = comp["pixel_area"] / plate_area * 100
            if pct < 10:
                print(f"  Region '{comp['name']}' is only {pct:.1f}% — too small")
                use_interactive = True
                break
    
    if use_interactive:
        result = interactive_seed_selection(img, plate_interior)
        if result is None:
            print("\n  User cancelled. Using geometric fallback.")
            compartments, divider_mask = fallback_geometric_split(
                plate_mask, center, axes
            )
        else:
            compartments, divider_mask = result
    
    # ── Step 4: Report results ──
    print("\n[4/6] Compartment measurements:")
    print("  " + "-" * 50)
    for comp in compartments:
        pct = comp["pixel_area"] / plate_area * 100
        print(f"  {comp['name']:15s} | {comp['pixel_area']:>8d} px | {pct:5.1f}% of plate")
    print("  " + "-" * 50)
    total_comp = sum(c["pixel_area"] for c in compartments)
    print(f"  {'TOTAL':15s} | {total_comp:>8d} px | {total_comp / plate_area * 100:5.1f}%")
    
    # ── Step 5: Generate overlay ──
    print("\n[5/6] Generating transparent overlay...")
    overlay = generate_overlay(img, plate_contour, compartments, divider_mask, center)
    cv2.imwrite(OVERLAY_PATH, overlay)
    print(f"  Saved: {OVERLAY_PATH}")
    
    # ── Step 6: Save calibration data ──
    print("\n[6/6] Saving calibration data...")
    debug = generate_debug_image(img, compartments, divider_mask, center)
    cv2.imwrite(DEBUG_PATH, debug)
    print(f"  Saved: {DEBUG_PATH}")
    
    cal_data = save_calibration(compartments, center, plate_area)
    
    print("\n" + "=" * 60)
    print("  CALIBRATION COMPLETE!")
    print("=" * 60)
    print(f"""
  Next steps:
  1. Open '{os.path.basename(DEBUG_PATH)}' to verify compartments look correct
  2. Measure your plate compartment volumes with water (in ml)
  3. Update 'volume_ml' values in '{os.path.basename(CALIBRATION_JSON)}'
  4. Copy '{os.path.basename(OVERLAY_PATH)}' to mobile-app/assets/
  5. Run portion_estimator.py to test with a food photo
""")


if __name__ == "__main__":
    main()
