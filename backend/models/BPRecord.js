const mongoose = require("mongoose");

const bpRecordSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    date: {
      type: String, // "YYYY-MM-DD"
      required: true,
    },
    systolic: {
      type: Number,
      required: true,
      min: 70,
      max: 250,
    },
    diastolic: {
      type: Number,
      required: true,
      min: 40,
      max: 150,
    },
    hba1c: {
      type: Number,
      default: null,
    },
    source: {
      type: String,
      enum: ["manual", "healthConnect"],
      default: "manual",
    },
    lastSyncedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

// One record per user per calendar date
bpRecordSchema.index({ userId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("BPRecord", bpRecordSchema);
