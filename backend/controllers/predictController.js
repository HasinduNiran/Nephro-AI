const { spawn } = require("child_process");
const path = require("path");
const KidneyScan = require("../models/KidneyScan");

exports.predictRisk = (req, res) => {
  const { spo2, heart_rate, bp_systolic, age, diabetes, hypertension } =
    req.body;

  if (
    spo2 === undefined ||
    heart_rate === undefined ||
    bp_systolic === undefined ||
    age === undefined
  ) {
    return res.status(400).json({ message: "Missing vital signs" });
  }

  // Prepare data for python script
  const inputData = {
    spo2: parseFloat(spo2),
    heart_rate: parseFloat(heart_rate),
    bp_systolic: parseFloat(bp_systolic),
    age: parseFloat(age),
    diabetes: diabetes ? 1 : 0,
    hypertension: hypertension ? 1 : 0,
  };

  // Path to python script. Assuming server.js is in backend/ and api_predict.py is in scripts/
  const scriptPath = path.join(
    __dirname,
    "..",
    "..",
    "ai-engine",
    "src",
    "risk_prediction",
    "api_predict.py"
  );

  // Spawn python process
  const pythonProcess = spawn("python", [
    scriptPath,
    JSON.stringify(inputData),
  ]);

  let dataString = "";
  let errorString = "";

  pythonProcess.stdout.on("data", (data) => {
    dataString += data.toString();
  });

  pythonProcess.stderr.on("data", (data) => {
    errorString += data.toString();
  });

  pythonProcess.on("close", (code) => {
    if (code !== 0) {
      console.error(`Python script exited with code ${code}`);
      console.error(`Stderr: ${errorString}`);
      return res
        .status(500)
        .json({ message: "Error calculating risk", error: errorString });
    }

    try {
      const result = JSON.parse(dataString);
      if (result.error) {
        return res.status(500).json({ message: result.error });
      }
      res.json(result);
    } catch (e) {
      console.error("Error parsing python output:", e);
      res.status(500).json({ message: "Error parsing prediction result" });
    }
  });
};

// Kidney Ultrasound Analysis
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