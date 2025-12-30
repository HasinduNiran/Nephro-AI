const path = require("path");
const fs = require("fs");

// Path logic from predictController.js
const scriptPath = path.join(
    __dirname,
    "..",
    "ai-engine",
    "src",
    "risk_prediction",
    "api_predict.py"
);

console.log("Verifying path:", scriptPath);

if (fs.existsSync(scriptPath)) {
    console.log("✅ File exists!");
} else {
    console.error("❌ File NOT found!");
    process.exit(1);
}
