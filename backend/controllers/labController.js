const LabTest = require("../models/LabTest");
const fs = require("fs");
const path = require("path");
const { processLabReport, calculateEGFRFromCreatinine, validateResult } = require("../utils/ocrProcessor");

// Determine CKD stage based on eGFR value
function determineCKDStage(eGFR) {
  if (eGFR >= 90) {
    return {
      stage: "Stage 1",
      description: "You are in stage 1 of CKD",
      eGFRRange: "90 or higher",
    };
  } else if (eGFR >= 60) {
    return {
      stage: "Stage 2",
      description: "eGFR level is in the range of 60 to 90 that cause the stage 2",
      eGFRRange: "60–89",
    };
  } else if (eGFR >= 45) {
    return {
      stage: "Stage 3a",
      description: "eGFR level is in the range of 45 to 59 that cause the stage 3a",
      eGFRRange: "45–59",
    };
  } else if (eGFR >= 30) {
    return {
      stage: "Stage 3b",
      description: "eGFR level is in the range of 30 to 44 that cause the stage 3b",
      eGFRRange: "30–44",
    
    };
  } else if (eGFR >= 15) {
    return {
      stage: "Stage 4",
      description: "eGFR level is in the range of 15 to 29 that cause the stage 4",
      eGFRRange: "15–29",
  
    };
  } else {
    return {
      stage: "Stage 5",
      description: "eGFR level is in the range of less than 15 that cause the stage 5",
      eGFRRange: "Less than 15",
   
    };
  }
}

// Add lab test results and get CKD stage
exports.addLabTest = async (req, res) => {
  try {
    const { name, eGFR, creatinine, bun, albumin, age, gender } = req.body;

    // Validate required fields
    if (!name) {
      return res.status(400).json({ message: "Name is required" });
    }

    let calculatedEGFR = eGFR;

    // If eGFR not provided, try to calculate from creatinine
    if ((eGFR === undefined || eGFR === null) && creatinine && age) {
      console.log(`Calculating eGFR from creatinine: ${creatinine}, age: ${age}, gender: ${gender || 'M'}`);
      calculatedEGFR = calculateEGFRFromCreatinine(
        parseFloat(creatinine),
        parseInt(age),
        gender || "M"
      );
      console.log(`Calculated eGFR: ${calculatedEGFR}`);
    }

    // Validate eGFR is available
    if (calculatedEGFR === undefined || calculatedEGFR === null) {
      return res.status(400).json({ 
        message: "eGFR is required, or provide creatinine with age to calculate it" 
      });
    }

    if (calculatedEGFR < 0) {
      return res.status(400).json({ message: "eGFR must be a positive number" });
    }

    // Determine CKD stage
    const ckdInfo = determineCKDStage(calculatedEGFR);

    // Validate creatinine status if available
    let creatinineStatus = null;
    if (creatinine && gender) {
      creatinineStatus = validateResult(parseFloat(creatinine), gender);
    }

    // Create lab test record
    const labTest = await LabTest.create({
      name,
      eGFR: calculatedEGFR,
      creatinine: creatinine || null,
      creatinineStatus: creatinineStatus,
      bun: bun || null,
      albumin: albumin || null,
      age: age ? parseInt(age) : null,
      gender: gender || null,
      ckdStage: ckdInfo.stage,
      stageDescription: ckdInfo.description,
      eGFRRange: ckdInfo.eGFRRange,
      testMethod: "manual",
      extractionConfidence: eGFR ? {} : { eGFR: "calculated" },
    });

    res.status(201).json({
      success: true,
      message: "Lab test results saved successfully",
      data: labTest,
      calculated: !eGFR && creatinine && age,
      creatinineStatus: creatinineStatus,
    });
  } catch (error) {
    console.error("Error adding lab test:", error);
    res.status(500).json({
      message: "Error saving lab test results",
      error: error.message,
    });
  }
};

// Get all lab tests
exports.getAllLabTests = async (req, res) => {
  try {
    const labTests = await LabTest.find().sort({ createdAt: -1 });
    res.json({
      success: true,
      count: labTests.length,
      data: labTests,
    });
  } catch (error) {
    console.error("Error fetching lab tests:", error);
    res.status(500).json({
      message: "Error fetching lab tests",
      error: error.message,
    });
  }
};

// Get lab tests by patient name
exports.getLabTestsByName = async (req, res) => {
  try {
    const { name } = req.params;
    const labTests = await LabTest.find({
      name: new RegExp(name, "i"),
    }).sort({ createdAt: -1 });

    if (labTests.length === 0) {
      return res.status(404).json({ message: "No lab tests found for this patient" });
    }

    res.json({
      success: true,
      count: labTests.length,
      patient: name,
      data: labTests,
    });
  } catch (error) {
    console.error("Error fetching lab tests:", error);
    res.status(500).json({
      message: "Error fetching lab tests",
      error: error.message,
    });
  }
};

// Get single lab test by ID
exports.getLabTestById = async (req, res) => {
  try {
    const { id } = req.params;
    const labTest = await LabTest.findById(id);

    if (!labTest) {
      return res.status(404).json({ message: "Lab test not found" });
    }

    res.json({
      success: true,
      data: labTest,
    });
  } catch (error) {
    console.error("Error fetching lab test:", error);
    res.status(500).json({
      message: "Error fetching lab test",
      error: error.message,
    });
  }
};

