const Tesseract = require("tesseract.js");
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

// Reference ranges for creatinine validation
const REF_RANGES = {
  male: { min: 0.7, max: 1.3 },
  female: { min: 0.6, max: 1.1 }
};
                                
// Initialize Tesseract worker once
let tesseractWorker = null;

async function initializeTesseract() {
  if (!tesseractWorker) {
    try {
      console.log("Initializing Tesseract worker...");
      tesseractWorker = await Tesseract.createWorker({
        logger: m => {
          if (m.status === "initializing languages" || m.status === "recognizing text") {
            console.log(`Tesseract: ${m.status} (${(m.progress * 100).toFixed(2)}%)`);
          }
        }
      });
      await tesseractWorker.loadLanguage('eng');
      await tesseractWorker.initialize('eng');
      console.log("Tesseract worker initialized successfully");
    } catch (error) {
      console.error("Error initializing Tesseract:", error);
      tesseractWorker = null;
      throw error;
    }
  }
  return tesseractWorker;
}

// Clean up Tesseract worker
async function terminateTesseract() {
  if (tesseractWorker) {
    try {
      await tesseractWorker.terminate();
      tesseractWorker = null;
      console.log("Tesseract worker terminated");
    } catch (error) {
      console.error("Error terminating Tesseract:", error);
    }
  }
}

/**
 * Validate lab result against reference ranges
 * @param {number} value - Lab value
 * @param {string} gender - Patient gender ('M' or 'F')
 * @returns {string} - "Normal", "High", or "Low"
 */
function validateResult(value, gender) {
  const genderUpper = (gender || "M").toString().toUpperCase();
  const range = genderUpper === "F" || genderUpper === "FEMALE" || genderUpper.startsWith("F") 
    ? REF_RANGES.female 
    : REF_RANGES.male;
  
  if (value > range.max) return "High";
  if (value < range.min) return "Low";
  return "Normal";
}

/**
 * Process image with OCR to extract text
 * @param {string} imagePath - Path to the image file
 * @returns {Promise<string>} - Extracted text
 */
async function extractTextFromImage(imagePath) {
  let tempOptimizedPath = null;
  try {
    console.log(`Starting OCR for file: ${imagePath}`);
    
    // Check if file exists
    if (!fs.existsSync(imagePath)) {
      throw new Error(`File not found: ${imagePath}`);
    }

    // Optimize image for better OCR accuracy
    tempOptimizedPath = imagePath.replace(
      /(\.[^.]*)?$/,
      "_optimized.png"
    );

    console.log(`Optimizing image to: ${tempOptimizedPath}`);

    // Enhance image using Sharp (increase contrast, denoise)
    // Critical preprocessing for decimal point detection
    await sharp(imagePath)
      .grayscale()
      .linear(1.5, -0.2) // Boost contrast
      .threshold(160)    // CRITICAL: Makes decimal points solid black/white
      .sharpen()         // Makes edges crisper
      .png()
      .toFile(tempOptimizedPath);

    console.log(`Image optimization complete`);
    console.log(`Starting Tesseract OCR...`);

    // Initialize Tesseract worker
    const worker = await initializeTesseract();

    // Perform OCR with faster settings
    const { data: { text } } = await worker.recognize(tempOptimizedPath, {
      tessedit_pageseg_mode: "6", // Assume uniform block of text
      tessedit_char_whitelist: "0123456789.ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz:=/- ",
    });
    
    console.log(`OCR completed. Extracted text length: ${text.length}`);
    console.log(`Extracted text preview: ${text.substring(0, 200)}`);

    // Clean up temporary file
    if (tempOptimizedPath && fs.existsSync(tempOptimizedPath)) {
      fs.unlinkSync(tempOptimizedPath);
      console.log(`Cleaned up temporary file`);
    }

    return text;
  } catch (error) {
    console.error("OCR Error:", error);
    console.error("Error details:", error.stack);
    
    // Clean up temporary file on error
    if (tempOptimizedPath && fs.existsSync(tempOptimizedPath)) {
      try {
        fs.unlinkSync(tempOptimizedPath);
      } catch (e) {
        console.error("Error deleting temp file:", e);
      }
    }
    
    throw new Error(`OCR processing failed: ${error.message}`);
  }
}

/**
 * Extract lab values from OCR text
 * @param {string} text - OCR extracted text
 * @returns {Object} - Extracted lab values including age and gender
 */
