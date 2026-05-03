import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
  SafeAreaView,
  StatusBar,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import CustomInput from "../components/CustomInput";
import CustomButton from "../components/CustomButton";
import axios from "../api/axiosConfig";

// Format a Date object to "YYYY-MM-DD"
const toISODate = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

// Format a "YYYY-MM-DD" string for display: "Apr 18, 2026"
const toDisplayDate = (isoStr) => {
  if (!isoStr) return "";
  const [y, m, d] = isoStr.split("-").map(Number);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[m - 1]} ${d}, ${y}`;
};

const RiskPredictionScreen = ({ navigation, route }) => {
  const paramUserId = route?.params?.userId || route?.params?.userID;
  const [userId, setUserId] = useState(paramUserId || null);

  // 14-day date range: default to last 14 days (today inclusive)
  const today = new Date();
  const fourteenDaysAgo = new Date(today);
  fourteenDaysAgo.setDate(today.getDate() - 13);

  const [dateRangeStart, setDateRangeStart] = useState(fourteenDaysAgo);
  const [dateRangeEnd, setDateRangeEnd] = useState(today);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const [age, setAge] = useState("");
  const [gender, setGender] = useState("Male");
  const [hba1cLevel, setHba1cLevel] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [riskLevel, setRiskLevel] = useState(null);
  const [riskScore, setRiskScore] = useState(null);
  const [shapValues, setShapValues] = useState(null);
  const [shapBaseValue, setShapBaseValue] = useState(null);
  const [isSaved, setIsSaved] = useState(false);
  const [bpAvgLoading, setBpAvgLoading] = useState(false);
  const [bpAvgData, setBpAvgData] = useState(null);
  const [bpSystolic, setBpSystolic] = useState("");
  const [bpDiastolic, setBpDiastolic] = useState("");

  // Keep userId in sync when route params change
  useEffect(() => {
    const newParamId = route?.params?.userId || route?.params?.userID;
    if (newParamId && newParamId !== userId) {
      setUserId(newParamId);
    }
  }, [route?.params?.userId, route?.params?.userID]);

  // Resolve userId from AsyncStorage if not in route params
  useEffect(() => {
    const resolveUserId = async () => {
      if (!userId) {
        const storedId = await AsyncStorage.getItem("userID");
        if (storedId) setUserId(storedId);
      }
    };
    resolveUserId();
  }, []);

  // Load user profile (age, gender) from AsyncStorage
  useEffect(() => {
    const loadUserData = async () => {
      try {
        const userDataString = await AsyncStorage.getItem("userData");
        if (userDataString) {
          const userData = JSON.parse(userDataString);
          if (userData.gender) setGender(userData.gender);
          if (userData.birthday) {
            const birthDate = new Date(userData.birthday);
            const now = new Date();
            let calculatedAge = now.getFullYear() - birthDate.getFullYear();
            const monthDiff = now.getMonth() - birthDate.getMonth();
            if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate())) {
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

  // Fetch 14-day BP average whenever the date range or userId changes
  useEffect(() => {
    const load14DayBPAvg = async () => {
      try {
        const uid = userId || (await AsyncStorage.getItem("userID"));
        if (!uid) return;
        setBpAvgLoading(true);
        setBpAvgData(null);
        const startDate = toISODate(dateRangeStart);
        const endDate = toISODate(dateRangeEnd);
        const res = await axios.get(
          `/bp-records/${uid}/range-average?startDate=${startDate}&endDate=${endDate}`,
        );
        const data = res.data;
        setBpAvgData(data);
        if (data.recordCount > 0) {
          setBpSystolic(String(data.avgSystolic));
          setBpDiastolic(String(data.avgDiastolic));
        } else {
          setBpSystolic("");
          setBpDiastolic("");
        }
      } catch (err) {
        console.warn("load14DayBPAvg error:", err);
      } finally {
        setBpAvgLoading(false);
      }
    };
    load14DayBPAvg();
  }, [userId, dateRangeStart, dateRangeEnd]);

  const VALIDATION_RANGES = {
    bpSystolic: { min: 70, max: 250, label: "Systolic BP" },
    bpDiastolic: { min: 40, max: 150, label: "Diastolic BP" },
    hba1cLevel: { min: 4.0, max: 14.0, label: "HbA1c Level" },
  };

  const validateInput = (value, field) => {
    const range = VALIDATION_RANGES[field];
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return { valid: false, message: `${range.label} must be a valid number` };
    if (numValue < range.min) return { valid: false, message: `${range.label} must be at least ${range.min}` };
    if (numValue > range.max) return { valid: false, message: `${range.label} must not exceed ${range.max}` };
    return { valid: true };
  };

  const onPredictPressed = async () => {
    if (!bpSystolic || !bpDiastolic || !age) {
      Alert.alert("Error", "Please fill in Blood Pressure (Systolic and Diastolic) and Age");
      return;
    }

    const systolicValidation = validateInput(bpSystolic, "bpSystolic");
    if (!systolicValidation.valid) { Alert.alert("Invalid Input", systolicValidation.message); return; }

    const diastolicValidation = validateInput(bpDiastolic, "bpDiastolic");
    if (!diastolicValidation.valid) { Alert.alert("Invalid Input", diastolicValidation.message); return; }

    if (parseFloat(bpSystolic) <= parseFloat(bpDiastolic)) {
      Alert.alert("Invalid Input", "Systolic BP must be greater than Diastolic BP");
      return;
    }

    if (hba1cLevel) {
      const hba1cValidation = validateInput(hba1cLevel, "hba1cLevel");
      if (!hba1cValidation.valid) { Alert.alert("Invalid Input", hba1cValidation.message); return; }
    }

    setLoading(true);
    setRiskLevel(null);
    setRiskScore(null);
    setShapValues(null);
    setShapBaseValue(null);
    setIsSaved(false);

    try {
      const requestData = { bp_systolic: bpSystolic, bp_diastolic: bpDiastolic, age, gender };
      if (hba1cLevel) requestData.hba1c_level = hba1cLevel;

      const response = await axios.post("/predict", requestData);
      setRiskLevel(response.data.risk_level);
      const score = response.data.risk_score || calculateRiskScore(response.data.risk_level);
      setRiskScore(score);
      if (response.data.shap_values) {
        setShapValues(response.data.shap_values);
        setShapBaseValue(response.data.shap_base_value || 0);
      }
    } catch (error) {
      console.error("Prediction Error:", error);
      Alert.alert("Error", "Failed to predict risk. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const calculateRiskScore = (level) => {
    const lowerLevel = level?.toLowerCase() || "";
    if (lowerLevel.includes("low")) return 33;
    if (lowerLevel.includes("medium")) return 66;
    if (lowerLevel.includes("high")) return 100;
    return 50;
  };

  const onSavePressed = async () => {
    if (!userId) { Alert.alert("Error", "User not identified. Please log in again."); return; }
    if (!riskLevel || riskScore === null) { Alert.alert("Error", "Please predict risk first before saving."); return; }

    setSaving(true);
    try {
      const response = await axios.post("/risk-history/save", {
        userId,
        riskLevel,
        riskScore,
        periodStart: toISODate(dateRangeStart),
        periodEnd: toISODate(dateRangeEnd),
        vitalSigns: {
          bpSystolic: parseFloat(bpSystolic),
          bpDiastolic: parseFloat(bpDiastolic),
          age: parseFloat(age),
          gender,
          hba1cLevel: hba1cLevel ? parseFloat(hba1cLevel) : null,
        },
        shapValues: shapValues
          ? {
              age: shapValues.age,
              gender: shapValues.gender,
              bp_systolic: shapValues.bp_systolic,
              bp_diastolic: shapValues.bp_diastolic,
              hba1c_level: shapValues.hba1c_level,
              baseValue: shapBaseValue || 0,
            }
          : null,
      });

      setIsSaved(true);
      const periodLabel = `${toDisplayDate(toISODate(dateRangeStart))} – ${toDisplayDate(toISODate(dateRangeEnd))}`;
      const message = response.data.isUpdate
        ? `Your risk record for ${periodLabel} has been updated!`
        : `Your risk record for ${periodLabel} has been saved!`;

      Alert.alert("Success", message, [
        { text: "OK" },
        { text: "View History", onPress: () => navigation.navigate("RiskHistory", { userId }) },
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

  const onStartDateChange = (event, selectedDate) => {
    setShowStartPicker(false);
    if (selectedDate) {
      setDateRangeStart(selectedDate);
      // Auto-set end date to start + 13 days (14-day range inclusive)
      const autoEnd = new Date(selectedDate);
      autoEnd.setDate(selectedDate.getDate() + 13);
      if (autoEnd > today) autoEnd.setTime(today.getTime());
      setDateRangeEnd(autoEnd);
    }
  };

  const onEndDateChange = (event, selectedDate) => {
    setShowEndPicker(false);
    if (selectedDate) setDateRangeEnd(selectedDate);
  };

  const periodDays =
    Math.round((dateRangeEnd - dateRangeStart) / (1000 * 60 * 60 * 24)) + 1;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#4A90E2" />

      {/* Hero Header */}
      <View style={styles.heroHeader}>
        <View style={styles.heroCircleLarge} />
        <View style={styles.heroCircleSmall} />
        <View style={styles.heroInner}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.heroTitle}>Risk Prediction</Text>
          <View style={styles.rightBtnPlaceholder} />
        </View>
      </View>

    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {/* Date Range Selector */}
      <View style={styles.dateRangeCard}>
        <Text style={styles.dateRangeTitle}>📅 Select 14-Day Period</Text>
        <View style={styles.dateRow}>
          <View style={styles.dateField}>
            <Text style={styles.dateFieldLabel}>Start Date</Text>
            <TouchableOpacity
              style={styles.datePicker}
              onPress={() => setShowStartPicker(true)}
            >
              <Text style={styles.datePickerText}>{toDisplayDate(toISODate(dateRangeStart))}</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.dateArrow}>→</Text>
          <View style={styles.dateField}>
            <Text style={styles.dateFieldLabel}>End Date</Text>
            <TouchableOpacity
              style={styles.datePicker}
              onPress={() => setShowEndPicker(true)}
            >
              <Text style={styles.datePickerText}>{toDisplayDate(toISODate(dateRangeEnd))}</Text>
            </TouchableOpacity>
          </View>
        </View>
        <Text style={styles.periodDaysText}>
          {periodDays} day{periodDays !== 1 ? "s" : ""} selected
          {periodDays !== 14 ? " (14 days recommended)" : " ✓"}
        </Text>
      </View>

      {showStartPicker && (
        <DateTimePicker
          value={dateRangeStart}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={onStartDateChange}
          maximumDate={today}
        />
      )}
      {showEndPicker && (
        <DateTimePicker
          value={dateRangeEnd}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={onEndDateChange}
          minimumDate={dateRangeStart}
          maximumDate={today}
        />
      )}

      {/* BP 14-Day Average Card */}
      {bpAvgLoading ? (
        <View style={styles.bpAvgCard}>
          <ActivityIndicator size="small" color="#4A90E2" />
          <Text style={styles.bpAvgLoadingText}>Loading BP average for selected period...</Text>
        </View>
      ) : bpAvgData?.recordCount > 0 ? (
        <View style={styles.bpAvgCard}>
          <Text style={styles.bpAvgLabel}>
            📊 14-day BP average ({bpAvgData.recordCount} reading
            {bpAvgData.recordCount !== 1 ? "s" : ""})
          </Text>
          <Text style={styles.bpAvgValue}>
            <Text style={{ color: "#FF4757" }}>{bpAvgData.avgSystolic}</Text>
            <Text style={{ color: "#8E8E93" }}> / </Text>
            <Text style={{ color: "#4A90E2" }}>{bpAvgData.avgDiastolic}</Text>
            <Text style={{ color: "#8E8E93", fontSize: 13 }}> mmHg</Text>
          </Text>
          <TouchableOpacity onPress={() => navigation.navigate("BPHistory", { userId })}>
            <Text style={styles.bpAvgLink}>Manage BP data →</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.bpNoDataCard}
          onPress={() => navigation.navigate("BPHistory", { userId })}
        >
          <Text style={styles.bpNoDataText}>⚠️ No BP data for the selected period.</Text>
          <Text style={styles.bpNoDataLink}>Add readings in BP History →</Text>
        </TouchableOpacity>
      )}

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
        placeholder="HbA1c Level (%) - Optional"
        value={hba1cLevel}
        setValue={setHba1cLevel}
        keyboardType="numeric"
        helperText="Range: 4.0-14.0%"
      />

      <CustomButton text="Predict Risk" onPress={onPredictPressed} />

      {loading && (
        <ActivityIndicator size="large" color="#4A90E2" style={{ marginTop: 20 }} />
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
              <Text style={styles.saveButtonText}>
                {isSaved ? "✓ Saved for This Period" : "💾 Save 14-Day Record"}
              </Text>
            )}
          </TouchableOpacity>

          {isSaved && (
            <Text style={styles.savedHint}>
              Record saved for {toDisplayDate(toISODate(dateRangeStart))} –{" "}
              {toDisplayDate(toISODate(dateRangeEnd))}. View history to see the trend.
            </Text>
          )}
        </View>
      )}

      <TouchableOpacity
        style={styles.historyButton}
        onPress={() => navigation.navigate("RiskHistory", { userId })}
      >
        <Text style={styles.historyButtonText}>📊 View Risk History & Trend</Text>
      </TouchableOpacity>

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>💡 About the Prediction</Text>
        <Text style={styles.infoText}>
          {"\n\n"}Select a 14-day date range first. BP values are automatically sourced
          from daily readings saved in BP History for that exact period.
          {"\n\n"}Optional: Enter your HbA1c Level (%) for a more accurate prediction.
          {"\n\n"}Save your prediction to track your kidney health trend over time.
        </Text>
      </View>
    </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F0F3F8",
  },
  heroHeader: {
    backgroundColor: "#4A90E2",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 20,
    overflow: "hidden",
    position: "relative",
  },
  heroCircleLarge: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(255,255,255,0.08)",
    top: -50,
    right: -40,
  },
  heroCircleSmall: {
    position: "absolute",
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "rgba(255,255,255,0.06)",
    bottom: -20,
    left: 30,
  },
  heroInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heroTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
    flex: 1,
    textAlign: "center",
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  rightBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  rightBtnPlaceholder: {
    width: 40,
  },
  container: {
    padding: 20,
    alignItems: "center",
    backgroundColor: "#F0F3F8",
    flexGrow: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1C1C1E",
    marginBottom: 10,
    marginTop: 4,
  },
  subtitle: {
    fontSize: 16,
    color: "#8E8E93",
    marginBottom: 20,
  },
  dateRangeCard: {
    width: "100%",
    backgroundColor: "#F0F4FF",
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: "#4A90E2",
  },
  dateRangeTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#4A90E2",
    marginBottom: 12,
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dateField: {
    flex: 1,
  },
  dateFieldLabel: {
    fontSize: 11,
    color: "#8E8E93",
    marginBottom: 4,
    fontWeight: "600",
  },
  datePicker: {
    backgroundColor: "#fff",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#4A90E2",
  },
  datePickerText: {
    fontSize: 13,
    color: "#1C1C1E",
    fontWeight: "600",
  },
  dateArrow: {
    marginHorizontal: 10,
    fontSize: 18,
    color: "#4A90E2",
    fontWeight: "bold",
  },
  periodDaysText: {
    fontSize: 12,
    color: "#555",
    marginTop: 10,
    textAlign: "center",
    fontStyle: "italic",
  },
  bpAvgCard: {
    width: "100%",
    backgroundColor: "#EBF4FF",
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: "#4A90E2",
  },
  bpAvgLabel: {
    fontSize: 13,
    color: "#4A90E2",
    fontWeight: "600",
    marginBottom: 6,
  },
  bpAvgValue: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 8,
  },
  bpAvgLink: {
    fontSize: 13,
    color: "#4A90E2",
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  bpAvgLoadingText: {
    fontSize: 14,
    color: "#8E8E93",
    marginTop: 8,
    textAlign: "center",
  },
  bpNoDataCard: {
    width: "100%",
    backgroundColor: "#FFF5E6",
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: "#F5A623",
    alignItems: "flex-start",
  },
  bpNoDataText: {
    fontSize: 14,
    color: "#F5A623",
    fontWeight: "600",
    marginBottom: 6,
  },
  bpNoDataLink: {
    fontSize: 13,
    color: "#F5A623",
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  readOnlyContainer: {
    width: "100%",
    backgroundColor: "#F5F7FA",
    borderRadius: 12,
    padding: 15,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#E5E5EA",
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
    backgroundColor: "#4A90E2",
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
    borderLeftColor: "#4A90E2",
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
