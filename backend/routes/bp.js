const express = require("express");
const router = express.Router();
const {
  upsertBPRecord,
  getBPHistory,
  getMonthlyAverage,
  getRangeAverage,
} = require("../controllers/bpController");

// POST /api/bp-records/upsert
router.post("/upsert", upsertBPRecord);

// GET /api/bp-records/:userId/monthly-average?month=M&year=YYYY
// Must be defined BEFORE /:userId to avoid route conflict
router.get("/:userId/monthly-average", getMonthlyAverage);

// GET /api/bp-records/:userId/range-average?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
router.get("/:userId/range-average", getRangeAverage);

// GET /api/bp-records/:userId
router.get("/:userId", getBPHistory);

module.exports = router;
