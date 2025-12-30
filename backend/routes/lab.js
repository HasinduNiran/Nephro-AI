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
    console.log("Multer fileFilter - File details:");
    console.log("  Original name:", file.originalname);
    console.log("  Mimetype:", file.mimetype);
    console.log("  Fieldname:", file.fieldname);

    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = file.mimetype.startsWith("image/") || file.mimetype === "application/pdf";
    
    // Accept if EITHER mimetype OR extension is valid (important for web uploads)
    if (mimetype || extname) {
      console.log("  ✓ File accepted");
      return cb(null, true);
    } else {
      console.log("  ✗ File rejected");
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
