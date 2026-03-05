const HealthRecord = require("../models/HealthRecord");
const DailySummary = require("../models/DailySummary");
const {
  runSyncCycle,
  computeMonthlyBPAverages,
} = require("../services/healthSyncService");

/* ──────────────────────────────────────────────────────────
 *  POST /api/health-sync/ingest
 *  Accept raw readings from the watch / Health Connect.
 * ────────────────────────────────────────────────────────── */
const ingestHealthRecords = async (req, res) => {
  try {
    const { records } = req.body; // array of { userId, date, measuredAt, systolic, diastolic, hba1c?, source? }

    if (!Array.isArray(records) || records.length === 0) {
      return res
        .status(400)
        .json({ message: "records[] array is required and must not be empty." });
    }

    const docs = records.map((r) => ({
      userId: r.userId,
      date: r.date,
      measuredAt: r.measuredAt || new Date(),
      systolic: r.systolic ?? null,
      diastolic: r.diastolic ?? null,
      hba1c: r.hba1c ?? null,
      source: r.source || "watch",
      synced: false,
    }));

    const inserted = await HealthRecord.insertMany(docs, { ordered: false });

    res.status(201).json({
      success: true,
      insertedCount: inserted.length,
    });
  } catch (err) {
    console.error("ingestHealthRecords error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

/* ──────────────────────────────────────────────────────────
 *  POST /api/health-sync/trigger
 *  Manually trigger the sync cycle (useful during dev/testing).
 * ────────────────────────────────────────────────────────── */
const triggerSync = async (_req, res) => {
  try {
    await runSyncCycle();
    res.status(200).json({ success: true, message: "Sync cycle completed." });
  } catch (err) {
    console.error("triggerSync error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

/* ──────────────────────────────────────────────────────────
 *  GET /api/health-sync/:userId/daily
 *  Return deduplicated daily summaries for a user.
 *  Optional query params: ?from=YYYY-MM-DD&to=YYYY-MM-DD
 * ────────────────────────────────────────────────────────── */
const getDailySummaries = async (req, res) => {
  try {
    const { userId } = req.params;
    const { from, to } = req.query;

    const filter = { userId };
    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = from;
      if (to) filter.date.$lte = to;
    }

    const summaries = await DailySummary.find(filter)
      .sort({ date: -1 })
      .lean();

    res.status(200).json({ success: true, summaries });
  } catch (err) {
    console.error("getDailySummaries error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

/* ──────────────────────────────────────────────────────────
 *  GET /api/health-sync/:userId/monthly-average?month=M&year=YYYY
 *  Returns BP-only monthly averages from the deduplicated data.
 * ────────────────────────────────────────────────────────── */
const getMonthlyBPAverage = async (req, res) => {
  try {
    const { userId } = req.params;
    const { month, year } = req.query;

    if (!month || !year) {
      return res.status(400).json({ message: "month and year are required." });
    }

    const result = await computeMonthlyBPAverages(userId, year, month);

    res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error("getMonthlyBPAverage error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

module.exports = {
  ingestHealthRecords,
  triggerSync,
  getDailySummaries,
  getMonthlyBPAverage,
};
