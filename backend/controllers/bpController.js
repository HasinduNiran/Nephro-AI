const BPRecord = require("../models/BPRecord");
const mongoose = require("mongoose");

// POST /api/bp-records/upsert
// Body: { userId, date, systolic, diastolic, hba1c?, source? }
const upsertBPRecord = async (req, res) => {
  try {
    const { userId, date, systolic, diastolic, hba1c, source } = req.body;

    if (!userId || !date || systolic == null || diastolic == null) {
      return res.status(400).json({
        message: "userId, date, systolic, and diastolic are required.",
      });
    }

    const record = await BPRecord.findOneAndUpdate(
      { userId, date },
      {
        systolic,
        diastolic,
        hba1c: hba1c ?? null,
        source: source || "manual",
        lastSyncedAt: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    res.status(200).json({ success: true, record });
  } catch (error) {
    console.error("upsertBPRecord error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// GET /api/bp-records/:userId
// Returns all BP records for a user, sorted newest first
const getBPHistory = async (req, res) => {
  try {
    const { userId } = req.params;
    const records = await BPRecord.find({ userId }).sort({ date: -1 }).lean();
    res.status(200).json({ success: true, records });
  } catch (error) {
    console.error("getBPHistory error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// GET /api/bp-records/:userId/monthly-average?month=M&year=YYYY
// Returns { avgSystolic, avgDiastolic, recordCount } rounded to integers
const getMonthlyAverage = async (req, res) => {
  try {
    const { userId } = req.params;
    const { month, year } = req.query;

    if (!month || !year) {
      return res.status(400).json({ message: "month and year are required." });
    }

    const mm = String(month).padStart(2, "0");
    const yyyy = String(year);
    const prefix = `${yyyy}-${mm}-`; // e.g. "2026-03-"

    const records = await BPRecord.find({
      userId,
      date: { $regex: `^${prefix}` },
    }).lean();

    if (!records || records.length === 0) {
      return res.status(200).json({
        success: true,
        recordCount: 0,
        avgSystolic: null,
        avgDiastolic: null,
      });
    }

    const totalSystolic = records.reduce((sum, r) => sum + r.systolic, 0);
    const totalDiastolic = records.reduce((sum, r) => sum + r.diastolic, 0);
    const count = records.length;

    res.status(200).json({
      success: true,
      recordCount: count,
      avgSystolic: Math.round(totalSystolic / count),
      avgDiastolic: Math.round(totalDiastolic / count),
    });
  } catch (error) {
    console.error("getMonthlyAverage error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// GET /api/bp-records/:userId/range-average?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
// Returns { avgSystolic, avgDiastolic, recordCount } for the given date range
const getRangeAverage = async (req, res) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ message: "startDate and endDate are required." });
    }

    const records = await BPRecord.find({
      userId,
      date: { $gte: startDate, $lte: endDate },
    }).lean();

    if (!records || records.length === 0) {
      return res.status(200).json({
        success: true,
        recordCount: 0,
        avgSystolic: null,
        avgDiastolic: null,
      });
    }

    const totalSystolic = records.reduce((sum, r) => sum + r.systolic, 0);
    const totalDiastolic = records.reduce((sum, r) => sum + r.diastolic, 0);
    const count = records.length;

    res.status(200).json({
      success: true,
      recordCount: count,
      avgSystolic: Math.round(totalSystolic / count),
      avgDiastolic: Math.round(totalDiastolic / count),
    });
  } catch (error) {
    console.error("getRangeAverage error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = { upsertBPRecord, getBPHistory, getMonthlyAverage, getRangeAverage };
