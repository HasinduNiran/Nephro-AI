const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const { processLabReport, calculateEGFRFromCreatinine } = require("../utils/ocrProcessor");
const StageProgressionRecord = require("../models/StageProgressionRecord");

function buildLabPointFromRecord(record) {
  const labs = record?.inputs?.labs || {};
  return {
    creatinine: labs.creatinine ?? null,
    bun: labs.bun ?? null,
    egfr: labs.egfr ?? null,
    gfr: labs.egfr ?? null,
    albumin: labs.albumin ?? null,
    hemoglobin: labs.hemoglobin ?? null,
    potassium: null,
    sodium: null,
    anchor_age: record?.inputs?.age ?? null,
    urea: null,
  };
}

/**
 * Calculate eGFR using CKD-EPI formula if missing from lab report
 */
function calculateEGFRIfMissing(labData, age, gender) {
  // If eGFR is already available, return it
  if (labData.eGFR && labData.eGFR > 0) {
    return {
      eGFR: labData.eGFR,
      source: "extracted",
      method: "From lab report"
    };
  }

  // If creatinine and age/gender available, calculate eGFR
  if (labData.creatinine && age && gender) {
    const creatinine = parseFloat(labData.creatinine);
    const ageNum = parseInt(age);
    const genderStr = gender.toUpperCase();

    if (isNaN(creatinine) || isNaN(ageNum)) {
      return {
        eGFR: null,
        source: "missing",
        method: "Invalid age or creatinine"
      };
    }

    // CKD-EPI 2021 Formula
    const kappa = genderStr === "F" ? 0.7 : 0.9;
    const alpha = genderStr === "F" ? -0.241 : -0.302;
    const femaleCoeff = genderStr === "F" ? 1.012 : 1;

    const eGFR = 142 * Math.pow(creatinine / kappa, alpha) * Math.pow(0.9333, ageNum) * femaleCoeff;

    return {
      eGFR: Math.round(eGFR * 10) / 10,
      source: "calculated",
      method: `Calculated using CKD-EPI formula (${genderStr}, Age ${ageNum})`
    };
  }

  // Fallback: use default if creatinine available but age/gender missing
  if (labData.creatinine) {
    const eGFR = calculateEGFRFromCreatinine(
      parseFloat(labData.creatinine),
      40, // default age
      "M" // default gender
    );
    return {
      eGFR: eGFR,
      source: "default",
      method: "Calculated with default values (Age 40, Male)"
    };
  }

  return {
    eGFR: null,
    source: "missing",
    method: "No creatinine or eGFR available"
  };
}

/**
 * Predict CKD stage progression using uploaded images or manual values
 * Processes lab report image (optional if manual values provided) and ultrasound image (optional)
 */