// Get latest lab test for a patient
exports.getLatestLabTest = async (req, res) => {
  try {
    const { name } = req.params;
    const labTest = await LabTest.findOne({
      name: new RegExp(name, "i"),
    }).sort({ createdAt: -1 });

    if (!labTest) {
      return res.status(404).json({ message: "No lab tests found for this patient" });
    }

    res.json({
      success: true,
      data: labTest,
    });
  } catch (error) {
    console.error("Error fetching latest lab test:", error);
    res.status(500).json({
      message: "Error fetching latest lab test",
      error: error.message,
    });
  }
};
// Upload lab report image and extract data via OCR
exports.uploadLabReport = async (req, res) => {
  let filePath = null;
  
  try {
    console.log("\n=== LAB REPORT UPLOAD STARTED ===");
    console.log("Request body:", req.body);
    console.log("File info:", req.file ? { filename: req.file.filename, path: req.file.path, size: req.file.size } : "No file");

    // Check if file was uploaded
    if (!req.file) {
      console.error("No file uploaded in request");
      return res.status(400).json({ 
        success: false,
        message: "No file uploaded. Please provide a lab report image (PDF/JPG/PNG)" 
      });
    }

    filePath = req.file.path;
    const { name, age, gender } = req.body;

    // Validate required fields
    if (!name) {
      console.error("Patient name is required");
      try {
        fs.unlinkSync(filePath);
      } catch (e) {
        console.error("Error deleting file:", e);
      }
      return res.status(400).json({ 
        success: false,
        message: "Patient name is required" 
      });
    }

    console.log(`Processing lab report for patient: ${name}`);
    console.log(`File uploaded: ${req.file.filename}`);

    // Try to process the image with OCR
    console.log("Starting OCR processing...");
    const ocrResult = await processLabReport(filePath, {
      age: parseInt(age) || null,
      gender: gender || "M",
    });

    console.log("OCR processing complete:", ocrResult);
    const { labValues } = ocrResult;

    // Use OCR-extracted age/gender if not provided in request body
    const extractedAge = labValues.age || (age ? parseInt(age) : null);
    const extractedGender = labValues.gender || gender || "M";

    console.log(`Using age: ${extractedAge}, gender: ${extractedGender}`);

    // If eGFR not found but we have creatinine and age, calculate it
    if (!labValues.eGFR && labValues.creatinine && extractedAge) {
      console.log('eGFR not found in OCR, calculating from creatinine...');
      labValues.eGFR = calculateEGFRFromCreatinine(
        labValues.creatinine,
        extractedAge,
        extractedGender
      );
      labValues.confidence.eGFR = "calculated";
    }

    // Validate that we have at least eGFR (extracted or calculated) or creatinine with age
    if (!labValues.eGFR && !(labValues.creatinine && extractedAge)) {
      console.error("No eGFR or creatinine found");
      try {
        fs.unlinkSync(filePath);
      } catch (e) {
        console.error("Error deleting file:", e);
      }
      return res.status(400).json({
        success: false,
        message: "Could not extract eGFR from the lab report. Please provide age if creatinine is available, or ensure the image is clear and readable.",
        extractedText: ocrResult.extractedText,
        extractedValues: labValues,
      });
    }

    // Determine CKD stage
    console.log(`Determining CKD stage for eGFR: ${labValues.eGFR}`);
    const ckdInfo = determineCKDStage(labValues.eGFR);
    console.log("CKD Info:", ckdInfo);

    // Create lab test record in MongoDB
    console.log("Creating MongoDB record...");
    const labTest = await LabTest.create({
      name,
      eGFR: labValues.eGFR,
      creatinine: labValues.creatinine,
      creatinineStatus: labValues.creatinineStatus || null,
      bun: labValues.bun,
      albumin: labValues.albumin,
      age: extractedAge,
      gender: extractedGender,
      ckdStage: ckdInfo.stage,
      stageDescription: ckdInfo.description,
      eGFRRange: ckdInfo.eGFRRange,
      imageFilename: req.file.filename,
      imagePath: filePath,
      extractionConfidence: labValues.confidence,
      ocrRawText: ocrResult.extractedText,
      age: labValues.age || (age ? parseInt(age) : null),
      gender: labValues.gender || gender || null,
      testMethod: "ocr",
    });

    console.log(`Lab test saved to MongoDB with ID: ${labTest._id}`);
    console.log(`Lab test saved for ${name} with eGFR: ${labValues.eGFR}, Stage: ${ckdInfo.stage}`);

    console.log("=== LAB REPORT UPLOAD COMPLETED SUCCESSFULLY ===\n");

    res.status(201).json({
      success: true,
      message: "Lab report processed successfully",
      labTest: labTest,
      extractionDetails: {
        eGFR: {
          value: labValues.eGFR,
          confidence: labValues.confidence.eGFR,
        },
        creatinine: {
          value: labValues.creatinine,
          confidence: labValues.confidence.creatinine,
          status: labValues.creatinineStatus,
        },
        bun: {
          value: labValues.bun,
          confidence: labValues.confidence.bun,
        },
        albumin: {
          value: labValues.albumin,
          confidence: labValues.confidence.albumin,
        },
      },
      ckdStageInfo: ckdInfo,
    });
  } catch (error) {
    console.error("\n=== ERROR IN LAB REPORT UPLOAD ===");
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);
    console.error("=== END ERROR ===\n");

    // Clean up uploaded file if it exists
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        console.log("Cleaned up uploaded file after error");
      } catch (cleanupError) {
        console.error("Error cleaning up file:", cleanupError);
      }
    }

    // Return detailed error
    res.status(500).json({
      success: false,
      message: "Error processing lab report",
      error: error.message,
    });
  }
};