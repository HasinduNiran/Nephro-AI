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

const ScanResultScreen = ({ navigation, route }) => {
  const { result } = route.params || {};

  const getStatusColor = (status) => {
    switch (status) {
      case "normal":
        return "#50E3C2";
      case "abnormal":
        return "#FF6B6B";
      default:
        return "#8E8E93";
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case "normal":
        return "checkmark-circle";
      case "abnormal":
        return "alert-circle";
      default:
        return "help-circle";
    }
  };

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
        <Text style={styles.headerTitle}>Analysis Results</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={true}
      >
        {result && result.success && (
          <View style={styles.resultsContainer}>
            {/* Status Card */}
            <View style={[styles.statusCard, { borderLeftColor: getStatusColor(result.status) }]}>
              <View style={styles.statusHeader}>
                <Ionicons
                  name={getStatusIcon(result.status)}
                  size={32}
                  color={getStatusColor(result.status)}
                />
                <Text style={[styles.statusText, { color: getStatusColor(result.status) }]}>
                  {result.status ? result.status.toUpperCase() : "UNKNOWN"}
                </Text>
              </View>
            </View>

            {/* Measurements Card */}
            <View style={styles.resultCard}>
              <Text style={styles.cardTitle}>Kidney Measurements</Text>
              
              <View style={styles.measurementRow}>
                <Ionicons name="resize-outline" size={20} color="#4A90E2" />
                <View style={styles.measurementContent}>
                  <Text style={styles.measurementLabel}>Kidney Length</Text>
                  <Text style={styles.measurementValue}>
                    {result.kidney_length_cm ? result.kidney_length_cm.toFixed(2) : "N/A"} cm
                  </Text>
                </View>
              </View>

              {result.kidney_width_cm && (
                <View style={styles.measurementRow}>
                  <Ionicons name="resize-outline" size={20} color="#4A90E2" />
                  <View style={styles.measurementContent}>
                    <Text style={styles.measurementLabel}>Kidney Width</Text>
                    <Text style={styles.measurementValue}>
                      {result.kidney_width_cm.toFixed(2)} cm
                    </Text>
                  </View>
                </View>
              )}
            </View>

            {/* Interpretation Card */}
            {result.interpretation && (
              <View style={styles.resultCard}>
                <Text style={styles.cardTitle}>Interpretation</Text>
                <Text style={styles.interpretationText}>{result.interpretation}</Text>
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
  resultsContainer: {
    marginTop: 10,
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
  measurementValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1C1C1E",
    marginTop: 2,
  },
  interpretationText: {
    fontSize: 15,
    color: "#1C1C1E",
    lineHeight: 22,
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

export default ScanResultScreen;
