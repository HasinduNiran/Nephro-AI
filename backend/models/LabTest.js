const mongoose = require("mongoose");

const labTestSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    userEmail: {
      type: String,
      trim: true,
      lowercase: true,
      index: true,
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
    creatinineStatus: {
      type: String,
      enum: ["Normal", "High", "Low", null],
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
    // OCR-related fields
    imageFilename: {
      type: String,
    },
    imagePath: {
      type: String,
    },
    ocrRawText: {
      type: String,
    },
    extractionConfidence: {
      eGFR: String,
      creatinine: String,
      bun: String,
      albumin: String,
    },
    age: {
      type: Number,
      min: 0,
      max: 150,
    },
    gender: {
      type: String,
      enum: ["M", "F", null],
    },
    testMethod: {
      type: String,
      enum: ["manual", "ocr"],
      default: "manual",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("LabTest", labTestSchema);
