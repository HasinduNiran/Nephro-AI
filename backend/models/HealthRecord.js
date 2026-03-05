const mongoose = require("mongoose");

/**
 * HealthRecord – raw incoming data from smartwatch / Health Connect.
 *
 * Multiple documents per user per day are allowed so the watch can
 * push readings at any cadence. The background sync service later
 * deduplicates these into DailySummary (latest reading per day).
 */
const healthRecordSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    /** Calendar date string in "YYYY-MM-DD" format */
    date: {
      type: String,
      required: true,
    },

    /** Exact moment the measurement was taken on the watch */
    measuredAt: {
      type: Date,
      required: true,
      default: Date.now,
    },

    /* ─── blood-pressure fields ─── */
    systolic: {
      type: Number,
      min: 70,
      max: 250,
      default: null,
    },
    diastolic: {
      type: Number,
      min: 40,
      max: 150,
      default: null,
    },

    /* ─── excluded from BP aggregation ─── */
    hba1c: {
      type: Number,
      default: null,
    },

    /** Where the reading originated */
    source: {
      type: String,
      enum: ["watch", "healthConnect", "manual"],
      default: "watch",
    },

    /** Track whether the sync job has already processed this doc */
    synced: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true },
);

// Fast lookups for the aggregation pipeline
healthRecordSchema.index({ userId: 1, date: 1, measuredAt: -1 });

module.exports = mongoose.model("HealthRecord", healthRecordSchema);