function extractLabValues(text) {
  const extractedValues = {
    eGFR: null,
    creatinine: null,
    bun: null,
    albumin: null,
    age: null,
    gender: null,
    confidence: {},
  };

  // Extract eGFR (case-insensitive)
  const eGFRPatterns = [
    /egfr\s*[\:\=\s]*(\d+\.?\d*)/i,
    /estimated glomerular filtration rate\s*[\:\=\s]*(\d+\.?\d*)/i,
    /gfr\s*[\:\=\s]*(\d+\.?\d*)/i,
    /e\.gfr\s*[\:\=\s]*(\d+\.?\d*)/i,
  ];

  for (const pattern of eGFRPatterns) {
    const match = text.match(pattern);
    if (match) {
      const value = parseFloat(match[1]);
      if (value >= 0 && value <= 200) {
        extractedValues.eGFR = value;
        extractedValues.confidence.eGFR = "high";
        break;
      }
    }
  }

  // Extract Creatinine (case-insensitive) with enhanced decimal handling
  const creatininePatterns = [
    /creatinine\s*[\:\=\s]*(\d+[\s\.\,]*\d*)/i, // Matches "1.5", "1 . 5", "1,5", "15"
    /serum creatinine\s*[\:\=\s]*(\d+[\s\.\,]*\d*)/i,
    /s\.creatinine\s*[\:\=\s]*(\d+[\s\.\,]*\d*)/i,
    /cr\s*[\:\=\s]*(\d+[\s\.\,]*\d*)\s*(?:mg|mg\/dl)?/i,
  ];

  for (const pattern of creatininePatterns) {
    const match = text.match(pattern);
    if (match) {
      // Clean the string: replace commas or spaces with a single dot
      let rawStr = match[1].replace(/[\s\,]/g, '.');
      
      // Remove trailing dot if exists
      rawStr = rawStr.replace(/\.$/, '');
      
      let value = parseFloat(rawStr);

      // If OCR missed the dot entirely (e.g., "15" instead of "1.5")
      // For creatinine, values > 10 are extremely rare, likely OCR error
      if (value > 10 && value < 100) {
        // Likely missing decimal point - try to fix
        const strValue = value.toString();
        if (strValue.length >= 2) {
          // Insert decimal point after first digit (15 -> 1.5)
          value = parseFloat(strValue[0] + '.' + strValue.substring(1));
          extractedValues.confidence.creatinine = "medium - auto-corrected decimal";
        } else {
          extractedValues.confidence.creatinine = "low - extreme value or missing decimal";
        }
      } else if (value >= 0 && value <= 20) {
        extractedValues.confidence.creatinine = "high";
      } else {
        extractedValues.confidence.creatinine = "low - value out of range";
      }

      if (value >= 0 && value <= 20) {
        extractedValues.creatinine = value;
        break;
      }
    }
  }

  // Extract BUN (case-insensitive)
  const bunPatterns = [
    /bun\s*[\:\=\s]*(\d+\.?\d*)\s*(?:mg|mg\/dl|mg\/dL)?/i,
    /blood urea nitrogen\s*[\:\=\s]*(\d+\.?\d*)/i,
    /urea nitrogen\s*[\:\=\s]*(\d+\.?\d*)/i,
    /b\.u\.n\s*[\:\=\s]*(\d+\.?\d*)/i,
  ];

  for (const pattern of bunPatterns) {
    const match = text.match(pattern);
    if (match) {
      const value = parseFloat(match[1]);
      if (value >= 0 && value <= 300) {
        extractedValues.bun = value;
        extractedValues.confidence.bun = "high";
        break;
      }
    }
  }

  // Extract Albumin (case-insensitive)
  const albuminPatterns = [
    /albumin\s*[\:\=\s]*(\d+\.?\d*)\s*(?:g|g\/dl|g\/dL)?/i,
    /serum albumin\s*[\:\=\s]*(\d+\.?\d*)/i,
    /s\.albumin\s*[\:\=\s]*(\d+\.?\d*)/i,
    /alb\s*[\:\=\s]*(\d+\.?\d*)\s*(?:g|g\/dl)?/i,
  ];

  for (const pattern of albuminPatterns) {
    const match = text.match(pattern);
    if (match) {
      const value = parseFloat(match[1]);
      if (value >= 0 && value <= 10) {
        extractedValues.albumin = value;
        extractedValues.confidence.albumin = "high";
        break;
      }
    }
  }

  // Extract Age (case-insensitive)
  const agePatterns = [
    /age\s*[\:\=\s]*(\d+)\s*(?:years?|yrs?|y)?/i,
    /(\d+)\s*(?:years?|yrs?)\s*old/i,
    /patient age\s*[\:\=\s]*(\d+)/i,
    /dob.*?(\d+)\s*(?:years?|yrs?)/i,
  ];

  for (const pattern of agePatterns) {
    const match = text.match(pattern);
    if (match) {
      const value = parseInt(match[1]);
      if (value >= 1 && value <= 120) {
        extractedValues.age = value;
        extractedValues.confidence.age = "high";
        break;
      }
    }
  }

  // Extract Gender (case-insensitive)
  const genderPatterns = [
    /gender\s*[\:\=\s]*(male|female|m|f)/i,
    /sex\s*[\:\=\s]*(male|female|m|f)/i,
    /patient\s*[\:\=\s]*(male|female|m|f)/i,
    /(male|female)\s*patient/i,
  ];

  for (const pattern of genderPatterns) {
    const match = text.match(pattern);
    if (match) {
      const genderText = match[1].toUpperCase();
      if (genderText === "M" || genderText === "MALE") {
        extractedValues.gender = "M";
        extractedValues.confidence.gender = "high";
        break;
      } else if (genderText === "F" || genderText === "FEMALE") {
        extractedValues.gender = "F";
        extractedValues.confidence.gender = "high";
        break;
      }
    }
  }

  return extractedValues;
}