exports.predictStageProgressionWithImages = async (req, res) => {
  const { name, age, gender, userEmail, creatinine, egfr, bun, albumin, hemoglobin } = req.body;

  let labReportFile = req.files?.labReport?.[0];
  let ultrasoundFile = req.files?.ultrasound?.[0];

  // If multer was configured with .any(), req.files is an array; pick by fieldname
  if (Array.isArray(req.files)) {
    const pick = (fields) => req.files.find((f) => fields.includes(f.fieldname));
    labReportFile = labReportFile || pick(["labReport", "lab_report", "lab", "report", "file", "labreport"]);
    ultrasoundFile = ultrasoundFile || pick(["ultrasound", "ultrasound_image", "us", "ultra", "scan", "ultrasoundreport"]);
  }

  // Validate that either lab report OR manual values are provided
  const hasLabReport = !!labReportFile;
  const hasManualValues = !!(creatinine || egfr);
  
  if (!hasLabReport && !hasManualValues) {
    return res.status(400).json({
      success: false,
      message: "Either lab report image or manual lab values (creatinine/eGFR) are required",
    });
  }

  try {
    console.log("🔬 Processing data for stage progression...");
    console.log("User Email:", userEmail || "Not provided");
    console.log("User Name:", name || "Not provided");
    if (labReportFile) {
      console.log("Lab report:", labReportFile.path);
    } else {
      console.log("Using manual lab values only");
    }
    console.log("Patient details - Age:", age, "Gender:", gender);
    console.log("Manual lab values:", { creatinine, egfr, bun, albumin, hemoglobin });
    if (ultrasoundFile) {
      console.log("Ultrasound:", ultrasoundFile.path);
    }

    // Step 1: Extract lab data from uploaded image using OCR (if provided)
    let labData = {};
    
    if (labReportFile) {
      console.log("📄 Extracting lab data from image...");
      try {
        const ocrResult = await processLabReport(labReportFile.path, {
          age: age ? parseInt(age) : null,
          gender: gender || "M",
        });
        labData = ocrResult.labValues || ocrResult;
        console.log("OCR extraction result:", labData);
      } catch (ocrError) {
        console.error("OCR extraction error:", ocrError);
        // Continue with empty labData if OCR fails but manual values provided
        if (!hasManualValues) {
          throw ocrError; // Only fail if no manual values as backup
        }
      }
    } else {
      console.log("Skipping OCR - using manual values only");
    }

    // Step 1.5: Use manual values if provided (override OCR)
    if (creatinine) {
      labData.creatinine = parseFloat(creatinine);
      console.log("Using manual creatinine:", creatinine);
    }
    if (egfr) {
      labData.eGFR = parseFloat(egfr);
      console.log("Using manual eGFR:", egfr);
    }
    if (bun) {
      labData.bun = parseFloat(bun);
      console.log("Using manual BUN:", bun);
    }
    if (albumin) {
      labData.albumin = parseFloat(albumin);
      console.log("Using manual albumin:", albumin);
    }
    if (hemoglobin) {
      labData.hemoglobin = parseFloat(hemoglobin);
      console.log("Using manual hemoglobin:", hemoglobin);
    }

    console.log("📊 Lab data after manual override:", labData);

    // Use extracted age/gender if not provided
    const finalAge = age || labData.age;
    const finalGender = gender || labData.gender || "M";

    // Step 1.6: Calculate eGFR if still missing
    const eGFRResult = calculateEGFRIfMissing(labData, finalAge, finalGender);
    if (!eGFRResult.eGFR) {
      // Clean up uploaded files if they exist
      if (labReportFile) fs.unlink(labReportFile.path, () => {});
      if (ultrasoundFile) fs.unlink(ultrasoundFile.path, () => {});

      return res.status(400).json({
        success: false,
        message: `Could not calculate eGFR: ${eGFRResult.method}. Please either: 1) Upload a clearer lab report image, 2) Provide manual lab values (expand Manual Lab Values section), or 3) Enter age, gender, and creatinine value.`,
        details: {
          creatinine: labData.creatinine,
          egfr: labData.eGFR,
          age: finalAge,
          gender: finalGender,
          method: eGFRResult.method,
        }
      });
    }

    // Merge eGFR calculation result with lab data
    const enrichedLabData = {
      ...labData,
      eGFR: eGFRResult.eGFR,
      eGFRSource: eGFRResult.source,
      eGFRMethod: eGFRResult.method,
    };

    console.log("✅ Lab data with eGFR:", enrichedLabData);

    // Step 2: Call prediction with lab data only (first prediction)
    const inputDataLabOnly = {
      lab_data: {
        creatinine: parseFloat(enrichedLabData.creatinine),
        bun: enrichedLabData.bun ? parseFloat(enrichedLabData.bun) : null,
        egfr: parseFloat(enrichedLabData.eGFR),
        gfr: parseFloat(enrichedLabData.eGFR),
        albumin: enrichedLabData.albumin ? parseFloat(enrichedLabData.albumin) : null,
        hemoglobin: enrichedLabData.hemoglobin ? parseFloat(enrichedLabData.hemoglobin) : null,
        potassium: enrichedLabData.potassium ? parseFloat(enrichedLabData.potassium) : null,
        sodium: enrichedLabData.sodium ? parseFloat(enrichedLabData.sodium) : null,
        anchor_age: finalAge ? parseFloat(finalAge) : null,
      },
    };

    console.log("🔬 Running prediction with lab data only...");
    const predictionLabOnly = await runPrediction(inputDataLabOnly);

    let predictionWithUS = null;

    // Step 3: If ultrasound is provided, process it and run combined prediction
    if (ultrasoundFile) {
      console.log("🔬 Processing ultrasound image...");
      
      try {
        // Call Python script to analyze ultrasound and extract measurements
        const ultrasoundData = await processUltrasoundImage(ultrasoundFile.path, name);

        if (ultrasoundData) {
          console.log("✅ Extracted ultrasound data:", ultrasoundData);

          const inputDataWithUS = {
            lab_data: inputDataLabOnly.lab_data,
            ultrasound_data: ultrasoundData,
          };

          console.log("🔬 Running prediction with lab + ultrasound data...");
          predictionWithUS = await runPrediction(inputDataWithUS);
        } else {
          console.warn("⚠️ Ultrasound processing returned no data");
        }
      } catch (usError) {
        console.error("❌ Error processing ultrasound:", usError.message);
        // Continue with lab-only prediction
      }
    } else {
      console.log("ℹ️ No ultrasound image provided - lab-only prediction");
    }

    // Clean up uploaded files if they exist
    if (labReportFile) fs.unlink(labReportFile.path, () => {});
    if (ultrasoundFile) fs.unlink(ultrasoundFile.path, () => {});

    const recordPayload = {
      userEmail: (userEmail || name || "unknown").toLowerCase().trim(),
      userName: name,
      inputs: {
        age: age ? parseInt(age) : null,
        gender: gender || null,
        labs: {
          creatinine: labData.creatinine ?? null,
          egfr: labData.eGFR ?? null,
          bun: labData.bun ?? null,
          albumin: labData.albumin ?? null,
          hemoglobin: labData.hemoglobin ?? null,
        },
        uploaded: {
          labReport: !!labReportFile,
          ultrasound: !!ultrasoundFile,
        },
      },
      prediction_lab_only: predictionLabOnly,
      prediction_with_us: predictionWithUS,
      eGFR_info: {
        value: enrichedLabData.eGFR,
        source: enrichedLabData.eGFRSource,
        method: enrichedLabData.eGFRMethod,
      },
      progression_to_next_stage: predictionWithUS?.next_stage_progression || predictionLabOnly?.next_stage_progression,
    };

    try {
      const savedRecord = await StageProgressionRecord.create(recordPayload);
      console.log("✅ Stage progression record saved to DB with ID:", savedRecord._id);
      console.log("📧 User Email stored:", savedRecord.userEmail);
    } catch (dbErr) {
      console.error("❌ Failed to save stage progression record to DB:", dbErr.message);
    }

    // Return both predictions with eGFR information and progression summaries
    return res.status(200).json({
      success: true,
      prediction_lab_only: predictionLabOnly,
      prediction_with_us: predictionWithUS,
      eGFR_info: {
        value: enrichedLabData.eGFR,
        source: enrichedLabData.eGFRSource,
        method: enrichedLabData.eGFRMethod,
      },
      summary_lab_only: formatProgressionSummary(predictionLabOnly, "Lab only"),
      summary_lab_and_ultrasound: formatProgressionSummary(predictionWithUS, "Lab + Ultrasound"),
      message: "Stage progression analysis completed successfully",
    });
  } catch (error) {
    console.error("Error in stage progression with images:", error);

    // Clean up uploaded files on error
    if (labReportFile) fs.unlink(labReportFile.path, () => {});
    if (ultrasoundFile) fs.unlink(ultrasoundFile.path, () => {});

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to process images and predict stage progression",
    });
  }
};

