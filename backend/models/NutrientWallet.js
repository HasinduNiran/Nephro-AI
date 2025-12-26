const mongoose = require("mongoose");

const nutrientWalletSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  date: {
    type: String, // Format "YYYY-MM-DD"
    required: true,
  },
  consumed: {
    sodium: { type: Number, default: 0 },
    potassium: { type: Number, default: 0 },
    phosphorus: { type: Number, default: 0 },
    protein: { type: Number, default: 0 },
  },
  // Limits are now required and must be set upon creation
  limits: {
    sodium: { type: Number, required: true },
    potassium: { type: Number, required: true },
    phosphorus: { type: Number, required: true },
    protein: { type: Number, required: true },
  },
});

module.exports = mongoose.model("NutrientWallet", nutrientWalletSchema);