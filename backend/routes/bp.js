const express = require("express");
const router = express.Router();
const {
  upsertBPRecord,
  getBPHistory,
  getRangeAverage,
} = require("../controllers/bpController");

// POST /api/bp-records/upsert
router.post("/upsert", upsertBPRecord);

// GET /api/bp-records/:userId/range-average?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
// Use this for 14-day average: pass startDate = today-13days, endDate = today
router.get("/:userId/range-average", getRangeAverage);

// GET /api/bp-records/:userId
router.get("/:userId", getBPHistory);

module.exports = router;
