const express = require('express');
const router = express.Router();
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const { foodDatabase } = require('../mealPlate/foodData'); 
const NutrientWallet = require('../models/NutrientWallet');
const { getCKDLimits } = require('../utils/nutrientLimits'); 

const upload = multer({ storage: multer.memoryStorage() });

// --- 1. FOOD MAPPING DICTIONARY (The Translator) ---
// LEFT: The Class Name your AI Model detects
// RIGHT: The exact Key in your foodData.js
const foodMapping = {
    // Typos & Exact Fixes
    "pieapple": "pineapple",       
    "avacado": "avacado", 

    // Name Translations (AI Name -> DB Name)
    "coconut_sambol": "Pol sambol - tempered",
    "coconut_sambol_tempered": "Pol sambol - tempered",
    "coconut_sambol_lime": "Pol sambol - lime added",
    "pol_sambol": "Pol sambol - tempered",
    "coconut_roti": "roti",         
    "fish": "fish curry",           
    "dahl_curry": "dahl curry",     
    "food": null, // Too generic, ignore
    
    // Underscore & Case Normalization
    "beans_curry": "Beans curry",
    "fried_rice": "fried rice",
    "white_rice": "white rice",
    "red_rice": "red rice",
    "tempered_sprats": "tempered sprats",
    "mallum": "mallum - gotukola",
    "mallum_gotukola": "mallum - gotukola",
    "mallum_mukunuwenna": "mallum - mukunuwenna",
    "mallum_murunga": "mallum - murunga",
    "mallum_kathurumurunga": "mallum - kathurumurunga",
    "mallum_asamodagam": "mallum - asamodagam",
    "gotukola": "mallum - gotukola",
    "mukunuwenna": "mallum - mukunuwenna",
    "murunga": "mallum - murunga",
    "kathurumurunga": "mallum - kathurumurunga",
    "asamodagam": "mallum - asamodagam",
    "beetroot": "beetroot",
    "chicken": "chicken",
    "cutlet": "cutlet"
};

// --- HELPER: SMART MATCHER ---
// Tries to find the correct DB key using Mapping -> Direct -> Fuzzy
const findFoodInDb = (aiName) => {
    if (!aiName) return null;

    // STEP 1: Check Manual Mapping (Fastest & most accurate)
    if (foodMapping[aiName]) {
        return foodMapping[aiName];
    }

    // STEP 2: Try Direct Match (e.g. "pineapple" == "pineapple")
    if (foodDatabase[aiName]) return aiName;

    // STEP 3: Try Fuzzy Match (Ignore case & underscores)
    // "Beans_Curry" -> "beanscurry" vs "Beans curry" -> "beanscurry"
    const normalize = (str) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
    const aiNormalized = normalize(aiName);

    const dbKeys = Object.keys(foodDatabase);
    const match = dbKeys.find(key => normalize(key) === aiNormalized);

    // Return match if found, otherwise return the original AI name (fallback)
    return match || aiName;
};

// --- HELPER: GET DATE ---
const getTodayDate = () => new Date().toISOString().split('T')[0];

// --- HELPER: GET/CREATE WALLET ---
const getWallet = async (userId) => {
    const today = getTodayDate();
    let wallet = await NutrientWallet.findOne({ userId, date: today });

    if (!wallet) {
        // Default to Stage 3 limits (Hardcoded for now)
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

        // Call AI Engine
        console.log("🔍 Sending image to AI...");
        const aiResponse = await axios.post('http://127.0.0.1:5001/predict_meal', form, {
            headers: { ...form.getHeaders() }
        });

        const rawDetectedNames = aiResponse.data.foods || [];
        console.log("🔍 AI Detected (Raw):", rawDetectedNames);

        // --- MAP RESULTS ---
        const results = rawDetectedNames.map(rawName => {
            // Find the correct DB key using our Helper
            const dbKey = findFoodInDb(rawName);
            const data = foodDatabase[dbKey];

            console.log(`🔹 Mapping: "${rawName}" -> "${dbKey}" | Units found: ${!!data}`);

            return {
                food: dbKey, // Send the Corrected Name to Frontend
                // Send the custom units (e.g. ['tbsp', 'small_piece']) or default to grams
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
// ROUTE 2: CALCULATE & CONFIRM MEAL
// ---------------------------------------------------------
router.post('/confirm-meal', async (req, res) => {
    const { userId, items, confirm } = req.body; 

    if (!userId) return res.status(400).json({ error: "User ID required" });

    let mealNutrients = { sodium: 0, potassium: 0, phosphorus: 0, protein: 0 };
    let breakdown = [];

    items.forEach(item => {
        const foodEntry = foodDatabase[item.food];
        
        if (foodEntry) {
            // Get weight for the selected unit (e.g. 'small_piece' -> 50g)
            const unitWeight = foodEntry.units[item.unit] || 0;
            // Total grams = unit weight * quantity (e.g. 50g * 2 = 100g)
            const totalGrams = unitWeight * parseFloat(item.amount);
            
            // Nutrients are stored per 100g in DB
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
        } else {
             breakdown.push({ food: item.food, details: "Nutrient info not available" });
        }
    });

    try {
        const wallet = await getWallet(userId);

        const projected = {
            sodium: wallet.consumed.sodium + mealNutrients.sodium,
            potassium: wallet.consumed.potassium + mealNutrients.potassium,
            phosphorus: wallet.consumed.phosphorus + mealNutrients.phosphorus,
            protein: wallet.consumed.protein + mealNutrients.protein
        };

        let isSafe = true;
        let warnings = [];

        const checkLimit = (name, total, limit) => {
            if (total > limit) {
                isSafe = false;
                warnings.push(`❌ ${name} exceeded! (${total.toFixed(0)}/${limit})`);
            } else if (total > (limit * 0.85)) {
                warnings.push(`⚠️ ${name} is getting high (${total.toFixed(0)}/${limit})`);
            }
        };

        checkLimit("Sodium", projected.sodium, wallet.limits.sodium);
        checkLimit("Potassium", projected.potassium, wallet.limits.potassium);
        checkLimit("Phosphorus", projected.phosphorus, wallet.limits.phosphorus);
        checkLimit("Protein", projected.protein, wallet.limits.protein);

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

// ---------------------------------------------------------
// ROUTE 3: STATUS (For Dashboard)
// ---------------------------------------------------------
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