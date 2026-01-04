# 🩺 Medical Reference Levels - Hypertension & Blood Sugar

## Table of Contents
1. [Blood Pressure (Hypertension) Levels](#1-blood-pressure-hypertension-levels)
2. [Blood Sugar (Diabetes) Levels](#2-blood-sugar-diabetes-levels)
3. [Relationship to CKD](#relationship-to-ckd-chronic-kidney-disease)
4. [Risk Level Matrix](#risk-level-matrix-used-in-nephro-ai)
5. [Clinical Guidelines](#clinical-guidelines)

---

## 1. Blood Pressure (Hypertension) Levels

### Understanding Blood Pressure Reading
Blood pressure is written as **Systolic/Diastolic** (e.g., 120/80 mmHg)
- **Systolic** (upper number): Pressure when heart beats (contracts)
- **Diastolic** (lower number): Pressure when heart rests between beats

### Clinical Categories (American Heart Association)

| Category | Systolic (mmHg) | Diastolic (mmHg) | Example | Status |
|----------|-----------------|------------------|---------|--------|
| 🟢 **NORMAL** | < 120 | AND < 80 | 115/75 | ✓ Healthy range |
| 🟡 **ELEVATED** | 120-129 | AND < 80 | 125/78 | ⚠️ Warning - lifestyle changes needed |
| 🟠 **HYPERTENSION STAGE 1** | 130-139 | OR 80-89 | 135/85 | ⚠️ High BP - medication may be considered |
| 🔴 **HYPERTENSION STAGE 2** | ≥ 140 | OR ≥ 90 | 145/95 | 🚨 High risk - medication usually required |
| 🚨 **HYPERTENSIVE CRISIS** | > 180 | OR > 120 | 185/125 | 🚨 EMERGENCY - Seek immediate medical care |

### Visual Scale - Systolic BP

```
70   90   110  120  130  140  160  180  200  220  240  250
│    │    │    │    │    │    │    │    │    │    │    │
└────┴────┴────┼────┼────┼────┼────┴────┴────┴────┴────┘
          🟢   │🟡  │🟠  │🔴         🚨
         NORMAL│ELEV│STG1│STAGE 2   CRISIS
```

### Key Blood Pressure Facts

- **Optimal**: < 120/80 mmHg
- **White Coat Hypertension**: High readings only in medical settings
- **Masked Hypertension**: Normal in clinic but high at home
- **Isolated Systolic Hypertension**: Systolic ≥ 140, Diastolic < 90 (common in elderly)

### Risk Factors for Hypertension
- Age > 60 years
- Family history
- Obesity (BMI > 30)
- High sodium diet
- Physical inactivity
- Excessive alcohol consumption
- Chronic stress
- Smoking

---

## 2. Blood Sugar (Diabetes) Levels

### Fasting Blood Sugar Test
Measured after 8+ hours without eating (overnight fast)

| Category | Fasting (mg/dL) | Fasting (mmol/L) | Example | Status |
|----------|-----------------|------------------|---------|--------|
| 🟢 **NORMAL** | 70-99 | 3.9-5.5 | 85 | ✓ Healthy glucose metabolism |
| 🟡 **PREDIABETES** | 100-125 | 5.6-6.9 | 110 | ⚠️ High risk - lifestyle intervention crucial |
| 🔴 **DIABETES** | ≥ 126 | ≥ 7.0 | 150 | 🚨 Diabetes diagnosis - treatment required |
| 🟣 **HYPOGLYCEMIA** | < 70 | < 3.9 | 60 | ⚠️ Too low - immediate sugar intake needed |
| 🚨 **SEVERE HIGH** | > 240 | > 13.3 | 280 | 🚨 Medical attention - risk of DKA |

### Visual Scale - Blood Sugar

```
50   70   90   100  126  150  180  240  300  400  500
│    │    │    │    │    │    │    │    │    │    │
└────┴────┼────┼────┼────┼────┼────┴────┴────┴────┘
     🟣   │🟢  │🟡  │🔴  │         🚨
     LOW  │NORM│PRE │DIABETES    SEVERE
```

### Random Blood Sugar Test
Measured at any time (non-fasting)

| Category | Random (mg/dL) | Status |
|----------|----------------|--------|
| Normal | < 140 | Healthy |
| Prediabetes | 140-199 | Warning |
| Diabetes | ≥ 200 | Requires treatment |

### HbA1c Test (3-month average)

| Category | HbA1c Level | Average Glucose (mg/dL) |
|----------|-------------|------------------------|
| 🟢 **Normal** | < 5.7% | < 117 |
| 🟡 **Prediabetes** | 5.7-6.4% | 117-137 |
| 🔴 **Diabetes** | ≥ 6.5% | ≥ 140 |
| **Good Control** (if diabetic) | < 7.0% | < 154 |
| **Fair Control** | 7.0-8.0% | 154-183 |
| **Poor Control** | > 8.0% | > 183 |

### Diabetes Types

#### Type 1 Diabetes
- Autoimmune condition
- Body doesn't produce insulin
- Usually diagnosed in children/young adults
- Requires insulin injections

#### Type 2 Diabetes
- Most common (90-95% of cases)
- Body becomes insulin resistant
- Usually develops in adults
- Managed with diet, exercise, and medication

#### Gestational Diabetes
- Develops during pregnancy
- Usually resolves after delivery
- Increases risk of Type 2 later

---

## 🔗 Relationship to CKD (Chronic Kidney Disease)

### How High BP Damages Kidneys

```
HIGH BLOOD PRESSURE
        ↓
Damages blood vessels in kidneys
        ↓
Reduced filtration capacity
        ↓
Protein leaks into urine (proteinuria)
        ↓
CHRONIC KIDNEY DISEASE
```

**Statistics:**
- Hypertension is the **#2 cause** of kidney failure (25-30% of cases)
- 30% of people with hypertension develop CKD
- Uncontrolled BP accelerates kidney decline

### How High Blood Sugar Damages Kidneys

```
HIGH BLOOD SUGAR
        ↓
Damages tiny filters (nephrons) in kidneys
        ↓
Glomerular damage (diabetic nephropathy)
        ↓
Excessive protein in urine
        ↓
CHRONIC KIDNEY DISEASE
```

**Statistics:**
- Diabetes is the **#1 cause** of kidney failure (40-50% of cases)
- 50% of diabetics develop some kidney disease
- Diabetic nephropathy develops after 5-10 years of uncontrolled diabetes

### Combined Effect: Double Trouble

**Diabetes + Hypertension = 🚨 Exponential Risk**

| Condition | CKD Risk |
|-----------|----------|
| Neither | 1x (baseline) |
| Hypertension alone | 3-5x |
| Diabetes alone | 4-6x |
| **Both together** | **10-15x** |

---

## 📊 Risk Level Matrix (Used in Nephro-AI)

### CKD Risk Based on BP and Blood Sugar

|  | **Normal Glucose**<br>(< 100 mg/dL) | **Prediabetes**<br>(100-125 mg/dL) | **Diabetes**<br>(≥ 126 mg/dL) |
|---|---|---|---|
| **Normal BP**<br>(< 120/80) | 🟢 **LOW RISK**<br>Risk Score: 0-33 | 🟡 **MEDIUM RISK**<br>Risk Score: 33-50 | 🔴 **HIGH RISK**<br>Risk Score: 50-70 |
| **Elevated BP**<br>(120-129/<80) | 🟡 **MEDIUM RISK**<br>Risk Score: 25-40 | 🟠 **MEDIUM-HIGH RISK**<br>Risk Score: 40-60 | 🔴 **HIGH RISK**<br>Risk Score: 60-75 |
| **Stage 1 HTN**<br>(130-139/80-89) | 🟡 **MEDIUM RISK**<br>Risk Score: 35-55 | 🔴 **HIGH RISK**<br>Risk Score: 55-75 | 🔴 **HIGH RISK**<br>Risk Score: 70-85 |
| **Stage 2 HTN**<br>(≥ 140/90) | 🔴 **HIGH RISK**<br>Risk Score: 50-70 | 🔴 **HIGH RISK**<br>Risk Score: 70-85 | 🚨 **VERY HIGH RISK**<br>Risk Score: 85-100 |

### Risk Score Interpretation

- **0-33**: 🟢 Low Risk - Continue healthy lifestyle
- **33-66**: 🟡 Medium Risk - Lifestyle modifications recommended
- **66-100**: 🔴 High Risk - Medical intervention required

---

## 📋 Clinical Guidelines

### Target Levels for CKD Prevention

| Measure | General Target | High-Risk/CKD Target | Ideal |
|---------|---------------|---------------------|-------|
| **Systolic BP** | < 130 mmHg | < 120 mmHg | < 120 mmHg |
| **Diastolic BP** | < 80 mmHg | < 80 mmHg | < 80 mmHg |
| **Fasting Glucose** | < 100 mg/dL | < 100 mg/dL | 70-99 mg/dL |
| **HbA1c** | < 6.5% | < 7.0% | < 5.7% |
| **BMI** | 18.5-24.9 | 18.5-24.9 | 20-22 |

### Monitoring Frequency

#### For Normal Risk Individuals:
- Blood Pressure: Every 2 years (if < 120/80)
- Blood Sugar: Every 3 years (if < 100 mg/dL)
- HbA1c: Not routinely needed

#### For High Risk Individuals (CKD risk):
- Blood Pressure: Monthly or as directed
- Fasting Glucose: Every 3-6 months
- HbA1c: Every 3 months
- Kidney Function (eGFR, Creatinine): Every 6-12 months
- Urine Albumin: Annually

---

## 🚨 When to See a Doctor

### Immediate Medical Attention (Emergency)
- BP > 180/120 mmHg with symptoms (chest pain, shortness of breath, vision changes)
- Blood sugar > 400 mg/dL
- Blood sugar < 50 mg/dL with confusion or unconsciousness
- Signs of stroke (FAST: Face drooping, Arm weakness, Speech difficulty, Time to call)

### Schedule Appointment Soon
- BP consistently > 140/90 mmHg (two or more readings)
- Fasting blood sugar > 126 mg/dL (two or more readings)
- Random blood sugar > 200 mg/dL with symptoms
- Both BP and sugar elevated
- New symptoms: excessive thirst, frequent urination, unexplained fatigue

### Warning Symptoms of Kidney Problems
- Foamy or bubbly urine (protein)
- Blood in urine
- Reduced urine output
- Swelling in legs, ankles, or feet
- Persistent fatigue
- Loss of appetite
- Difficulty concentrating
- Muscle cramps

---

## 💊 Lifestyle Modifications

### For Blood Pressure Control

1. **DASH Diet** (Dietary Approaches to Stop Hypertension)
   - Rich in fruits, vegetables, whole grains
   - Low-fat dairy products
   - Lean proteins
   - Limit sodium to < 2,300 mg/day (ideally < 1,500 mg)

2. **Physical Activity**
   - 150 minutes/week moderate exercise
   - Or 75 minutes/week vigorous exercise
   - Examples: brisk walking, swimming, cycling

3. **Weight Management**
   - Lose 5-10% of body weight if overweight
   - Each 10 lbs lost can reduce BP by 5-20 mmHg

4. **Limit Alcohol**
   - Men: ≤ 2 drinks/day
   - Women: ≤ 1 drink/day

5. **Stress Management**
   - Meditation, yoga, deep breathing
   - Adequate sleep (7-9 hours)

### For Blood Sugar Control

1. **Carbohydrate Management**
   - Choose complex carbs over simple sugars
   - Control portion sizes
   - Include fiber-rich foods

2. **Regular Exercise**
   - Improves insulin sensitivity
   - Helps maintain healthy weight
   - 30 minutes daily activity

3. **Weight Loss**
   - 5-7% weight loss can prevent/delay Type 2 diabetes
   - Improves blood sugar control in existing diabetes

4. **Meal Timing**
   - Eat at regular times
   - Don't skip meals
   - Avoid large meals before bed

5. **Monitor Blood Sugar**
   - Check as recommended by doctor
   - Keep log of readings
   - Note patterns and triggers

---

## 📱 Integration with Nephro-AI

### How the App Uses These Values

1. **Risk Prediction Model**
   - Takes input: Age, Gender, BP (Systolic/Diastolic), Blood Sugar
   - Feature engineering creates 20 features from 5 inputs
   - ML model predicts risk category (Low/Medium/High)
   - Continuous score (0-100) calculated for trend tracking

2. **Trend Analysis**
   - Monthly records saved with timestamp
   - Linear regression (y = mx + c) calculates trend
   - Slope indicates if risk is increasing, decreasing, or steady
   - Visual graph shows progression over time

3. **Clinical Validation Ranges**
   - Systolic BP: 70-250 mmHg (min-max)
   - Diastolic BP: 40-150 mmHg (min-max)
   - Blood Sugar: 50-500 mg/dL (min-max)
   - Validates systolic > diastolic

---

## 📚 References

1. **American Heart Association (AHA)** - Blood Pressure Guidelines
2. **American Diabetes Association (ADA)** - Standards of Medical Care in Diabetes
3. **National Kidney Foundation (NKF)** - KDIGO Guidelines
4. **Centers for Disease Control and Prevention (CDC)** - Diabetes and Kidney Disease
5. **World Health Organization (WHO)** - Hypertension Management

---

## 📝 Notes

- This document is for educational purposes only
- Always consult healthcare professionals for diagnosis and treatment
- Individual target levels may vary based on age, health conditions, and medications
- Regular monitoring and medical follow-up are essential

---

**Last Updated:** January 4, 2026  
**Version:** 1.0  
**Project:** Nephro-AI - Early CKD Risk Prediction System
