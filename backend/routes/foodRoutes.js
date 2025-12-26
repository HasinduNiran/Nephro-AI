const express = require('express');
const router = express.Router();
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const { foodDatabase } = require('../mealPlate/foodData');
const NutrientWallet = require('../models/NutrientWallet');
const { getCKDLimits } = require('../utils/nutrientLimits'); 

const upload = multer({ storage: multer.memoryStorage() });

// HELPER: Get today's date "YYYY-MM-DD"
const getTodayDate = () => new Date().toISOString().split('T')[0];

// HELPER: Get or Create Wallet
const getWallet = async (userId) => {
    const today = getTodayDate();
    let wallet = await NutrientWallet.findOne({ userId, date: today });

    if (!wallet) {
        // --- HARDCODED STAGE (For now) ---
        // Later, fetch this from User Profile: const user = await User.findById(userId);
        const currentStage = 3; 
        
        const dailyLimits = getCKDLimits(currentStage);

        wallet = new NutrientWallet({
            userId,
            date: today,
            consumed: { sodium: 0, potassium: 0, phosphorus: 0, protein: 0 },
            limits: dailyLimits 
        });
        await wallet.save();
    }
    return wallet;
};

// ---------------------------------------------------------
// ROUTE 1: DETECT FOODS
// ---------------------------------------------------------
router.post('/detect', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No image provided" });

        const form = new FormData();
        form.append('image', req.file.buffer, 'meal.jpg');

        // Call Python AI
        const aiResponse = await axios.post('http://127.0.0.1:5001/predict_meal', form, {
            headers: { ...form.getHeaders() }
        });

        const detectedNames = aiResponse.data.foods || [];

        // Attach Unit Options
        const results = detectedNames.map(foodName => {
            const data = foodDatabase[foodName];
            return {
                food: foodName,
                availableUnits: data ? Object.keys(data.units) : ['grams'] 
            };
        });

        res.json({ detected: results });

    } catch (err) {
        console.error("AI Service Error:", err.message);
        res.status(500).json({ error: "AI Engine Unavailable" });
    }
});

// ---------------------------------------------------------
// ROUTE 2: CALCULATE & CHECK SAFETY
// ---------------------------------------------------------
router.post('/confirm-meal', async (req, res) => {
    const { userId, items, confirm } = req.body; 

    if (!userId) return res.status(400).json({ error: "User ID required" });

    let mealNutrients = { sodium: 0, potassium: 0, phosphorus: 0, protein: 0 };
    let breakdown = [];

    // 1. Calculate Nutrition for THIS Meal
    items.forEach(item => {
        const foodEntry = foodDatabase[item.food];
        if (foodEntry) {
            // Formula: Unit Weight * Amount
            const unitWeight = foodEntry.units[item.unit] || 0;
            const totalGrams = unitWeight * parseFloat(item.amount);
            
            // Nutrients are per 100g in DB
            const n = foodEntry.nutrients;
            
            const s = (n.sodium * totalGrams) / 100;
            const k = (n.potassium * totalGrams) / 100;
            const p = (n.phosphorus * totalGrams) / 100;
            const pr = (n.protein * totalGrams) / 100;

            mealNutrients.sodium += s;
            mealNutrients.potassium += k;
            mealNutrients.phosphorus += p;
            mealNutrients.protein += pr;

            breakdown.push({
                food: item.food,
                details: `${item.amount} ${item.unit} (${totalGrams}g) : ${k.toFixed(0)}mg K+, ${s.toFixed(0)}mg Na`
            });
        }
    });

    try {
        // 2. Fetch Wallet (Current Consumption)
        const wallet = await getWallet(userId);

        // 3. Calculate Projected Total (Already Eaten + This Meal)
        const projected = {
            sodium: wallet.consumed.sodium + mealNutrients.sodium,
            potassium: wallet.consumed.potassium + mealNutrients.potassium,
            phosphorus: wallet.consumed.phosphorus + mealNutrients.phosphorus,
            protein: wallet.consumed.protein + mealNutrients.protein
        };

        // 4. Check Safety against DAILY LIMITS
        let isSafe = true;
        let warnings = [];

        const checkLimit = (name, total, limit) => {
            if (total > limit) {
                isSafe = false;
                warnings.push(`❌ ${name} exceeded! (${total.toFixed(0)}/${limit})`);
            } else if (total > (limit * 0.85)) {
                // Warning if > 85% of limit
                warnings.push(`⚠️ ${name} is getting high (${total.toFixed(0)}/${limit})`);
            }
        };

        checkLimit("Sodium", projected.sodium, wallet.limits.sodium);
        checkLimit("Potassium", projected.potassium, wallet.limits.potassium);
        checkLimit("Phosphorus", projected.phosphorus, wallet.limits.phosphorus);
        checkLimit("Protein", projected.protein, wallet.limits.protein);

        // 5. Update DB (Only if user clicks "Confirm & Eat")
        if (confirm === true) {
            wallet.consumed.sodium = projected.sodium;
            wallet.consumed.potassium = projected.potassium;
            wallet.consumed.phosphorus = projected.phosphorus;
            wallet.consumed.protein = projected.protein;
            await wallet.save();
        }

        res.json({
            mealNutrients,
            isSafe,
            warnings,
            breakdown
        });

    } catch (error) {
        console.error("Wallet Error:", error);
        res.status(500).json({ error: "Database Error" });
    }
});

// ROUTE 3: DASHBOARD STATUS
router.get('/status/:userId', async (req, res) => {
    try {
        const wallet = await getWallet(req.params.userId);
        res.json({
            sodium: wallet.limits.sodium - wallet.consumed.sodium,
            potassium: wallet.limits.potassium - wallet.consumed.potassium,
            phosphorus: wallet.limits.phosphorus - wallet.consumed.phosphorus,
            protein: wallet.limits.protein - wallet.consumed.protein
        });
    } catch (error) {
        res.status(500).json({ error: "Could not fetch wallet" });
    }
});

module.exports = router;