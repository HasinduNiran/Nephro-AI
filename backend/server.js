require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const authRoutes = require("./routes/auth");
const predictRoutes = require("./routes/predict");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

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
// NEW: Import the Meal Plate Routes
const foodRoutes = require("./routes/foodRoutes");
// NEW: Register the Meal Plate endpoint
// This means your app will call: http://[IP]:5000/api/mealPlate/detect
app.use("/api/mealPlate", foodRoutes);

// Base route
app.get("/", (req, res) => {
  res.send("Nephro-AI Backend is running");
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
