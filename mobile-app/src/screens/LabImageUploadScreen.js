import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Alert,
  ActivityIndicator,
  Image,
  Platform,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Picker } from "@react-native-picker/picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_URL } from "../api/axiosConfig";

const LabImageUploadScreen = ({ navigation, route }) => {
  const [userName, setUserName] = useState(route.params?.userName || "User");
  const [userEmail, setUserEmail] = useState(route.params?.userEmail || "");
  const [userID, setUserID] = useState(route.params?.userID || "");
  const [selectedImage, setSelectedImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingUser, setLoadingUser] = useState(true);
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("M");

  // Helper function to calculate age from birthday
  const calculateAge = (birthday) => {
    if (!birthday) return "";
    const birthDate = new Date(birthday);
    const today = new Date();
    let calculatedAge = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      calculatedAge--;
    }
    return calculatedAge.toString();
  };

  // Helper function to convert gender format (Backend: "Male"/"Female" -> Form: "M"/"F")
  const convertGenderFormat = (genderValue) => {
    if (!genderValue) return "M";
    const lowerGender = genderValue.toLowerCase();
    if (lowerGender === "male" || lowerGender === "m") return "M";
    if (lowerGender === "female" || lowerGender === "f") return "F";
    return "M"; // Default
  };

  // Load user data from AsyncStorage on component mount
  useEffect(() => {
    const loadUserData = async () => {
      try {
        // Get user data from AsyncStorage
        const storedUserName = await AsyncStorage.getItem("userName");
        const storedUserEmail = await AsyncStorage.getItem("userEmail");
        const storedUserID = await AsyncStorage.getItem("userID");
        const storedUserData = await AsyncStorage.getItem("userData");

        // Use route params if available, otherwise use AsyncStorage
        if (!route.params?.userName && storedUserName) {
          setUserName(storedUserName);
        }
        if (!route.params?.userEmail && storedUserEmail) {
          setUserEmail(storedUserEmail);
        }
        if (!route.params?.userID && storedUserID) {
          setUserID(storedUserID);
        }

        // If we have complete userData, extract age and gender
        if (storedUserData) {
          const userData = JSON.parse(storedUserData);
          console.log("Loaded user data from AsyncStorage:", userData);

          // Calculate age from birthday
          if (userData.birthday) {
            const calculatedAge = calculateAge(userData.birthday);
            setAge(calculatedAge);
            console.log("Calculated age from birthday:", calculatedAge);
          }

          // Set gender from user data
          if (userData.gender) {
            const convertedGender = convertGenderFormat(userData.gender);
            setGender(convertedGender);
            console.log("User gender:", userData.gender, "-> Converted:", convertedGender);
          }
        }

        console.log("User loaded - Name:", storedUserName || route.params?.userName, "Email:", storedUserEmail || route.params?.userEmail);
      } catch (error) {
        console.error("Error loading user data from AsyncStorage:", error);
      } finally {
        setLoadingUser(false);
      }
    };

    loadUserData();
  }, [route.params]);

  const pickImage = async () => {
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
        mediaTypes: "images",
        quality: 1,
      });

      if (!result.canceled) {
        setSelectedImage(result.assets[0]);
      }
    } catch (error) {
      console.error("Error picking image:", error);
      Alert.alert("Error", "Failed to pick image");
    }
  };

  const uploadAndProcess = async () => {
    if (!selectedImage) {
      Alert.alert("No Image", "Please select a lab report image first");
      return;
    }

    setLoading(true);

    try {
      const formData = new FormData();
      const fileUri = selectedImage.uri;
      const fileName = fileUri.split("/").pop() || "lab-report.jpg";
      
      // Determine file type
      let fileType = "image/jpeg";
      if (fileName.endsWith(".png")) {
        fileType = "image/png";
      } else if (fileName.endsWith(".jpg") || fileName.endsWith(".jpeg")) {
        fileType = "image/jpeg";
      }

      // Handle file upload differently for web vs mobile
      if (Platform.OS === "web") {
        // For web, fetch the file as blob
        const fileResponse = await fetch(fileUri);
        const blob = await fileResponse.blob();
        console.log("Blob size:", blob.size, "type:", blob.type);
        
        // Create a File object from blob
        const file = new File([blob], fileName, { type: fileType });
        formData.append("reportImage", file, fileName);
      } else {
        // For mobile (iOS/Android)
        formData.append("reportImage", {
          uri: fileUri,
          type: fileType,
          name: fileName,
        });
      }
      
      // Add patient name and email
      formData.append("name", userName || userEmail || "Unknown");
      if (userEmail) {
        formData.append("userEmail", userEmail);
      }
      // Add age and gender as fallback (if OCR fails to extract)
      if (age) {
        formData.append("age", age);
      }
      formData.append("gender", gender);

      console.log("Platform:", Platform.OS);
      console.log("Uploading lab report for:", userName || userEmail || "Unknown");
      console.log("File name:", fileName);

      // Use centralized API URL from axiosConfig
      const BACKEND_URL = Platform.OS === "web" 
        ? "http://localhost:5000/api" 
        : API_URL;
      
      console.log("Connecting to:", BACKEND_URL);
      
      const uploadResponse = await fetch(`${BACKEND_URL}/lab/upload`, {
        method: "POST",
        body: formData,
        // Don't set Content-Type header - let browser set it with boundary
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

      if (responseData.success || responseData.labTest) {
        Alert.alert("Success", "Lab report processed successfully!");
        // Navigate to results page with all user details
        navigation.navigate("LabResult", { result: responseData, userName, userEmail, userID });
      } else {
        throw new Error(responseData.message || "Processing failed");
      }
    } catch (error) {
      console.error("Upload/Processing error:", error);
      Alert.alert(
        "Error",
        error.message || "Failed to process lab report. Check if backend is running."
      );
    } finally {
      setLoading(false);
    }
  };

  // Show loading while fetching user data
  if (loadingUser) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color="#4A90E2" />
        <Text style={styles.loadingText}>Loading user data...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
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
        <Text style={styles.headerTitle}>Upload Lab Report</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={true}
      >
        <Text style={styles.sectionTitle}>Upload Lab Report Image</Text>
        <Text style={styles.patientInfo}>Patient: {userName || userEmail || "Unknown"}</Text>

        {/* Info Card */}
       

        {/* Patient Information (Auto-filled from profile) */}
        <Text style={styles.sectionTitle}>Patient Information</Text>
        <Text style={styles.autoFillNote}>Auto-filled from your profile</Text>
        <View style={styles.row}>
          <View style={styles.halfInputGroup}>
            <Text style={styles.label}>Age</Text>
            <TextInput
              style={[styles.input, age ? styles.inputFilled : null, styles.inputReadOnly]}
              value={age}
              editable={false}
              placeholder="From profile"
              placeholderTextColor="#C7C7CC"
              keyboardType="numeric"
            />
          </View>

          <View style={styles.halfInputGroup}>
            <Text style={styles.label}>Gender</Text>
            <View style={[styles.pickerContainer, styles.pickerFilled, styles.pickerReadOnly]}>
              <Picker
                selectedValue={gender}
                enabled={false}
                style={styles.picker}
              >
                <Picker.Item label="Male" value="M" />
                <Picker.Item label="Female" value="F" />
              </Picker>
            </View>
          </View>
        </View>

        {/* Image Preview */}
        {selectedImage && (
          <View style={styles.imagePreviewContainer}>
            <Image source={{ uri: selectedImage.uri }} style={styles.imagePreview} />
          </View>
        )}

        {/* Upload Button */}
        <TouchableOpacity
          style={styles.uploadButton}
          onPress={pickImage}
          activeOpacity={0.8}
          disabled={loading}
        >
          <Ionicons name="cloud-upload-outline" size={24} color="#4A90E2" />
          <Text style={styles.uploadButtonText}>
            {selectedImage ? "Change Lab Report" : "Upload Lab Report Image"}
          </Text>
        </TouchableOpacity>

        {/* Process Button */}
        {selectedImage && (
          <TouchableOpacity
            style={styles.processButton}
            onPress={uploadAndProcess}
            activeOpacity={0.8}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Text style={styles.processButtonText}>Analyze Lab Report</Text>
                <Ionicons name="analytics" size={20} color="#FFFFFF" />
              </>
            )}
          </TouchableOpacity>
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
  loadingContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: "#8E8E93",
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
    paddingBottom: 50,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1C1C1E",
    marginBottom: 8,
  },
  patientInfo: {
    fontSize: 16,
    color: "#8E8E93",
    marginBottom: 20,
  },
  infoCard: {
    flexDirection: "row",
    backgroundColor: "#E3F2FD",
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    alignItems: "flex-start",
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: "#1C1C1E",
    lineHeight: 20,
    marginLeft: 12,
  },
  imagePreviewContainer: {
    width: "100%",
    height: 300,
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 16,
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  imagePreview: {
    width: "100%",
    height: "100%",
    resizeMode: "contain",
  },
  uploadButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 18,
    borderWidth: 2,
    borderColor: "#4A90E2",
    borderStyle: "dashed",
    marginBottom: 16,
  },
  uploadButtonText: {
    color: "#4A90E2",
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
  },
  processButton: {
    backgroundColor: "#50E3C2",
    borderRadius: 16,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#50E3C2",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  processButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
    marginRight: 8,
  },
  row: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  halfInputGroup: {
    flex: 1,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1C1C1E",
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#E5E5EA",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#1C1C1E",
    backgroundColor: "#FFFFFF",
  },
  inputFilled: {
    borderColor: "#50E3C2",
    backgroundColor: "#F0FDF9",
  },
  pickerContainer: {
    borderWidth: 3,
    borderColor: "#2a2a33ff",
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
  },
  pickerFilled: {
    borderColor: "#50E3C2",
    backgroundColor: "#F0FDF9",
  },
  autoFillNote: {
    fontSize: 13,
    color: "#50E3C2",
    marginBottom: 12,
    fontStyle: "italic",
  },
  inputReadOnly: {
    opacity: 0.7,
    color: "#6B7280",
  },
  pickerReadOnly: {
    opacity: 0.7,
  },
  picker: {
    height: 50,
    width: "100%",
  },
});

export default LabImageUploadScreen;
