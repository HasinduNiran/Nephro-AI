import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import CustomInput from "../components/CustomInput";
import CustomButton from "../components/CustomButton";
import axios from "../api/axiosConfig";

const RiskPredictionScreen = ({ navigation, route }) => {
  // Get userId from route params or use a default for testing
  const userId = route?.params?.userId || "test-user-id";

  const [bpSystolic, setBpSystolic] = useState("");
  const [bpDiastolic, setBpDiastolic] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("Male"); // Male or Female
  const [hba1cLevel, setHba1cLevel] = useState(""); // HbA1c level (%)
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [riskLevel, setRiskLevel] = useState(null);
  const [riskScore, setRiskScore] = useState(null);
  const [isSaved, setIsSaved] = useState(false);

  // Fetch user data on component mount
  useEffect(() => {
    const loadUserData = async () => {
      try {
        const userDataString = await AsyncStorage.getItem("userData");
        if (userDataString) {
          const userData = JSON.parse(userDataString);

          // Set gender from user data
          if (userData.gender) {
            setGender(userData.gender);
          }

          // Calculate age from birthday
          if (userData.birthday) {
            const birthDate = new Date(userData.birthday);
            const today = new Date();
            let calculatedAge = today.getFullYear() - birthDate.getFullYear();
            const monthDiff = today.getMonth() - birthDate.getMonth();

            if (
              monthDiff < 0 ||
              (monthDiff === 0 && today.getDate() < birthDate.getDate())
            ) {
              calculatedAge--;
            }

            setAge(calculatedAge.toString());
          }
        }
      } catch (error) {
        console.error("Error loading user data:", error);
      }
    };

    loadUserData();
  }, []);

  // Validation ranges for inputs
  const VALIDATION_RANGES = {
    bpSystolic: { min: 70, max: 250, label: "Systolic BP" },
    bpDiastolic: { min: 40, max: 150, label: "Diastolic BP" },
    hba1cLevel: { min: 4.0, max: 14.0, label: "HbA1c Level" },
  };

  const validateInput = (value, field) => {
    const range = VALIDATION_RANGES[field];
    const numValue = parseFloat(value);

    if (isNaN(numValue)) {
      return { valid: false, message: `${range.label} must be a valid number` };
    }
    if (numValue < range.min) {
      return {
        valid: false,
        message: `${range.label} must be at least ${range.min}`,
      };
    }
    if (numValue > range.max) {
      return {
        valid: false,
        message: `${range.label} must not exceed ${range.max}`,
      };
    }
    return { valid: true };
  };

  const onPredictPressed = async () => {
    if (!bpSystolic || !bpDiastolic || !age) {
      Alert.alert(
        "Error",
        "Please fill in Blood Pressure (Systolic and Diastolic) and Age"
      );
      return;
    }

    // Validate Systolic BP
    const systolicValidation = validateInput(bpSystolic, "bpSystolic");
    if (!systolicValidation.valid) {
      Alert.alert("Invalid Input", systolicValidation.message);
      return;
    }

    // Validate Diastolic BP
    const diastolicValidation = validateInput(bpDiastolic, "bpDiastolic");
    if (!diastolicValidation.valid) {
      Alert.alert("Invalid Input", diastolicValidation.message);
      return;
    }

    // Validate that Systolic > Diastolic
    if (parseFloat(bpSystolic) <= parseFloat(bpDiastolic)) {
      Alert.alert(
        "Invalid Input",
        "Systolic BP must be greater than Diastolic BP"
      );
      return;
    }

    // Validate HbA1c Level (if provided)
    if (hba1cLevel) {
      const hba1cValidation = validateInput(hba1cLevel, "hba1cLevel");
      if (!hba1cValidation.valid) {
        Alert.alert("Invalid Input", hba1cValidation.message);
        return;
      }
    }

    setLoading(true);
    setRiskLevel(null);
    setRiskScore(null);
    setIsSaved(false);

    try {
      const requestData = {
        bp_systolic: bpSystolic,
        bp_diastolic: bpDiastolic,
        age,
        gender,
      };

      // If HbA1c level is provided, use it
      if (hba1cLevel) {
        requestData.hba1c_level = hba1cLevel;
      }

      const response = await axios.post("/predict", requestData);

      setRiskLevel(response.data.risk_level);
      // Use risk_score from backend
      const score =
        response.data.risk_score ||
        calculateRiskScore(response.data.risk_level);
      setRiskScore(score);
    } catch (error) {
      console.error("Prediction Error:", error);
      Alert.alert("Error", "Failed to predict risk. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Calculate a numeric risk score based on risk level if not provided by backend
  const calculateRiskScore = (level) => {
    const lowerLevel = level?.toLowerCase() || "";
    if (lowerLevel.includes("low")) return 33;
    if (lowerLevel.includes("medium")) return 66;
    if (lowerLevel.includes("high")) return 100;
    return 50;
  };

  const onSavePressed = async () => {
    if (!riskLevel || riskScore === null) {
      Alert.alert("Error", "Please predict risk first before saving.");
      return;
    }

    setSaving(true);

    try {
      const response = await axios.post("/risk-history/save", {
        userId,
        riskLevel,
        riskScore,
        vitalSigns: {
          bpSystolic: parseFloat(bpSystolic),
          bpDiastolic: parseFloat(bpDiastolic),
          age: parseFloat(age),
          gender,
          hba1cLevel: hba1cLevel ? parseFloat(hba1cLevel) : null,
        },
      });

      setIsSaved(true);

      const message = response.data.isUpdate
        ? "Your risk record for this month has been updated!"
        : "Your risk record has been saved for this month!";

      Alert.alert("Success", message, [
        { text: "OK" },
        {
          text: "View History",
          onPress: () => navigation.navigate("RiskHistory", { userId }),
        },
      ]);
    } catch (error) {
      console.error("Save Error:", error);
      Alert.alert("Error", "Failed to save risk record. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const getRiskColor = (level) => {
    const lowerLevel = level?.toLowerCase() || "";
    if (lowerLevel.includes("low")) return "#2ED573";
    if (lowerLevel.includes("medium")) return "#FFA502";
    if (lowerLevel.includes("high")) return "#FF4757";
    return "#747D8C";
  };

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      <Text style={styles.title}>Early Risk Prediction</Text>
      <Text style={styles.subtitle}>Enter your vital signs below</Text>

      <View style={styles.readOnlyContainer}>
        <View style={styles.readOnlyField}>
          <Text style={styles.readOnlyLabel}>Gender:</Text>
          <Text style={styles.readOnlyValue}>{gender || "Not set"}</Text>
        </View>
        <View style={styles.readOnlyField}>
          <Text style={styles.readOnlyLabel}>Age:</Text>
          <Text style={styles.readOnlyValue}>{age || "Not set"} years</Text>
        </View>
      </View>

      <CustomInput
        placeholder="Systolic BP (mmHg) *Required"
        value={bpSystolic}
        setValue={setBpSystolic}
        keyboardType="numeric"
        helperText="Range: 70-250 mmHg"
      />
      <CustomInput
        placeholder="Diastolic BP (mmHg) *Required"
        value={bpDiastolic}
        setValue={setBpDiastolic}
        keyboardType="numeric"
        helperText="Range: 40-150 mmHg"
      />
      <CustomInput
        placeholder="HbA1c Level (%) - Optional"
        value={hba1cLevel}
        setValue={setHba1cLevel}
        keyboardType="numeric"
        helperText="Range: 4.0-14.0%"
      />

      <CustomButton text="Predict Risk" onPress={onPredictPressed} />

      {loading && (
        <ActivityIndicator
          size="large"
          color="#4A90E2"
          style={{ marginTop: 20 }}
        />
      )}

      {riskLevel && (
        <View style={styles.resultContainer}>
          <Text style={styles.resultLabel}>Predicted Risk Level:</Text>
          <Text
            style={[styles.resultValue, { color: getRiskColor(riskLevel) }]}
          >
            {riskLevel}
          </Text>

          {riskScore !== null && (
            <View style={styles.scoreContainer}>
              <Text style={styles.scoreLabel}>Risk Score:</Text>
              <Text
                style={[styles.scoreValue, { color: getRiskColor(riskLevel) }]}
              >
                {riskScore.toFixed(0)}
              </Text>
            </View>
          )}

          {/* Save Button */}
          <TouchableOpacity
            style={[
              styles.saveButton,
              isSaved && styles.savedButton,
              saving && styles.savingButton,
            ]}
            onPress={onSavePressed}
            disabled={saving || isSaved}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Text style={styles.saveButtonText}>
                  {isSaved
                    ? "✓ Saved for This Month"
                    : "💾 Save Monthly Record"}
                </Text>
              </>
            )}
          </TouchableOpacity>

          {isSaved && (
            <Text style={styles.savedHint}>
              Your record has been saved. View your history to see the trend.
            </Text>
          )}
        </View>
      )}

      {/* View History Button */}
      <TouchableOpacity
        style={styles.historyButton}
        onPress={() => navigation.navigate("RiskHistory", { userId })}
      >
        <Text style={styles.historyButtonText}>
          📊 View Risk History & Trend
        </Text>
      </TouchableOpacity>

      {/* Info Card */}
      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>💡 About the Prediction</Text>
        <Text style={styles.infoText}>
          {"\n\n"}Required: Systolic BP, Diastolic BP, and Age
          {"\n"}Optional: HbA1c Level (%)
          {"\n\n"}Both blood pressure values are important for accurate kidney
          health assessment.
          {"\n\n"}Save your prediction each month to track your kidney health
          trend over time.
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
    alignItems: "center",
    backgroundColor: "#F5F7FA",
    flexGrow: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1C1C1E",
    marginBottom: 10,
    marginTop: 20,
  },
  subtitle: {
    fontSize: 16,
    color: "#8E8E93",
    marginBottom: 30,
  },
  readOnlyContainer: {
    width: "100%",
    backgroundColor: "#F0F0F0",
    borderRadius: 8,
    padding: 15,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  readOnlyField: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  readOnlyLabel: {
    fontSize: 16,
    color: "#666",
    fontWeight: "600",
  },
  readOnlyValue: {
    fontSize: 16,
    color: "#333",
    fontWeight: "500",
  },
  genderContainer: {
    width: "100%",
    marginBottom: 15,
  },
  genderLabel: {
    fontSize: 16,
    color: "#333",
    marginBottom: 10,
    fontWeight: "500",
  },
  genderButtons: {
    flexDirection: "row",
    gap: 10,
  },
  genderButton: {
    flex: 1,
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#E5E5E5",
    backgroundColor: "#FFF",
    alignItems: "center",
  },
  genderButtonActive: {
    borderColor: "#4A90E2",
    backgroundColor: "#EBF4FF",
  },
  genderButtonText: {
    fontSize: 16,
    color: "#666",
    fontWeight: "600",
  },
  genderButtonTextActive: {
    color: "#4A90E2",
  },
  resultContainer: {
    marginTop: 30,
    padding: 20,
    backgroundColor: "#fff",
    borderRadius: 15,
    width: "100%",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  resultLabel: {
    fontSize: 18,
    color: "#666",
    marginBottom: 5,
  },
  resultValue: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#FF6B6B",
  },
  scoreContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 15,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: "#E5E5E5",
    width: "100%",
    justifyContent: "center",
  },
  scoreLabel: {
    fontSize: 16,
    color: "#666",
    marginRight: 10,
  },
  scoreValue: {
    fontSize: 24,
    fontWeight: "bold",
  },
  saveButton: {
    backgroundColor: "#3B71F3",
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 8,
    marginTop: 20,
    width: "100%",
    alignItems: "center",
  },
  savedButton: {
    backgroundColor: "#2ED573",
  },
  savingButton: {
    backgroundColor: "#8E8E93",
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  savedHint: {
    fontSize: 12,
    color: "#8E8E93",
    marginTop: 10,
    textAlign: "center",
  },
  historyButton: {
    backgroundColor: "#f0f0f0",
    paddingVertical: 15,
    paddingHorizontal: 25,
    borderRadius: 10,
    marginTop: 20,
    width: "100%",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E5E5",
  },
  historyButtonText: {
    color: "#333",
    fontSize: 16,
    fontWeight: "600",
  },
  infoCard: {
    backgroundColor: "#E8F4FD",
    borderRadius: 12,
    padding: 15,
    marginTop: 20,
    width: "100%",
    borderLeftWidth: 4,
    borderLeftColor: "#3B71F3",
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 5,
  },
  infoText: {
    fontSize: 13,
    color: "#555",
    lineHeight: 20,
  },
});

export default RiskPredictionScreen;
