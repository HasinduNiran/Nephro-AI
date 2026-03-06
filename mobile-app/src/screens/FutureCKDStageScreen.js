import React, { useCallback, useState, useEffect } from "react";
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
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useFocusEffect } from "@react-navigation/native";
import axios, { API_URL } from "../api/axiosConfig";

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

const getTodayDateString = () => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const toDateString = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const parseDateString = (value) => {
  if (!value) return new Date();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const FutureCKDStageScreen = ({ navigation, route }) => {
  // Try multiple param shapes to recover email passed from upstream screens/auth
  const userFromRoute = route.params?.user || null;
  const userName = route.params?.userName || userFromRoute?.name || "User";
  const [userEmail, setUserEmail] = useState(
    route.params?.userEmail ||
    route.params?.email ||
    userFromRoute?.email ||
    userFromRoute?.userEmail ||
    ""
  );

  // Load userEmail from AsyncStorage if not available
  useEffect(() => {
    const loadUserEmail = async () => {
      if (!userEmail) {
        try {
          const storedEmail = await AsyncStorage.getItem("userEmail");
          if (storedEmail) {
            setUserEmail(storedEmail);
          }
        } catch (error) {
          console.error("Error loading user email:", error);
        }
      }
    };
    loadUserEmail();
  }, []);

  // Load user data (age and gender) from AsyncStorage
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

            setAge(calculatedAge.toString());
          }

          const routeGenderCode = normalizeGenderCode(route.params?.user?.gender);
          const storedGenderCode = normalizeGenderCode(userData.gender);
          const genderCode = storedGenderCode || routeGenderCode;
          if (genderCode) {
            setGender(genderCode);
          }
        }
      } catch (error) {
        console.error("Error loading user data:", error);
      }
    };

    loadUserData();
  }, []);
  
  const [ultrasoundImage, setUltrasoundImage] = useState(null);
  const [labReportImage, setLabReportImage] = useState(null);
  const [scanResult, setScanResult] = useState(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [age, setAge] = useState("");
  const [visitDate, setVisitDate] = useState(getTodayDateString());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [gender, setGender] = useState(""); // "M" or "F"
  const [showGenderPicker, setShowGenderPicker] = useState(false);
  const [manualResult, setManualResult] = useState(null);
  const [labResult, setLabResult] = useState(null);
  const [labAnalyzing, setLabAnalyzing] = useState(false);
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

  const bunNumber = bun ? parseFloat(bun) : null;
  const bunRiskCategory = bunNumber !== null && !Number.isNaN(bunNumber) && bunNumber >= 0
    ? getBunRiskCategory(bunNumber)
    : "";
  const hasManualInput = !!(creatinine || egfr || bun || albumin || hemoglobin);
  const hasLabInputForPreview = !!(labReportImage || creatinine || egfr || bun || albumin || hemoglobin);

  const getLabStageColor = (stage) => {
    const text = String(stage || "");
    if (!text) return "#8E8E93";
    if (text.includes("1") || text.includes("2")) return "#50E3C2";
    if (text.includes("3")) return "#FFB946";
    if (text.includes("4") || text.includes("5")) return "#FF6B6B";
    return "#8E8E93";
  };

  const getLabStageIcon = (stage) => {
    const text = String(stage || "");
    if (!text) return "help-circle";
    if (text.includes("1") || text.includes("2")) return "checkmark-circle";
    if (text.includes("3")) return "warning";
    if (text.includes("4") || text.includes("5")) return "alert-circle";
    return "help-circle";
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "Normal":
        return "#50E3C2";
      case "Early risk":
        return "#FFB946";
      case "High":
      case "High risk":
        return "#FF6B6B";
      case "Low":
        return "#FFB946";
      default:
        return "#8E8E93";
    }
  };

  const clearLabPreview = () => {
    setLabResult(null);
    setLabReportImage(null);
    setCreatinine("");
    setEgfr("");
    setBun("");
    setAlbumin("");
    setHemoglobin("");
    setShowManualEntry(false);
  };

  const confirmClearLabPreview = () => {
    Alert.alert(
      "Delete lab result?",
      "This will remove the lab result from this page and prevent it from being used for Future CKD probability until you analyze again.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: clearLabPreview },
      ]
    );
  };

  const confirmClearUltrasoundPreview = () => {
    Alert.alert(
      "Delete ultrasound result?",
      "This will remove the ultrasound result from this page and prevent it from being used for Future CKD probability until you analyze again.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            setScanResult(null);
            setUltrasoundImage(null);
          },
        },
      ]
    );
  };

  const analyzeLabInPage = async () => {
    if (!hasLabInputForPreview) {
      Alert.alert("No Lab Input", "Upload a lab report or enter manual lab values first.");
      return;
    }

    if (!egfr && !creatinine && !labReportImage) {
      Alert.alert("Validation Error", "Creatinine is required when eGFR is not provided.");
      return;
    }

    setLabAnalyzing(true);
    try {
      let parsedLabData = null;

      if (labReportImage) {
        const formData = new FormData();
        const fileUri = labReportImage.uri;
        const fileName = fileUri.split("/").pop() || "lab-report.jpg";
        const fileType = fileName.endsWith(".png") ? "image/png" : "image/jpeg";

        if (Platform.OS === "web") {
          const fileResponse = await fetch(fileUri);
          const blob = await fileResponse.blob();
          const file = new File([blob], fileName, { type: fileType });
          formData.append("reportImage", file, fileName);
        } else {
          formData.append("reportImage", {
            uri: fileUri,
            type: fileType,
            name: fileName,
          });
        }

        formData.append("name", userName || userEmail || "Unknown");
        if (userEmail) formData.append("userEmail", userEmail);
        if (age) formData.append("age", age);
        if (gender) formData.append("gender", gender);

        const uploadResponse = await fetch(`${API_URL}/lab/upload`, {
          method: "POST",
          body: formData,
        });

        if (!uploadResponse.ok) {
          throw new Error(`Lab upload failed (${uploadResponse.status})`);
        }

        const responseData = await uploadResponse.json();
        parsedLabData = responseData?.data || responseData?.labTest || responseData;
      } else {
        const payload = {
          name: userName || userEmail || "Unknown",
          age: age ? parseInt(age, 10) : undefined,
          gender: gender || undefined,
          creatinine: creatinine ? parseFloat(creatinine) : undefined,
          eGFR: egfr ? parseFloat(egfr) : undefined,
          bun: bun ? parseFloat(bun) : undefined,
          bunRiskCategory: bunRiskCategory || undefined,
          albumin: albumin ? parseFloat(albumin) : undefined,
        };
        const response = await axios.post("/lab", payload);
        parsedLabData = response?.data?.data || response?.data?.labTest || response?.data;
      }

      if (!parsedLabData) {
        throw new Error("Lab analysis returned empty data");
      }
      setLabResult(parsedLabData);
      setManualResult(parsedLabData);
    } catch (error) {
      console.error("Lab analysis error:", error);
      Alert.alert("Error", error.message || "Failed to analyze lab data");
    } finally {
      setLabAnalyzing(false);
    }
  };

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
      // Check if user is trying to upload lab report while manual data exists
      if (type === "lab" && (creatinine || egfr || bun || albumin || hemoglobin)) {
        Alert.alert(
          "Remove Manual Data First",
          "You have already entered manual lab values. Please clear them before uploading a lab report.\n\nTap the Manual Values section to collapse it and remove the data.",
          [
            {
              text: "OK",
              onPress: () => setShowManualEntry(true), // Auto-expand manual entry section
            },
            { text: "Cancel" }
          ]
        );
        return;
      }

      // Request permission
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (status !== "granted") {
        Alert.alert(
          "Permission Required",
          "Please grant camera roll permissions to upload images"
        );
        return;
      }

      // Launch image picker - NO CROPPING
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 1,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        if (type === "ultrasound") {
          setScanResult(null);
          setUltrasoundImage(result.assets[0]);
          console.log("Ultrasound image selected:", result.assets[0].uri);
        } else {
          setShowManualEntry(false);
          setLabReportImage(result.assets[0]);
          console.log("Lab report image selected:", result.assets[0].uri);
        }
      }
    } catch (error) {
      console.error("Error picking image:", error);
      Alert.alert("Error", "Failed to pick image");
    }
  };