/**
 * Calculate probability of progressing to the next stage
 */
function calculateNextStageProgression(currentStage, stageProbabilities) {
  // Parse current stage (could be "2", "3.1", "3.2", etc.)
  const stageNum = parseFloat(currentStage);
  
  if (stageNum >= 5) {
    return {
      next_stage: null,
      probability: 0,
      probability_percentage: 0,
      message: "Already at final stage"
    };
  }

  // Determine next stage
  let nextStage;
  let nextProbability = 0;

  if (stageNum < 3) {
    nextStage = "3";
    // Sum probabilities for all stage 3 variants
    nextProbability = (stageProbabilities.stage_3 || 0) + 
                      (stageProbabilities['stage_3.1'] || 0) + 
                      (stageProbabilities['stage_3.2'] || 0);
  } else if (stageNum >= 3 && stageNum < 4) {
    nextStage = "4";
    nextProbability = stageProbabilities.stage_4 || 0;
  } else if (stageNum >= 4 && stageNum < 5) {
    nextStage = "5";
    nextProbability = stageProbabilities.stage_5 || 0;
  }

  return {
    next_stage: nextStage,
    probability: nextProbability,
    probability_percentage: (nextProbability * 100).toFixed(1),
    message: `${(nextProbability * 100).toFixed(1)}% chance of progressing to Stage ${nextStage}`
  };
}

