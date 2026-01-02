const express = require("express");
const router = express.Router();
const labController = require("../controllers/labController");

// POST: Add lab test results
router.post("/", labController.addLabTest);

// GET: All lab tests
router.get("/", labController.getAllLabTests);

// GET: Lab tests by patient name
router.get("/patient/:name", labController.getLabTestsByName);

// GET: Latest lab test for a patient
router.get("/patient/:name/latest", labController.getLatestLabTest);

// GET: Single lab test by ID
router.get("/:id", labController.getLabTestById);

module.exports = router;
