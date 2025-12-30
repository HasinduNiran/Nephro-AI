const express = require("express");
const router = express.Router();
const stageProgressionController = require("../controllers/stageProgressionController");

/**
 * POST /api/stage-progression
 * Predict CKD stage progression using LSTM model
 * 
 * Request body:
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
