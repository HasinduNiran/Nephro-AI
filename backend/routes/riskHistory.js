const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth");
const riskHistoryController = require("../controllers/riskHistoryController");

// Protect all risk history routes
router.use(authMiddleware);

// Save a risk record
router.post("/save", riskHistoryController.saveRiskRecord);

// Get risk history with trend analysis for a user
router.get("/history/:userId", riskHistoryController.getRiskHistory);

// Delete a specific risk record
router.delete("/record/:recordId", riskHistoryController.deleteRiskRecord);

module.exports = router;
