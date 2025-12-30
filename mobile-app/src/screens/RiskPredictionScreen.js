import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Switch,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import CustomInput from "../components/CustomInput";
import CustomButton from "../components/CustomButton";
import axios from "../api/axiosConfig";

const RiskPredictionScreen = ({ navigation, route }) => {
  // Get userId from route params or use a default for testing
  const userId = route?.params?.userId || "test-user-id";

  const [spo2, setSpo2] = useState("");
  const [heartRate, setHeartRate] = useState("");
  const [bpSystolic, setBpSystolic] = useState("");
  const [age, setAge] = useState("");
  const [hasDiabetes, setHasDiabetes] = useState(false);
  const [hasHypertension, setHasHypertension] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [riskLevel, setRiskLevel] = useState(null);
  const [riskScore, setRiskScore] = useState(null);
  const [isSaved, setIsSaved] = useState(false);

  const onPredictPressed = async () => {
    if (!spo2 || !heartRate || !bpSystolic || !age) {
      Alert.alert("Error", "Please fill in all numeric fields");
      return;
    }

    setLoading(true);
    setRiskLevel(null);
    setRiskScore(null);
    setIsSaved(false);

    try {
      const response = await axios.post("/predict", {
        spo2,
        heart_rate: heartRate,
        bp_systolic: bpSystolic,
        age,
        diabetes: hasDiabetes,
        hypertension: hasHypertension,
      });

      setRiskLevel(response.data.risk_level);
      // If the backend returns a risk_score, use it; otherwise calculate from risk_level
      const score = response.data.risk_score || calculateRiskScore(response.data.risk_level);
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
          spo2: parseFloat(spo2),
          heartRate: parseFloat(heartRate),
          bpSystolic: parseFloat(bpSystolic),
          age: parseFloat(age),
          diabetes: hasDiabetes,
          hypertension: hasHypertension,
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

      <CustomInput
        placeholder="SPO2 (%)"
        value={spo2}
        setValue={setSpo2}
        keyboardType="numeric"
      />
      <CustomInput
        placeholder="Heart Rate (bpm)"
        value={heartRate}
        setValue={setHeartRate}
        keyboardType="numeric"
      />
      <CustomInput
        placeholder="Systolic BP (mmHg)"
        value={bpSystolic}
        setValue={setBpSystolic}
        keyboardType="numeric"
      />
      <CustomInput
        placeholder="Age"
        value={age}
        setValue={setAge}
        keyboardType="numeric"
      />

      <View style={styles.switchContainer}>
        <Text style={styles.switchLabel}>Do you have Diabetes?</Text>
        <Switch
          value={hasDiabetes}
          onValueChange={setHasDiabetes}
          trackColor={{ false: "#767577", true: "#4A90E2" }}
          thumbColor={hasDiabetes ? "#f4f3f4" : "#f4f3f4"}
        />
      </View>

      <View style={styles.switchContainer}>
        <Text style={styles.switchLabel}>Do you have Hypertension?</Text>
        <Switch
          value={hasHypertension}
          onValueChange={setHasHypertension}
          trackColor={{ false: "#767577", true: "#4A90E2" }}
          thumbColor={hasHypertension ? "#f4f3f4" : "#f4f3f4"}
        />
      </View>

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
          <Text style={[styles.resultValue, { color: getRiskColor(riskLevel) }]}>
            {riskLevel}
          </Text>
          
          {riskScore !== null && (
            <View style={styles.scoreContainer}>
              <Text style={styles.scoreLabel}>Risk Score:</Text>
              <Text style={[styles.scoreValue, { color: getRiskColor(riskLevel) }]}>
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
                  {isSaved ? "✓ Saved for This Month" : "💾 Save Monthly Record"}
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
        <Text style={styles.historyButtonText}>📊 View Risk History & Trend</Text>
      </TouchableOpacity>

      {/* Info Card */}
      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>💡 Tip</Text>
        <Text style={styles.infoText}>
          Save your prediction each month to track your kidney health trend over time.
          The app will calculate the slope (m) of your risk trend using linear regression (y = mx + c).
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
  switchContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    paddingVertical: 15,
    paddingHorizontal: 10,
    backgroundColor: "white",
    borderRadius: 5,
    marginBottom: 10,
    borderColor: "#e8e8e8",
    borderWidth: 1,
  },
  switchLabel: {
    fontSize: 16,
    color: "#333",
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

