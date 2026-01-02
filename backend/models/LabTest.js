const mongoose = require("mongoose");

const labTestSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    eGFR: {
      type: Number,
      required: true,
      min: 0,
    },
    creatinine: {
      type: Number,
      min: 0,
    },
    bun: {
      type: Number,
      min: 0,
    },
    albumin: {
      type: Number,
      min: 0,
    },
    ckdStage: {
      type: String,
      required: true,
    },
    stageDescription: {
      type: String,
      required: true,
    },
    eGFRRange: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("LabTest", labTestSchema);
