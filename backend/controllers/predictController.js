const { spawn } = require("child_process");
const path = require("path");

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
