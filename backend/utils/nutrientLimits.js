const getCKDLimits = (stage) => {
    // Medical Guidelines (Approximate)
    switch (stage) {
        case 1:
        case 2:
            return { sodium: 2300, potassium: 3000, phosphorus: 1000, protein: 56 };
        case 3: // Stage 3a/3b
            return { sodium: 2000, potassium: 2500, phosphorus: 800, protein: 56 };
        case 4:
        case 5: // Strict Restrictions
            return { sodium: 1500, potassium: 2000, phosphorus: 800, protein: 42 };
        case 6: // Dialysis (Higher Protein)
            return { sodium: 2000, potassium: 2500, phosphorus: 1000, protein: 84 };
        default:
            return { sodium: 2000, potassium: 2500, phosphorus: 800, protein: 50 };
    }
};

module.exports = { getCKDLimits };