const analyzeUltrasound = async () => {
  if (!ultrasoundImage) {
    Alert.alert("No Image", "Please upload an ultrasound image first");
    return;
  }

  try {
    setScanLoading(true);

    const formData = new FormData();
    const fileUri = ultrasoundImage.uri;
    const fileName = fileUri.split("/").pop() || "ultrasound.jpg";

    let fileType = "image/jpeg";
    if (fileName.endsWith(".png")) fileType = "image/png";

    if (Platform.OS === "web") {
      const response = await fetch(fileUri);
      const blob = await response.blob();
      const file = new File([blob], fileName, { type: fileType });
      formData.append("ultrasound", file);
    } else {
      formData.append("ultrasound", {
        uri: fileUri,
        type: fileType,
        name: fileName,
      });
    }

    formData.append("name", userName || userEmail || "Unknown");

    const uploadResponse = await fetch(`${API_URL}/upload-ultrasound`, {
      method: "POST",
      body: formData,
    });

    if (!uploadResponse.ok) {
      throw new Error("Ultrasound analysis failed");
    }

    const data = await uploadResponse.json();

    if (data.success) {
      setScanResult(data);
    } else {
      throw new Error(data.message || "Analysis failed");
    }

  } catch (error) {
    console.error(error);
    Alert.alert("Error", error.message);
  } finally {
    setScanLoading(false);
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
      if (!egfr && !creatinine) {
        Alert.alert(
          "Insufficient Data",
          "Creatinine is required when eGFR is not provided."
        );
        return;
      }

      const egfrValue = egfr ? parseFloat(egfr) : null;
      if (egfr && (Number.isNaN(egfrValue) || egfrValue < 0)) {
        Alert.alert(
          "Validation Error",
          "eGFR cannot be less than 0."
        );
        return;
      }

      const creatinineValue = creatinine ? parseFloat(creatinine) : null;
      if (creatinine && Number.isNaN(creatinineValue)) {
        Alert.alert(
          "Validation Error",
          "Please enter a valid Creatinine value."
        );
        return;
      }

      if (creatinineValue !== null) {
        const creatinineRange = getCreatinineRangeByGender(gender);
        if (creatinineValue < creatinineRange.min || creatinineValue > creatinineRange.max) {
          Alert.alert(
            "Validation Error",
            `Creatinine for ${gender === "F" ? "female" : "male"} should be within ${creatinineRange.label}.`
          );
          return;
        }
      }

      if (bun) {
        const bunValue = parseFloat(bun);
        if (Number.isNaN(bunValue) || bunValue < 0) {
          Alert.alert(
            "Validation Error",
            "BUN cannot be less than 0."
          );
          return;
        }
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
      
      // Add lab report if provided
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

      // Add ultrasound if provided
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
      formData.append("visitDate", visitDate || getTodayDateString());
      
      // Add manual lab values if provided
      if (creatinine) formData.append("creatinine", creatinine);
      if (egfr) formData.append("egfr", egfr);
      if (bun) formData.append("bun", bun);
      if (bunRiskCategory) formData.append("bunRiskCategory", bunRiskCategory);
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
      
      console.log("Connecting to:", API_URL);
      
      const uploadResponse = await fetch(`${API_URL}/stage-progression/upload`, {
        method: "POST",
        body: formData,
        timeout: 30000,
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
      } else if (responseData.message && responseData.message.includes("extraction")) {
        // Data extraction from lab report failed
        Alert.alert(
          "Unable to Extract Data",
          "Could not automatically extract lab values from the image.\n\nPlease enter the values manually instead.",
          [
            {
              text: "OK",
              onPress: () => {
                setLabReportImage(null); // Clear lab report
                setShowManualEntry(true); // Auto-expand manual entry section
              },
            },
          ]
        );
      } else {
        throw new Error(responseData.message || "Analysis failed");
      }
    } catch (error) {
      console.error("Analysis error:", error);
      
      // Handle network request failures
      if (error.message.includes("Network") || error.message.includes("fetch") || error.message.includes("ERR_")) {
        Alert.alert(
          "Network Connection Error",
          "Failed to connect to the server. Please check your internet connection and try again.\n\nError: " + error.message,
          [{ text: "OK" }]
        );
      } else if (error.message.includes("extraction")) {
        Alert.alert(
          "Data Extraction Failed",
          "Could not extract lab values from the uploaded image.\n\nPlease enter the values manually instead.",
          [
            {
              text: "OK",
              onPress: () => {
                setLabReportImage(null); // Clear lab report
                setShowManualEntry(true); // Auto-expand manual entry section
              },
            },
          ]
        );
      } else {
        Alert.alert(
          "Error",
          error.message || "Failed to process data. Please try again."
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVisitDateChange = (_event, selectedDate) => {
    setShowDatePicker(false);
    if (selectedDate) {
      setVisitDate(toDateString(selectedDate));
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
          {/* PATIENT DETAILS - FIRST */}
          <View style={styles.gridColumn}>
            <View style={styles.uploadSection}>
              <View style={styles.sectionHeader}>
                <Ionicons name="person" size={24} color="#007AFF" />
                <Text style={styles.sectionTitle}>Patient Details</Text>
              </View>

              <View style={styles.ageGenderField}>
                <Text style={styles.fieldLabel}>Age</Text>
                <TextInput
                  style={styles.textInput}
                  value={age}
                  onChangeText={setAge}
                  placeholder="Enter age"
                  placeholderTextColor="#8E8E93"
                  keyboardType="number-pad"
                />
              </View>

              <View style={[styles.ageGenderField, { marginTop: 12 }]}> 
                <Text style={styles.fieldLabel}>Visit Date</Text>
                {Platform.OS === "web" ? (
                  <TextInput
                    style={styles.textInput}
                    value={visitDate}
                    onChangeText={setVisitDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#8E8E93"
                    autoCapitalize="none"
                  />
                ) : (
                  <TouchableOpacity
                    style={styles.datePickerButton}
                    onPress={() => setShowDatePicker(true)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="calendar-outline" size={18} color="#4A90E2" />
                    <Text style={styles.datePickerButtonText}>{visitDate || "Select date"}</Text>
                  </TouchableOpacity>
                )}

                {showDatePicker && Platform.OS !== "web" ? (
                  <DateTimePicker
                    value={parseDateString(visitDate)}
                    mode="date"
                    display="default"
                    onChange={handleVisitDateChange}
                    maximumDate={new Date()}
                  />
                ) : null}
              </View>

              <View style={styles.ageGenderField}>
                <Text style={styles.fieldLabel}>Gender</Text>
                <View style={styles.readOnlyInput}>
                  <Text style={styles.readOnlyText}>
                    {gender === "F" ? "Female" : gender === "M" ? "Male" : "Not set"}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* LEFT COLUMN - Lab Report + Age/Gender */}
          <View style={styles.gridColumn}>
            {/* Lab Report Upload Section */}
            <View style={styles.uploadSection}>
              <View style={styles.sectionHeader}>
                <Ionicons name="flask" size={24} color="#F5A623" />
                <Text style={styles.sectionTitle}>Lab Report</Text>
              </View>
              {labReportImage ? (
                <Text style={styles.optionalLabel}>✅ Lab Report mode selected (Manual entry locked)</Text>
              ) : (
                <Text style={styles.optionalLabel}>(Optional if Manual Values entered)</Text>
              )}
              
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
          </View>
 {/* RIGHT COLUMN - Manual Lab Values */}
          <View style={styles.gridColumn}>
            <View style={styles.uploadSection}>
              <TouchableOpacity 
                style={styles.sectionHeader}
                onPress={() => {
                  if (labReportImage) {
                    Alert.alert(
                      "Manual Entry Locked",
                      "Lab report mode is selected. Remove the uploaded lab report to enable manual entry."
                    );
                    return;
                  }
                  setShowManualEntry(!showManualEntry);
                }}
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
              {labReportImage && (
                <Text style={styles.disabledLabel}>
                  ✅ Lab Report mode approved. Remove it to use Manual Entry.
                </Text>
              )}
              {!labReportImage && hasManualInput && (
                <Text style={styles.optionalLabel}>✅ Manual Entry mode selected</Text>
              )}
              {!labReportImage && !hasManualInput && (
                <Text style={styles.optionalLabel}>(Optional if Lab Report uploaded)</Text>
              )}
              
              <Text style={styles.manualEntryHint}>
                If eGFR is entered, Creatinine is optional. If eGFR is empty, Creatinine is required.
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
                    <Text style={styles.validationHint}>
                      {`Range (${gender === "F" ? "Female" : "Male"}): ${getCreatinineRangeByGender(gender || "M").label}`}
                    </Text>
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
                    <Text style={styles.validationHint}>Must be 0 or greater</Text>
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
                    <Text style={styles.validationHint}>Must be 0 or greater</Text>
                    {bunRiskCategory ? (
                      <Text style={styles.bunRiskText}>{`BUN Category: ${bunRiskCategory}`}</Text>
                    ) : null}
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

            {hasLabInputForPreview && !labResult && (
              <TouchableOpacity
                style={styles.inlineAnalyzeButton}
                onPress={analyzeLabInPage}
                activeOpacity={0.8}
                disabled={labAnalyzing}
              >
                {labAnalyzing ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="flask" size={20} color="#FFFFFF" />
                    <Text style={styles.inlineAnalyzeButtonText}>Analyze Lab</Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            {labResult && (
              <View style={styles.resultsContainer}>
                <View style={styles.inlineResultHeader}>
                  <Text style={styles.inlineResultTitle}>Lab Analysis Result</Text>
                  <TouchableOpacity
                    style={styles.inlineDeleteButton}
                    onPress={confirmClearLabPreview}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="trash" size={18} color="#FF3B30" />
                  </TouchableOpacity>
                </View>

                <View style={[styles.labStageCard, { borderLeftColor: getLabStageColor(labResult.ckdStage) }]}>
                  <View style={styles.statusHeader}>
                    <Ionicons
                      name={getLabStageIcon(labResult.ckdStage)}
                      size={28}
                      color={getLabStageColor(labResult.ckdStage)}
                    />
                    <View style={{ marginLeft: 10, flex: 1 }}>
                      <Text style={[styles.statusText, { color: getLabStageColor(labResult.ckdStage), fontSize: 20 }]}>
                        {labResult.ckdStage || "Unknown Stage"}
                      </Text>
                      <Text style={styles.measurementLabel}>eGFR: {labResult.eGFRRange || "N/A"}</Text>
                    </View>
                  </View>
                  {labResult.stageDescription ? (
                    <Text style={styles.interpretationText}>{labResult.stageDescription}</Text>
                  ) : null}
                </View>

                <View style={styles.resultCard}>
                  <Text style={styles.cardTitle}>Lab Values</Text>

                  <View style={styles.measurementRow}>
                    <Ionicons name="water-outline" size={20} color="#4A90E2" />
                    <View style={styles.measurementContent}>
                      <Text style={styles.measurementLabel}>eGFR</Text>
                      <Text style={styles.measurementValue}>
                        {typeof labResult.eGFR === "number" ? labResult.eGFR.toFixed(2) : "N/A"} mL/min/1.73m²
                      </Text>
                    </View>
                  </View>

                  {typeof labResult.creatinine === "number" ? (
                    <View style={styles.measurementRow}>
                      <Ionicons name="flask-outline" size={20} color="#4A90E2" />
                      <View style={styles.measurementContent}>
                        <Text style={styles.measurementLabel}>Creatinine</Text>
                        <Text style={styles.measurementValue}>{labResult.creatinine.toFixed(2)} mg/dL</Text>
                      </View>
                    </View>
                  ) : null}

                  {typeof labResult.bun === "number" ? (
                    <View style={styles.measurementRow}>
                      <Ionicons name="fitness-outline" size={20} color="#4A90E2" />
                      <View style={styles.measurementContent}>
                        <Text style={styles.measurementLabel}>BUN</Text>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <Text style={styles.measurementValue}>{labResult.bun.toFixed(2)} mg/dL</Text>
                          <View
                            style={{
                              paddingHorizontal: 8,
                              paddingVertical: 4,
                              borderRadius: 8,
                              backgroundColor: `${getStatusColor(labResult.bunRiskCategory || getBunRiskCategory(labResult.bun))}20`,
                            }}
                          >
                            <Text style={{ fontSize: 11, fontWeight: "700", color: getStatusColor(labResult.bunRiskCategory || getBunRiskCategory(labResult.bun)) }}>
                              {labResult.bunRiskCategory || getBunRiskCategory(labResult.bun)}
                            </Text>
                          </View>
                        </View>
                      </View>
                    </View>
                  ) : null}

                  {typeof labResult.albumin === "number" ? (
                    <View style={styles.measurementRow}>
                      <Ionicons name="nutrition-outline" size={20} color="#4A90E2" />
                      <View style={styles.measurementContent}>
                        <Text style={styles.measurementLabel}>Albumin</Text>
                        <Text style={styles.measurementValue}>{labResult.albumin.toFixed(2)} g/dL</Text>
                      </View>
                    </View>
                  ) : null}
                </View>
              </View>
            )}
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
                    onPress={() => {
                      setUltrasoundImage(null);
                      setScanResult(null);
                    }}
                  >
                    <Ionicons name="close-circle" size={24} color="#FF3B30" />
                  </TouchableOpacity>
                </View>
              )}
{ultrasoundImage && !(scanResult && scanResult.success) && (
  <TouchableOpacity
    style={styles.analyzeButton}
    onPress={analyzeUltrasound}
    disabled={scanLoading}
  >
    {scanLoading ? (
      <ActivityIndicator color="#FFFFFF" />
    ) : (
      <>
        <Text style={styles.analyzeButtonText}>Analyze Ultrasound</Text>
        <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
      </>
    )}
  </TouchableOpacity>
)}
{scanResult && scanResult.success && (
  <View style={styles.resultsContainer}>
    <View style={styles.inlineResultHeader}>
      <Text style={styles.inlineResultTitle}>Ultrasound Result</Text>
      <TouchableOpacity
        style={styles.inlineDeleteButton}
        onPress={confirmClearUltrasoundPreview}
        activeOpacity={0.8}
      >
        <Ionicons name="trash" size={18} color="#FF3B30" />
      </TouchableOpacity>
    </View>

    <View
      style={[
        styles.statusCard,
        {
          borderLeftColor:
            scanResult.status === "normal" ? "#50E3C2" : "#FF6B6B",
        },
      ]}
    >
      <View style={styles.statusHeader}>
        <Ionicons
          name={
            scanResult.status === "normal"
              ? "checkmark-circle"
              : "alert-circle"
          }
          size={32}
          color={scanResult.status === "normal" ? "#50E3C2" : "#FF6B6B"}
        />
        <Text
          style={[
            styles.statusText,
            {
              color:
                scanResult.status === "normal"
                  ? "#50E3C2"
                  : "#FF6B6B",
            },
          ]}
        >
          {scanResult.status?.toUpperCase()}
        </Text>
      </View>
    </View>

    <View style={styles.resultCard}>
      <Text style={styles.cardTitle}>Kidney Measurements</Text>

      <View style={styles.measurementRow}>
        <Ionicons name="resize-outline" size={20} color="#4A90E2" />
        <View style={styles.measurementContent}>
          <Text style={styles.measurementLabel}>Kidney Length</Text>
          <Text style={styles.measurementValue}>
            {scanResult.kidney_length_cm
              ? scanResult.kidney_length_cm.toFixed(2)
              : "N/A"}{" "}
            cm
          </Text>
        </View>
      </View>

      {scanResult.kidney_width_cm && (
        <View style={styles.measurementRow}>
          <Ionicons name="resize-outline" size={20} color="#4A90E2" />
          <View style={styles.measurementContent}>
            <Text style={styles.measurementLabel}>Kidney Width</Text>
            <Text style={styles.measurementValue}>
              {scanResult.kidney_width_cm.toFixed(2)} cm
            </Text>
          </View>
        </View>
      )}
    </View>

    {scanResult.interpretation && (
      <View style={styles.resultCard}>
        <Text style={styles.cardTitle}>Interpretation</Text>
        <Text style={styles.interpretationText}>
          {scanResult.interpretation}
        </Text>
      </View>
    )}
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
                <Text style={styles.historyTitle}>Past Records</Text>
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
                  const visitNumber = index + 1;

                  return (
                    <View key={record._id || record.id || index} style={styles.historyCard}>
                      <View style={styles.historyCardHeader}>
                        <View>
                          <Text style={styles.historyCardTitle}>
                            {stageWithUS || stageLabOnly
                              ? `Stage ${stageWithUS || stageLabOnly}`
                              : "Result saved"}
                          </Text>
                          <Text style={styles.historyCardDate}>{formatDateTime(record.visitDate || record.inputs?.visitDate || record.createdAt)}</Text>
                          <Text style={styles.historyCardDate}>Visit #{visitNumber}</Text>
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
  disabledLabel: {
    fontSize: 11,
    color: "#FF3B30",
    marginTop: -12,
    marginBottom: 8,
    fontStyle: "italic",
    fontWeight: "600",
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
  validationHint: {
    fontSize: 11,
    color: "#8E8E93",
    marginTop: 4,
  },
  bunRiskText: {
    fontSize: 11,
    color: "#FF9500",
    marginTop: 4,
    fontWeight: "600",
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
  datePickerButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F5F7FA",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#E5E5EA",
    gap: 8,
  },
  datePickerButtonText: {
    fontSize: 14,
    color: "#1C1C1E",
    fontWeight: "500",
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
  inlineAnalyzeButton: {
    backgroundColor: "#4A90E2",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: -4,
    marginBottom: 12,
  },
  inlineAnalyzeButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  inlineResultHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  inlineResultTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1C1C1E",
  },
  inlineDeleteButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: "#FFF1F2",
    alignItems: "center",
    justifyContent: "center",
  },
  labStageCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 6,
  },
  analyzeButton: {
  backgroundColor: "#4A90E2",
  borderRadius: 16,
  padding: 18,
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  marginTop: 10,
  marginBottom: 24,
  shadowColor: "#4A90E2",
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.3,
  shadowRadius: 8,
  elevation: 5,
},

analyzeButtonText: {
  color: "#FFFFFF",
  fontSize: 16,
  fontWeight: "700",
  marginRight: 8,
},

resultsContainer: {
  marginTop: 10,
},

statusCard: {
  backgroundColor: "#FFFFFF",
  borderRadius: 16,
  padding: 20,
  marginBottom: 16,
  borderLeftWidth: 6,
},

statusHeader: {
  flexDirection: "row",
  alignItems: "center",
},

statusText: {
  fontSize: 24,
  fontWeight: "700",
  marginLeft: 12,
},

resultCard: {
  backgroundColor: "#FFFFFF",
  borderRadius: 16,
  padding: 20,
  marginBottom: 16,
},

cardTitle: {
  fontSize: 16,
  fontWeight: "700",
  marginBottom: 16,
},

measurementRow: {
  flexDirection: "row",
  alignItems: "center",
  marginBottom: 12,
},

measurementContent: {
  marginLeft: 12,
},

measurementLabel: {
  fontSize: 14,
  color: "#8E8E93",
},

measurementValue: {
  fontSize: 18,
  fontWeight: "700",
},

interpretationText: {
  fontSize: 15,
  lineHeight: 22,
},
});

export default FutureCKDStageScreen;
