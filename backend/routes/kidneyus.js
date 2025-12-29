const express = require("express");
const router = express.Router();
const kidneyusController = require("../controllers/kidneyusController");

// POST: Analyze ultrasound
router.post("/ultrasound", kidneyusController.analyzeKidneyUltrasound);

// GET: All kidney scans
router.get("/scans", kidneyusController.getAllKidneyScans);

// GET: Kidney scans by patient name
router.get("/scans/patient/:name", kidneyusController.getKidneyScansByName);

// GET: Single kidney scan by ID
router.get("/scans/:id", kidneyusController.getKidneyScanById);

module.exports = router;
