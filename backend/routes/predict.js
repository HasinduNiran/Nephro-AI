const express = require("express");
const router = express.Router();
const predictController = require("../controllers/predictController");

router.post("/", predictController.predictRisk);
router.post("/ultrasound", predictController.analyzeKidneyUltrasound);

module.exports = router;
