import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Switch,
  ActivityIndicator,
} from "react-native";
import CustomInput from "../components/CustomInput";
import CustomButton from "../components/CustomButton";
import axios from "../api/axiosConfig";

const RiskPredictionScreen = () => {
  const [spo2, setSpo2] = useState("");
  const [heartRate, setHeartRate] = useState("");
  const [bpSystolic, setBpSystolic] = useState("");
  const [age, setAge] = useState("");
  const [hasDiabetes, setHasDiabetes] = useState(false);
  const [hasHypertension, setHasHypertension] = useState(false);
  const [loading, setLoading] = useState(false);
  const [riskLevel, setRiskLevel] = useState(null);

  const onPredictPressed = async () => {
    if (!spo2 || !heartRate || !bpSystolic || !age) {
      Alert.alert("Error", "Please fill in all numeric fields");
      return;
    }

    setLoading(true);
    setRiskLevel(null);

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
    } catch (error) {
      console.error("Prediction Error:", error);
      Alert.alert("Error", "Failed to predict risk. Please try again.");
    } finally {
      setLoading(false);
    }
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
          <Text style={styles.resultValue}>{riskLevel}</Text>
        </View>
      )}
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
});

export default RiskPredictionScreen;
