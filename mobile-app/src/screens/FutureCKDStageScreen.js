import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
  Alert,
  ActivityIndicator,
  Image,
  Platform,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect } from "@react-navigation/native";
import axios from "../api/axiosConfig";

const FutureCKDStageScreen = ({ navigation, route }) => {
  // Try multiple param shapes to recover email passed from upstream screens/auth
  const userFromRoute = route.params?.user || null;
  const userName = route.params?.userName || userFromRoute?.name || "User";
  const userEmail =
    route.params?.userEmail ||
    route.params?.email ||
    userFromRoute?.email ||
    userFromRoute?.userEmail ||
    "";
  
  const [ultrasoundImage, setUltrasoundImage] = useState(null);
  const [labReportImage, setLabReportImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [age, setAge] = useState("");
  const [gender, setGender] = useState(""); // "M" or "F"
  const [showGenderPicker, setShowGenderPicker] = useState(false);
  
  // Manual lab entry fields
  const [creatinine, setCreatinine] = useState("");
  const [egfr, setEgfr] = useState("");
  const [bun, setBun] = useState("");
  const [albumin, setAlbumin] = useState("");
  const [hemoglobin, setHemoglobin] = useState("");
  const [showManualEntry, setShowManualEntry] = useState(false);

  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  const formatDateTime = (isoString) => {
    try {
      const date = new Date(isoString);
      return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })}`;
    } catch (error) {
      return "Recent";
    }
  };

  const fetchHistory = useCallback(async () => {
    if (!userEmail) {
      setHistory([]);
      setHistoryError("No user email provided");
      return;
    }

    try {
      setHistoryLoading(true);
      setHistoryError("");
      const response = await axios.get(`/stage-progression/history/${encodeURIComponent(userEmail)}`);
      if (response.data?.success) {
        setHistory(response.data.records || []);
      } else {
        setHistory([]);
        setHistoryError("Failed to load history");
      }
    } catch (error) {
      console.error("Failed to fetch CKD stage history", error);
      setHistoryError("Unable to load past records");
    } finally {
      setHistoryLoading(false);
    }
  }, [userEmail]);

  useFocusEffect(
    useCallback(() => {
      fetchHistory();
    }, [fetchHistory])
  );

  const pickImage = async (type) => {
    try {
      // Request permission
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (status !== "granted") {
        Alert.alert(
          "Permission Required",
          "Please grant camera roll permissions to upload images"
        );
        return;
      }

      // Launch image picker
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 1,
      });

      if (!result.canceled) {
        if (type === "ultrasound") {
          setUltrasoundImage(result.assets[0]);
        } else {
          setLabReportImage(result.assets[0]);
        }
      }
    } catch (error) {
      console.error("Error picking image:", error);
      Alert.alert("Error", "Failed to pick image");
    }
  };

  const analyzeData = async () => {
    // Check if we have either lab report image OR manual values
    const hasLabReport = !!labReportImage;
    const hasManualValues = !!(creatinine || egfr);
    
    if (!hasLabReport && !hasManualValues) {
      Alert.alert(
        "Lab Data Required",
        "Please either upload a lab report image OR enter manual lab values (Creatinine or eGFR)."
      );
      return;
    }

    // Validate manual values if no lab report
    if (!hasLabReport && hasManualValues) {
      if (!creatinine && !egfr) {
        Alert.alert(
          "Insufficient Data",
          "Please provide at least Creatinine or eGFR value for analysis."
        );
        return;
      }
      
      // Age and gender required for eGFR calculation
      if (!egfr && creatinine && (!age || !gender)) {
        Alert.alert(
          "Additional Info Required",
          "Age and Gender are required to calculate eGFR from Creatinine."
        );
        return;
      }
    }

    setLoading(true);

    try {
      const formData = new FormData();
      
      // Add lab report if provided (optional now)
      if (labReportImage) {
        const labFileUri = labReportImage.uri;
        const labFileName = labFileUri.split("/").pop() || "lab-report.jpg";
        let labFileType = "image/jpeg";
        if (labFileName.endsWith(".png")) {
          labFileType = "image/png";
        }

        if (Platform.OS === "web") {
          const labFileResponse = await fetch(labFileUri);
          const labBlob = await labFileResponse.blob();
          const labFile = new File([labBlob], labFileName, { type: labFileType });
          formData.append("labReport", labFile, labFileName);
        } else {
          formData.append("labReport", {
            uri: labFileUri,
            type: labFileType,
            name: labFileName,
          });
        }
      }

      // Add ultrasound if provided (optional)
      if (ultrasoundImage) {
        const usFileUri = ultrasoundImage.uri;
        const usFileName = usFileUri.split("/").pop() || "ultrasound.jpg";
        let usFileType = "image/jpeg";
        if (usFileName.endsWith(".png")) {
          usFileType = "image/png";
        }

        if (Platform.OS === "web") {
          const usFileResponse = await fetch(usFileUri);
          const usBlob = await usFileResponse.blob();
          const usFile = new File([usBlob], usFileName, { type: usFileType });
          formData.append("ultrasound", usFile, usFileName);
        } else {
          formData.append("ultrasound", {
            uri: usFileUri,
            type: usFileType,
            name: usFileName,
          });
        }
      }

      // Add patient info
      formData.append("name", userName || userEmail || "Unknown");
      if (userEmail) formData.append("userEmail", userEmail);
      formData.append("age", age);
      formData.append("gender", gender);
      
      // Add manual lab values if provided
      if (creatinine) formData.append("creatinine", creatinine);
      if (egfr) formData.append("egfr", egfr);
      if (bun) formData.append("bun", bun);
      if (albumin) formData.append("albumin", albumin);
      if (hemoglobin) formData.append("hemoglobin", hemoglobin);

      console.log("Platform:", Platform.OS);
      if (labReportImage) {
        console.log("Uploading lab report:", labReportImage.uri.split("/").pop());
      } else {
        console.log("Using manual lab values only");
      }
      if (ultrasoundImage) {
        console.log("Uploading ultrasound:", ultrasoundImage.uri.split("/").pop());
      }
      console.log("Manual lab values:", { creatinine, egfr, bun, albumin, hemoglobin });
      const BACKEND_URL = Platform.OS === "web" 
        ? "http://localhost:5000/api" 
        : "http://172.20.10.2:5000/api";
      
      console.log("Connecting to:", BACKEND_URL);
      
      const uploadResponse = await fetch(`${BACKEND_URL}/stage-progression/upload`, {
        method: "POST",
        body: formData,
      });

      console.log("Response status:", uploadResponse.status);

      if (!uploadResponse.ok) {
        const contentType = uploadResponse.headers.get("content-type");
        let errorMessage = `Server error (${uploadResponse.status})`;
        
        if (contentType && contentType.includes("application/json")) {
          const errorData = await uploadResponse.json();
          errorMessage = errorData.message || errorMessage;
        } else {
          const errorText = await uploadResponse.text();
          console.error("Server error:", errorText);
          errorMessage = `Backend error - check server console`;
        }
        
        throw new Error(errorMessage);
      }

      const responseData = await uploadResponse.json();
      console.log("Response:", responseData);

      if (responseData.success) {
        Alert.alert("Success", "Analysis completed successfully!");

        fetchHistory();
        // Navigate to results page
        navigation.navigate("FutureCKDStageResult", { 
          result: responseData,
          userName,
          userEmail,
        });
      } else {
        throw new Error(responseData.message || "Analysis failed");
      }
    } catch (error) {
      console.error("Analysis error:", error);
      Alert.alert(
        "Error",
        error.message || "Failed to process data. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F7FA" />
      
      {/* Header with Back Button */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color="#1C1C1E" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Future CKD Stage</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={true}
      >
        <Text style={styles.welcomeText}>Upload Medical Data</Text>
        {/* <Text style={styles.subtitle}>Patient: {userName || userEmail}</Text> */}
        {/* <Text style={styles.infoText}>{userEmail ? `Email: ${userEmail}` : "Email not provided"}</Text> */}
        {/* <Text style={styles.infoText}>
          * Either Lab Report image OR Manual lab values required{"\n"}
          * Ultrasound is optional (enhances prediction accuracy){"\n"}
          * Age & Gender help calculate eGFR if not provided
        </Text> */}

        {/* Main Grid Layout - 3 Columns */}
        <View style={styles.gridContainer}>
          {/* LEFT COLUMN - Lab Report + Age/Gender */}
          <View style={styles.gridColumn}>
            {/* Lab Report Upload Section */}
            <View style={styles.uploadSection}>
              <View style={styles.sectionHeader}>
                <Ionicons name="flask" size={24} color="#F5A623" />
                <Text style={styles.sectionTitle}>Lab Report</Text>
              </View>
              <Text style={styles.optionalLabel}>(Optional if Manual Values entered)</Text>
              
              {labReportImage && (
                <View style={styles.imagePreviewContainer}>
                  <Image 
                    source={{ uri: labReportImage.uri }} 
                    style={styles.imagePreview} 
                  />
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => setLabReportImage(null)}
                  >
                    <Ionicons name="close-circle" size={24} color="#FF3B30" />
                  </TouchableOpacity>
                </View>
              )}

              <TouchableOpacity
                style={[styles.uploadButton, labReportImage && styles.uploadButtonSecondary]}
                onPress={() => pickImage("lab")}
                activeOpacity={0.8}
                disabled={loading}
              >
                <Ionicons 
                  name={labReportImage ? "refresh" : "cloud-upload-outline"} 
                  size={24} 
                  color={labReportImage ? "#50E3C2" : "#F5A623"} 
                />
                <Text style={[styles.uploadButtonText, labReportImage && styles.uploadButtonTextSecondary]}>
                  {labReportImage ? "Change" : "Upload"}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Age and Gender Section */}
            <View style={styles.uploadSection}>
              <View style={styles.sectionHeader}>
                <Ionicons name="person" size={24} color="#007AFF" />
                <Text style={styles.sectionTitle}>Patient Details</Text>
              </View>

              {/* Age Input */}
              <View style={styles.ageGenderField}>
                <Text style={styles.fieldLabel}>Age</Text>
                
                  <TextInput
                      style={styles.textInput}
                      value={age}
                      onChangeText={setAge}
                      placeholder="e.g., 30"
                      placeholderTextColor="#007AFF"
                      keyboardType="decimal-pad"
                    />
                
              </View>

              {/* Gender Selection */}
              <View style={styles.ageGenderField}>
                <Text style={styles.fieldLabel}>Gender</Text>
                <View style={styles.genderContainer}>
                  <TouchableOpacity
                    style={[styles.genderButton, gender === "M" && styles.genderButtonActive]}
                    onPress={() => setGender("M")}
                  >
                    <Ionicons name="male" size={20} color={gender === "M" ? "#FFFFFF" : "#007AFF"} />
                    <Text style={[styles.genderButtonText, gender === "M" && styles.genderButtonTextActive]}>
                      Male
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.genderButton, gender === "F" && styles.genderButtonActive]}
                    onPress={() => setGender("F")}
                  >
                    <Ionicons name="female" size={20} color={gender === "F" ? "#FFFFFF" : "#007AFF"} />
                    <Text style={[styles.genderButtonText, gender === "F" && styles.genderButtonTextActive]}>
                      Female
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>

          {/* MIDDLE COLUMN - Ultrasound */}
          <View style={styles.gridColumn}>
            <View style={styles.uploadSection}>
              <View style={styles.sectionHeader}>
                <Ionicons name="scan" size={24} color="#4A90E2" />
                <Text style={styles.sectionTitle}>Ultrasound</Text>
              </View>

              {ultrasoundImage && (
                <View style={styles.imagePreviewContainer}>
                  <Image 
                    source={{ uri: ultrasoundImage.uri }} 
                    style={styles.imagePreview} 
                  />
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => setUltrasoundImage(null)}
                  >
                    <Ionicons name="close-circle" size={24} color="#FF3B30" />
                  </TouchableOpacity>
                </View>
              )}

              <TouchableOpacity
                style={[styles.uploadButton, ultrasoundImage && styles.uploadButtonSecondary]}
                onPress={() => pickImage("ultrasound")}
                activeOpacity={0.8}
                disabled={loading}
              >
                <Ionicons 
                  name={ultrasoundImage ? "refresh" : "cloud-upload-outline"} 
                  size={24} 
                  color={ultrasoundImage ? "#50E3C2" : "#4A90E2"} 
                />
                <Text style={[styles.uploadButtonText, ultrasoundImage && styles.uploadButtonTextSecondary]}>
                  {ultrasoundImage ? "Change" : "Upload"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* RIGHT COLUMN - Manual Lab Values */}
          <View style={styles.gridColumn}>
            <View style={styles.uploadSection}>
              <TouchableOpacity 
                style={styles.sectionHeader}
                onPress={() => setShowManualEntry(!showManualEntry)}
              >
                <Ionicons name="create" size={24} color="#FF9500" />
                <Text style={styles.sectionTitle}>Manual Values</Text>
                <Ionicons 
                  name={showManualEntry ? "chevron-up" : "chevron-down"} 
                  size={24} 
                  color="#8E8E93" 
                  style={{ marginLeft: "auto" }}
                />
              </TouchableOpacity>
              <Text style={styles.optionalLabel}>(Optional if Lab Report uploaded)</Text>
              
              <Text style={styles.manualEntryHint}>
                Use instead of or along with lab image
              </Text>

              {showManualEntry && (
                <View style={styles.manualEntryContainer}>
                  {/* Creatinine */}
                  <View style={styles.inputRow}>
                    <Text style={styles.inputLabel}>Creatinine</Text>
                    <Text style={styles.unitLabel}>(mg/dL)</Text>
                    <TextInput
                      style={styles.textInput}
                      value={creatinine}
                      onChangeText={setCreatinine}
                      placeholder="e.g., 1.2"
                      placeholderTextColor="#8E8E93"
                      keyboardType="decimal-pad"
                    />
                  </View>

                  {/* eGFR */}
                  <View style={styles.inputRow}>
                    <Text style={styles.inputLabel}>eGFR</Text>
                    <Text style={styles.unitLabel}>(mL/min/1.73m²)</Text>
                    <TextInput
                      style={styles.textInput}
                      value={egfr}
                      onChangeText={setEgfr}
                      placeholder="e.g., 60"
                      placeholderTextColor="#8E8E93"
                      keyboardType="decimal-pad"
                    />
                  </View>

                  {/* BUN */}
                  <View style={styles.inputRow}>
                    <Text style={styles.inputLabel}>BUN</Text>
                    <Text style={styles.unitLabel}>(mg/dL)</Text>
                    <TextInput
                      style={styles.textInput}
                      value={bun}
                      onChangeText={setBun}
                      placeholder="e.g., 20"
                      placeholderTextColor="#8E8E93"
                      keyboardType="decimal-pad"
                    />
                  </View>

                  {/* Albumin */}
                  <View style={styles.inputRow}>
                    <Text style={styles.inputLabel}>Albumin</Text>
                    <Text style={styles.unitLabel}>(g/dL)</Text>
                    <TextInput
                      style={styles.textInput}
                      value={albumin}
                      onChangeText={setAlbumin}
                      placeholder="e.g., 4.0"
                      placeholderTextColor="#8E8E93"
                      keyboardType="decimal-pad"
                    />
                  </View>

                  {/* Hemoglobin */}
                  <View style={styles.inputRow}>
                    <Text style={styles.inputLabel}>Hemoglobin</Text>
                    <Text style={styles.unitLabel}>(g/dL)</Text>
                    <TextInput
                      style={styles.textInput}
                      value={hemoglobin}
                      onChangeText={setHemoglobin}
                      placeholder="e.g., 12.5"
                      placeholderTextColor="#8E8E93"
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Analyze Button */}
        <TouchableOpacity
          style={[
            styles.analyzeButton,
            ((!labReportImage && !creatinine && !egfr) || loading) && styles.analyzeButtonDisabled,
          ]}
          onPress={analyzeData}
          activeOpacity={0.8}
          disabled={(!labReportImage && !creatinine && !egfr) || loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="analytics" size={24} color="#FFFFFF" />
              <Text style={styles.analyzeButtonText}>Analyze & Predict</Text>
            </>
          )}
        </TouchableOpacity>

        {loading && (
          <Text style={styles.loadingText}>
            Processing your data... This may take a moment.
          </Text>
        )}

        {/* Past CKD Stage Records */}
        <View style={styles.historySection}>
          <TouchableOpacity
            style={styles.historyHeader}
            onPress={() => navigation.navigate("FutureCKDStageHistory", { userEmail, userName })}
            activeOpacity={0.8}
          >
            <View style={styles.historyHeaderLeft}>
              <Ionicons name="time" size={22} color="#4A90E2" />
              <View>
                <Text style={styles.historyTitle}>Past Future CKD Stages</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={22} color="#8E8E93" />
          </TouchableOpacity>

          <View style={styles.historyBody}>
            {historyLoading ? (
              <Text style={styles.emptyHistoryText}>Loading...</Text>
            ) : historyError ? (
              <Text style={styles.emptyHistoryText}>{historyError}</Text>
            ) : history.length === 0 ? (
              <View style={styles.emptyHistory}>
                <Text style={styles.emptyHistoryText}>
                  No saved predictions yet. Run an analysis to capture it here.
                </Text>
              </View>
            ) : (
              <>
                {history.slice(0, 2).map((record, index) => {
                  const stageWithUS = record.prediction_with_us?.predicted_stage;
                  const stageLabOnly = record.prediction_lab_only?.predicted_stage;
                  const inputs = record.inputs || {};
                  const labs = inputs.labs || {};
                  const uploaded = inputs.uploaded || {};

                  return (
                    <View key={record._id || record.id || index} style={styles.historyCard}>
                      <View style={styles.historyCardHeader}>
                        <View>
                          <Text style={styles.historyCardTitle}>
                            {stageWithUS || stageLabOnly
                              ? `Stage ${stageWithUS || stageLabOnly}`
                              : "Result saved"}
                          </Text>
                          <Text style={styles.historyCardDate}>{formatDateTime(record.createdAt)}</Text>
                          {record.submissionIndex ? (
                            <Text style={styles.historyCardDate}>Submission #{record.submissionIndex}</Text>
                          ) : null}
                        </View>
                        {/* <View style={styles.badgeRow}>
                          {uploaded.labReport && (
                            <View style={[styles.badge, styles.badgePrimary]}>
                              <Text style={styles.badgeText}>Lab</Text>
                            </View>
                          )}
                          {uploaded.ultrasound && (
                            <View style={[styles.badge, styles.badgeSecondary]}>
                              <Text style={styles.badgeText}>Ultrasound</Text>
                            </View>
                          )}
                          {(labs.creatinine || labs.egfr) && (
                            <View style={[styles.badge, styles.badgeMuted]}>
                              <Text style={styles.badgeText}>Manual Labs</Text>
                            </View>
                          )}
                        </View> */}
                      </View>
                    </View>
                  );
                })}
                {history.length > 2 }
              </>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F7FA",
    paddingTop: StatusBar.currentHeight || 0,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 10,
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
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1C1C1E",
  },
  placeholder: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: 24,
    paddingTop: 36,
  },
  gridContainer: {
    flexDirection: "column",
    gap: 16,
    marginBottom: 16,
  },
  gridColumn: {
    flex: 1,
    width: "100%",
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1C1C1E",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "#8E8E93",
    marginBottom: 12,
  },
  infoText: {
    fontSize: 13,
    color: "#FF9500",
    backgroundColor: "#FFF3E0",
    padding: 12,
    borderRadius: 12,
    marginBottom: 24,
    lineHeight: 20,
  },
  uploadSection: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  detailsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  ageGenderField: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1C1C1E",
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F5F7FA",
    borderRadius: 12,
    paddingHorizontal: 8,
    height: 44,
  },
  inputPrefix: {
    fontSize: 12,
    fontWeight: "600",
    color: "#8E8E93",
    marginRight: 4,
  },
  numberInputButton: {
    padding: 8,
  },
  ageGenderValue: {
    flex: 1,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "700",
    color: "#1C1C1E",
  },
  genderContainer: {
    flexDirection: "row",
    gap: 8,
  },
  genderButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F5F7FA",
    borderRadius: 12,
    paddingVertical: 10,
    borderWidth: 2,
    borderColor: "#E5E5EA",
  },
  genderButtonActive: {
    backgroundColor: "#007AFF",
    borderColor: "#007AFF",
  },
  genderButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#007AFF",
    marginLeft: 6,
  },
  genderButtonTextActive: {
    color: "#FFFFFF",
  },
  manualEntryHint: {
    fontSize: 12,
    color: "#8E8E93",
    marginBottom: 12,
    fontStyle: "italic",
  },
  optionalLabel: {
    fontSize: 11,
    color: "#FF9500",
    marginTop: -12,
    marginBottom: 8,
    fontStyle: "italic",
  },
  manualEntryContainer: {
    marginTop: 12,
    gap: 12,
  },
  inputRow: {
    marginBottom: 0,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1C1C1E",
    marginBottom: 2,
  },
  unitLabel: {
    fontSize: 10,
    fontWeight: "500",
    color: "#8E8E93",
    marginBottom: 4,
  },
  textInput: {
    backgroundColor: "#F5F7FA",
    borderRadius: 12,
    padding: 10,
    fontSize: 14,
    color: "#1C1C1E",
    borderWidth: 1,
    borderColor: "#E5E5EA",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1C1C1E",
    marginLeft: 8,
  },
  imagePreviewContainer: {
    position: "relative",
    marginBottom: 16,
    borderRadius: 12,
    overflow: "hidden",
  },
  imagePreview: {
    width: "100%",
    height: 200,
    borderRadius: 12,
    backgroundColor: "#E5E5EA",
  },
  removeButton: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  uploadButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F5F7FA",
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: "#E5E5EA",
    borderStyle: "dashed",
  },
  uploadButtonSecondary: {
    borderStyle: "solid",
    borderColor: "#50E3C2",
    backgroundColor: "#50E3C220",
  },
  uploadButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1C1C1E",
    marginLeft: 8,
  },
  uploadButtonTextSecondary: {
    color: "#50E3C2",
  },
  analyzeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#34C759",
    borderRadius: 16,
    padding: 18,
    marginTop: 8,
    shadowColor: "#34C759",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  analyzeButtonDisabled: {
    backgroundColor: "#C7C7CC",
    shadowOpacity: 0,
  },
  analyzeButtonText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
    marginLeft: 8,
  },
  loadingText: {
    fontSize: 14,
    color: "#8E8E93",
    textAlign: "center",
    marginTop: 16,
    fontStyle: "italic",
  },
  historySection: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    marginTop: 24,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  historyHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  historyHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  historyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1C1C1E",
  },
  historySubtitle: {
    fontSize: 12,
    color: "#8E8E93",
  },
  historyBody: {
    marginTop: 16,
    gap: 12,
  },
  emptyHistory: {
    padding: 14,
    backgroundColor: "#F5F7FA",
    borderRadius: 12,
  },
  emptyHistoryText: {
    fontSize: 13,
    color: "#8E8E93",
  },
  historyCard: {
    borderWidth: 1,
    borderColor: "#EEF0F4",
    borderRadius: 14,
    padding: 14,
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
  },
  historyCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  historyCardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1C1C1E",
  },
  historyCardDate: {
    fontSize: 12,
    color: "#8E8E93",
    marginTop: 2,
  },
  badgeRow: {
    flexDirection: "row",
    gap: 6,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "#F5F7FA",
  },
  badgePrimary: {
    backgroundColor: "#E3F2FD",
  },
  badgeSecondary: {
    backgroundColor: "#E6FFFA",
  },
  badgeMuted: {
    backgroundColor: "#F1F2F6",
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#1C1C1E",
  },
  detailsToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  detailsToggleText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#4A90E2",
  },
  historyDetails: {
    marginTop: 8,
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "#E5E5EA",
    gap: 6,
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1C1C1E",
    marginBottom: 4,
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  resultLabel: {
    fontSize: 12,
    color: "#8E8E93",
    width: 80,
  },
  resultValue: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1C1C1E",
  },
  resultMeta: {
    fontSize: 12,
    color: "#4A90E2",
  },
  labGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  labItem: {
    width: "48%",
    backgroundColor: "#F5F7FA",
    borderRadius: 10,
    padding: 8,
  },
  labLabel: {
    fontSize: 12,
    color: "#8E8E93",
  },
  labValue: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1C1C1E",
    marginTop: 2,
  },
  metaRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 4,
  },
  metaText: {
    fontSize: 12,
    color: "#8E8E93",
  },
  historyFooter: {
    marginTop: 6,
    fontSize: 12,
    color: "#8E8E93",
    textAlign: "right",
  },
});

export default FutureCKDStageScreen;
