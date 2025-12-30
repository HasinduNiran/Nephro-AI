const { spawn } = require("child_process");
const path = require("path");

/**
 * Predict CKD stage progression using LSTM model
 * Accepts lab data and optional ultrasound data
 */
exports.predictStageProgression = (req, res) => {
  const { lab_data, ultrasound_data } = req.body;

  // Validate that at least lab_data is provided
  if (!lab_data) {
    return res.status(400).json({
      success: false,
      message: "Lab data is required for stage progression prediction",
    });
  }

  // Validate required lab parameters (creatinine and egfr or gfr)
  const egfrValue =
    lab_data.egfr !== undefined && lab_data.egfr !== null
      ? lab_data.egfr
      : lab_data.gfr;

  const missingFields = [];
  if (lab_data.creatinine === undefined || lab_data.creatinine === null) {
    missingFields.push("creatinine");
  }
  if (egfrValue === undefined || egfrValue === null) {
    missingFields.push("egfr (or gfr)");
  }

  if (missingFields.length > 0) {
    return res.status(400).json({
      success: false,
      message: `Missing required lab fields: ${missingFields.join(", ")}`,
    });
  }

  // Prepare input data for Python script
  const inputData = {
    lab_data: {
      creatinine: parseFloat(lab_data.creatinine),
      bun: lab_data.bun !== undefined ? parseFloat(lab_data.bun) : null,
      egfr:
        egfrValue !== undefined && egfrValue !== null
          ? parseFloat(egfrValue)
          : null,
      gfr:
        egfrValue !== undefined && egfrValue !== null
          ? parseFloat(egfrValue)
          : null,
      albumin: lab_data.albumin ? parseFloat(lab_data.albumin) : null,
      hemoglobin: lab_data.hemoglobin ? parseFloat(lab_data.hemoglobin) : null,
      potassium: lab_data.potassium ? parseFloat(lab_data.potassium) : null,
      sodium: lab_data.sodium ? parseFloat(lab_data.sodium) : null,
    },
  };

  // Add ultrasound data if provided
  if (ultrasound_data) {
    inputData.ultrasound_data = {
      left_kidney_length: ultrasound_data.left_kidney_length
        ? parseFloat(ultrasound_data.left_kidney_length)
        : null,
      right_kidney_length: ultrasound_data.right_kidney_length
        ? parseFloat(ultrasound_data.right_kidney_length)
        : null,
      left_cortical_thickness: ultrasound_data.left_cortical_thickness
        ? parseFloat(ultrasound_data.left_cortical_thickness)
        : null,
      right_cortical_thickness: ultrasound_data.right_cortical_thickness
        ? parseFloat(ultrasound_data.right_cortical_thickness)
        : null,
      echogenicity_score: ultrasound_data.echogenicity_score
        ? parseInt(ultrasound_data.echogenicity_score)
        : null,
    };
  }

  // Path to Python script
  const scriptPath = path.join(
    __dirname,
    "..",
    "..",
    "ai-engine",
    "src",
    "ckd_stage",
    "stage_progression_predict.py"
  );

  console.log("🔬 Starting LSTM Stage Progression Prediction...");
  console.log("Input data:", JSON.stringify(inputData, null, 2));

  // Spawn Python process
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
      console.error("Python script error:", errorString);
      return res.status(500).json({
        success: false,
        message: "Failed to predict stage progression",
        error: errorString,
      });
    }

    try {
      const result = JSON.parse(dataString);
      console.log("Prediction successful:", result);

      if (!result.success) {
        return res.status(500).json({
          success: false,
          message: result.error || "Prediction failed",
        });
      }

      // Return prediction results with progression info
      return res.status(200).json({
        success: true,
        current_stage: result.current_stage,
        confidence: result.confidence,
        stage_probabilities: result.stage_probabilities,
        progression: result.progression,
        overall_progression_risk: result.overall_progression_risk,
        overall_risk_level: result.overall_risk_level,
        used_ultrasound: result.used_ultrasound,
        egfr_value: result.egfr_value,
        message: `Current CKD Stage ${result.current_stage}${result.progression && result.progression.next_stage ? ` - ${result.progression.probability_percentage}% chance of progressing to Stage ${result.progression.next_stage}` : ''}`,
      });
    } catch (parseError) {
      console.error("Error parsing Python output:", parseError);
      console.error("Raw output:", dataString);
      return res.status(500).json({
        success: false,
        message: "Error parsing prediction results",
        error: parseError.message,
      });
    }
  });

  pythonProcess.on("error", (err) => {
    console.error("Error starting Python process:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to start prediction process",
      error: err.message,
    });
  });
};
