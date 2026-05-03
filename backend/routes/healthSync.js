const express = require("express");
const router = express.Router();
const {
  ingestHealthRecords,
  triggerSync,
  getDailySummaries,
  get14DayBPAverage,
} = require("../controllers/healthSyncController");

// POST /api/health-sync/ingest   – push raw watch readings
router.post("/ingest", ingestHealthRecords);

// POST /api/health-sync/trigger  – manual sync trigger
router.post("/trigger", triggerSync);

// GET  /api/health-sync/:userId/14day-average?date=YYYY-MM-DD
// (must be before the generic /:userId/daily to avoid route collision)
router.get("/:userId/14day-average", get14DayBPAverage);

// GET  /api/health-sync/:userId/daily?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get("/:userId/daily", getDailySummaries);

module.exports = router;
