import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  Image,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { API_URL } from "../api/axiosConfig";

// Validation limits matching FutureCKDStageScreen
const manualFieldLimits = {
  age: { min: 0, max: 120, label: "0 - 120 years" },
  creatinine: (genderCode) => (genderCode === "F"
    ? { min: 0.6, max: 1.3, label: "0.6 - 1.3 mg/dL" }
    : { min: 0.6, max: 1.6, label: "0.6 - 1.6 mg/dL" }),
  egfr: { min: 0, max: 130, label: "0 - 130 mL/min/1.73m²" },
  bun: { min: 0, max: 200, label: "0 - 200 mg/dL" },
  albumin: { min: 2.5, max: 5.5, label: "2.5 - 5.5 g/dL" },
  hemoglobin: (genderCode) => (genderCode === "F"
    ? { min: 12.0, max: 15.5, label: "12.0 - 15.5 g/dL" }
    : { min: 13.5, max: 17.5, label: "13.5 - 17.5 g/dL" }),
};

const getManualFieldConfig = (fieldName, genderCode) => {
  const config = manualFieldLimits[fieldName];
  return typeof config === "function" ? config(genderCode) : config;
};

const validateNumericField = (fieldName, rawValue, genderCode) => {
  if (rawValue === "" || rawValue === null || rawValue === undefined) {
    return "";
  }
  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    return `${fieldName} must be a valid number`;
  }

  const config = getManualFieldConfig(fieldName, genderCode);
  if (!config) {
    return "";
  }
  if (value < config.min || value > config.max) {
    return `${fieldName} should be within ${config.label}`;
  }

  return "";
};

