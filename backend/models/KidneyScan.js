const mongoose = require("mongoose");

const kidneyScanSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    kidneyLengthCm: {
      type: Number,
      required: true,
    },
    kidneyWidthCm: {
      type: Number,
    },
    interpretation: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ["normal", "abnormal", "unknown"],
      default: "unknown",
    },
    imagePath: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("KidneyScan", kidneyScanSchema);
