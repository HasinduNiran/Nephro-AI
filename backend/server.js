require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const KidneyScan = require("./models/KidneyScan");
const authRoutes = require("./routes/auth");
const predictRoutes = require("./routes/predict");
const kidneyusRoutes = require("./routes/kidneyus");
const labRoutes = require("./routes/lab");
const riskHistoryRoutes = require("./routes/riskHistory");

const app = express();

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "ultrasound-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|bmp/;
    const extname = allowedTypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

// Middleware
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(uploadsDir));

// Database Connection
mongoose
  .connect(process.env.DATABASE_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB Connected Successfully"))
  .catch((err) => console.error("MongoDB Connection Error:", err));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/predict", predictRoutes);
app.use("/api/kidneyus", kidneyusRoutes);
app.use("/api/lab", labRoutes);

// Ultrasound upload endpoint
app.post("/api/upload-ultrasound", upload.single("ultrasound"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" });
  }

  const { name } = req.body;
  if (!name) {
    // Clean up uploaded file before returning
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ message: "Name is required" });
  }

  const { spawn } = require("child_process");
  const imagePath = req.file.path;

  // Path to ultrasound analysis script
  const scriptPath = path.join(
    __dirname,
    "..",
    "ai-engine",
    "src",
    "ckd_stage",
    "ultrasound_scan.py"
  );

  const pythonProcess = spawn("python", [scriptPath, imagePath]);

  let dataString = "";
  let errorString = "";

  pythonProcess.stdout.on("data", (data) => {
    dataString += data.toString();
  });

  pythonProcess.stderr.on("data", (data) => {
    errorString += data.toString();
  });

  pythonProcess.on("close", async (code) => {
    // Clean up uploaded file
    fs.unlink(imagePath, (err) => {
      if (err) console.error("Error deleting file:", err);
    });

    if (code !== 0) {
      console.error(`Python script exited with code ${code}`);
      console.error(`Stderr: ${errorString}`);
      return res.status(500).json({
        message: "Error analyzing ultrasound",
        error: errorString,
      });
    }

    try {
      // Some debug lines may come from stdout; grab the last JSON-looking line
      const lines = dataString.trim().split(/\r?\n/);
      const jsonLine = [...lines].reverse().find((line) => line.trim().startsWith("{"));
      const result = JSON.parse(jsonLine || dataString);
      if (!result.success) {
        return res.status(400).json({
          message: result.error || "Failed to analyze ultrasound",
          success: false,
        });
      }

      // Save kidney scan measurement
      try {
        await KidneyScan.create({
          name,
          kidneyLengthCm: result.kidney_length_cm,
          kidneyWidthCm: result.kidney_width_cm,
          interpretation: result.interpretation,
          status: result.status || "unknown",
          imagePath,
        });
      } catch (dbErr) {
        console.error("Error saving kidney scan:", dbErr);
        // Continue responding even if save fails
      }

      res.json(result);
    } catch (e) {
      console.error("Error parsing python output:", e);
      console.error("Raw output:", dataString);
      res.status(500).json({
        message: "Error parsing ultrasound analysis result",
      });
    }
  });
});
app.use("/api/risk-history", riskHistoryRoutes);

// Base route
app.get("/", (req, res) => {
  res.send("Nephro-AI Backend is running");
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
