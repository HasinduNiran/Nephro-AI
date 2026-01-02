# Future CKD Stage Prediction Feature

## Overview
A complete implementation for predicting future CKD stage progression using lab reports and optional ultrasound images.

## Features Implemented

### 1. Upload Screen (`FutureCKDStageScreen.js`)
- **Lab Report Upload** (Required)
  - Image picker for lab report (PNG/JPEG)
  - OCR extraction of lab values
  
- **Ultrasound Upload** (Optional)
  - Image picker for kidney ultrasound
  - Used for enhanced prediction accuracy

- **Patient Details**
  - Age input with increment/decrement buttons
  - Gender selection (Male/Female)
  - Both optional - can be extracted from lab report OCR

- **Manual Lab Values** (Collapsible Section)
  - Creatinine (mg/dL)
  - eGFR (mL/min/1.73m²)
  - BUN (mg/dL)
  - Albumin (g/dL)
  - Hemoglobin (g/dL)
  - These override OCR-extracted values when provided

- **Navigation**
  - Back button to return to ScanLab screen
  - Analyze button to submit for prediction

### 2. Result Screen (`FutureCKDStageResultScreen.js`)
- **Dual Predictions**
  - Lab-only prediction (always shown)
  - Lab + Ultrasound prediction (shown when ultrasound provided)
  - Each shows: current stage, predicted stage, progression trend

- **eGFR Information Box**
  - Current eGFR value
  - Source (OCR extracted, calculated, or manually entered)
  - Calculation method (CKD-EPI 2021 formula)
  - Age and gender used in calculation

- **Recommendations**
  - Personalized recommendations based on prediction
  - Back button to upload screen

### 3. Backend Processing

#### OCR Processing (`ocrProcessor.js`)
- Tesseract.js for text extraction
- Sharp for image preprocessing (grayscale, threshold, contrast)
- Regex patterns to extract:
  - Creatinine
  - eGFR
  - BUN
  - Albumin
  - Hemoglobin
  - Age and gender (from report header)
- Automatic eGFR calculation using CKD-EPI 2021 formula when:
  - eGFR not found in report
  - Creatinine is available
  - Age and gender are known

#### Stage Progression Controller (`stageProgressionController.js`)
**Data Flow:**
1. Receive lab report image (required) and ultrasound image (optional)
2. Extract patient details (age, gender) from request
3. Extract manual lab values from request (if provided)
4. Process lab report with OCR, passing age/gender for eGFR calculation
5. Override OCR values with manual values (if provided)
6. Use extracted age/gender if not provided by user
7. Calculate eGFR if still missing (using creatinine + age + gender)
8. Validate that eGFR is available (error if not)
9. Run lab-only prediction using Python LSTM model
10. If ultrasound provided, process it and run combined prediction
11. Return both predictions with eGFR information

**Error Handling:**
- Graceful OCR failure (fallback to manual values)
- Clear error messages when eGFR cannot be determined
- Guidance for users on how to resolve issues
- File cleanup on error

#### API Endpoint
```
POST /api/stage-progression/upload
Content-Type: multipart/form-data

Fields:
- labReport: File (required) - Lab report image
- ultrasound: File (optional) - Kidney ultrasound image
- name: String - Patient name
- age: Number (optional) - Patient age
- gender: String (optional) - "M" or "F"
- creatinine: Number (optional) - Manual creatinine value
- egfr: Number (optional) - Manual eGFR value
- bun: Number (optional) - Manual BUN value
- albumin: Number (optional) - Manual albumin value
- hemoglobin: Number (optional) - Manual hemoglobin value

Response:
{
  success: true,
  predictions: {
    labOnly: {
      currentStage: 3,
      predictedStage: 4,
      progression: "Progressive",
      confidence: 0.85
    },
    labWithUS: {
      currentStage: 3,
      predictedStage: 4,
      progression: "Progressive",
      confidence: 0.92
    }
  },
  egfrInfo: {
    value: 45.2,
    source: "ocr_extracted",
    method: "Calculated using CKD-EPI 2021 formula",
    age: 65,
    gender: "M"
  },
  recommendations: [...]
}
```

### 4. eGFR Calculation

**CKD-EPI 2021 Formula:**
```
For Female:
- If Scr ≤ 0.7: eGFR = 142 × (Scr/0.7)^(-0.241) × 0.9938^age
- If Scr > 0.7: eGFR = 142 × (Scr/0.7)^(-1.200) × 0.9938^age

For Male:
- If Scr ≤ 0.9: eGFR = 142 × (Scr/0.9)^(-0.302) × 0.9938^age
- If Scr > 0.9: eGFR = 142 × (Scr/0.9)^(-1.200) × 0.9938^age

Where:
- Scr = Serum creatinine in mg/dL
- age = Age in years
- eGFR = Estimated GFR in mL/min/1.73m²
```

