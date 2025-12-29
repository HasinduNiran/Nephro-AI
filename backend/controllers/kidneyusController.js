const { spawn } = require("child_process");
const path = require("path");
const KidneyScan = require("../models/KidneyScan");

// Kidney Ultrasound Analysis only
exports.analyzeKidneyUltrasound = async (req, res) => {
  const { imagePath, name } = req.body;

  if (!imagePath) {
    return res.status(400).json({ message: "Image path is required" });
  }

  if (!name) {
    return res.status(400).json({ message: "Name is required" });
  }

  // Path to ultrasound analysis script
  const scriptPath = path.join(__dirname, "..", "..", "ai-engine", "src", "ckd_stage", "ultrasound_scan.py");
  const pythonProcess = spawn("python", [scriptPath, imagePath]);

  let dataBuffer = ""; // Use a buffer to collect chunks

  pythonProcess.stdout.on("data", (data) => {
    dataBuffer += data.toString();
  });

  pythonProcess.stderr.on("data", (data) => {
    console.error(`Python Script Error: ${data}`);
  });

  pythonProcess.on("close", async (code) => {
    if (code !== 0) {
      return res.status(500).json({ message: "Python script failed", code });
    }

    try {
      // Clean the string of any accidental whitespace/newlines
      const result = JSON.parse(dataBuffer.trim());
      
      if (!result.success) {
        return res.status(400).json({ message: result.error, success: false });
      }

      // Save to MongoDB
      await KidneyScan.create({
        name,
        kidneyLengthCm: result.kidney_length_cm,
        kidneyWidthCm: result.kidney_width_cm,
        interpretation: result.interpretation,
        status: result.status,
        imagePath,
      });

      res.json(result);
    } catch (e) {
      console.error("JSON Parse Error. Raw Output was:", dataBuffer);
      res.status(500).json({ message: "Failed to parse AI output", raw: dataBuffer });
    }
  });
};

// Get all kidney scans
exports.getAllKidneyScans = async (req, res) => {
  try {
    const scans = await KidneyScan.find().sort({ createdAt: -1 });
    res.json({
      success: true,
      count: scans.length,
      data: scans
    });
  } catch (error) {
    console.error("Error fetching kidney scans:", error);
    res.status(500).json({ message: "Error fetching kidney scans", error: error.message });
  }
};

// Get kidney scans by patient name
exports.getKidneyScansByName = async (req, res) => {
  try {
    const { name } = req.params;
    const scans = await KidneyScan.find({ name: new RegExp(name, 'i') }).sort({ createdAt: -1 });
    
    if (scans.length === 0) {
      return res.status(404).json({ message: "No scans found for this patient" });
    }
    
    res.json({
      success: true,
      count: scans.length,
      patient: name,
      data: scans
    });
  } catch (error) {
    console.error("Error fetching kidney scans:", error);
    res.status(500).json({ message: "Error fetching kidney scans", error: error.message });
  }
};

// Get single kidney scan by ID
exports.getKidneyScanById = async (req, res) => {
  try {
    const { id } = req.params;
    const scan = await KidneyScan.findById(id);
    
    if (!scan) {
      return res.status(404).json({ message: "Scan not found" });
    }
    
    res.json({
      success: true,
      data: scan
    });
  } catch (error) {
    console.error("Error fetching kidney scan:", error);
    res.status(500).json({ message: "Error fetching kidney scan", error: error.message });
  }
};