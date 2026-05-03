const mongoose = require("mongoose");

const riskRecordSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    riskLevel: {
      type: String,
      required: true,
      enum: ["Low", "Medium", "High", "Low Risk", "Medium Risk", "High Risk"],
    },
    riskScore: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    // Vital signs at the time of prediction
    vitalSigns: {
      spo2: { type: Number },
      heartRate: { type: Number },
      bpSystolic: { type: Number },
      bpDiastolic: { type: Number },
      age: { type: Number },
      gender: { type: String },
      hba1cLevel: { type: Number },
      diabetes: { type: Boolean },
      hypertension: { type: Boolean },
    },
    // SHAP feature contributions for explainability
    shapValues: {
      age: { type: Number },
      gender: { type: Number },
      bp_systolic: { type: Number },
      bp_diastolic: { type: Number },
      hba1c_level: { type: Number },
      baseValue: { type: Number },
    },
    // Month and year kept for backward compatibility
    month: {
      type: Number,
      min: 1,
      max: 12,
    },
    year: {
      type: Number,
    },
    // 14-day period tracking (YYYY-MM-DD)
    periodStart: {
      type: String,
    },
    periodEnd: {
      type: String,
    },
    recordDate: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Sparse unique index: one record per user per 14-day period start date
// Sparse means documents without periodStart are excluded (preserves old month/year records)
riskRecordSchema.index({ userId: 1, periodStart: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("RiskRecord", riskRecordSchema);