function formatProgressionSummary(prediction, label) {
  if (!prediction) return null;

  const next = prediction.next_stage_progression || {};
  const prob = typeof next.probability === "number" ? next.probability : parseFloat(next.probability) || 0;

  return {
    source: label,
    current_stage: prediction.predicted_stage,
    next_stage: next.next_stage || null,
    progression_probability_6_months: `${(prob * 100).toFixed(1)}%`,
    progression_message: next.message || "No progression data",
  };
}

/**
 * Helper function to run LSTM prediction
 */
function runPrediction(inputData) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(
      __dirname,
      "..",
      "..",
      "ai-engine",
      "src",
      "ckd_stage",
      "stage_progression_predict.py"
    );

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
        return reject(new Error(errorString || "Prediction failed"));
      }

      try {
        const result = JSON.parse(dataString);

        if (!result.success) {
          return reject(new Error(result.error || "Prediction failed"));
        }

        // Calculate next stage progression
        const nextStageProgression = calculateNextStageProgression(
          result.current_stage,
          result.stage_probabilities
        );

        // Return prediction in standardized format
        resolve({
          predicted_stage: result.current_stage,
          confidence: result.confidence,
          stage_probabilities: result.stage_probabilities,
          progression_risk: result.overall_progression_risk,
          risk_level: result.overall_risk_level,
          used_ultrasound: result.used_ultrasound,
          egfr_value: result.egfr_value,
          next_stage_progression: nextStageProgression,
        });
      } catch (parseError) {
        console.error("Error parsing Python output:", parseError);
        reject(new Error("Error parsing prediction results"));
      }
    });

    pythonProcess.on("error", (err) => {
      console.error("Error starting Python process:", err);
      reject(new Error("Failed to start prediction process"));
    });
  });
}

exports.getStageProgressionHistory = async (req, res) => {
  try {
    const userEmail = (req.params.userEmail || "").toLowerCase();

    if (!userEmail) {
      return res.status(400).json({ success: false, message: "userEmail is required" });
    }

    console.log(`📧 Fetching stage progression history for user: ${userEmail}`);

    const records = await StageProgressionRecord.find({ userEmail })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    console.log(`✅ Found ${records.length} records for ${userEmail}`);

    return res.status(200).json({ 
      success: true, 
      userEmail: userEmail,
      recordCount: records.length,
      records 
    });
  } catch (error) {
    console.error("Error fetching stage progression history", error);
    return res.status(500).json({ success: false, message: "Failed to fetch history" });
  }
};

