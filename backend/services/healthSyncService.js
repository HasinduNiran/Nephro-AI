const cron = require("node-cron");
const mongoose = require("mongoose");
const HealthRecord = require("../models/HealthRecord");
const DailySummary = require("../models/DailySummary");
const syncConfig = require("../config/syncConfig");

/* =========================================================
 *  AGGREGATION PIPELINES
 * ========================================================= */

/**
 * Stage 1 – Deduplication: "latest_per_day"
 *
 * For every (userId, date) group, pick the document with the
 * NEWEST `measuredAt` timestamp. Earlier readings are discarded.
 *
 * HbA1c is projected alongside BP but will NEVER be mixed into
 * the BP monthly average calculation (see `computeMonthlyBPAverages`).
 */
function buildDeduplicationPipeline() {
  return [
    // Only process un-synced records for efficiency
    { $match: { synced: false } },

    // Sort so that $first after grouping gives the latest reading
    { $sort: { measuredAt: -1 } },

    // Group by (userId + date) → keep the latest document's values
    {
      $group: {
        _id: { userId: "$userId", date: "$date" },
        systolic: { $first: "$systolic" },
        diastolic: { $first: "$diastolic" },
        hba1c: { $first: "$hba1c" },
        measuredAt: { $first: "$measuredAt" },
        source: { $first: "$source" },
        // Collect all _id values so we can flag them as synced later
        processedIds: { $push: "$_id" },
      },
    },

    // Reshape for easy consumption
    {
      $project: {
        _id: 0,
        userId: "$_id.userId",
        date: "$_id.date",
        systolic: 1,
        diastolic: 1,
        hba1c: 1,
        measuredAt: 1,
        source: 1,
        processedIds: 1,
      },
    },
  ];
}

/**
 * Stage 2 – Monthly BP Average (runs on DailySummary collection)
 *
 * Calculates avgSystolic / avgDiastolic for a given user + month.
 * HbA1c is explicitly excluded ($ne: null guard on BP fields).
 */
function buildMonthlyBPAveragePipeline(userId, yearMonth) {
  // yearMonth format: "YYYY-MM"
  const datePrefix = `^${yearMonth}-`;

  return [
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        date: { $regex: datePrefix },
        // ── strict BP-only filter ──
        systolic: { $ne: null },
        diastolic: { $ne: null },
      },
    },
    {
      $group: {
        _id: null,
        avgSystolic: { $avg: "$systolic" },
        avgDiastolic: { $avg: "$diastolic" },
        recordCount: { $sum: 1 },
      },
    },
    {
      $project: {
        _id: 0,
        avgSystolic: { $round: ["$avgSystolic", 0] },
        avgDiastolic: { $round: ["$avgDiastolic", 0] },
        recordCount: 1,
      },
    },
  ];
}

/* =========================================================
 *  SYNC LOGIC
 * ========================================================= */

/**
 * Core sync task – called every cron tick.
 *
 * 1. Run deduplication aggregation on HealthRecord.
 * 2. Upsert each result into DailySummary.
 * 3. Mark processed HealthRecords as synced.
 */
async function runSyncCycle() {
  const startTime = Date.now();

  try {
    const pipeline = buildDeduplicationPipeline();
    const deduplicated = await HealthRecord.aggregate(pipeline);

    if (deduplicated.length === 0) {
      return; // nothing new to sync – stay quiet
    }

    let upsertCount = 0;
    const allProcessedIds = [];

    for (const doc of deduplicated) {
      // ── Upsert into DailySummary (BP fields) ──
      const updateFields = {
        measuredAt: doc.measuredAt,
        source: doc.source,
        lastSyncedAt: new Date(),
      };

      // Only write BP values if they exist (keeps BP / HbA1c separate)
      if (doc.systolic != null && doc.diastolic != null) {
        updateFields.systolic = doc.systolic;
        updateFields.diastolic = doc.diastolic;
      }

      // Write HbA1c independently – never merged into BP avg calc
      if (doc.hba1c != null) {
        updateFields.hba1c = doc.hba1c;
      }

      await DailySummary.findOneAndUpdate(
        { userId: doc.userId, date: doc.date },
        { $set: updateFields },
        { upsert: true, new: true },
      );

      upsertCount++;
      allProcessedIds.push(...doc.processedIds);
    }

    // ── Flag source records as synced ──
    if (allProcessedIds.length > 0) {
      await HealthRecord.updateMany(
        { _id: { $in: allProcessedIds } },
        { $set: { synced: true } },
      );
    }

    const elapsed = Date.now() - startTime;
    console.log(
      `[HealthSync] Cycle done – ${upsertCount} day(s) upserted, ` +
        `${allProcessedIds.length} raw record(s) marked synced (${elapsed}ms)`,
    );
  } catch (err) {
    console.error("[HealthSync] Sync cycle error:", err);
  }
}

/* =========================================================
 *  PUBLIC HELPERS  (used by controller / routes)
 * ========================================================= */

/**
 * Returns { avgSystolic, avgDiastolic, recordCount } for a user
 * in a given month. Operates on *deduplicated* DailySummary data.
 */
async function computeMonthlyBPAverages(userId, year, month) {
  const mm = String(month).padStart(2, "0");
  const yearMonth = `${year}-${mm}`;
  const pipeline = buildMonthlyBPAveragePipeline(userId, yearMonth);
  const results = await DailySummary.aggregate(pipeline);

  if (!results || results.length === 0) {
    return { avgSystolic: null, avgDiastolic: null, recordCount: 0 };
  }

  return results[0];
}

/* =========================================================
 *  CRON JOB SETUP
 * ========================================================= */

let cronTask = null;

/**
 * Call once after Mongoose is connected.
 * Starts the recurring background sync based on syncConfig.
 */
function startSyncJob() {
  const { enabled, cron_schedule } = syncConfig.sync_service;

  if (!enabled) {
    console.log("[HealthSync] Sync service is DISABLED by config.");
    return;
  }

  if (!cron.validate(cron_schedule)) {
    console.error(
      `[HealthSync] Invalid cron expression: "${cron_schedule}". Service not started.`,
    );
    return;
  }

  cronTask = cron.schedule(cron_schedule, () => {
    runSyncCycle();
  });

  console.log(
    `[HealthSync] Background sync started – schedule: "${cron_schedule}"`,
  );
}

/**
 * Gracefully stop the cron job (e.g. during tests or shutdown).
 */
function stopSyncJob() {
  if (cronTask) {
    cronTask.stop();
    cronTask = null;
    console.log("[HealthSync] Background sync stopped.");
  }
}

/* =========================================================
 *  EXPORTS
 * ========================================================= */
module.exports = {
  startSyncJob,
  stopSyncJob,
  runSyncCycle, // exposed for manual / on-demand trigger
  computeMonthlyBPAverages,
};
