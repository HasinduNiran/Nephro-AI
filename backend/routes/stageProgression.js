const express = require("express");
const router = express.Router();
const stageProgressionController = require("../controllers/stageProgressionController");
const multer = require("multer");
const path = require("path");

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadsDir = path.join(__dirname, "..", "uploads", "lab-reports");
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const prefix = file.fieldname === "ultrasound" ? "ultrasound-" : "lab-report-";
    cb(null, prefix + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    // Allow common image formats and PDF lab reports
    const allowedTypes = /jpeg|jpg|png|bmp|pdf/;
    const extname = allowedTypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = allowedTypes.test(file.mimetype.toLowerCase());

    if (mimetype || extname) {
      return cb(null, true);
    }
    cb(new Error("Only image or PDF files are allowed"));
  },
});

/**
 * POST /api/stage-progression/upload
 * Predict CKD stage progression using uploaded images or manual values
 * 
 * Form data:
 * - labReport: image file (optional if manual values provided)
 * - ultrasound: image file (optional)
 * - name: string (patient name)
 * - age: number (optional, helps calculate eGFR)
 * - gender: string (M/F, optional, helps calculate eGFR)
 * - creatinine: number (optional manual value)
 * - egfr: number (optional manual value)
 * - bun: number (optional manual value)
 * - albumin: number (optional manual value)
 * - hemoglobin: number (optional manual value)
 * 
 * Response:
 * {
 *   "success": true,
 *   "prediction_lab_only": { ... },
 *   "prediction_with_us": { ... } or null,
 *   "message": string
 * }
 */
router.post(
  "/upload",
  upload.any(), // accept any file field; controller will pick known ones
  stageProgressionController.predictStageProgressionWithImages
);

// Get past stage progression records for a user (by email)
router.get(
  "/history/:userEmail",
  stageProgressionController.getStageProgressionHistory
);

// Get all past stage progression records (admin/debug)
router.get(
  "/history",
  stageProgressionController.getAllStageProgressionHistory
);

// Delete a specific stage progression record by ID (admin/debug)
router.delete(
  "/history/:id",
  stageProgressionController.deleteStageProgressionRecord
);
router.get(
  "/future-rate/:userEmail",
  stageProgressionController.getFutureProgressionRate
);
/**
 * POST /api/stage-progression
 * Predict CKD stage progression using LSTM model
 * 
 * Request body:

// Get future progression rate (latest record) for a user
router.get(
  "/future-rate/:userEmail",
  stageProgressionController.getFutureProgressionRate
);
 * {
 *   "lab_data": {
 *     "creatinine": number (required),
 *     "bun": number (required),
 *     "gfr": number (required),
 *     "albumin": number (optional),
 *     "hemoglobin": number (optional),
 *     "potassium": number (optional),
 *     "sodium": number (optional),
 *     "calcium": number (optional),
 *     "phosphorus": number (optional)
 *   },
 *   "ultrasound_data": {
 *     "left_kidney_length": number (optional, cm),
 *     "right_kidney_length": number (optional, cm),
 *     "left_cortical_thickness": number (optional, cm),
 *     "right_cortical_thickness": number (optional, cm),
 *     "echogenicity_score": number (optional, 1-5)
 *   }
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "prediction": {
 *     "predicted_stage": number (1-5),
 *     "confidence": number (0-1),
 *     "stage_probabilities": {
 *       "stage_1": number,
 *       "stage_2": number,
 *       "stage_3": number,
 *       "stage_4": number,
 *       "stage_5": number
 *     },
 *     "progression_risk": number (0-1),
 *     "risk_level": string ("Low", "Moderate", "High"),
 *     "used_ultrasound": boolean
 *   },
 *   "message": string
 * }
 */
router.post("/", stageProgressionController.predictStageProgression);

module.exports = router;
