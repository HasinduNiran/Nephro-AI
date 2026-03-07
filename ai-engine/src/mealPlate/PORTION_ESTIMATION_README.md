# MealPlate — Food Portion Estimation System

**Full Technical Documentation**

---

## Table of Contents

1. [Overview](#1-overview)
2. [System Architecture](#2-system-architecture)
3. [The Physical Plate Setup](#3-the-physical-plate-setup)
4. [Stage 0 — One-Time Calibration](#4-stage-0--one-time-calibration)
5. [Stage 1 — Image Standardization (EXIF Failsafe)](#5-stage-1--image-standardization-exif-failsafe)
6. [Stage 2 — Food Detection (YOLOv11)](#6-stage-2--food-detection-yolov11)
7. [Stage 3 — Precise Food Masking (MobileSAM)](#7-stage-3--precise-food-masking-mobilesam)
8. [Stage 4 — Compartment Assignment](#8-stage-4--compartment-assignment)
9. [Stage 5 — Raw Fill Ratio Calculation](#9-stage-5--raw-fill-ratio-calculation)
10. [Stage 6 — Frustum Correction (Taper Exponent)](#10-stage-6--frustum-correction-taper-exponent)
11. [Stage 7 — MiDaS Monocular Depth Estimation](#11-stage-7--midas-monocular-depth-estimation)
12. [Stage 8 — Volume Estimation with Dynamic Height Factor](#12-stage-8--volume-estimation-with-dynamic-height-factor)
13. [Stage 9 — Weight Estimation (Density Lookup)](#13-stage-9--weight-estimation-density-lookup)
14. [Stage 10 — Confidence Scoring](#14-stage-10--confidence-scoring)
15. [Stage 11 — Nutrient Calculation (Backend)](#15-stage-11--nutrient-calculation-backend)
16. [Food Database — Density & Nutrient Reference](#15-food-database--density--nutrient-reference)
17. [API Response Format](#16-api-response-format)
18. [Debug Visualization](#17-debug-visualization)
19. [Key Design Decisions & Limitations](#18-key-design-decisions--limitations)
20. [File Reference Map](#19-file-reference-map)

---

## 1. Overview

The MealPlate component estimates **the weight in grams of each food item** placed on a standard 3-compartment plate by combining:

- A **custom-trained YOLOv11m model** that recognizes Sri Lankan food classes from a photo.
- **MobileSAM** (Segment Anything Model) that draws a precise pixel boundary around each detected food item.
- A **calibrated compartment geometry** of the physical plate that converts pixel area into millilitres, then into grams using food-specific density values.

The overarching design principle is that the **camera always photographs the plate at the same fixed distance and angle** (enforced by an overlay guide in the mobile app). Because scale is constant, pixel area is a reliable proxy for volume, and no depth sensor or 3D reconstruction is required.

---

## 2. System Architecture

```
Mobile App (photo)
        │
        ▼
   POST /mealPlate/detect-foods
        │
        ▼
┌───────────────────────────────────────┐
│         predictor.py                  │
│                                       │
│  1. standardize_incoming_image()      │  ← EXIF correction + resize to 1524×1557
│  2. YOLO model.predict()             │  ← food class + bounding box per item
│  3. estimate_all_portions()           │  ← calls portion_estimator.py
│       ├── generate_depth_map()        │  ← MiDaS → inverse-depth float32 array (once)
│       ├── create_food_mask()          │  ← MobileSAM → binary mask (per detection)
│       ├── map_food_by_max_overlap()   │  ← pixel-overlap → main_carb / side_1 / side_2
│       └── estimate_portion()         │  ← fill ratio + depth → volume → grams
│                                       │
└───────────────────────────────────────┘
        │
        ▼
   JSON response  →  Backend (Node.js)  →  foodData.js nutrient lookup
```

---

## 3. The Physical Plate Setup

The system uses one specific physical plate: a **white 3-compartment rectangular tray**.

```
┌─────────────────┬──────────────┐
│                 │              │
│                 │   side_2     │  ← top-right  (smallest, ~165 ml)
│   main_carb     │              │
│                 ├──────────────┤
│   (rice / carb) │              │
│                 │   side_1     │  ← bottom-right (medium, ~250 ml)
│                 │              │
└─────────────────┴──────────────┘
          ▲
      vertical divider at x = 761 px
      horizontal divider at y = 778 px (right half only)
```

| Compartment | Intended Food                 | Volume (ml) | Pixel Area (at 1524×1557) |
| ----------- | ----------------------------- | ----------- | ------------------------- |
| `main_carb` | Rice / Roti / String Hoppers  | **580 ml**  | **911,005 px**            |
| `side_1`    | Curry / Protein (larger side) | **250 ml**  | **406,813 px**            |
| `side_2`    | Salad / Sambol / Small side   | **165 ml**  | **262,181 px**            |

These values are **hardcoded constants** measured once during the calibration process (see Stage 0) and never change at runtime — they are baked into `portion_estimator.py` to avoid re-loading the calibration JSON on every request.

---

## 4. Stage 0 — One-Time Calibration

**File:** `auto_calibrate.py` + `calibration.py`

Before any live estimation is possible, a single calibration run must be done with an empty plate photograph. This is a **one-time offline step**.

### Calibration algorithm (`auto_calibrate.py`)

```
empty_plate.png  (any camera, any rotation)
        │
        ▼
 1. PIL ImageOps.exif_transpose()        ← strips hidden EXIF rotation tag
 2. cv2.resize → 1524×1557              ← force to standard calibration resolution
        │
        ▼
 3. detect_plate_boundary()
      • GaussianBlur + threshold → binary plate mask
      • cv2.findContours → largest contour = plate rim
      • cv2.fitEllipse → plate centroid + axes
        │
        ▼
 4. detect_dividers_watershed()
      • Erode rim away → plate interior mask
      • Three ridge detectors combined (weighted sum):
          A. Morphological gradient       (weight 0.4)
          B. Local contrast deviation     (weight 0.3)
          C. Top-hat + Black-hat          (weight 0.3)
      • Otsu threshold → divider mask
      • cv2.distanceTransform on non-divider area → seed markers
      • cv2.watershed() → 3 labelled regions
        │
        ▼
 5. extract_compartments()
      • Count pixels per watershed label
      • Sort by area descending → top 3 labels
      • Assign names: largest=main_carb, 2nd=side_1, 3rd=side_2
        │
        ▼
 6. Save outputs:
      • compartment_masks.npz    ← binary boolean mask per compartment (numpy)
      • plate_calibration.json   ← pixel areas + centroids
      • plate_overlay_transparent.png  ← ARGB overlay for mobile camera guide
      • debug_compartments.png   ← visual confirmation image
```

If the watershed approach fails to find exactly 3 compartments, a **geometric fallback** is used: a hardcoded vertical + horizontal line split based on the plate centroid.

### Manual Calibration Tool (`calibration.py`)

An interactive OpenCV window allows manually clicking polygon points around each compartment and pressing `c` to compute the polygon area. This produced the authoritative pixel area constants now hardcoded in `portion_estimator.py`.

---

## 5. Stage 1 — Image Standardization (EXIF Failsafe)

**Function:** `standardize_incoming_image()` in `portion_estimator.py`

Every photo arriving from the mobile app passes through this mandatory pre-processing step:

```python
pil_img = PILImage.open(io.BytesIO(image_bytes))
pil_img = ImageOps.exif_transpose(pil_img)          # ← strip EXIF rotation
cv_img  = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
cv_img  = cv2.resize(cv_img, (1524, 1557), interpolation=cv2.INTER_AREA)
```

| Step                     | Why it matters                                                                                                                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `exif_transpose`         | Android and iOS cameras embed a rotation tag in JPEG EXIF metadata rather than physically rotating pixels. Without this, a portrait photo from a phone appears sideways, causing all compartment assignments to be wrong. |
| Force to **1524 × 1557** | All calibrated constants (pixel areas, centroids, split coordinates) were measured at this exact resolution. Every incoming image must be normalized to this size before any pixel-level calculation.                     |

---

## 6. Stage 2 — Food Detection (YOLOv11)

**File:** `predictor.py` — model `best_model_yolo11m.pt`

```python
results = model.predict(pil_img, conf=0.25)
```

The YOLO model outputs for each detection:

- `class_id` → food class name (e.g., `"white rice"`, `"dahl curry"`)
- `confidence` → detection confidence score (0–1)
- `xyxy` → bounding box pixel coordinates `[x1, y1, x2, y2]`

**Supported food classes** (Sri Lankan cuisine focused):

| Category               | Classes                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Carbs / Staples**    | white rice, red rice, fried rice, roti, string hoppers, pittu, hoppers                                                    |
| **Proteins**           | chicken, fish curry, egg, cutlet, tempered sprats                                                                         |
| **Curries / Legumes**  | dahl curry, Beans curry                                                                                                   |
| **Vegetables / Sides** | mallum, mallum - gotukola, mallum - mukunuwenna, mallum - murunga, mallum - kathurumurunga, mallum - asamodagam, beetroot |
| **Condiments**         | Pol sambol, Pol sambol - tempered, Pol sambol - lime added                                                                |
| **Fruits**             | avacado, pineapple                                                                                                        |
| **Other**              | coconut_sambol                                                                                                            |

The confidence threshold is `0.25` (relatively permissive) because foods on a partially-filled plate can be partially occluded.

---

## 7. Stage 3 — Precise Food Masking (MobileSAM)

**Function:** `create_food_mask()` in `portion_estimator.py`

After YOLO identifies _what_ food is where, **MobileSAM** is used to identify _exactly which pixels_ belong to the food item — not just its rectangular bounding box.

```
YOLO bounding box  →  MobileSAM prompted with bbox  →  binary food mask
   [x1, y1, x2, y2]         sam_model.predict(                (h × w uint8)
                               cv_img,
                               bboxes=[[x1,y1,x2,y2]])
```

MobileSAM returns a boolean mask at the full image resolution. The function resizes it if needed and converts it to a `uint8` mask where `255 = food pixel`.

**Fallback behaviour:** If MobileSAM fails (exception, no masks returned, or bounding box is smaller than 10×10 px), the raw YOLO bounding box rectangle is used as the mask instead. This ensures the pipeline never crashes.

**Why SAM matters for accuracy:** A bounding box includes background pixels (empty plate, divider ridges). SAM removes those, so the `food_pixels` count is much closer to the actual food area. For example, a single piece of chicken in a corner of a large compartment would be massively over-estimated if the full bbox were used.

---

## 8. Stage 4 — Compartment Assignment

**Function:** `map_food_by_max_overlap()` in `portion_estimator.py`

After the SAM mask is created, the function determines which compartment the food belongs to by finding the compartment mask that has the **greatest pixel-level overlap** with the food mask:

```python
def map_food_by_max_overlap(food_mask):
    best_compartment = "main_carb"   # safe fallback
    max_pixels = 0
    for comp_name, comp_mask in _masks.items():
        overlap = cv2.bitwise_and(food_mask, comp_mask)
        overlap_pixels = cv2.countNonZero(overlap)
        if overlap_pixels > max_pixels:
            max_pixels = overlap_pixels
            best_compartment = comp_name
    return best_compartment
```

This approach is **robust to food items that cross a divider ridge**: a piece of fish whose geometric centre happens to fall in `main_carb` but whose majority pixel area is in `side_1` will now be correctly assigned to `side_1`. The old centroid-based split (`cx < 761`) would misassign such items.

Compartment masks are loaded with `MASK_DILATION_PX = 15` expansion applied at load time (see `_load_masks()`), so food pixels resting on the physical ridge between compartments are always captured by at least one mask and counted correctly.

---

## 9. Stage 5 — Fill Ratio Calculation

**Function:** `estimate_portion()` → `_count_food_pixels()` in `portion_estimator.py`

This is the core measurement step.

```python
# Count only the food pixels that also lie inside the compartment mask
overlap = cv2.bitwise_and(food_mask, compartment_mask)
food_pixels = cv2.countNonZero(overlap)

# Fill ratio: what fraction of the compartment is covered by food?
fill_ratio = food_pixels / COMPARTMENT_PIXELS[compartment]
```

The bitwise AND with the compartment mask ensures that even if the SAM mask bleeds slightly outside the compartment boundary (e.g., onto a divider ridge), only the pixels that are definitively inside the correct compartment are counted. This prevents double-counting in edge cases where food sits right on the divider line.

**Example:**

```
Compartment: main_carb  →  911,005 total pixels
Food mask overlap:          455,503 pixels
Fill ratio:                 455,503 / 911,005 = 0.50  (plate is 50% full)
```

If `food_pixels < 50`, the item is discarded and returns 0g with an error message — this handles ghost detections.

---

## 11. Stage 7 — MiDaS Monocular Depth Estimation

**Functions:** `generate_depth_map()`, `_get_reference_rim_depth()` in `portion_estimator.py`

The 2D fill ratio tells us _how much plate area_ the food covers but cannot measure _how tall_ the food is. A mound of rice heaped 5 cm high and a flat thin layer covering the same area look identical to the camera. MiDaS resolves this by estimating a per-pixel inverse-depth map from the single RGB image.

### How it works

```
std_img (BGR, 1524×1557)
        │
        ▼
  cv2.cvtColor → RGB
        │
        ▼
  transform_depth(img_rgb)          ← MiDaS small_transform pipeline
        │
        ▼
  midas_model(input_batch)          ← MiDaS_small neural network inference
        │
        ▼
  torch.nn.functional.interpolate   ← bicubic upsample back to 1524×1557
        │
        ▼
  depth_map  (float32, STANDARD_H × STANDARD_W)
```

MiDaS produces **inverse depth** (higher value = closer to camera = taller object). The output is relative and scene-normalised — not metric distances.

### Reference Rim Depth

To convert relative depth into a dimensionless height factor compared to the plate rim:

```python
reference_rim_depth = np.percentile(depth_map, 95)
```

The 95th percentile of the whole scene is used as a proxy for the highest-confidence "flat plate rim" level. Food that piles above the rim will have depth values exceeding this reference.

### Dynamic Height Factor

For each food item:

```python
food_depth_pixels     = depth_map[food_mask == 255]
dynamic_height_factor = np.median(food_depth_pixels) / reference_rim_depth
dynamic_height_factor = clamp(dynamic_height_factor, DEPTH_HEIGHT_MIN=0.3, DEPTH_HEIGHT_MAX=1.5)
```

| Value range                           | Physical interpretation                                   |
| ------------------------------------- | --------------------------------------------------------- |
| `≈ 1.0`                               | Food roughly level with the rim                           |
| `> 1.0` (e.g. 1.35)                   | Food heaped above the rim (e.g. mound of rice)            |
| `< 1.0` (e.g. 0.70)                   | Food below rim level (e.g. liquid curry, thin flat layer) |
| Falls back to `static_heaping_factor` | When food_mask is empty or reference_rim_depth is zero    |

**MiDaS is run once per API request** (not once per food item) to avoid redundant inference — the single depth map is shared across all `estimate_portion()` calls in `estimate_all_portions()`.

### Static Heaping Factor (fallback)

The original per-food `HEAPING_FACTOR` table is retained as a per-item fallback. If MiDaS data is unavailable, `dynamic_height_factor` defaults to `static_heaping_factor` for that food class, preserving backward-compatible estimates.

---

## 12. Stage 8 — Volume Estimation with Dynamic Height Factor

**Function:** `estimate_portion()` in `portion_estimator.py`

The corrected fill ratio and MiDaS-derived height factor are combined to compute food volume:

```
food_volume_ml = corrected_ratio × compartment_volume_ml × dynamic_height_factor
```

### Compartment Volumes

Measured physically by filling each compartment with water and reading a graduated cylinder:

| Compartment | Volume     |
| ----------- | ---------- |
| `main_carb` | **580 ml** |
| `side_1`    | **250 ml** |
| `side_2`    | **165 ml** |

**Example (end-to-end):**

```
raw_fill_ratio        = 0.50
corrected_ratio       = 0.50 ^ 1.25             = 0.4204
dynamic_height_factor = 1.12                    (MiDaS measured this rice mound)
compartment_volume    = 580 ml                  (main_carb)

food_volume_ml = 0.4204 × 580 × 1.12 = 273.6 ml
```

---

## 13. Stage 9 — Weight Estimation (Density Lookup)

**Data:** `FOOD_DENSITY` dict in `portion_estimator.py`

The final conversion from volume to grams uses food-specific density:

```
food_grams = food_volume_ml × density_g_per_ml
```

### Density Reference Table

| Food                      | Density (g/ml) | Notes                                   |
| ------------------------- | -------------- | --------------------------------------- |
| `white rice`              | **1.00**       | Steamed, compacted                      |
| `red rice`                | **0.85**       | Slightly less dense than white rice     |
| `fried rice`              | **0.75**       | Oil + air pockets from frying           |
| `roti`                    | **0.55**       | Bread-like; lots of trapped air         |
| `pittu`                   | **0.72**       | Steamed cylindrical cake                |
| `hoppers`                 | **0.38**       | Very airy bowl-shaped pancake           |
| `string hoppers`          | **0.40**       | Fine noodle mesh, many air gaps         |
| `chicken`                 | **1.50**       | Dense protein; heaviest item            |
| `fish curry`              | **0.80**       | Watery curry sauce decreases density    |
| `dahl curry`              | **1.25**       | Dense lentil paste                      |
| `Beans curry`             | **0.65**       | Liquid-heavy                            |
| `egg`                     | **0.95**       | Near water density                      |
| `cutlet`                  | **0.60**       | Breaded; air in coating                 |
| `tempered sprats`         | **0.50**       | Light dried/fried fish                  |
| `mallum` (all variants)   | **0.35**       | Shredded leafy greens; very low density |
| `beetroot`                | **0.70**       | Cooked vegetable in light sauce         |
| `Pol sambol`              | **0.45**       | Grated coconut; fluffy                  |
| `Pol sambol - lime added` | **0.75**       | Lime juice adds significant moisture    |
| `avacado`                 | **0.90**       | Dense fruit flesh                       |
| `pineapple`               | **0.85**       | Dense tropical fruit                    |
| _(default)_               | **0.75**       | Fallback for unknown foods              |

**Completing the example from above:**

```
food_volume_ml  = 268.2 ml
density         = 1.0 g/ml   (white rice)
food_grams      = 268.2 × 1.0 = 268.2g
```

---

## 14. Stage 10 — Confidence Scoring

**Function:** `_confidence()` in `portion_estimator.py`

A composite confidence score (0–1) is attached to each estimate, combining:

1. **Fill Ratio Confidence (weight 0.6):** How "normal" is the fill ratio?
   - `0.10 – 0.95` fill ratio → score **1.0** (reasonable amount of food)
   - `0.05 – 0.10` or `0.95 – 1.00` → score **0.7** (very little or nearly full)
   - Outside this range → score **0.4** (abnormal)

2. **Pixel Count Confidence (weight 0.4):** How much pixel evidence supports the estimate?
   - `> 5,000 px` → score **1.0** (large clear detection)
   - `1,000 – 5,000 px` → score **0.8**
   - `200 – 1,000 px` → score **0.6**
   - `< 200 px` → score **0.3** (very small, possibly noise)

```python
confidence = fill_ratio_confidence × 0.6 + pixel_count_confidence × 0.4
```

Note: `_confidence()` uses `raw_fill_ratio` (not `corrected_ratio`) because the confidence score judges how reasonable the camera observation is — that is independent of the geometric taper correction.

The final API response includes both this `portion_confidence` and the YOLO `detection_confidence` separately.

---

## 15. Stage 11 — Nutrient Calculation (Backend)

**File:** `backend/mealPlate/foodData.js`

Once the AI engine returns grams per food item, the Node.js backend multiplies by per-100g nutrient values to compute absolute intake:

```
nutrient_mg = (estimated_grams / 100) × nutrient_per_100g
```

All nutrient values are calibrated for Sri Lankan food preparation styles (e.g., `Pol sambol` has a high sodium value of 400 mg/100g reflecting salt added during preparation).

**Tracked nutrients** (critical for CKD patients):

| Nutrient            | Why it matters for CKD                                                     |
| ------------------- | -------------------------------------------------------------------------- |
| **Protein** (g)     | Excess protein increases waste products that impaired kidneys can't filter |
| **Sodium** (mg)     | Causes fluid retention and hypertension                                    |
| **Potassium** (mg)  | Dangerous at high serum levels when kidneys can't excrete it               |
| **Phosphorus** (mg) | Accumulates in CKD, causing bone disease                                   |

---

## 16. Food Database — Density & Nutrient Reference

Complete cross-reference of all supported foods with their parameters used in estimation and nutrient reporting:

| Food              | Density g/ml | Heaping Factor | Protein /100g | Sodium mg/100g | Potassium mg/100g | Phosphorus mg/100g |
| ----------------- | ------------ | -------------- | ------------- | -------------- | ----------------- | ------------------ |
| white rice        | 1.00         | 1.1            | 2.7           | 1              | 35                | 35                 |
| red rice          | 0.85         | 1.1            | 2.5           | 1              | 85                | 78                 |
| fried rice        | 0.75         | 1.1            | 4             | 400            | 100               | 90                 |
| roti              | 0.55         | 1.0            | 8             | 320            | 120               | 100                |
| string hoppers    | 0.40         | 1.0            | —             | —              | —                 | —                  |
| pittu             | 0.72         | 1.0            | —             | —              | —                 | —                  |
| hoppers           | 0.38         | 1.0            | —             | —              | —                 | —                  |
| chicken           | 1.50         | 1.4            | 31            | 74             | 256               | 228                |
| fish curry        | 0.80         | 1.2            | 20            | 350            | 350               | 200                |
| dahl curry        | 1.25         | 1.0            | 6             | 250            | 300               | 180                |
| Beans curry       | 0.65         | 1.0            | 2             | 200            | 250               | 40                 |
| egg               | 0.95         | 1.0            | —             | —              | —                 | —                  |
| cutlet            | 0.60         | 1.0            | 12            | 300            | 200               | 150                |
| tempered sprats   | 0.50         | 1.0            | 35            | 900            | 400               | 350                |
| mallum (all)      | 0.35         | 1.0            | 2–4           | 15–25          | 380–450           | 45–60              |
| beetroot          | 0.70         | 1.0            | 1.6           | 78             | 325               | 40                 |
| Pol sambol        | 0.45         | 1.0            | 3             | 400            | 300               | 100                |
| Pol sambol - lime | 0.75         | 1.0            | 3             | 380            | 310               | 98                 |
| avacado           | 0.90         | 1.0            | 2             | 7              | 485               | 52                 |
| pineapple         | 0.85         | 1.0            | 0.5           | 1              | 109               | 8                  |

---

## 17. API Response Format

**Endpoint:** `POST /mealPlate/detect-foods`

**Request:** Multipart form-data, field `image` = JPEG photo

**Response:**

```json
{
  "success": true,
  "hasAutoPortions": true,
  "count": 3,
  "detected_foods": [
    {
      "food": "white rice",
      "confidence": 0.912,
      "bbox": [45, 80, 720, 1450],
      "compartment": "main_carb",
      "food_pixels": 455503,
      "compartment_pixels": 911005,
      "raw_fill_ratio": 0.5,
      "corrected_ratio": 0.4204,
      "taper_exponent": 1.25,
      "dynamic_height_factor": 1.12,
      "static_heaping_factor": 1.1,
      "food_volume_ml": 273.6,
      "density_g_per_ml": 1.0,
      "estimated_grams": 273.6,
      "portion_confidence": 0.94
    },
    {
      "food": "dahl curry",
      "confidence": 0.847,
      "bbox": [800, 450, 1480, 1500],
      "compartment": "side_1",
      "food_pixels": 310000,
      "compartment_pixels": 406813,
      "raw_fill_ratio": 0.76,
      "corrected_ratio": 0.7052,
      "taper_exponent": 1.25,
      "dynamic_height_factor": 0.98,
      "static_heaping_factor": 1.0,
      "food_volume_ml": 172.6,
      "density_g_per_ml": 1.25,
      "estimated_grams": 215.7,
      "portion_confidence": 0.88
    }
  ]
}
```

---

## 18. Debug Visualization

**Function:** `save_debug_visualization()` in `portion_estimator.py`

After every successful analysis, the system saves a debug image to:
`ai-engine/src/mealPlate/debug_output/latest_scan.jpg`

This visualization overlays:

- **Coloured SAM masks** for each detected food item (semi-transparent tint)
- **Bounding box rectangles** in matching colours
- **Text labels** showing food name, estimated grams, compartment, and fill ratio
- **White divider lines** at the calibrated split coordinates

This allows quick visual inspection of whether SAM masks and compartment assignments are correct.

---

## 19. Key Design Decisions & Limitations

### Design Decisions

| Decision                                            | Rationale                                                                                                                                                              |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fixed plate + fixed distance                        | Eliminates the need for depth estimation. Pixel area becomes a reliable volume proxy.                                                                                  |
| Hardcoded pixel constants                           | Faster than loading calibration JSON on every request. The plate never changes during production.                                                                      |
| SAM with YOLO bbox as prompt                        | Box-prompted SAM is much faster than fully automatic SAM segmentation while still being far more accurate than using the raw YOLO bounding box.                        |
| Separate heaping and density tables                 | These two factors are physically independent. MiDaS/heaping corrects for 3D height; density converts volume to mass. Separating them makes each independently tunable. |
| Pixel-overlap compartment assignment (not centroid) | Correctly handles food items that cross a divider ridge. The compartment that captures the majority of the food's pixels wins.                                         |
| MiDaS run once per request (not once per food item) | The depth map is computed once in `estimate_all_portions()` and shared across all `estimate_portion()` calls, avoiding redundant GPU inference.                        |
| Static heaping factor retained as MiDaS fallback    | If the depth map is degenerate or food_mask is empty, the per-class `HEAPING_FACTOR` is used so the pipeline degrades gracefully without crashing.                     |

### Known Limitations

| Limitation                                | Impact                                                                                                                                                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fixed plate hardware                      | Only works with the specific 3-compartment plate. A different plate requires a full re-calibration.                                                                                                     |
| MiDaS produces relative, not metric depth | The depth map is scene-normalised. Uniform scenes (e.g., all food at roughly the same height) reduce contrast between food and rim, making the height factor less reliable.                             |
| MiDaS adds ~100–300 ms per request        | On CPU-only servers, MiDaS_small inference is fast but not instant. On GPU it is negligible. The model is loaded once at startup.                                                                       |
| One food per compartment assumption       | If two different foods are placed in the same compartment (e.g., rice and curry mixed together), their individual grams will be unrelated since compartment volume is divided among them independently. |
| Three AI models loaded at startup         | MobileSAM + YOLOv11m + MiDaS_small are all loaded once on server start. This adds ~3–5 s startup time but keeps per-request latency low.                                                                |
| Confidence ≠ accuracy                     | The confidence score measures internal consistency (fill ratio + pixel count), not ground-truth weight accuracy.                                                                                        |

---

## 20. File Reference Map

| File                            | Role                                                                                               |
| ------------------------------- | -------------------------------------------------------------------------------------------------- |
| `portion_estimator.py`          | Core estimation logic: standardize → mask → raw fill ratio → frustum correction → volume → grams   |
| `predictor.py`                  | Orchestrator: YOLO inference → calls portion_estimator → merges results                            |
| `api.py`                        | FastAPI router: receives HTTP upload, calls predictor, returns JSON                                |
| `auto_calibrate.py`             | One-time calibration tool: watershed segmentation of empty plate photo                             |
| `calibration.py`                | Manual calibration tool: interactive OpenCV click-to-measure polygon area                          |
| `compartment_masks.npz`         | Pre-computed binary masks (numpy): one per compartment at 1524×1557                                |
| `plate_calibration.json`        | Saved calibration output: pixel areas, centroids, volume assignments                               |
| `best_model_yolo11m.pt`         | Trained YOLOv11 medium model weights for Sri Lankan food classification                            |
| `mobile_sam.pt`                 | MobileSAM foundation model weights (loaded via `ultralytics.SAM`)                                  |
| MiDaS_small (auto-downloaded)   | Monocular depth estimation model; fetched from `intel-isl/MiDaS` via `torch.hub.load` on first run |
| `backend/mealPlate/foodData.js` | Per-100g nutrient database: protein, sodium, potassium, phosphorus                                 |

---

_This document covers the complete portion estimation pipeline for the Nephro-AI MealPlate component. For information about how portion estimates feed into the CKD nutrient wallet and daily limits, see the main project README._
