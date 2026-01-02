import React, { useState } from "react";
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
import api from "../api/axiosConfig";

const LabImageUploadScreen = ({ navigation, route }) => {
  const userName = route.params?.userName || "User";
  const userEmail = route.params?.userEmail || "";
  const [selectedImage, setSelectedImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("M");

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
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
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
      
      // Add patient name
      formData.append("name", userName || userEmail || "Unknown");
      // Add age and gender as fallback (if OCR fails to extract)
      if (age) {
        formData.append("age", age);
      }
      formData.append("gender", gender);

      console.log("Platform:", Platform.OS);
      console.log("Uploading lab report for:", userName || userEmail || "Unknown");
      console.log("File name:", fileName);

      // Use localhost for web, IP address for mobile devices
      const BACKEND_URL = Platform.OS === "web" 
        ? "http://localhost:5000/api" 
        : "http://172.20.10.2:5000/api";
      
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
        // Navigate to results page
        navigation.navigate("LabResult", { result: responseData, userName, userEmail });
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
        <Text style={styles.patientInfo}>Patient: {userName || userEmail}</Text>

        {/* Info Card */}
       

        {/* Optional Age and Gender Fields (Fallback for OCR) */}
        <Text style={styles.sectionTitle}>Optional Patient Info (for OCR backup)</Text>
        <View style={styles.row}>
          <View style={styles.halfInputGroup}>
            <Text style={styles.label}>Age (Optional)</Text>
            <TextInput
              style={styles.input}
              value={age}
              onChangeText={setAge}
              placeholder="If not in report"
              placeholderTextColor="#C7C7CC"
              keyboardType="numeric"
            />
          </View>

          <View style={styles.halfInputGroup}>
            <Text style={styles.label}>Gender (Optional)</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={gender}
                onValueChange={setGender}
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
            {selectedImage ? "Change Image" : "Select Lab Report Image"}
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
                <Text style={styles.processButtonText}>Process & Analyze</Text>
                <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
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
    fontSize: 16,
    color: "#1C1C1E",
    backgroundColor: "#FFFFFF",
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: "#E5E5EA",
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
  },
  picker: {
    height: 50,
    width: "100%",
  },
});

export default LabImageUploadScreen;
