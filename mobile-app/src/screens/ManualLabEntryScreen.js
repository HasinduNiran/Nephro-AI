import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  StatusBar,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";
import api from "../api/axiosConfig";

const normalizeGenderCode = (genderValue) => {
  if (!genderValue) return "";
  const normalized = String(genderValue).trim().toLowerCase();
  if (normalized === "female" || normalized === "f") return "F";
  if (normalized === "male" || normalized === "m") return "M";
  return "";
};

const getCreatinineRangeByGender = (genderCode) => {
  if (genderCode === "F") {
    return { min: 0.1, max: 1.3, label: "0.1 - 1.3 mg/dL" };
  }
  return { min: 0.1, max: 1.6, label: "0.1 - 1.6 mg/dL" };
};

const getBunRiskCategory = (bunValue) => {
  if (bunValue < 30) return "Normal";
  if (bunValue <= 300) return "Early risk";
  return "High risk";
};

const ManualLabEntryScreen = ({ navigation, route }) => {
  const userName = route.params?.userName || "User";
  const userEmail = route.params?.userEmail || "";
  
  const [formData, setFormData] = useState({
    name: userName || userEmail || "",
    age: "",
    gender: "",
    creatinine: "",
    eGFR: "",
    bun: "",
    albumin: "",
  });
  const [loading, setLoading] = useState(false);

  // Fetch user data on component mount
  useEffect(() => {
    const loadUserData = async () => {
      try {
        const userDataString = await AsyncStorage.getItem("userData");
        if (userDataString) {
          const userData = JSON.parse(userDataString);

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

            setFormData(prev => ({
              ...prev,
              age: calculatedAge.toString(),
            }));
          }

          // Set gender from user data (convert "Male"/"Female" to "M"/"F")
          const routeGenderCode = normalizeGenderCode(route.params?.user?.gender);
          const storedGenderCode = normalizeGenderCode(userData.gender);
          const genderCode = storedGenderCode || routeGenderCode;
          if (genderCode) {
            setFormData(prev => ({
              ...prev,
              gender: genderCode,
            }));
          }
        }
      } catch (error) {
        console.error("Error loading user data:", error);
      }
    };

    loadUserData();
  }, []);

  const updateField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const bunNumber = formData.bun ? parseFloat(formData.bun) : null;
  const bunRiskCategory = bunNumber !== null && !Number.isNaN(bunNumber) && bunNumber >= 0
    ? getBunRiskCategory(bunNumber)
    : "";

  const handleSubmit = async () => {
    // Validation
    if (!formData.name.trim()) {
      Alert.alert("Validation Error", "Please enter patient name");
      return;
    }

    if (!formData.age || parseInt(formData.age) < 1 || parseInt(formData.age) > 120) {
      Alert.alert("Validation Error", "Please enter a valid age (1-120)");
      return;
    }

    if (!formData.gender) {
      Alert.alert("Validation Error", "Gender is missing in profile. Please update your account profile.");
      return;
    }

    if (!formData.eGFR && !formData.creatinine) {
      Alert.alert("Validation Error", "Creatinine is required when eGFR is not provided.");
      return;
    }

    const eGFRValue = formData.eGFR ? parseFloat(formData.eGFR) : null;
    if (formData.eGFR && (Number.isNaN(eGFRValue) || eGFRValue < 0)) {
      Alert.alert("Validation Error", "eGFR cannot be less than 0.");
      return;
    }

    const creatinineValue = formData.creatinine ? parseFloat(formData.creatinine) : null;
    if (formData.creatinine && Number.isNaN(creatinineValue)) {
      Alert.alert("Validation Error", "Please enter a valid Creatinine value.");
      return;
    }

    if (creatinineValue !== null) {
      const creatinineRange = getCreatinineRangeByGender(formData.gender);
      if (creatinineValue < creatinineRange.min || creatinineValue > creatinineRange.max) {
        Alert.alert(
          "Validation Error",
          `Creatinine for ${formData.gender === "F" ? "female" : "male"} should be within ${creatinineRange.label}.`
        );
        return;
      }
    }

    if (formData.bun) {
      const bunValue = parseFloat(formData.bun);
      if (Number.isNaN(bunValue) || bunValue < 0) {
        Alert.alert("Validation Error", "BUN cannot be less than 0.");
        return;
      }
    }

    setLoading(true);

    try {
      let finalEGFR = formData.eGFR ? parseFloat(formData.eGFR) : null;

      // Calculate eGFR from creatinine if not provided
      if (!finalEGFR && formData.creatinine) {
        const creatinine = parseFloat(formData.creatinine);
        const age = parseInt(formData.age);
        const isFemale = formData.gender === "F";

        // CKD-EPI 2021 Formula
        const kappa = isFemale ? 0.7 : 0.9;
        const alpha = isFemale ? -0.241 : -0.302;
        const femaleCoeff = isFemale ? 1.012 : 1;

        finalEGFR = 142 * Math.pow(Math.min(creatinine / kappa, 1), alpha) * 
                    Math.pow(Math.max(creatinine / kappa, 1), -1.200) * 
                    Math.pow(0.9938, age) * femaleCoeff;
        
        finalEGFR = Math.round(finalEGFR * 10) / 10; // Round to 1 decimal place
        console.log("Calculated eGFR:", finalEGFR);
      }

      // Prepare data for backend
      const submitData = {
        name: formData.name.trim(),
        age: parseInt(formData.age),
        gender: formData.gender,
        creatinine: formData.creatinine ? parseFloat(formData.creatinine) : undefined,
        eGFR: finalEGFR,
        bun: formData.bun ? parseFloat(formData.bun) : undefined,
        bunRiskCategory: bunRiskCategory || undefined,
        albumin: formData.albumin ? parseFloat(formData.albumin) : undefined,
      };

      console.log("Submitting lab data:", submitData);

      const response = await api.post("/lab", submitData);

      if (response.data) {
        Alert.alert("Success", "Lab test results saved successfully!");
        // Pass the actual lab test data (response.data.data)
        navigation.navigate("LabResult", { result: response.data.data, userName, userEmail });
      }
    } catch (error) {
      console.error("Error submitting lab data:", error);
      Alert.alert(
        "Error",
        error.response?.data?.message || "Failed to save lab results"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <StatusBar barStyle="light-content" backgroundColor="#4A90E2" />

      {/* Hero Header */}
      <View style={styles.heroHeader}>
        <View style={styles.heroCircleLarge} />
        <View style={styles.heroCircleSmall} />
        <View style={styles.heroInner}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.heroTitle}>Manual Entry</Text>
          <View style={styles.rightBtnPlaceholder} />
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={true}
      >
        <Text style={styles.sectionTitle}>Patient Information</Text>
        <Text style={styles.emailText}>Email: {userEmail || "Not provided"}</Text>

        {/* Name Input - Full Width (Read-only from login) */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Patient Name</Text>
          <View style={styles.readOnlyInput}>
            <Text style={styles.readOnlyText}>{formData.name}</Text>
          </View>
        </View>

        {/* Age and Gender Row */}
        <View style={styles.row}>
          <View style={styles.halfInputGroup}>
            <Text style={styles.label}>Age *</Text>
            <TextInput
              style={styles.input}
              value={formData.age}
              onChangeText={(value) => updateField("age", value)}
              placeholder="Enter age"
              placeholderTextColor="#C7C7CC"
              keyboardType="number-pad"
            />
          </View>

          <View style={styles.halfInputGroup}>
            <Text style={styles.label}>Gender *</Text>
            <View style={styles.readOnlyInput}>
              <Text style={styles.readOnlyText}>
                {formData.gender === "F" ? "Female" : formData.gender === "M" ? "Male" : "Not set"}
              </Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Lab Values</Text>
        <Text style={styles.hint}>
          * If eGFR is entered, Creatinine is optional{"\n"}
          * If eGFR is empty, Creatinine is required
        </Text>

        {/* Creatinine and eGFR Row */}
        <View style={styles.row}>
          <View style={styles.halfInputGroup}>
            <Text style={styles.label}>Creatinine</Text>
            <TextInput
              style={styles.input}
              value={formData.creatinine}
              onChangeText={(value) => updateField("creatinine", value)}
              placeholder="1.2"
              placeholderTextColor="#C7C7CC"
              keyboardType="decimal-pad"
            />
            <Text style={styles.unit}>mg/dL</Text>
            <Text style={styles.validationHint}>
              {`Range (${formData.gender === "F" ? "Female" : formData.gender === "M" ? "Male" : "Male"}): ${getCreatinineRangeByGender(formData.gender || "M").label}`}
            </Text>
          </View>

          <View style={styles.halfInputGroup}>
            <Text style={styles.label}>eGFR</Text>
            <TextInput
              style={styles.input}
              value={formData.eGFR}
              onChangeText={(value) => updateField("eGFR", value)}
              placeholder="75"
              placeholderTextColor="#C7C7CC"
              keyboardType="decimal-pad"
            />
            <Text style={styles.unit}>mL/min/1.73m²</Text>
            <Text style={styles.validationHint}>Must be 0 or greater</Text>
          </View>
        </View>

        {/* BUN and Albumin Row */}
        <View style={styles.row}>
          <View style={styles.halfInputGroup}>
            <Text style={styles.label}>BUN (Optional)</Text>
            <TextInput
              style={styles.input}
              value={formData.bun}
              onChangeText={(value) => updateField("bun", value)}
              placeholder="20"
              placeholderTextColor="#C7C7CC"
              keyboardType="decimal-pad"
            />
            <Text style={styles.unit}>mg/dL</Text>
            <Text style={styles.validationHint}>Must be 0 or greater</Text>
            {/* {bunRiskCategory ? (
              <Text style={styles.bunRiskText}>{`BUN Category: ${bunRiskCategory}`}</Text>
            ) : null} */}
          </View>

          <View style={styles.halfInputGroup}>
            <Text style={styles.label}>Albumin (Optional)</Text>
            <TextInput
              style={styles.input}
              value={formData.albumin}
              onChangeText={(value) => updateField("albumin", value)}
              placeholder="4.0"
              placeholderTextColor="#C7C7CC"
              keyboardType="decimal-pad"
            />
            <Text style={styles.unit}>g/dL</Text>
          </View>
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={styles.submitButton}
          onPress={handleSubmit}
          activeOpacity={0.8}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Text style={styles.submitButtonText}>Analyze Results</Text>
              <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#4A90E2",
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
  scrollView: {
    backgroundColor: "#F0F3F8",
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1C1C1E",
    marginBottom: 12,
    marginTop: 8,
  },
  emailText: {
    fontSize: 12,
    color: "#6B7280",
    marginBottom: 8,
  },
  hint: {
    fontSize: 12,
    color: "#8E8E93",
    marginBottom: 12,
    lineHeight: 18,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  halfInputGroup: {
    flex: 1,
    marginHorizontal: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1C1C1E",
    marginBottom: 6,
  },
  input: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: "#1C1C1E",
    borderWidth: 1,
    borderColor: "#E5E5EA",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  readOnlyInput: {
    backgroundColor: "#F5F7FA",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E5E5EA",
  },
  readOnlyText: {
    fontSize: 14,
    color: "#1C1C1E",
    fontWeight: "600",
  },
  unit: {
    fontSize: 11,
    color: "#8E8E93",
    marginTop: 4,
  },
  validationHint: {
    fontSize: 11,
    color: "#8E8E93",
    marginTop: 3,
  },
  bunRiskText: {
    fontSize: 11,
    color: "#FF9500",
    marginTop: 3,
    fontWeight: "600",
  },
  pickerContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E5EA",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  picker: {
    height: 45,
  },
  submitButton: {
    backgroundColor: "#4A90E2",
    borderRadius: 12,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
    shadowColor: "#4A90E2",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  submitButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
    marginRight: 8,
  },
});

export default ManualLabEntryScreen;
