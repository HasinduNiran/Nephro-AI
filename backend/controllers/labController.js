const LabTest = require("../models/LabTest");

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
    const { name, eGFR, creatinine, bun, albumin } = req.body;

    // Validate required fields
    if (!name) {
      return res.status(400).json({ message: "Name is required" });
    }

    if (eGFR === undefined || eGFR === null) {
      return res.status(400).json({ message: "eGFR is required" });
    }

    if (eGFR < 0) {
      return res.status(400).json({ message: "eGFR must be a positive number" });
    }

    // Determine CKD stage
    const ckdInfo = determineCKDStage(eGFR);

    // Create lab test record
    const labTest = await LabTest.create({
      name,
      eGFR,
      creatinine: creatinine || null,
      bun: bun || null,
      albumin: albumin || null,
      ckdStage: ckdInfo.stage,
      stageDescription: ckdInfo.description,
      eGFRRange: ckdInfo.eGFRRange,
      kidneyFunctionPercent: ckdInfo.kidneyFunctionPercent,
    });

    res.status(201).json({
      success: true,
      message: "Lab test results saved successfully",
      data: labTest,
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