const LabAnalysisScreen = ({ navigation, route }) => {
  const userName = route.params?.userName || "User";
  const userEmail = route.params?.userEmail || "";

  const [selectedTab, setSelectedTab] = useState("upload"); // "upload" or "manual"
  const [uploadedImage, setUploadedImage] = useState(null);
  const [labAnalyzing, setLabAnalyzing] = useState(false);
  const [labResult, setLabResult] = useState(null);
  const [manualData, setManualData] = useState({
    name: userName,
    age: "",
    gender: "",
    creatinine: "",
    egfr: "",
    bun: "",
    albumin: "",
    hemoglobin: "",
  });
  const [validationErrors, setValidationErrors] = useState({});

  const handleFieldChange = (fieldName, value) => {
    setManualData({ ...manualData, [fieldName]: value });
    
    // Validate on change if field has value
    if (value && value !== "") {
      const error = validateNumericField(fieldName, value, manualData.gender);
      if (error) {
        setValidationErrors({ ...validationErrors, [fieldName]: error });
      } else {
        const newErrors = { ...validationErrors };
        delete newErrors[fieldName];
        setValidationErrors(newErrors);
      }
    } else {
      const newErrors = { ...validationErrors };
      delete newErrors[fieldName];
      setValidationErrors(newErrors);
    }
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 1,
    });

    if (!result.canceled) {
      setUploadedImage(result.assets[0]);
    }
  };

  const handleUpload = () => {
    if (!uploadedImage) {
      Alert.alert("No Image", "Please select an image to upload.");
      return;
    }
    // Analyze the uploaded image
    analyzeLabImage();
  };

  const analyzeLabImage = async () => {
    if (!uploadedImage) {
      Alert.alert("Error", "No image to analyze");
      return;
    }

    setLabAnalyzing(true);
    try {
      const formData = new FormData();
      const fileUri = uploadedImage.uri;
      const fileName = fileUri.split("/").pop() || "lab_report.jpg";
      const fileType = fileName.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";

      formData.append("reportImage", {
        uri: fileUri,
        type: fileType,
        name: uploadedImage.filename || fileName,
      });
      formData.append("name", userName);
      formData.append("userEmail", userEmail || "unknown");

      console.log("Platform:", Platform.OS);
      console.log("Sending lab report to:", `${API_URL}/lab/upload`);

      const uploadResponse = await fetch(`${API_URL}/lab/upload`, {
        method: "POST",
        body: formData,
      });

      if (!uploadResponse.ok) {
        const contentType = uploadResponse.headers.get("content-type");
        let errorMessage = `Server error (${uploadResponse.status})`;

        if (contentType && contentType.includes("application/json")) {
          const errorData = await uploadResponse.json();
          errorMessage = errorData.message || errorMessage;
        } else {
          const errorText = await uploadResponse.text();
          console.error("Server error:", errorText);
          errorMessage = "Backend error - check server console";
        }

        throw new Error(errorMessage);
      }

      const response = await uploadResponse.json();

      console.log("Lab analysis response:", response);

      // Backend returns data in ocrExtracted object
      const extractedData = response.ocrExtracted || response.labValues || response.data || response;

      if (extractedData && (extractedData.eGFR || extractedData.creatinine)) {
        // Format for LabResultScreen
        const labResultData = {
          name: userName,
          eGFR: extractedData.eGFR ? parseFloat(extractedData.eGFR) : null,
          creatinine: extractedData.creatinine ? parseFloat(extractedData.creatinine) : null,
          bun: extractedData.bun ? parseFloat(extractedData.bun) : null,
          albumin: extractedData.albumin ? parseFloat(extractedData.albumin) : null,
          hemoglobin: extractedData.hemoglobin ? parseFloat(extractedData.hemoglobin) : null,
          age: extractedData.age ? parseInt(extractedData.age) : null,
          gender: extractedData.gender || null,
          ckdStage: response.labTest?.ckdStage || response.data?.labTest?.ckdStage || null,
          eGFRRange: response.labTest?.eGFRRange || response.data?.labTest?.eGFRRange || null,
          stageDescription: response.labTest?.stageDescription || response.data?.labTest?.stageDescription || null,
          imageFilename: response.labTest?.imageFilename || response.data?.labTest?.imageFilename || uploadedImage.filename || fileName,
          source: "image_upload",
          confidence: response.confidence || response.data?.confidence,
        };

        setLabResult(labResultData);

        // Navigate to LabResult screen
        navigation.navigate("LabResult", {
          result: labResultData,
          userName,
          userEmail,
        });
      } else {
        Alert.alert(
          "No Data",
          "Could not extract lab values from the image. Please try another image or use manual entry."
        );
        setLabAnalyzing(false);
      }
    } catch (error) {
      console.error("Lab analysis error:", error?.message || error);
      console.error("Error response:", error?.response?.data);
      
      let errorMessage = "Failed to analyze lab report. ";
      
      if (error.code === "ECONNREFUSED") {
        errorMessage += "Cannot connect to backend. Make sure the backend server is running on port 5000.";
      } else if (error.message === "Network Error") {
        errorMessage += "Network connection failed. Check your internet and backend server.";
      } else if (error.response?.data?.error) {
        errorMessage += error.response.data.error;
      } else {
        errorMessage += error.message;
      }
      
      Alert.alert("Analysis Error", errorMessage);
      setLabAnalyzing(false);
    }
  };

  const handleManualSubmit = () => {
    const { name, age, gender, creatinine, egfr } = manualData;
    const errors = {};

    // Check required fields
    if (!name) errors.name = "Name is required";
    if (!age) errors.age = "Age is required";
    if (!gender) errors.gender = "Gender is required";
    if (!creatinine && !egfr) errors.main = "At least eGFR or creatinine is required";

    // Validate each entered field
    if (age && age !== "") {
      const ageError = validateNumericField("age", age, gender);
      if (ageError) errors.age = ageError;
    }
    if (creatinine && creatinine !== "") {
      const creatError = validateNumericField("creatinine", creatinine, gender);
      if (creatError) errors.creatinine = creatError;
    }
    if (egfr && egfr !== "") {
      const egfrError = validateNumericField("egfr", egfr, gender);
      if (egfrError) errors.egfr = egfrError;
    }
    if (manualData.bun && manualData.bun !== "") {
      const bunError = validateNumericField("bun", manualData.bun, gender);
      if (bunError) errors.bun = bunError;
    }
    if (manualData.albumin && manualData.albumin !== "") {
      const albuminError = validateNumericField("albumin", manualData.albumin, gender);
      if (albuminError) errors.albumin = albuminError;
    }
    if (manualData.hemoglobin && manualData.hemoglobin !== "") {
      const hemoglobinError = validateNumericField("hemoglobin", manualData.hemoglobin, gender);
      if (hemoglobinError) errors.hemoglobin = hemoglobinError;
    }

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      const firstError = Object.values(errors)[0];
      Alert.alert("Validation Error", firstError);
      return;
    }

    setValidationErrors({});
    
    // Format manual data for LabResultScreen
    const labResult = {
      name: manualData.name,
      eGFR: parseFloat(manualData.egfr) || null,
      creatinine: parseFloat(manualData.creatinine) || null,
      bun: parseFloat(manualData.bun) || null,
      albumin: parseFloat(manualData.albumin) || null,
      hemoglobin: parseFloat(manualData.hemoglobin) || null,
      age: parseInt(manualData.age) || null,
      gender: manualData.gender,
      source: "manual_entry",
    };

    // Navigate to LabResultScreen to show results
    navigation.navigate("LabResult", {
      result: labResult,
      userName,
      userEmail,
    });
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F7FA" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color="#1C1C1E" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Lab Analysis</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Tab Buttons */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tabButton, selectedTab === "upload" && styles.tabButtonActive]}
          onPress={() => setSelectedTab("upload")}
          activeOpacity={0.7}
        >
          <Ionicons
            name="image-outline"
            size={20}
            color={selectedTab === "upload" ? "#50E3C2" : "#8E8E93"}
          />
          <Text
            style={[
              styles.tabLabel,
              selectedTab === "upload" && styles.tabLabelActive,
            ]}
          >
            Upload Lab
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, selectedTab === "manual" && styles.tabButtonActive]}
          onPress={() => setSelectedTab("manual")}
          activeOpacity={0.7}
        >
          <Ionicons
            name="create-outline"
            size={20}
            color={selectedTab === "manual" ? "#4A90E2" : "#8E8E93"}
          />
          <Text
            style={[
              styles.tabLabel,
              selectedTab === "manual" && styles.tabLabelActive,
            ]}
          >
            Manual Entry
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {selectedTab === "upload" ? (
          // Upload Lab Section
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Upload Lab Report</Text>
            <Text style={styles.sectionSubtitle}>
              Scan or select an image of your lab report
            </Text>

            <TouchableOpacity
              style={styles.uploadBox}
              onPress={pickImage}
              activeOpacity={0.8}
              disabled={labAnalyzing}
            >
              {uploadedImage ? (
                <>
                  <Image
                    source={{ uri: uploadedImage.uri }}
                    style={styles.uploadedImage}
                  />
                  <View style={styles.uploadedImageOverlay}>
                    <TouchableOpacity
                      style={styles.changeButton}
                      onPress={pickImage}
                      disabled={labAnalyzing}
                    >
                      <Text style={styles.changeButtonText}>Change Image</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.removeButton}
                      onPress={() => setUploadedImage(null)}
                      disabled={labAnalyzing}
                    >
                      <Ionicons name="close" size={24} color="#FF3B30" />
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <>
                  <Ionicons name="cloud-upload-outline" size={48} color="#50E3C2" />
                  <Text style={styles.uploadText}>Tap to select image</Text>
                  <Text style={styles.uploadSubtext}>
                    JPG, PNG, or PDF format
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.submitButton, labAnalyzing && styles.submitButtonDisabled]}
              onPress={analyzeLabImage}
              activeOpacity={0.8}
              disabled={!uploadedImage || labAnalyzing}
            >
              {labAnalyzing ? (
                <>
                  <ActivityIndicator size="small" color="#FFFFFF" />
                  <Text style={styles.submitButtonText}>Analyzing...</Text>
                </>
              ) : (
                <Text style={styles.submitButtonText}>Analyze Report</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          // Manual Entry Section
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Manual Lab Entry</Text>
            <Text style={styles.sectionSubtitle}>
              Enter your lab values manually
            </Text>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Name</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter name"
                value={manualData.name}
                onChangeText={(text) =>
                  setManualData({ ...manualData, name: text })
                }
                editable={false}
              />
            </View>

            <View style={styles.row}>
              <View style={[styles.formGroup, styles.halfWidth]}>
                <Text style={styles.label}>Age</Text>
                <TextInput
                  style={[styles.input, validationErrors.age && styles.inputError]}
                  placeholder="Age"
                  keyboardType="numeric"
                  value={manualData.age}
                  onChangeText={(text) =>
                    handleFieldChange("age", text)
                  }
                />
                {validationErrors.age && (
                  <Text style={styles.errorText}>{validationErrors.age}</Text>
                )}
              </View>

              <View style={[styles.formGroup, styles.halfWidth]}>
                <Text style={styles.label}>Gender</Text>
                <View style={styles.genderContainer}>
                  <TouchableOpacity
                    style={[
                      styles.genderButton,
                      manualData.gender === "M" && styles.genderButtonActive,
                    ]}
                    onPress={() => setManualData({ ...manualData, gender: "M" })}
                  >
                    <Text
                      style={[
                        styles.genderText,
                        manualData.gender === "M" && styles.genderTextActive,
                      ]}
                    >
                      M
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.genderButton,
                      manualData.gender === "F" && styles.genderButtonActive,
                    ]}
                    onPress={() => setManualData({ ...manualData, gender: "F" })}
                  >
                    <Text
                      style={[
                        styles.genderText,
                        manualData.gender === "F" && styles.genderTextActive,
                      ]}
                    >
                      F
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Creatinine (mg/dL)</Text>
              <TextInput
                style={[styles.input, validationErrors.creatinine && styles.inputError]}
                placeholder="0.0"
                keyboardType="decimal-pad"
                value={manualData.creatinine}
                onChangeText={(text) =>
                  handleFieldChange("creatinine", text)
                }
              />
              {validationErrors.creatinine && (
                <Text style={styles.errorText}>{validationErrors.creatinine}</Text>
              )}
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>eGFR (ml/min/1.73m²)</Text>
              <TextInput
                style={[styles.input, validationErrors.egfr && styles.inputError]}
                placeholder="0.0"
                keyboardType="decimal-pad"
                value={manualData.egfr}
                onChangeText={(text) =>
                  handleFieldChange("egfr", text)
                }
              />
              {validationErrors.egfr && (
                <Text style={styles.errorText}>{validationErrors.egfr}</Text>
              )}
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>BUN (mg/dL) - Optional</Text>
              <TextInput
                style={[styles.input, validationErrors.bun && styles.inputError]}
                placeholder="0.0"
                keyboardType="decimal-pad"
                value={manualData.bun}
                onChangeText={(text) =>
                  handleFieldChange("bun", text)
                }
              />
              {validationErrors.bun && (
                <Text style={styles.errorText}>{validationErrors.bun}</Text>
              )}
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Albumin (g/dL) - Optional</Text>
              <TextInput
                style={[styles.input, validationErrors.albumin && styles.inputError]}
                placeholder="0.0"
                keyboardType="decimal-pad"
                value={manualData.albumin}
                onChangeText={(text) =>
                  handleFieldChange("albumin", text)
                }
              />
              {validationErrors.albumin && (
                <Text style={styles.errorText}>{validationErrors.albumin}</Text>
              )}
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Hemoglobin (g/dL) - Optional</Text>
              <TextInput
                style={[styles.input, validationErrors.hemoglobin && styles.inputError]}
                placeholder="0.0"
                keyboardType="decimal-pad"
                value={manualData.hemoglobin}
                onChangeText={(text) =>
                  handleFieldChange("hemoglobin", text)
                }
              />
              {validationErrors.hemoglobin && (
                <Text style={styles.errorText}>{validationErrors.hemoglobin}</Text>
              )}
            </View>

            <TouchableOpacity
              style={styles.submitButton}
              onPress={handleManualSubmit}
              activeOpacity={0.8}
            >
              <Text style={styles.submitButtonText}>Predict Stage</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F7FA",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 50,
    paddingBottom: 16,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E5EA",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F5F7FA",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1C1C1E",
  },
  placeholder: {
    width: 40,
  },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 2,
    borderBottomColor: "#F0F0F0",
    paddingHorizontal: 16,
  },
  tabButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderBottomWidth: 3,
    borderBottomColor: "transparent",
    gap: 8,
  },
  tabButtonActive: {
    borderBottomColor: "#4A90E2",
  },
  tabLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#8E8E93",
  },
  tabLabelActive: {
    color: "#1C1C1E",
    fontWeight: "700",
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 24,
    paddingBottom: 40,
  },
  section: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1C1C1E",
    marginBottom: 8,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: "#8E8E93",
    marginBottom: 24,
  },

  // Upload Styles
  uploadBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#E5E5EA",
    borderStyle: "dashed",
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
    minHeight: 220,
  },
  uploadedImage: {
    width: "100%",
    height: 180,
    borderRadius: 12,
    marginBottom: 12,
  },
  uploadedImageOverlay: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  removeButton: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    padding: 6,
    borderWidth: 1,
    borderColor: "#FF3B30",
  },
  uploadText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1C1C1E",
    marginTop: 12,
  },
  uploadSubtext: {
    fontSize: 13,
    color: "#8E8E93",
    marginTop: 4,
  },
  changeButton: {
    backgroundColor: "#4A90E2",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginTop: 12,
  },
  changeButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },

  // Form Styles
  formGroup: {
    marginBottom: 18,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1C1C1E",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E5EA",
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: "#1C1C1E",
  },
  inputError: {
    borderColor: "#FF3B30",
    backgroundColor: "#FFF1F1",
  },
  errorText: {
    fontSize: 12,
    color: "#FF3B30",
    marginTop: 6,
    fontWeight: "600",
  },
  row: {
    flexDirection: "row",
    gap: 12,
  },
  halfWidth: {
    flex: 1,
  },
  genderContainer: {
    flexDirection: "row",
    gap: 8,
  },
  genderButton: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#E5E5EA",
    paddingVertical: 12,
    alignItems: "center",
  },
  genderButtonActive: {
    backgroundColor: "#4A90E2",
    borderColor: "#4A90E2",
  },
  genderText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#8E8E93",
  },
  genderTextActive: {
    color: "#FFFFFF",
  },

  // Button Styles
  submitButton: {
    backgroundColor: "#10B981",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 24,
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  submitButtonDisabled: {
    backgroundColor: "#C7C7CC",
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});

export default LabAnalysisScreen;