**Priority Order for eGFR:**
1. Manual eGFR value (highest priority)
2. OCR-extracted eGFR from lab report
3. Calculated from creatinine + age + gender
4. Error if none available

### 5. Python Integration

**LSTM Model:** `ai-engine/models/ckd_lstm_model_withUS.h5`
- Predicts future CKD stage based on lab data
- Enhanced prediction when ultrasound features available

**Input Format:**
```python
{
  "lab_data": {
    "creatinine": float,
    "bun": float,
    "egfr": float,
    "gfr": float,
    "albumin": float,
    "hemoglobin": float,
    "potassium": float,
    "sodium": float
  },
  "us_features": {  # Optional
    "kidney_length": float,
    "cortical_thickness": float,
    "echogenicity": float
  }
}
```

## Testing Checklist

### Upload Screen
- [ ] Can pick lab report image
- [ ] Can pick ultrasound image (optional)
- [ ] Age increment/decrement works
- [ ] Gender selection works
- [ ] Manual lab values section expands/collapses
- [ ] Manual values can be entered
- [ ] Back button returns to ScanLab
- [ ] Analyze button submits data
- [ ] Loading indicator shows during processing

### OCR Extraction
- [ ] Extracts creatinine from lab report
- [ ] Extracts eGFR from lab report
- [ ] Extracts other lab values (BUN, albumin, hemoglobin)
- [ ] Extracts age/gender from report header
- [ ] Calculates eGFR when missing but creatinine available
- [ ] Uses provided age/gender over extracted ones
- [ ] Handles OCR failure gracefully

### Manual Entry
- [ ] Manual creatinine overrides OCR value
- [ ] Manual eGFR overrides OCR/calculated value
- [ ] All manual values override OCR values
- [ ] Can proceed with only manual values (no OCR)

### Backend Processing
- [ ] Lab report file uploads successfully
- [ ] Ultrasound file uploads successfully
- [ ] OCR processing completes
- [ ] eGFR calculation works correctly
- [ ] Lab-only prediction runs
- [ ] Lab+US prediction runs when ultrasound provided
- [ ] Error handling works (missing eGFR)
- [ ] Files cleaned up after processing

### Result Screen
- [ ] Lab-only prediction displays correctly
- [ ] Lab+US prediction displays correctly (when available)
- [ ] eGFR info box shows correct data
- [ ] eGFR source is accurate (OCR/calculated/manual)
- [ ] Recommendations display
- [ ] Back button works
- [ ] Data matches backend response

## Error Messages

### User-Friendly Errors
1. **Missing Lab Report:**
   > "Lab report image is required"

2. **Cannot Calculate eGFR:**
   > "Could not calculate eGFR: [reason]. Please either: 1) Upload a clearer lab report image, 2) Provide manual lab values (expand Manual Lab Values section), or 3) Enter age, gender, and creatinine value."

3. **Prediction Failed:**
   > "Failed to predict CKD stage progression"

## Files Modified/Created

### Created:
- `mobile-app/src/screens/FutureCKDStageScreen.js`
- `mobile-app/src/screens/FutureCKDStageResultScreen.js`

### Modified:
- `mobile-app/App.js` - Added navigation routes
- `backend/controllers/stageProgressionController.js` - Added image upload endpoint
- `backend/routes/stageProgression.js` - Added /upload route with multer

### Dependencies Used:
- `ocrProcessor.js` - OCR and lab value extraction
- `ckd_lstm_model_withUS.h5` - LSTM prediction model
- Tesseract.js - Text extraction
- Sharp - Image preprocessing
- Multer - File upload handling

## Known Limitations

1. **OCR Accuracy:**
   - Depends on image quality
   - Requires clear, legible text
   - May not work with handwritten reports
   - Solution: Manual entry fallback

2. **Lab Report Formats:**
   - Regex patterns optimized for common formats
   - May miss values in unusual formats
   - Solution: Manual entry fallback

3. **Ultrasound Processing:**
   - Requires specific Python script (not detailed here)
   - Must extract kidney measurements
   - Optional feature

## Future Enhancements

1. **Advanced OCR:**
   - ML-based text recognition
   - Support for more lab report formats
   - Handwriting recognition

2. **Result History:**
   - Store predictions in database
   - Track progression over time
   - Compare with past predictions

3. **Export Results:**
   - PDF report generation
   - Email results to patient/doctor
   - Share with healthcare providers

4. **Enhanced Visualization:**
   - Charts showing progression over time
   - Risk factor breakdown
   - Treatment recommendations

## Support

For issues or questions:
1. Check console logs in both frontend and backend
2. Verify OCR extraction in backend logs
3. Test with manual values to isolate OCR issues
4. Ensure Python LSTM model is accessible
5. Check image file formats and sizes
