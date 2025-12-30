const RiskRecord = require("../models/RiskRecord");

/**
 * Calculate linear regression (y = mx + c) from risk records
 * Returns slope (m), intercept (c), and trend analysis
 */
const calculateLinearRegression = (records) => {
  if (records.length < 2) {
    return {
      slope: 0,
      intercept: records.length === 1 ? records[0].riskScore : 0,
      trend: "insufficient_data",
      trendDescription: "Need at least 2 months of data for trend analysis",
    };
  }

  const n = records.length;

  // Convert records to x (month index) and y (risk score)
  // Sort by date first
  const sortedRecords = [...records].sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.month - b.month;
  });

  // X values: 0, 1, 2, 3... (month index from start)
  // Y values: risk scores
  const data = sortedRecords.map((record, index) => ({
    x: index,
    y: record.riskScore,
    month: record.month,
    year: record.year,
  }));

  // Calculate means
  const sumX = data.reduce((sum, point) => sum + point.x, 0);
  const sumY = data.reduce((sum, point) => sum + point.y, 0);
  const meanX = sumX / n;
  const meanY = sumY / n;

  // Calculate slope (m) and intercept (c)
  // m = Σ((xi - meanX) * (yi - meanY)) / Σ((xi - meanX)²)
  let numerator = 0;
  let denominator = 0;

  for (const point of data) {
    numerator += (point.x - meanX) * (point.y - meanY);
    denominator += (point.x - meanX) * (point.x - meanX);
  }

  const slope = denominator !== 0 ? numerator / denominator : 0;
  const intercept = meanY - slope * meanX;

  // Determine trend based on slope
  let trend, trendDescription;
  const slopeThreshold = 0.5; // Small threshold to account for minor fluctuations

  if (slope > slopeThreshold) {
    trend = "increasing";
    trendDescription = "⚠️ Risk is INCREASING over time. Please consult your doctor.";
  } else if (slope < -slopeThreshold) {
    trend = "decreasing";
    trendDescription = "✅ Risk is DECREASING over time. Keep up the good work!";
  } else {
    trend = "steady";
    trendDescription = "➡️ Risk is STEADY. Continue monitoring regularly.";
  }

  // Generate predicted line points for the graph
  const regressionLine = data.map((point) => ({
    x: point.x,
    y: slope * point.x + intercept,
    month: point.month,
    year: point.year,
  }));

  return {
    slope: parseFloat(slope.toFixed(4)),
    intercept: parseFloat(intercept.toFixed(4)),
    trend,
    trendDescription,
    regressionLine,
    dataPoints: data,
    equation: `y = ${slope.toFixed(2)}x + ${intercept.toFixed(2)}`,
  };
};

/**
 * Save a new risk record for the current month
 */
exports.saveRiskRecord = async (req, res) => {
  try {
    const { userId, riskLevel, riskScore, vitalSigns } = req.body;

    if (!userId || !riskLevel || riskScore === undefined) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const now = new Date();
    const month = now.getMonth() + 1; // JavaScript months are 0-indexed
    const year = now.getFullYear();

    // Check if record exists for this month
    const existingRecord = await RiskRecord.findOne({ userId, month, year });

    if (existingRecord) {
      // Update existing record
      existingRecord.riskLevel = riskLevel;
      existingRecord.riskScore = riskScore;
      existingRecord.vitalSigns = vitalSigns;
      existingRecord.recordDate = now;
      await existingRecord.save();

      return res.json({
        message: "Risk record updated for this month",
        record: existingRecord,
        isUpdate: true,
      });
    }

    // Create new record
    const newRecord = new RiskRecord({
      userId,
      riskLevel,
      riskScore,
      vitalSigns,
      month,
      year,
      recordDate: now,
    });

    await newRecord.save();

    res.status(201).json({
      message: "Risk record saved successfully",
      record: newRecord,
      isUpdate: false,
    });
  } catch (error) {
    console.error("Error saving risk record:", error);

    if (error.code === 11000) {
      // Duplicate key error - should not happen with our upsert logic, but just in case
      return res.status(400).json({ message: "Record already exists for this month" });
    }

    res.status(500).json({ message: "Failed to save risk record", error: error.message });
  }
};

/**
 * Get all risk records for a user with trend analysis
 */
exports.getRiskHistory = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const records = await RiskRecord.find({ userId })
      .sort({ year: 1, month: 1 })
      .lean();

    if (records.length === 0) {
      return res.json({
        records: [],
        trendAnalysis: {
          slope: 0,
          intercept: 0,
          trend: "no_data",
          trendDescription: "No risk records found. Start by making a prediction!",
          regressionLine: [],
          dataPoints: [],
        },
      });
    }

    const trendAnalysis = calculateLinearRegression(records);

    // Format records for display
    const formattedRecords = records.map((record) => ({
      ...record,
      monthName: getMonthName(record.month),
      displayDate: `${getMonthName(record.month)} ${record.year}`,
    }));

    res.json({
      records: formattedRecords,
      trendAnalysis,
    });
  } catch (error) {
    console.error("Error fetching risk history:", error);
    res.status(500).json({ message: "Failed to fetch risk history", error: error.message });
  }
};

/**
 * Delete a specific risk record
 */
exports.deleteRiskRecord = async (req, res) => {
  try {
    const { recordId } = req.params;

    const deletedRecord = await RiskRecord.findByIdAndDelete(recordId);

    if (!deletedRecord) {
      return res.status(404).json({ message: "Record not found" });
    }

    res.json({ message: "Record deleted successfully", record: deletedRecord });
  } catch (error) {
    console.error("Error deleting risk record:", error);
    res.status(500).json({ message: "Failed to delete record", error: error.message });
  }
};

/**
 * Get month name from month number
 */
const getMonthName = (month) => {
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  return months[month - 1] || "Unknown";
};
