const { spawn } = require("child_process");
const path = require("path");
const { predictRiskViaFastApi } = require("../utils/inferenceClient");

exports.predictRisk = async (req, res) => {
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

  const inputData = {
    bp_systolic: parseFloat(bp_systolic),
    bp_diastolic: parseFloat(bp_diastolic),
    age: parseFloat(age),
    gender: gender,
  };

  if (hba1c_level !== undefined && hba1c_level !== null) {
    inputData.hba1c_level = parseFloat(hba1c_level);
  } else if (diabetes !== undefined) {
    inputData.hba1c_level = diabetes ? 7.5 : 5.0;
  } else {
    inputData.hba1c_level = 5.0;
  }

  // Fast path: call persistent FastAPI inference service first
  const fastApiResult = await predictRiskViaFastApi(inputData);
  if (fastApiResult) {
    return res.json(fastApiResult);
  }

  // Fallback: spawn Python subprocess
  const scriptPath = path.join(
    __dirname,
    "..",
    "..",
    "ai-engine",
    "src",
    "risk_prediction",
    "api_predict.py"
  );

  console.log("Python Script Path:", scriptPath);
  const pythonProcess = spawn("python", [scriptPath, JSON.stringify(inputData)]);

  let dataString = "";
  let errorString = "";

  pythonProcess.stdout.on("data", (data) => { dataString += data.toString(); });
  pythonProcess.stderr.on("data", (data) => {
    errorString += data.toString();
    console.error("Python Stderr:", data.toString());
  });

  pythonProcess.on("close", (code) => {
    if (code !== 0) {
      return res.status(500).json({ message: "Error calculating risk", error: errorString });
    }
    try {
      const result = JSON.parse(dataString);
      if (result.error) return res.status(500).json({ message: result.error });
      res.json(result);
    } catch (e) {
      res.status(500).json({ message: "Error parsing prediction result" });
    }
  });
};