// Get future progression rate using the latest saved record for a user
exports.getFutureProgressionRate = async (req, res) => {
  try {
    const userEmail = (req.params.userEmail || "").toLowerCase();

    if (!userEmail) {
      return res.status(400).json({ success: false, message: "userEmail is required" });
    }

    console.log(`📈 Fetching future progression rate for user: ${userEmail}`);

    const records = await StageProgressionRecord.find({ userEmail })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    if (!records.length) {
      return res.status(404).json({ success: false, message: "No records found for this user" });
    }

    const latest = records[0];

    // Prefer combined (lab + US) if present, else lab-only
    const primaryPrediction = latest.prediction_with_us || latest.prediction_lab_only;
    const primarySource = latest.prediction_with_us ? "Lab + Ultrasound" : "Lab only";

    const progression =
      latest.progression_to_next_stage ||
      primaryPrediction?.next_stage_progression ||
      null;

    const probability = progression?.probability ?? 0;
    const probabilityPct = progression?.probability_percentage
      ? `${progression.probability_percentage}`
      : `${(probability * 100).toFixed(1)}`;

    const response = {
      success: true,
      userEmail,
      recordId: latest._id,
      recordDate: latest.createdAt,
      source: primarySource,
      current_stage: primaryPrediction?.predicted_stage || null,
      next_stage: progression?.next_stage || null,
      progression_probability_6_months: probabilityPct,
      progression_message: progression?.message || null,
      egfr_value: primaryPrediction?.egfr_value || latest.eGFR_info?.value || null,
    };

    // Also include a short history of recent progression probabilities
    response.recent_progression = records.map((r) => {
      const pred = r.prediction_with_us || r.prediction_lab_only || {};
      const prog = r.progression_to_next_stage || pred.next_stage_progression || {};
      const prob = prog?.probability ?? 0;
      const probPct = prog?.probability_percentage
        ? `${prog.probability_percentage}`
        : `${(prob * 100).toFixed(1)}`;
      return {
        recordId: r._id,
        date: r.createdAt,
        source: r.prediction_with_us ? "Lab + Ultrasound" : "Lab only",
        current_stage: pred.predicted_stage || null,
        next_stage: prog?.next_stage || null,
        progression_probability_6_months: probPct,
      };
    });

    return res.status(200).json(response);
  } catch (error) {
    console.error("Error fetching future progression rate", error);
    return res.status(500).json({ success: false, message: "Failed to fetch future progression rate" });
  }
};

// Get all saved stage progression records (admin/debug use)
exports.getAllStageProgressionHistory = async (_req, res) => {
  try {
    console.log("📊 Fetching all stage progression records...");

    const records = await StageProgressionRecord.find({})
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    // Get unique user emails
    const uniqueUsers = [...new Set(records.map(r => r.userEmail))];
    console.log(`✅ Found ${records.length} total records from ${uniqueUsers.length} unique users`);

    return res.status(200).json({ 
      success: true, 
      totalRecords: records.length,
      uniqueUsers: uniqueUsers.length,
      userEmails: uniqueUsers,
      records 
    });
  } catch (error) {
    console.error("Error fetching all stage progression history", error);
    return res.status(500).json({ success: false, message: "Failed to fetch history" });
  }
};

// Delete a specific stage progression record by ID (admin/debug)
exports.deleteStageProgressionRecord = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ success: false, message: "record id is required" });
    }

    const deleted = await StageProgressionRecord.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({ success: false, message: "Record not found" });
    }

    return res.status(200).json({ success: true, message: "Record deleted", id });
  } catch (error) {
    console.error("Error deleting stage progression record", error);
    return res.status(500).json({ success: false, message: "Failed to delete record" });
  }
};

/**
 * Helper function to process ultrasound image and extract measurements
 */
