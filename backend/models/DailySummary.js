const mongoose = require("mongoose");

/**
 * DailySummary – one deduplicated record per user per calendar date.
 *
 * Populated (and kept up-to-date) by the background sync service.
 * Contains only the LATEST BP reading for each day; HbA1c values
 * are stored separately and never mixed into BP aggregation.
 */
const dailySummarySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    /** "YYYY-MM-DD" */
    date: {
      type: String,
      required: true,
    },

    /* ─── latest BP reading for this day ─── */
    systolic: {
      type: Number,
      default: null,
    },
    diastolic: {
      type: Number,
      default: null,
    },

    /* ─── latest HbA1c reading (kept separate from BP) ─── */
    hba1c: {
      type: Number,
      default: null,
    },

    /** Timestamp of the source HealthRecord that was chosen */
    measuredAt: {
      type: Date,
      default: null,
    },

    source: {
      type: String,
      default: "watch",
    },

    /** When the sync service last wrote / refreshed this doc */
    lastSyncedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

// One summary per user per day – upsert-safe
dailySummarySchema.index({ userId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("DailySummary", dailySummarySchema);