/**
 * Calculate eGFR using CKD-EPI 2021 Equation (Latest standard)
 * eGFR = 142 × min(Scr/0.9, 1)^(-0.302) × max(Scr/0.9, 1)^(-1.200) × 0.9938^Age × [1.012 if female]
 * @param {number} creatinine - Serum creatinine (mg/dL)
 * @param {number} age - Patient age in years
 * @param {string} gender - 'M' or 'F' (default: 'M')
 * @returns {number} - Calculated eGFR (mL/min/1.73m²)
 */
function calculateEGFRFromCreatinine(creatinine, age, gender = "M") {
  // CKD-EPI 2021 Equation
  const Scr = creatinine;
  const Age = age;
  
  // Calculate min(Scr/0.9, 1) and max(Scr/0.9, 1)
  const scrRatio = Scr / 0.9;
  const minValue = Math.min(scrRatio, 1);
  const maxValue = Math.max(scrRatio, 1);
  
  // Base calculation
  let eGFR = 142 * 
             Math.pow(minValue, -0.302) * 
             Math.pow(maxValue, -1.200) * 
             Math.pow(0.9938, Age);
  
  // Gender adjustment: Female × 1.012, Male × 1.000 (case-insensitive)
  const genderUpper = (gender || "M").toString().toUpperCase();
  if (genderUpper === "F" || genderUpper === "FEMALE" || genderUpper.startsWith("F")) {
    eGFR = eGFR * 1.012;
  }
  
  // Round to 1 decimal place
  return Math.round(eGFR * 10) / 10;
}

/**
 * Process lab report and extract all values
 * @param {string} imagePath - Path to lab report image
 * @param {Object} additionalData - Additional patient data (age, gender)
 * @returns {Promise<Object>} - All extracted lab values
 */
async function processLabReport(imagePath, additionalData = {}) {
  try {
    // Extract text from image
    const extractedText = await extractTextFromImage(imagePath);

    // Extract lab values (including age and gender from image)
    const labValues = extractLabValues(extractedText);

    // Use extracted age/gender from OCR if not provided in additionalData
    const finalAge = additionalData.age || labValues.age;
    const finalGender = additionalData.gender || labValues.gender || "M";

    // If eGFR is missing but creatinine is available, calculate it
    if (!labValues.eGFR && labValues.creatinine && finalAge) {
      console.log(`Calculating eGFR: creatinine=${labValues.creatinine}, age=${finalAge}, gender=${finalGender}`);
      labValues.eGFR = calculateEGFRFromCreatinine(
        labValues.creatinine,
        finalAge,
        finalGender
      );
      labValues.confidence.eGFR = "calculated";
    }

    // Update age and gender in labValues if they were provided in additionalData
    if (additionalData.age && !labValues.age) {
      labValues.age = additionalData.age;
    }
    if (additionalData.gender && !labValues.gender) {
      labValues.gender = additionalData.gender;
    }

    // Validate creatinine against reference ranges if available
    if (labValues.creatinine && finalGender) {
      labValues.creatinineStatus = validateResult(labValues.creatinine, finalGender);
    }

    return {
      success: true,
      extractedText: extractedText.substring(0, 500), // Store first 500 chars
      labValues: labValues,
      extractionTime: new Date(),
    };
  } catch (error) {
    throw error;
  }
}

module.exports = {
  extractTextFromImage,
  extractLabValues,
  calculateEGFRFromCreatinine,
  processLabReport,
  validateResult,
  initializeTesseract,
  terminateTesseract,
};
