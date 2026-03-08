const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth");
const {
  upsertBPRecord,
  getBPHistory,
  getMonthlyAverage,
} = require("../controllers/bpController");

// Protect all BP routes
router.use(authMiddleware);

// POST /api/bp-records/upsert
router.post("/upsert", upsertBPRecord);

// GET /api/bp-records/:userId/monthly-average?month=M&year=YYYY
// Must be defined BEFORE /:userId to avoid route conflict
router.get("/:userId/monthly-average", getMonthlyAverage);

// GET /api/bp-records/:userId
router.get("/:userId", getBPHistory);

module.exports = router;
