// backend/mealPlate/foodData.js

// Nutrient values are per 100g
// Units are estimated grams per specific household measure
const foodDatabase = {
  "avacado": {
    nutrients: { protein: 2, sodium: 7, potassium: 485, phosphorus: 52 },
    units: {
      "whole_fruit": 200, // Average edible weight
      "half_fruit": 100,
      "tbsp": 15
    }
  },
  "Beans curry": {
    nutrients: { protein: 2, sodium: 200, potassium: 250, phosphorus: 40 },
    units: {
      "tbsp": 15
    }
  },
  "beetroot": {
    nutrients: { protein: 1.6, sodium: 78, potassium: 325, phosphorus: 40 },
    units: {
      "tbsp": 15
    }
  },
  "chicken": {
    nutrients: { protein: 31, sodium: 74, potassium: 256, phosphorus: 228 },
    units: {
      "small_piece": 50,
      "large_piece": 100
    }
  },
  "cutlet": {
    nutrients: { protein: 12, sodium: 300, potassium: 200, phosphorus: 150 },
    units: {
      "small": 40,
      "large": 80
    }
  },
  "dahl curry": {
    nutrients: { protein: 6, sodium: 250, potassium: 300, phosphorus: 180 },
    units: {
      "tbsp": 15,
      "serving_spoon": 60
    }
  },
  "fish curry": {
    nutrients: { protein: 20, sodium: 350, potassium: 350, phosphorus: 200 },
    units: {
      "small_piece": 50,
      "large_piece": 100
    }
  },
  "fried rice": {
    nutrients: { protein: 4, sodium: 400, potassium: 100, phosphorus: 90 },
    units: {
      "serving_spoon": 60,
      "tea_cup": 150
    }
  },
  "mallum - gotukola": {
    nutrients: { protein: 2, sodium: 15, potassium: 380, phosphorus: 45 },
    units: {
      "tbsp": 15,
      "serving_spoon": 60
    }
  },
  "mallum - mukunuwenna": {
    nutrients: { protein: 3.5, sodium: 25, potassium: 420, phosphorus: 55 },
    units: {
      "tbsp": 15,
      "serving_spoon": 60
    }
  },
  "mallum - murunga": {
    nutrients: { protein: 4, sodium: 18, potassium: 450, phosphorus: 60 },
    units: {
      "tbsp": 15,
      "serving_spoon": 60
    }
  },
  "mallum - kathurumurunga": {
    nutrients: { protein: 3.8, sodium: 20, potassium: 410, phosphorus: 52 },
    units: {
      "tbsp": 15,
      "serving_spoon": 60
    }
  },
  "mallum - asamodagam": {
    nutrients: { protein: 2.5, sodium: 22, potassium: 390, phosphorus: 48 },
    units: {
      "tbsp": 15,
      "serving_spoon": 60
    }
  },
  "pineapple": {
    nutrients: { protein: 0.5, sodium: 1, potassium: 109, phosphorus: 8 },
    units: {
      "piece_cube": 20, // Small cube
      "slice": 80
    }
  },
  "Pol sambol - tempered": {
    nutrients: { protein: 3, sodium: 450, potassium: 320, phosphorus: 105 },
    units: {
      "tbsp": 15
    }
  },
  "Pol sambol - lime added": {
    nutrients: { protein: 3, sodium: 380, potassium: 310, phosphorus: 98 },
    units: {
      "tbsp": 15
    }
  },
  "red rice": {
    nutrients: { protein: 2.5, sodium: 1, potassium: 85, phosphorus: 78 },
    units: {
      "serving_spoon": 60,
      "tea_cup": 150
    }
  },
  "roti": {
    nutrients: { protein: 8, sodium: 320, potassium: 120, phosphorus: 100 },
    units: {
      "small": 40,
      "large": 80
    }
  },
  "tempered sprats": {
    nutrients: { protein: 35, sodium: 900, potassium: 400, phosphorus: 350 },
    units: {
      "tbsp": 15
    }
  },
  "white rice": {
    nutrients: { protein: 2.7, sodium: 1, potassium: 35, phosphorus: 35 },
    units: {
      "serving_spoon": 60,
      "tea_cup": 150
    }
  }
};

module.exports = { foodDatabase };