const { spawn } = require("child_process");
const path = require("path");

exports.predictRisk = (req, res) => {
  const { bp_systolic, bp_diastolic, age, gender, diabetes, hba1c_level } =
    req.body;

  if (
    bp_systolic === undefined ||
    bp_diastolic === undefined ||
    age === undefined ||
    gender === undefined
  ) {
    return res.status(400).json({
      message:
        "Missing required fields: bp_systolic, bp_diastolic, age, and gender",
    });
  }

  // Prepare data for python script
  const inputData = {
    bp_systolic: parseFloat(bp_systolic),
    bp_diastolic: parseFloat(bp_diastolic),
    age: parseFloat(age),
    gender: gender, // 'Male' or 'Female'
  };

  // Handle hba1c_level
  if (hba1c_level !== undefined && hba1c_level !== null) {
    inputData.hba1c_level = parseFloat(hba1c_level);
  } else if (diabetes !== undefined) {
    // Convert boolean to estimated HbA1c level
    // Normal: ~5.0%, Diabetic: ~7.5%
    inputData.hba1c_level = diabetes ? 7.5 : 5.0;
  } else {
    inputData.hba1c_level = 5.0; // Default normal
  }

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

  // Debug paths
  console.log("Python Script Path:", scriptPath);
  console.log("Input Data:", JSON.stringify(inputData));

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
    console.error("Python Stderr:", data.toString()); // Log stderr directly
  });

  pythonProcess.on("close", (code) => {
    if (code !== 0) {
      console.error(`Python script exited with code ${code}`);
      console.error(`Stderr: ${errorString}`);
      return res.status(500).json({
        message: "Error calculating risk",
        error: errorString,
        path: scriptPath,
      });
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
