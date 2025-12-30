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
      age: { type: Number },
      diabetes: { type: Boolean },
      hypertension: { type: Boolean },
    },
    // Month and year for tracking
    month: {
      type: Number,
      required: true,
      min: 1,
      max: 12,
    },
    year: {
      type: Number,
      required: true,
    },
    recordDate: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Compound index to ensure one record per user per month
riskRecordSchema.index({ userId: 1, month: 1, year: 1 }, { unique: true });

module.exports = mongoose.model("RiskRecord", riskRecordSchema);
