import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

const LabAnalysisScreen = ({ navigation, route }) => {
  const userName = route.params?.userName || "User";
  const userEmail = route.params?.userEmail || "";

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F7FA" />
      
      {/* Header with Back Button */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.navigate("ScanLab")}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color="#1C1C1E" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Lab Analysis</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.content}>
        <Text style={styles.welcomeText}>Choose how to enter your lab values</Text>
        <Text style={styles.subtitle}>Patient: {userName || userEmail}</Text>

        {/* Manual Entry Button */}
        <TouchableOpacity
          style={styles.optionButton}
          onPress={() => navigation.navigate("ManualLabEntry", { userName, userEmail })}
          activeOpacity={0.8}
        >
          <View style={styles.iconContainer}>
            <Ionicons name="create-outline" size={32} color="#4A90E2" />
          </View>
          <View style={styles.optionContent}>
            <Text style={styles.optionTitle}>Manual Entry</Text>
            <Text style={styles.optionDescription}>
              Enter lab values manually (name, age, gender, creatinine, etc.)
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#C7C7CC" />
        </TouchableOpacity>

        {/* Upload Image Button */}
        <TouchableOpacity
          style={styles.optionButton}
          onPress={() => navigation.navigate("LabImageUpload", { userName, userEmail })}
          activeOpacity={0.8}
        >
          <View style={styles.iconContainer}>
            <Ionicons name="image-outline" size={32} color="#50E3C2" />
          </View>
          <View style={styles.optionContent}>
            <Text style={styles.optionTitle}>Upload Lab Report</Text>
            <Text style={styles.optionDescription}>
              Upload an image of your lab report for automatic extraction
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#C7C7CC" />
        </TouchableOpacity>
      </View>
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
  content: {
    flex: 1,
    padding: 24,
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1C1C1E",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#8E8E93",
    marginBottom: 32,
  },
  optionButton: {
    flexDirection: "row",
    alignItems: "center",
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
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#F5F7FA",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  optionContent: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1C1C1E",
    marginBottom: 4,
  },
  optionDescription: {
    fontSize: 14,
    color: "#8E8E93",
    lineHeight: 20,
  },
});

export default LabAnalysisScreen;
