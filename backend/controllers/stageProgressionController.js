const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const { processLabReport, calculateEGFRFromCreatinine } = require("../utils/ocrProcessor");
const StageProgressionRecord = require("../models/StageProgressionRecord");
const User = require("../models/User");
const {
  predictStageViaFastApi,
  analyzeUltrasoundViaFastApi,
} = require("../utils/inferenceClient");

function toGenderCode(gender) {
  if (!gender) return null;
  const g = String(gender).trim().toUpperCase();
  if (g === "M" || g === "MALE") return "M";
  if (g === "F" || g === "FEMALE") return "F";
  return g;
}

function calculateAgeFromBirthday(birthday) {
  if (!birthday) return null;
  const birthDate = new Date(birthday);
  if (Number.isNaN(birthDate.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

function normalizeVisitDate(value) {
  if (!value) return new Date();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function stageFromEgfr(egfr) {
  const v = parseFloat(egfr);
  if (Number.isNaN(v)) return "2";
  if (v >= 90) return "1";
  if (v >= 60) return "2";
  if (v >= 45) return "3.1";
  if (v >= 30) return "3.2";
  if (v >= 15) return "4";
  return "5";
}

function extractPredictedStage(record) {
  return (
    record?.prediction_with_us?.predicted_stage ||
    record?.prediction_with_us?.current_stage ||
    record?.prediction_lab_only?.predicted_stage ||
    record?.prediction_lab_only?.current_stage ||
    stageFromEgfr(record?.inputs?.labs?.egfr)
  );
}

async function resolveDemographics({ userEmail, ageInput, genderInput }) {
  let resolvedAge = ageInput !== undefined && ageInput !== null && ageInput !== ""
    ? parseInt(ageInput, 10)
    : null;
  let resolvedGender = toGenderCode(genderInput);

  if ((!resolvedAge || !resolvedGender) && userEmail) {
    const user = await User.findOne({ email: String(userEmail).toLowerCase().trim() }).lean();
    if (user) {
      if (!resolvedAge) {
        resolvedAge = calculateAgeFromBirthday(user.birthday);
      }
      if (!resolvedGender) {
        resolvedGender = toGenderCode(user.gender);
      }
    }
  }

  if (!resolvedGender) resolvedGender = "M";
  return { age: resolvedAge, gender: resolvedGender };
}

function buildLabPointFromRecord(record) {
  const labs = record?.inputs?.labs || {};
  const visitDate = record?.visitDate || record?.inputs?.visitDate || record?.createdAt || new Date();
  return {
    charttime: new Date(visitDate).toISOString(),
    creatinine: labs.creatinine ?? null,
    bun: labs.bun ?? null,
    egfr: labs.egfr ?? null,
    gfr: labs.egfr ?? null,
    albumin: labs.albumin ?? null,
    hemoglobin: labs.hemoglobin ?? null,
    potassium: null,
    sodium: null,
    age: record?.inputs?.age ?? null,
    anchor_age: record?.inputs?.age ?? null,
    gender: toGenderCode(record?.inputs?.gender) || "M",
    ckd_stage: extractPredictedStage(record),
    urea: null,
  };
}

function applyHistoryRequirementToPrediction(prediction, priorVisitCount) {
  if (!prediction) return prediction;
  if ((priorVisitCount || 0) > 0) return prediction;

  return {
    ...prediction,
    next_stage_progression: null,
    next_stage_progression_6_month: null,
    progression_by_stage: [],
    progression_by_stage_6_month: [],
    insufficient_history: true,
    history_note: "Progression probabilities require at least one prior visit.",
  };
}

function normalizeStageLabel(stage) {
  const raw = String(stage ?? "2")
    .toLowerCase()
    .replace("stage", "")
    .replace("g", "")
    .trim();

  if (["1"].includes(raw)) return "1";
  if (["2"].includes(raw)) return "2";
  if (["3", "3a", "3.0", "3.1"].includes(raw)) return "3.1";
  if (["3b", "3.2"].includes(raw)) return "3.2";
  if (["4"].includes(raw)) return "4";
  if (["5"].includes(raw)) return "5";

  const numeric = parseFloat(raw);
  if (Number.isNaN(numeric)) return "2";
  if (numeric < 2) return "1";
  if (numeric < 3) return "2";
  if (numeric < 3.2) return "3.1";
  if (numeric < 4) return "3.2";
  if (numeric < 5) return "4";
  return "5";
}

async function resequenceSubmissionIndicesForUser(userEmail) {
  const normalizedEmail = String(userEmail || "").toLowerCase().trim();
  if (!normalizedEmail) return 0;

  const userRecords = await StageProgressionRecord.find({ userEmail: normalizedEmail })
    .sort({ createdAt: 1, _id: 1 })
    .select("_id")
    .lean();

  if (!userRecords.length) return 0;

  const bulkOps = userRecords.map((record, index) => ({
    updateOne: {
      filter: { _id: record._id },
      update: { $set: { submissionIndex: index + 1 } },
    },
  }));

  if (bulkOps.length) {
    await StageProgressionRecord.bulkWrite(bulkOps);
  }

  return userRecords.length;
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
  const { name, age, gender, visitDate, userEmail, creatinine, egfr, bun, albumin, hemoglobin } = req.body;

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

    const demographics = await resolveDemographics({
      userEmail,
      ageInput: age || labData.age,
      genderInput: gender || labData.gender,
    });
    const finalAge = demographics.age;
    const finalGender = demographics.gender;
    const normalizedVisitDate = normalizeVisitDate(visitDate);

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
    const labHistoryPoint = {
      charttime: normalizedVisitDate.toISOString(),
        creatinine: parseFloat(enrichedLabData.creatinine),
        bun: enrichedLabData.bun ? parseFloat(enrichedLabData.bun) : null,
        egfr: parseFloat(enrichedLabData.eGFR),
        gfr: parseFloat(enrichedLabData.eGFR),
        albumin: enrichedLabData.albumin ? parseFloat(enrichedLabData.albumin) : null,
        hemoglobin: enrichedLabData.hemoglobin ? parseFloat(enrichedLabData.hemoglobin) : null,
        potassium: enrichedLabData.potassium ? parseFloat(enrichedLabData.potassium) : null,
        sodium: enrichedLabData.sodium ? parseFloat(enrichedLabData.sodium) : null,
      age: finalAge ? parseFloat(finalAge) : null,
      anchor_age: finalAge ? parseFloat(finalAge) : null,
      gender: finalGender,
      ckd_stage: stageFromEgfr(enrichedLabData.eGFR),
    };

    const normalizedEmailForHistory = (userEmail || name || "").toLowerCase().trim();
    let priorHistoryPoints = [];
    let priorRecordsRaw = [];
    if (normalizedEmailForHistory) {
      try {
        const priorRecords = await StageProgressionRecord.find({ userEmail: normalizedEmailForHistory })
          .sort({ createdAt: -1 })
          .limit(2)
          .lean();
        priorRecordsRaw = priorRecords;
        priorHistoryPoints = priorRecords.map(buildLabPointFromRecord).reverse();
      } catch (historyErr) {
        console.warn("Could not load prior history for upload flow:", historyErr.message);
      }
    }

    const historyWithCurrent = [...priorHistoryPoints, labHistoryPoint].slice(-3);

    const priorVisitCount = priorHistoryPoints.length;
    const currentVisitNumberEstimate = priorVisitCount + 1;
    const priorVisitNumbersUsed = [...priorRecordsRaw]
      .reverse()
      .map((record) => record?.submissionIndex)
      .filter((value) => Number.isFinite(Number(value)))
      .map((value) => Number(value));
    const visitNumbersUsed = [...priorVisitNumbersUsed, currentVisitNumberEstimate];

    const inputDataLabOnly = {
      history: historyWithCurrent,
    };

    console.log("🔬 Running prediction with lab data only...");
    const predictionLabOnlyRaw = await runPrediction(inputDataLabOnly);
    const predictionLabOnly = applyHistoryRequirementToPrediction(predictionLabOnlyRaw, priorVisitCount);

    const hasCurrentVisitUltrasound = !!ultrasoundFile;
    let predictionWithUS = null;
    let ultrasoundInfo = null;

    // Step 3: If ultrasound is provided, process it and run combined prediction
    let usedPriorUltrasoundFallback = false;
    let priorUltrasoundVisitNumber = null;

    if (ultrasoundFile) {
      console.log("🔬 Processing ultrasound image...");
      
      try {
        // Call Python script to analyze ultrasound and extract measurements
        const ultrasoundData = await processUltrasoundImage(ultrasoundFile.path, name);

        if (ultrasoundData) {
          console.log("✅ Extracted ultrasound data:", ultrasoundData);

          ultrasoundInfo = {
            kidney_length_cm: ultrasoundData.kidney_length ?? null,
            kidney_width_cm: ultrasoundData.kidney_width ?? null,
            area_px: ultrasoundData.area_px ?? null,
            length_px: ultrasoundData.length_px ?? null,
            echogenicity: ultrasoundData.echogenicity ?? null,
          };

          const inputDataWithUS = {
            history: [
              {
                ...historyWithCurrent[historyWithCurrent.length - 1],
                kidney_length: ultrasoundData.kidney_length ?? null,
                kidney_width: ultrasoundData.kidney_width ?? null,
                area_px: ultrasoundData.area_px ?? null,
                length_px: ultrasoundData.length_px ?? null,
                echogenicity_score: ultrasoundData.echogenicity ?? null,
              },
            ],
            ultrasound_data: ultrasoundData,
          };

          if (historyWithCurrent.length > 1) {
            inputDataWithUS.history = [
              ...historyWithCurrent.slice(0, historyWithCurrent.length - 1),
              inputDataWithUS.history[0],
            ];
          }

          console.log("🔬 Running prediction with lab + ultrasound data...");
          const predictionWithUSRaw = await runPrediction(inputDataWithUS);
          predictionWithUS = applyHistoryRequirementToPrediction(predictionWithUSRaw, priorVisitCount);
        } else {
          console.warn("⚠️ Ultrasound processing returned no data");
        }
      } catch (usError) {
        console.error("❌ Error processing ultrasound:", usError.message);
        // Continue with lab-only prediction
      }
    } else {
      console.log("ℹ️ No current-visit ultrasound image provided. Trying latest prior ultrasound for model input...");

      let latestPriorWithUltrasound = null;
      if (normalizedEmailForHistory) {
        latestPriorWithUltrasound = await StageProgressionRecord.findOne({
          userEmail: normalizedEmailForHistory,
          "ultrasound_info.kidney_length_cm": { $ne: null },
        })
          .sort({ createdAt: -1 })
          .lean();
      }

      if (latestPriorWithUltrasound) {
        try {
          usedPriorUltrasoundFallback = true;
          priorUltrasoundVisitNumber = Number.isFinite(Number(latestPriorWithUltrasound?.submissionIndex))
            ? Number(latestPriorWithUltrasound.submissionIndex)
            : null;

          const fallbackUS = {
            kidney_length: latestPriorWithUltrasound.ultrasound_info?.kidney_length_cm ?? null,
            kidney_width: latestPriorWithUltrasound.ultrasound_info?.kidney_width_cm ?? null,
            area_px: latestPriorWithUltrasound.ultrasound_info?.area_px ?? null,
            length_px: latestPriorWithUltrasound.ultrasound_info?.length_px ?? latestPriorWithUltrasound.ultrasound_info?.kidney_length_cm ?? null,
            echogenicity: latestPriorWithUltrasound.ultrasound_info?.echogenicity ?? null,
          };

          const inputDataWithUS = {
            history: [
              {
                ...historyWithCurrent[historyWithCurrent.length - 1],
                kidney_length: fallbackUS.kidney_length,
                kidney_width: fallbackUS.kidney_width,
                area_px: fallbackUS.area_px,
                length_px: fallbackUS.length_px,
                echogenicity_score: fallbackUS.echogenicity,
              },
            ],
            ultrasound_data: fallbackUS,
          };

          if (historyWithCurrent.length > 1) {
            inputDataWithUS.history = [
              ...historyWithCurrent.slice(0, historyWithCurrent.length - 1),
              inputDataWithUS.history[0],
            ];
          }

          console.log("🔬 Running prediction with lab + prior-visit ultrasound fallback data...");
          const predictionWithUSRaw = await runPrediction(inputDataWithUS);
          predictionWithUS = applyHistoryRequirementToPrediction(predictionWithUSRaw, priorVisitCount);
        } catch (fallbackErr) {
          console.error("❌ Failed to use prior ultrasound fallback:", fallbackErr.message);
        }
      } else {
        console.log("ℹ️ No prior ultrasound measurement found - lab-only prediction");
      }
    }

    // Clean up uploaded files if they exist
    if (labReportFile) fs.unlink(labReportFile.path, () => {});
    if (ultrasoundFile) fs.unlink(ultrasoundFile.path, () => {});

    const recordUserEmail = (normalizedEmailForHistory || "unknown").toLowerCase().trim();

    const recordPayload = {
      userEmail: recordUserEmail,
      userName: name,
      visitDate: normalizedVisitDate,
      inputs: {
        visitDate: normalizedVisitDate,
        age: finalAge ? parseInt(finalAge, 10) : null,
        gender: finalGender || null,
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
      ultrasound_info: ultrasoundInfo,
      current_visit_ultrasound_uploaded: hasCurrentVisitUltrasound,
      eGFR_info: {
        value: enrichedLabData.eGFR,
        source: enrichedLabData.eGFRSource,
        method: enrichedLabData.eGFRMethod,
      },
      progression_to_next_stage: predictionWithUS?.next_stage_progression || predictionLabOnly?.next_stage_progression || null,
      progression_to_next_stage_6_month: predictionWithUS?.next_stage_progression_6_month || predictionLabOnly?.next_stage_progression_6_month || null,
      progression_by_stage: predictionWithUS?.progression_by_stage || predictionLabOnly?.progression_by_stage || [],
      progression_by_stage_6_month: predictionWithUS?.progression_by_stage_6_month || predictionLabOnly?.progression_by_stage_6_month || [],
      prediction_context: {
        visit_numbers_used: visitNumbersUsed,
        current_visit_number: currentVisitNumberEstimate,
        history_rule: "Trend uses prior visits + current visit (e.g., Visit 1 + Visit 2 + Visit 3).",
        current_visit_ultrasound_uploaded: hasCurrentVisitUltrasound,
        used_prior_ultrasound_fallback: usedPriorUltrasoundFallback,
        prior_ultrasound_visit_number: priorUltrasoundVisitNumber,
      },
    };

    let savedSubmissionIndex = null;
    try {
      const priorCount = await StageProgressionRecord.countDocuments({ userEmail: recordUserEmail });
      const savedRecord = await StageProgressionRecord.create({
        ...recordPayload,
        submissionIndex: priorCount + 1,
      });
      savedSubmissionIndex = savedRecord.submissionIndex || null;
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
      ultrasound_info: ultrasoundInfo,
      current_visit_ultrasound_uploaded: hasCurrentVisitUltrasound,
      eGFR_info: {
        value: enrichedLabData.eGFR,
        source: enrichedLabData.eGFRSource,
        method: enrichedLabData.eGFRMethod,
      },
      summary_lab_only: formatProgressionSummary(predictionLabOnly, "Lab only"),
      summary_lab_and_ultrasound: formatProgressionSummary(predictionWithUS, "Lab + Ultrasound"),
      progression_by_stage_lab_only: predictionLabOnly?.progression_by_stage || [],
      progression_by_stage_with_us: predictionWithUS?.progression_by_stage || [],
      progression_by_stage_6_month_lab_only: predictionLabOnly?.progression_by_stage_6_month || [],
      progression_by_stage_6_month_with_us: predictionWithUS?.progression_by_stage_6_month || [],
      insufficient_history: priorVisitCount === 0,
      submissionIndex: savedSubmissionIndex,
      prediction_context: {
        visit_numbers_used: visitNumbersUsed,
        current_visit_number: currentVisitNumberEstimate,
        history_rule: "Trend uses prior visits + current visit (e.g., Visit 1 + Visit 2 + Visit 3).",
        current_visit_ultrasound_uploaded: hasCurrentVisitUltrasound,
        used_prior_ultrasound_fallback: usedPriorUltrasoundFallback,
        prior_ultrasound_visit_number: priorUltrasoundVisitNumber,
      },
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
  const probs = stageProbabilities || {};

  const order = ["1", "2", "3.1", "3.2", "4", "5"];
  const stageKeyByLabel = {
    "1": "stage_1",
    "2": "stage_2",
    "3.1": "stage_3.1",
    "3.2": "stage_3.2",
    "4": "stage_4",
    "5": "stage_5",
  };

  const normalizedCurrent = normalizeStageLabel(currentStage);
  const currentIdx = order.indexOf(normalizedCurrent);

  if (currentIdx < 0 || currentIdx >= order.length - 1) {
    return {
      next_stage: null,
      probability: 0,
      probability_percentage: 0,
      any_decline_probability: 0,
      any_decline_percentage: "0.0",
      message: "Already at final stage",
    };
  }

  const nextStage = order[currentIdx + 1];
  const nextKey = stageKeyByLabel[nextStage];
  const nextProbability = Number(probs[nextKey] || 0);

  const anyDeclineProbability = order
    .slice(currentIdx + 1)
    .reduce((sum, label) => sum + Number(probs[stageKeyByLabel[label]] || 0), 0);

  return {
    next_stage: nextStage,
    probability: nextProbability,
    probability_percentage: (nextProbability * 100).toFixed(1),
    any_decline_probability: anyDeclineProbability,
    any_decline_percentage: (anyDeclineProbability * 100).toFixed(1),
    message: `${(nextProbability * 100).toFixed(1)}% chance of progressing to Stage ${nextStage}`,
  };
}

function normalizeStageProbabilities(probabilities) {
  const source = probabilities || {};
  const out = {
    stage_1: 0,
    stage_2: 0,
    stage_3: 0,
    "stage_3.1": 0,
    "stage_3.2": 0,
    stage_4: 0,
    stage_5: 0,
  };

  const put = (key, value) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return;
    if (Object.prototype.hasOwnProperty.call(out, key)) out[key] = num;
  };

  for (const [rawKey, value] of Object.entries(source)) {
    const key = String(rawKey).trim().toLowerCase();
    const compact = key.replace(/\s+/g, "").replace("stage", "");

    if (key === "stage_1" || key === "1" || key === "g1" || compact === "g1") put("stage_1", value);
    else if (key === "stage_2" || key === "2" || key === "g2" || compact === "g2") put("stage_2", value);
    else if (key === "stage_3" || key === "3" || key === "g3" || compact === "g3") put("stage_3", value);
    else if (
      key === "stage_3.1" || key === "3.1" || key === "3a" || key === "g3a" ||
      compact === "3.1" || compact === "3a" || compact === "g3a"
    ) put("stage_3.1", value);
    else if (
      key === "stage_3.2" || key === "3.2" || key === "3b" || key === "g3b" ||
      compact === "3.2" || compact === "3b" || compact === "g3b"
    ) put("stage_3.2", value);
    else if (key === "stage_4" || key === "4" || key === "g4" || compact === "g4") put("stage_4", value);
    else if (key === "stage_5" || key === "5" || key === "g5" || compact === "g5") put("stage_5", value);
  }

  if (out.stage_3 === 0 && (out["stage_3.1"] > 0 || out["stage_3.2"] > 0)) {
    out.stage_3 = out["stage_3.1"] + out["stage_3.2"];
  }
  if (out["stage_3.1"] === 0 && out["stage_3.2"] === 0 && out.stage_3 > 0) {
    out["stage_3.1"] = out.stage_3 * 0.5;
    out["stage_3.2"] = out.stage_3 * 0.5;
  }

  return out;
}

function buildProgressionBreakdown(currentStage, stageProbabilities) {
  const probs = stageProbabilities || {};
  const order = ["1", "2", "3.1", "3.2", "4", "5"];
  const stageKeyByLabel = {
    "1": "stage_1",
    "2": "stage_2",
    "3.1": "stage_3.1",
    "3.2": "stage_3.2",
    "4": "stage_4",
    "5": "stage_5",
  };
  const displayByLabel = {
    "1": "G1",
    "2": "G2",
    "3.1": "G3a",
    "3.2": "G3b",
    "4": "G4",
    "5": "G5",
  };

  const normalizedCurrent = normalizeStageLabel(currentStage);

  const currentIdx = order.indexOf(normalizedCurrent);
  const startIdx = currentIdx >= 0 ? currentIdx + 1 : 0;

  return order.slice(startIdx).map((label) => {
    const key = stageKeyByLabel[label];
    const probability = Number(probs[key] || 0);
    return {
      stage: label,
      stage_display: displayByLabel[label],
      probability,
      probability_percentage: Number((probability * 100).toFixed(1)),
    };
  });
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
function mapPredictionResult(result) {
  const nextVisitStageProbabilities = normalizeStageProbabilities(
    result.next_visit_stage_probabilities || result.stage_probabilities
  );
  const sixMonthStageProbabilities = normalizeStageProbabilities(
    result.six_month_stage_probabilities || result.stage_probabilities
  );

  const currentStage =
    result.current_stage ||
    result.predicted_stage ||
    result.stage ||
    "2";

  const nextStageProgression = calculateNextStageProgression(
    currentStage,
    nextVisitStageProbabilities
  );
  const nextStageProgression6Month = calculateNextStageProgression(
    currentStage,
    sixMonthStageProbabilities
  );
  const progressionByStage = buildProgressionBreakdown(
    currentStage,
    nextVisitStageProbabilities
  );
  const progressionByStage6Month = buildProgressionBreakdown(
    currentStage,
    sixMonthStageProbabilities
  );

  return {
    predicted_stage: currentStage,
    confidence: result.confidence ?? 0,
    uncertainty: result.uncertainty ?? null,
    stage_probabilities: nextVisitStageProbabilities,
    next_visit_stage_probabilities: nextVisitStageProbabilities,
    six_month_stage_probabilities: sixMonthStageProbabilities,
    progression_by_stage: progressionByStage,
    progression_by_stage_6_month: progressionByStage6Month,
    progression_risk: result.overall_progression_risk,
    risk_level: result.overall_risk_level,
    prediction_quality: result.prediction_quality || null,
    trend_adjustment: result.trend_adjustment || null,
    calibration: result.calibration || null,
    used_ultrasound: result.used_ultrasound,
    egfr_value: result.egfr_value,
    next_stage_progression: nextStageProgression,
    next_stage_progression_6_month: nextStageProgression6Month,
  };
}

async function runPrediction(inputData) {
  const fastApiResult = await predictStageViaFastApi(inputData);
  if (fastApiResult?.success) {
    return mapPredictionResult(fastApiResult);
  }

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

    const pythonProcess = spawn("python3",[
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
      try {
        const raw = (dataString || "").trim();
        const result = raw ? JSON.parse(raw) : null;

        if (code !== 0) {
          const detailedError = (result && result.error)
            ? result.error
            : (errorString || "Prediction failed");
          console.error("Python script error:", detailedError);
          return reject(new Error(detailedError));
        }

        if (!result) {
          return reject(new Error(errorString || "Prediction failed: empty Python output"));
        }

        if (!result.success) {
          return reject(new Error(result.error || "Prediction failed"));
        }

        resolve(mapPredictionResult(result));
      } catch (parseError) {
        console.error("Error parsing Python output:", parseError);
        const fallback = (errorString || dataString || "Error parsing prediction results").toString().trim();
        reject(new Error(fallback || "Error parsing prediction results"));
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

    const remainingCount = await resequenceSubmissionIndicesForUser(deleted.userEmail);

    return res.status(200).json({
      success: true,
      message: "Record deleted and visit numbers updated",
      id,
      userEmail: deleted.userEmail,
      remainingCount,
    });
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
    analyzeUltrasoundViaFastApi(imagePath)
      .then((fastApiResult) => {
        if (fastApiResult?.success) {
          const kidney_length = fastApiResult.kidney_length_cm || null;
          const kidney_width = fastApiResult.kidney_width_cm || null;
          const area_px = kidney_length && kidney_width ? kidney_length * kidney_width : null;
          return resolve({
            kidney_length,
            kidney_width,
            area_px,
            length_px: kidney_length,
            cortical_thickness: null,
            echogenicity: fastApiResult.status === "normal" ? 1 : 2,
          });
        }

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

        const pythonProcess = spawn("python3",[scriptPath, imagePath]);

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
            return resolve(null);
          }

          try {
            console.log("Ultrasound script output:", dataString);
            const result = JSON.parse(dataString);

            if (result.success) {
              const kidney_length = result.kidney_length_cm || null;
              const kidney_width = result.kidney_width_cm || null;

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

        return null;
      })
      .catch(() => {
        resolve(null);
      });

    return;

  });
}

/**
 * Predict CKD stage progression using LSTM model
 * Accepts lab data and optional ultrasound data
 */
exports.predictStageProgression = async (req, res) => {
  const { lab_data, ultrasound_data, userEmail, userName, age, gender, visitDate } = req.body;

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

  const normalizeLabPoint = (p, fallbackDate, fallbackAge, fallbackGender) => ({
    charttime: p.charttime || p.date || p.visitDate || fallbackDate.toISOString(),
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
    age: p.age ? parseFloat(p.age) : (fallbackAge ? parseFloat(fallbackAge) : null),
    anchor_age: p.anchor_age ? parseFloat(p.anchor_age) : p.age ? parseFloat(p.age) : (fallbackAge ? parseFloat(fallbackAge) : null),
    gender: toGenderCode(p.gender) || fallbackGender || "M",
    ckd_stage: p.ckd_stage || stageFromEgfr(p.egfr ?? p.gfr),
    urea: p.urea ? parseFloat(p.urea) : null,
  });

  const normalizedVisitDate = normalizeVisitDate(visitDate);
  const demographics = await resolveDemographics({ userEmail: normalizedEmail, ageInput: age, genderInput: gender });

  const priorLabPoints = priorRecords.map(buildLabPointFromRecord).reverse();

  let currentLabPoint;
  if (Array.isArray(lab_data)) {
    currentLabPoint = normalizeLabPoint(
      lab_data[lab_data.length - 1],
      normalizedVisitDate,
      demographics.age,
      demographics.gender
    );
  } else {
    currentLabPoint = normalizeLabPoint(
      lab_data,
      normalizedVisitDate,
      demographics.age,
      demographics.gender
    );
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

  const historySequence = [...priorLabPoints, currentLabPoint].slice(-3);

  // Ultrasound sequence aligns in length; prior points are null
  const ultrasoundSequence = historySequence.map(() => null);
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
    history: historySequence,
  };

  // Add ultrasound data if provided
  if (ultrasound_data) {
    inputData.ultrasound_data = ultrasoundSequence;
    const lastIndex = inputData.history.length - 1;
    inputData.history[lastIndex] = {
      ...inputData.history[lastIndex],
      kidney_length: ultrasoundSequence[lastIndex]?.kidney_length ?? null,
      kidney_width: ultrasoundSequence[lastIndex]?.kidney_width ?? null,
      area_px: ultrasoundSequence[lastIndex]?.area_px ?? null,
      length_px: ultrasoundSequence[lastIndex]?.length_px ?? null,
      echogenicity_score: ultrasoundSequence[lastIndex]?.echogenicity_score ?? null,
    };
  }

  console.log("🔬 Starting LSTM Stage Progression Prediction...");
  console.log("Input data:", JSON.stringify(inputData, null, 2));
  try {
    const result = await runPrediction(inputData);
    console.log("Prediction successful:", result);

    const nextVisitStageProbabilities = result.next_visit_stage_probabilities;
    const sixMonthStageProbabilities = result.six_month_stage_probabilities;
    const currentStage = result.predicted_stage || "2";
    const hasPriorHistory = priorRecords.length > 0;
    const nextStageProgression = hasPriorHistory ? result.next_stage_progression : null;
    const nextStageProgression6Month = hasPriorHistory ? result.next_stage_progression_6_month : null;
    const progressionByStage = hasPriorHistory ? result.progression_by_stage : [];
    const progressionByStage6Month = hasPriorHistory ? result.progression_by_stage_6_month : [];

    let savedSubmissionIndex = null;

    // Save record with submission index
    try {
      const priorCount = await StageProgressionRecord.countDocuments({ userEmail: normalizedEmail });
      const savedRecord = await StageProgressionRecord.create({
        userEmail: normalizedEmail,
        userName: userName || null,
        visitDate: normalizedVisitDate,
        submissionIndex: priorCount + 1,
        inputs: {
          visitDate: normalizedVisitDate,
          age: currentLabPoint.anchor_age ? parseInt(currentLabPoint.anchor_age, 10) : null,
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
        progression_to_next_stage: {
          next_stage: nextStageProgression?.next_stage || null,
          probability: nextStageProgression?.probability ?? null,
          probability_percentage:
            nextStageProgression?.probability_percentage !== undefined && nextStageProgression?.probability_percentage !== null
              ? String(nextStageProgression.probability_percentage)
              : null,
          message: nextStageProgression?.message || "Progression probabilities require at least one prior visit.",
        },
        progression_to_next_stage_6_month: {
          next_stage: nextStageProgression6Month?.next_stage || null,
          probability: nextStageProgression6Month?.probability ?? null,
          probability_percentage:
            nextStageProgression6Month?.probability_percentage !== undefined && nextStageProgression6Month?.probability_percentage !== null
              ? String(nextStageProgression6Month.probability_percentage)
              : null,
          message: nextStageProgression6Month?.message || "Progression probabilities require at least one prior visit.",
        },
        progression_by_stage: progressionByStage,
        progression_by_stage_6_month: progressionByStage6Month,
      });
      savedSubmissionIndex = savedRecord?.submissionIndex || null;
    } catch (dbErr) {
      console.error("Failed to save stage progression record", dbErr.message);
    }

    return res.status(200).json({
      success: true,
      current_stage: currentStage,
      confidence: result.confidence ?? 0,
      uncertainty: result.uncertainty ?? null,
      stage_probabilities: nextVisitStageProbabilities,
      next_visit_stage_probabilities: nextVisitStageProbabilities,
      six_month_stage_probabilities: sixMonthStageProbabilities,
      progression: nextStageProgression,
      progression_6_month: nextStageProgression6Month,
      progression_by_stage: progressionByStage,
      progression_by_stage_6_month: progressionByStage6Month,
      overall_progression_risk: result.progression_risk,
      overall_risk_level: result.risk_level,
      prediction_quality: result.prediction_quality || null,
      trend_adjustment: result.trend_adjustment || null,
      calibration: result.calibration || null,
      used_ultrasound: result.used_ultrasound,
      insufficient_history: !hasPriorHistory,
      submissionIndex: savedSubmissionIndex,
      egfr_value: result.egfr_value,
      message: !hasPriorHistory
        ? `Current CKD Stage ${currentStage} - progression probabilities will be available after at least one prior visit`
        : `Current CKD Stage ${currentStage}${nextStageProgression && nextStageProgression.next_stage ? ` - ${nextStageProgression.probability_percentage}% chance of progressing to Stage ${nextStageProgression.next_stage}` : ""}`,
    });
  } catch (error) {
    console.error("Prediction error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to predict stage progression",
      error: error.message,
    });
  }
};