function processUltrasoundImage(imagePath, patientName) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(
      __dirname,
      "..",
      "..",
      "ai-engine",
      "src",
      "ckd_stage",
      "ultrasound_scan.py"
    );

    console.log("Calling ultrasound analysis script:", scriptPath);
    console.log("Image path:", imagePath);

    const pythonProcess = spawn("python", [scriptPath, imagePath]);

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
        console.error("Ultrasound analysis error:", errorString);
        console.error("Error output:", errorString);
        // Don't fail completely, just return null
        return resolve(null);
      }

      try {
        console.log("Ultrasound script output:", dataString);
        const result = JSON.parse(dataString);

        if (result.success) {
          const kidney_length = result.kidney_length_cm || null;
          const kidney_width = result.kidney_width_cm || null;

          // Map to fusion feature placeholders expected by the new model
          const area_px = kidney_length && kidney_width ? kidney_length * kidney_width : null;
          resolve({
            kidney_length,
            kidney_width,
            area_px,
            length_px: kidney_length,
            cortical_thickness: null,
            echogenicity: result.status === "normal" ? 1 : 2,
          });
        } else {
          console.warn("Ultrasound analysis failed:", result.error || "Unknown error");
          resolve(null);
        }
      } catch (parseError) {
        console.error("Error parsing ultrasound analysis output:", parseError);
        console.error("Raw output:", dataString);
        resolve(null);
      }
    });

    pythonProcess.on("error", (err) => {
      console.error("Error starting ultrasound analysis process:", err);
      resolve(null);
    });
  });
}

/**
 * Predict CKD stage progression using LSTM model
 * Accepts lab data and optional ultrasound data
 */
