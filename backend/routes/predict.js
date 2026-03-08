const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth");
const predictController = require("../controllers/predictController");

router.post("/", authMiddleware, predictController.predictRisk);

module.exports = router;
