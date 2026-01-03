import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

const LabResultScreen = ({ navigation, route }) => {
  const { result } = route.params || {};
  const userName = route.params?.userName || "User";
  const userEmail = route.params?.userEmail || "";
  // Handle different response structures: direct data or nested in labTest/data
  const labData = result?.data || result?.labTest || result;

  console.log("Lab Result Data:", labData);

  const getStageColor = (stage) => {
    if (!stage) return "#8E8E93";
    if (stage.includes("1") || stage.includes("2")) return "#50E3C2";
    if (stage.includes("3")) return "#FFB946";
    if (stage.includes("4") || stage.includes("5")) return "#FF6B6B";
    return "#8E8E93";
  };

  const getStageIcon = (stage) => {
    if (!stage) return "help-circle";
    if (stage.includes("1") || stage.includes("2")) return "checkmark-circle";
    if (stage.includes("3")) return "warning";
    if (stage.includes("4") || stage.includes("5")) return "alert-circle";
    return "help-circle";
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "Normal":
        return "#50E3C2";
      case "High":
        return "#FF6B6B";
      case "Low":
        return "#FFB946";
      default:
        return "#8E8E93";
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F7FA" />
      
      {/* Header with Back Button */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.navigate("ScanLab", { userName, userEmail })}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color="#1C1C1E" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Lab Analysis Results</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={true}
      >
        <Text style={styles.patientInfo}>Patient: {userName || userEmail}</Text>
        {userEmail ? <Text style={styles.patientEmail}>{userEmail}</Text> : null}

        {labData && (
          <View style={styles.resultsContainer}>
            {/* Patient Info Card */}
            <View style={styles.resultCard}>
              <Text style={styles.cardTitle}>Patient Information</Text>
              <View style={styles.infoRow}>
                <Ionicons name="person-outline" size={20} color="#4A90E2" />
                <Text style={styles.infoLabel}>Name:</Text>
                <Text style={styles.infoValue}>{labData.name || userName || userEmail}</Text>
              </View>
              {/* <View style={styles.infoRow}>
                <Ionicons name="mail-outline" size={20} color="#4A90E2" />
                <Text style={styles.infoLabel}>Email:</Text>
                <Text style={styles.infoValue}>{userEmail || "Not provided"}</Text>
              </View> */}
            </View>

            {/* CKD Stage Card */}
            <View style={[styles.stageCard, { borderLeftColor: getStageColor(labData.ckdStage) }]}>
              <View style={styles.stageHeader}>
                <Ionicons
                  name={getStageIcon(labData.ckdStage)}
                  size={32}
                  color={getStageColor(labData.ckdStage)}
                />
                <View style={styles.stageInfo}>
                  <Text style={[styles.stageText, { color: getStageColor(labData.ckdStage) }]}>
                    {labData.ckdStage || "Unknown Stage"}
                  </Text>
                  <Text style={styles.eGFRRange}>eGFR: {labData.eGFRRange}</Text>
                </View>
              </View>
              {labData.stageDescription && (
                <Text style={styles.stageDescription}>{labData.stageDescription}</Text>
              )}
            </View>

            {/* Lab Values Card */}
            <View style={styles.resultCard}>
              <Text style={styles.cardTitle}>Lab Values</Text>
              
              {/* eGFR */}
              <View style={styles.labValueRow}>
                <View style={styles.labValueContent}>
                  <Text style={styles.labValueLabel}>eGFR</Text>
                  <Text style={styles.labValueValue}>
                    {labData.eGFR ? labData.eGFR.toFixed(2) : "N/A"} mL/min/1.73m²
                  </Text>
                </View>
                <Ionicons name="water-outline" size={24} color="#4A90E2" />
              </View>

              {/* Creatinine */}
              {labData.creatinine && (
                <View style={styles.labValueRow}>
                  <View style={styles.labValueContent}>
                    <Text style={styles.labValueLabel}>Creatinine</Text>
                    <View style={styles.labValueWithStatus}>
                      <Text style={styles.labValueValue}>
                        {labData.creatinine.toFixed(2)} mg/dL
                      </Text>
                      {labData.creatinineStatus && (
                        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(labData.creatinineStatus) + "20" }]}>
                          <Text style={[styles.statusText, { color: getStatusColor(labData.creatinineStatus) }]}>
                            {labData.creatinineStatus}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <Ionicons name="flask-outline" size={24} color="#4A90E2" />
                </View>
              )}

              {/* BUN */}
              {labData.bun && (
                <View style={styles.labValueRow}>
                  <View style={styles.labValueContent}>
                    <Text style={styles.labValueLabel}>BUN (Blood Urea Nitrogen)</Text>
                    <Text style={styles.labValueValue}>
                      {labData.bun.toFixed(2)} mg/dL
                    </Text>
                  </View>
                  <Ionicons name="fitness-outline" size={24} color="#4A90E2" />
                </View>
              )}

              {/* Albumin */}
              {labData.albumin && (
                <View style={styles.labValueRow}>
                  <View style={styles.labValueContent}>
                    <Text style={styles.labValueLabel}>Albumin</Text>
                    <Text style={styles.labValueValue}>
                      {labData.albumin.toFixed(2)} g/dL
                    </Text>
                  </View>
                  <Ionicons name="nutrition-outline" size={24} color="#4A90E2" />
                </View>
              )}
            </View>

            {/* OCR Info (if from image) */}
            {labData.imageFilename && (
              <View style={styles.ocrInfoCard}>
                <Ionicons name="camera-outline" size={20} color="#50E3C2" />
                <Text style={styles.ocrInfoText}>
                  Extracted from image: {labData.imageFilename}
                </Text>
              </View>
            )}

            {/* Saved Confirmation */}
            <View style={styles.savedBadge}>
              <Ionicons name="checkmark-circle" size={16} color="#50E3C2" />
              <Text style={styles.savedText}>Results saved to database</Text>
            </View>
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
  patientInfo: {
    fontSize: 14,
    color: "#4B5563",
    marginBottom: 2,
  },
  patientEmail: {
    fontSize: 12,
    color: "#6B7280",
    marginBottom: 12,
  },
  resultsContainer: {
    marginTop: 10,
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
  stageCard: {
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
  stageHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  stageInfo: {
    marginLeft: 12,
    flex: 1,
  },
  stageText: {
    fontSize: 24,
    fontWeight: "700",
  },
  eGFRRange: {
    fontSize: 14,
    color: "#8E8E93",
    marginTop: 2,
  },
  stageDescription: {
    fontSize: 15,
    color: "#1C1C1E",
    lineHeight: 22,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1C1C1E",
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: 14,
    color: "#8E8E93",
    marginLeft: 8,
    marginRight: 4,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1C1C1E",
  },
  labValueRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F5F7FA",
  },
  labValueContent: {
    flex: 1,
  },
  labValueLabel: {
    fontSize: 14,
    color: "#8E8E93",
    marginBottom: 4,
  },
  labValueValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1C1C1E",
  },
  labValueWithStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  ocrInfoCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E8F8F5",
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  ocrInfoText: {
    fontSize: 14,
    color: "#1C1C1E",
    marginLeft: 8,
    flex: 1,
  },
  savedBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#50E3C220",
    borderRadius: 12,
    padding: 12,
  },
  savedText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#50E3C2",
    marginLeft: 8,
  },
});

export default LabResultScreen;