exports.predictStageProgression = async (req, res) => {
  const { lab_data, ultrasound_data, userEmail, userName } = req.body;

  // Validate that at least lab_data is provided
  if (!lab_data) {
    return res.status(400).json({
      success: false,
      message: "Lab data is required for stage progression prediction",
    });
  }

  const normalizedEmail = (userEmail || "").toLowerCase().trim() ||
    (Array.isArray(lab_data) && lab_data[0]?.userEmail ? String(lab_data[0].userEmail).toLowerCase().trim() : "");
  if (!normalizedEmail) {
    return res.status(400).json({ success: false, message: "userEmail is required" });
  }

  // Validate required lab parameters (creatinine and egfr or gfr)
  // Build sequence using history + current
  const priorRecords = await StageProgressionRecord.find({ userEmail: normalizedEmail })
    .sort({ createdAt: -1 })
    .limit(2)
    .lean();

  const normalizeLabPoint = (p) => ({
    creatinine: p.creatinine !== undefined && p.creatinine !== null ? parseFloat(p.creatinine) : null,
    bun: p.bun !== undefined && p.bun !== null ? parseFloat(p.bun) : null,
    egfr:
      p.egfr !== undefined && p.egfr !== null
        ? parseFloat(p.egfr)
        : p.gfr !== undefined && p.gfr !== null
          ? parseFloat(p.gfr)
          : null,
    gfr:
      p.egfr !== undefined && p.egfr !== null
        ? parseFloat(p.egfr)
        : p.gfr !== undefined && p.gfr !== null
          ? parseFloat(p.gfr)
          : null,
    albumin: p.albumin ? parseFloat(p.albumin) : null,
    hemoglobin: p.hemoglobin ? parseFloat(p.hemoglobin) : null,
    potassium: p.potassium ? parseFloat(p.potassium) : null,
    sodium: p.sodium ? parseFloat(p.sodium) : null,
    anchor_age: p.anchor_age ? parseFloat(p.anchor_age) : p.age ? parseFloat(p.age) : null,
    urea: p.urea ? parseFloat(p.urea) : null,
  });

  const priorLabPoints = priorRecords.map(buildLabPointFromRecord).reverse();

  let currentLabPoint;
  if (Array.isArray(lab_data)) {
    currentLabPoint = normalizeLabPoint(lab_data[lab_data.length - 1]);
  } else {
    currentLabPoint = normalizeLabPoint(lab_data);
  }

  const egfrValue = currentLabPoint.egfr ?? currentLabPoint.gfr;

  const missingFields = [];
  if (currentLabPoint.creatinine === null || currentLabPoint.creatinine === undefined) {
    missingFields.push("creatinine");
  }
  if (egfrValue === null || egfrValue === undefined) {
    missingFields.push("egfr (or gfr)");
  }

  if (missingFields.length > 0) {
    return res.status(400).json({
      success: false,
      message: `Missing required lab fields: ${missingFields.join(", ")}`,
    });
  }

  const labSequence = [...priorLabPoints, currentLabPoint].slice(-3);

  // Ultrasound sequence aligns in length; prior points are null
  const ultrasoundSequence = labSequence.map(() => null);
  if (ultrasound_data) {
    ultrasoundSequence[ultrasoundSequence.length - 1] = {
      left_kidney_length: ultrasound_data.left_kidney_length ? parseFloat(ultrasound_data.left_kidney_length) : null,
      right_kidney_length: ultrasound_data.right_kidney_length ? parseFloat(ultrasound_data.right_kidney_length) : null,
      left_cortical_thickness: ultrasound_data.left_cortical_thickness
        ? parseFloat(ultrasound_data.left_cortical_thickness)
        : null,
      right_cortical_thickness: ultrasound_data.right_cortical_thickness
        ? parseFloat(ultrasound_data.right_cortical_thickness)
        : null,
      echogenicity_score: ultrasound_data.echogenicity_score
        ? parseInt(ultrasound_data.echogenicity_score)
        : null,
      area_px: null,
      length_px: ultrasound_data.left_kidney_length ? parseFloat(ultrasound_data.left_kidney_length) : (ultrasound_data.right_kidney_length ? parseFloat(ultrasound_data.right_kidney_length) : null),
      kidney_length: ultrasound_data.left_kidney_length ? parseFloat(ultrasound_data.left_kidney_length) : null,
      kidney_width: ultrasound_data.kidney_width ? parseFloat(ultrasound_data.kidney_width) : null,
    };
  }

  const inputData = {
    lab_data: labSequence,
  };

  // Add ultrasound data if provided
  if (ultrasound_data) {
    inputData.ultrasound_data = ultrasoundSequence;
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

  pythonProcess.on("close", async (code) => {
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

      // Save record with submission index
      try {
        const priorCount = await StageProgressionRecord.countDocuments({ userEmail: normalizedEmail });
        await StageProgressionRecord.create({
          userEmail: normalizedEmail,
          userName: userName || null,
          submissionIndex: priorCount + 1,
          inputs: {
            age: currentLabPoint.anchor_age ? parseInt(currentLabPoint.anchor_age) : null,
            gender: currentLabPoint.gender || null,
            labs: {
              creatinine: currentLabPoint.creatinine ?? null,
              egfr: egfrValue ?? null,
              bun: currentLabPoint.bun ?? null,
              albumin: currentLabPoint.albumin ?? null,
              hemoglobin: currentLabPoint.hemoglobin ?? null,
            },
            uploaded: { labReport: false, ultrasound: !!ultrasound_data },
          },
          prediction_lab_only: result.used_ultrasound ? null : result,
          prediction_with_us: result.used_ultrasound ? result : null,
          eGFR_info: {
            value: result.egfr_value ?? null,
            source: result.used_ultrasound ? "fusion" : "lab_only",
            method: "model_input",
          },
          progression_to_next_stage: result.progression
            ? {
                next_stage: result.progression.next_stage,
                probability: result.progression.probability,
                probability_percentage: String(result.progression.probability_percentage),
                message: result.progression.risk_level,
              }
            : null,
        });
      } catch (dbErr) {
        console.error("Failed to save stage progression record", dbErr.message);
      }

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
