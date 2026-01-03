import React, { useState } from "react";
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
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import api, { API_URL } from "../api/axiosConfig";

const ScanAnalysisScreen = ({ navigation, route }) => {
  const userName = route.params?.userName || "User";
  const userEmail = route.params?.userEmail || "";
  const [selectedImage, setSelectedImage] = useState(null);
  const [loading, setLoading] = useState(false);

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
        allowsEditing: false,
        quality: 1,
      });

      if (!result.canceled) {
        setSelectedImage(result.assets[0]);
        console.log("Ultrasound image selected:", result.assets[0].uri);
      }
    } catch (error) {
      console.error("Error picking image:", error);
      Alert.alert("Error", "Failed to pick image");
    }
  };

  const uploadAndAnalyze = async () => {
    if (!selectedImage) {
      Alert.alert("No Image", "Please select an ultrasound image first");
      return;
    }

    setLoading(true);

    try {
      const formData = new FormData();
      const fileUri = selectedImage.uri;
      const fileName = fileUri.split("/").pop() || "ultrasound.jpg";
      
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
        
        // Create a File object from blob (more compatible with multer)
        const file = new File([blob], fileName, { type: fileType });
        formData.append("ultrasound", file, fileName);
      } else {
        // For mobile (iOS/Android)
        formData.append("ultrasound", {
          uri: fileUri,
          type: fileType,
          name: fileName,
        });
      }
      
      // Add patient name
      formData.append("name", userName || userEmail || "Unknown");

      console.log("Platform:", Platform.OS);
      console.log("Uploading with name:", userName || userEmail || "Unknown");
      console.log("File name:", fileName);
      console.log("Connecting to:", API_URL);
      
      const uploadResponse = await fetch(`${API_URL}/upload-ultrasound`, {
        method: "POST",
        body: formData,
        // Don't set Content-Type header - let browser set it with boundary
      });

      console.log("Response status:", uploadResponse.status);

      if (!uploadResponse.ok) {
        // Try to get error message, might be JSON or HTML
        const contentType = uploadResponse.headers.get("content-type");
        let errorMessage = `Server error (${uploadResponse.status})`;
        
        if (contentType && contentType.includes("application/json")) {
          const errorData = await uploadResponse.json();
          errorMessage = errorData.message || errorMessage;
        } else {
          const errorText = await uploadResponse.text();
          console.error("Server error HTML:", errorText);
          errorMessage = `Backend error - check server console`;
        }
        
        throw new Error(errorMessage);
      }

      const responseData = await uploadResponse.json();

      console.log("Response:", responseData);

      if (responseData.success) {
        Alert.alert("Success", "Ultrasound analysis completed successfully!");
        // Navigate to results page
        navigation.navigate("ScanResult", { result: responseData, userName, userEmail });
      } else {
        throw new Error(responseData.message || "Analysis failed");
      }
    } catch (error) {
      console.error("Upload/Analysis error:", error);
      Alert.alert(
        "Error",
        error.message || "Failed to process ultrasound. Check if Python script exists."
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
        <Text style={styles.headerTitle}>Kidney Scan Analysis</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={true}
      >
        <Text style={styles.sectionTitle}>Upload Ultrasound Image</Text>
        <Text style={styles.patientInfo}>Patient: {userName || userEmail}</Text>

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
            {selectedImage ? "Change Image" : "Select Ultrasound Image"}
          </Text>
        </TouchableOpacity>

        {/* Analyze Button */}
        {selectedImage && (
          <TouchableOpacity
            style={styles.analyzeButton}
            onPress={uploadAndAnalyze}
            activeOpacity={0.8}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Text style={styles.analyzeButtonText}>Analyze Scan</Text>
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
    paddingTop: StatusBar.currentHeight || 0,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 10,
    paddingBottom: 16,
    backgroundColor: "#F5F7FA",
    zIndex: 10,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
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
    paddingTop: 8,
    paddingBottom: 150,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1C1C1E",
    marginBottom: 8,
  },
  patientInfo: {
    fontSize: 14,
    color: "#8E8E93",
    marginBottom: 20,
    fontWeight: "500",
  },
  imagePreviewContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 12,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  imagePreview: {
    width: "100%",
    height: 250,
    borderRadius: 12,
    resizeMode: "contain",
  },
  uploadButton: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    borderWidth: 2,
    borderColor: "#4A90E2",
    borderStyle: "dashed",
  },
  uploadButtonText: {
    color: "#4A90E2",
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 10,
  },
  analyzeButton: {
    backgroundColor: "#4A90E2",
    borderRadius: 16,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
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
  resultsTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1C1C1E",
    marginBottom: 16,
  },
  statusCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderLeftWidth: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
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
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1C1C1E",
    marginBottom: 16,
  },
  measurementRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  measurementContent: {
    marginLeft: 12,
    flex: 1,
  },
  measurementLabel: {
    fontSize: 14,
    color: "#8E8E93",
    fontWeight: "500",
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "#F5F7FA",
  },
  modalHeader: {
  analyzeButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
    marginRight: 8,
  },
}});

export default ScanAnalysisScreen;
