const mongoose = require("mongoose");

const stageProgressionRecordSchema = new mongoose.Schema(
  {
    userEmail: {
      type: String,
      required: true,
      index: true,
      lowercase: true,
      trim: true,
    },
    userName: {
      type: String,
      trim: true,
    },
    visitDate: {
      type: Date,
    },
    inputs: {
      visitDate: Date,
      age: Number,
      gender: String,
      labs: {
        creatinine: Number,
        egfr: Number,
        bun: Number,
        albumin: Number,
        hemoglobin: Number,
      },
      uploaded: {
        labReport: Boolean,
        ultrasound: Boolean,
      },
    },
    prediction_lab_only: mongoose.Schema.Types.Mixed,
    prediction_with_us: mongoose.Schema.Types.Mixed,
    eGFR_info: {
      value: Number,
      source: String,
      method: String,
    },
    submissionIndex: {
      type: Number,
    },
    progression_to_next_stage: {
      next_stage: String,
      probability: Number,
      probability_percentage: String,
      message: String,
    },
    progression_to_next_stage_6_month: {
      next_stage: String,
      probability: Number,
      probability_percentage: String,
      message: String,
    },
    progression_by_stage: [
      {
        stage: String,
        stage_display: String,
        probability: Number,
        probability_percentage: Number,
      },
    ],
    progression_by_stage_6_month: [
      {
        stage: String,
        stage_display: String,
        probability: Number,
        probability_percentage: Number,
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("StageProgressionRecord", stageProgressionRecordSchema);
