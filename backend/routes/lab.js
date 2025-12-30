const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const labController = require("../controllers/labController");

// Create uploads directory for lab reports if it doesn't exist
const labUploadsDir = path.join(__dirname, "../uploads/lab-reports");
if (!fs.existsSync(labUploadsDir)) {
  fs.mkdirSync(labUploadsDir, { recursive: true });
}

// Configure multer for lab report uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, labUploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "lab-report-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB limit for reports
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = /image|pdf/.test(file.mimetype);
    if ((mimetype && extname) || file.mimetype === "application/pdf") {
      return cb(null, true);
    } else {
      cb(new Error("Only image files (JPG, PNG) and PDF files are allowed"));
    }
  },
});

// POST: Add lab test results (manual entry)
router.post("/", labController.addLabTest);

// POST: Upload lab report and extract data via OCR
router.post("/upload", upload.single("reportImage"), labController.uploadLabReport);

// GET: All lab tests
router.get("/", labController.getAllLabTests);

// GET: Lab tests by patient name
router.get("/patient/:name", labController.getLabTestsByName);

// GET: Latest lab test for a patient
router.get("/patient/:name/latest", labController.getLatestLabTest);

// GET: Single lab test by ID
router.get("/:id", labController.getLabTestById);

module.exports = router;
