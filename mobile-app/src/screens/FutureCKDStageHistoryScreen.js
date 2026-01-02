import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  TextInput,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import axios from "../api/axiosConfig";

const formatDateTime = (isoString) => {
  try {
    const date = new Date(isoString);
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  } catch (_e) {
    return "Recent";
  }
};

const FutureCKDStageHistoryScreen = ({ navigation, route }) => {
  const userEmail =
    route.params?.userEmail ||
    route.params?.email ||
    route.params?.user?.email ||
    route.params?.user?.userEmail ||
    "";

  const userName = route.params?.userName || route.params?.user?.name || "User";

  // Allow manual override while still falling back to the best-known email
  const [emailOverride, setEmailOverride] = useState(userEmail);
  const effectiveEmail = (emailOverride || userEmail || "").trim();

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const fetchHistory = useCallback(async () => {
    if (!effectiveEmail) {
      setRecords([]);
      setError("No user email provided");
      return;
    }

    try {
      setLoading(true);
      setError("");
      const response = await axios.get(`/stage-progression/history/${encodeURIComponent(effectiveEmail)}`);
      if (response.data?.success) {
        setRecords(response.data.records || []);
      } else {
        setRecords([]);
        setError("Failed to load history");
      }
    } catch (err) {
      console.error("Failed to fetch CKD stage history", err);
      setError("Unable to load past records");
    } finally {
      setLoading(false);
    }
  }, [effectiveEmail]);

  useFocusEffect(
    useCallback(() => {
      fetchHistory();
    }, [fetchHistory])
  );

  const confirmDelete = (recordId) => {
    console.log("=== CONFIRM DELETE CALLED ===");
    console.log("Record ID:", recordId);
    console.log("About to show Alert dialog...");
    
    try {
      Alert.alert(
        "Delete record?",
        `This will remove the saved prediction for this submission. ID: ${recordId}`,
        [
          { 
            text: "Cancel", 
            style: "cancel",
            onPress: () => {
              console.log("=== CANCEL PRESSED ===");
            }
          },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => {
              console.log("=== DELETE IN ALERT PRESSED ===");
              console.log("Calling deleteRecord with ID:", recordId);
              deleteRecord(recordId);
            },
          },
        ],
        { cancelable: true }
      );
      console.log("Alert.alert called successfully");
    } catch (err) {
      console.error("Error showing alert:", err);
    }
  };

  const deleteRecord = async (recordId) => {
    console.log("=== DELETE ATTEMPT ===");
    console.log("Record ID to delete:", recordId);
    console.log("ID type:", typeof recordId);
    console.log("ID starts with 'record-'?", recordId?.startsWith("record-"));

    try {
      setDeletingId(recordId);
      
      const deleteUrl = `/stage-progression/history/${recordId}`;
      console.log("DELETE URL:", deleteUrl);
      
      const response = await axios.delete(deleteUrl);
      console.log("Delete response status:", response.status);
      console.log("Delete response data:", response.data);
      
      if (response.data?.success) {
        Alert.alert("Success", "Record deleted successfully");
        await fetchHistory();
      } else {
        Alert.alert("Delete failed", response.data?.message || "Unknown error");
      }
    } catch (err) {
      console.error("=== DELETE ERROR ===");
      console.error("Error object:", err);
      console.error("Error response:", err.response);
      console.error("Error message:", err.message);
      
      const errorMsg = err.response?.data?.message || err.message || "Could not delete this record. Please try again.";
      Alert.alert("Delete failed", errorMsg);
    } finally {
      setDeletingId(null);
      console.log("=== DELETE COMPLETE ===");
    }
  };

  const renderBadges = (record) => {
    const labs = record.inputs?.labs || {};
    const uploaded = record.inputs?.uploaded || {};

    return (
      <View style={styles.badgeRow}>
        {uploaded.labReport ? (
          <View style={[styles.badge, styles.badgePrimary]}>
            <Text style={styles.badgeText}>Lab Report</Text>
          </View>
        ) : null}
        {uploaded.ultrasound ? (
          <View style={[styles.badge, styles.badgeSecondary]}>
            <Text style={styles.badgeText}>Ultrasound</Text>
          </View>
        ) : null}
        {(labs.creatinine || labs.egfr) ? (
          <View style={[styles.badge, styles.badgeMuted]}>
            <Text style={styles.badgeText}>Manual Labs</Text>
          </View>
        ) : null}
      </View>
    );
  };

  const renderRecord = (record, idx) => {
    const recordId = record._id || record.id || `record-${idx}`;
    
    // Debug: Log the record structure to console
    console.log("Record data:", { 
      _id: record._id, 
      id: record.id, 
      recordId,
      fullRecord: record 
    });
    
    const stageUS = record.prediction_with_us?.predicted_stage;
    const stageLab = record.prediction_lab_only?.predicted_stage;
    const confidenceUS = record.prediction_with_us?.confidence;
    const confidenceLab = record.prediction_lab_only?.confidence;
    const egfrValue = record.eGFR_info?.value;
    const progression = record.progression_to_next_stage || record.prediction_with_us?.next_stage_progression || record.prediction_lab_only?.next_stage_progression;
    const labs = record.inputs?.labs || {};
    const age = record.inputs?.age;
    const gender = record.inputs?.gender;
    const isExpanded = expandedId === recordId;

    // Prefer Lab + US prediction when present; otherwise fall back to Lab-only
    const hasUSPrediction = stageUS !== undefined && stageUS !== null;
    const displayStage = hasUSPrediction ? stageUS : stageLab;
    const displayConfidence = hasUSPrediction ? confidenceUS : confidenceLab;
    const displayLabel = hasUSPrediction ? "Lab + US" : "Lab only";

    return (
      <View key={recordId} style={styles.card}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.cardTitle}>
              {displayStage ? `Stage ${displayStage}` : "Result saved"}
            </Text>
            <Text style={styles.cardMeta}>
              {formatDateTime(record.createdAt)} {record.submissionIndex ? `(Submission #${record.submissionIndex})` : ""}
            </Text>
            {(age || gender) ? (
              <Text style={styles.cardMeta}>
                {[age ? `Age: ${age}` : null, gender ? `Gender: ${gender}` : null]
                  .filter(Boolean)
                  .join(" | ")}
              </Text>
            ) : null}
            {progression?.next_stage ? (
              <Text style={[styles.cardMeta, styles.progressionHighlight]}>
                → {(progression.probability_percentage || (progression.probability || 0) * 100).toString()}% chance to Stage {progression.next_stage}
              </Text>
            ) : null}
          </View>
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => {
              console.log("=== DELETE BUTTON PRESSED ===");
              console.log("Record ID:", recordId);
              // Temporarily bypass confirmation for testing
              deleteRecord(recordId);
              // confirmDelete(recordId);
            }}
            disabled={deletingId === recordId}
            activeOpacity={0.8}
          >
            {deletingId === recordId ? (
              <ActivityIndicator size="small" color="#FF3B30" />
            ) : (
              <Ionicons name="trash" size={20} color="#FF3B30" />
            )}
          </TouchableOpacity>
        </View>

        {renderBadges(record)}

        <TouchableOpacity
          style={styles.expandToggle}
          onPress={() => setExpandedId(isExpanded ? null : recordId)}
          activeOpacity={0.8}
        >
          <Text style={styles.expandToggleText}>{isExpanded ? "Hide details" : "See labs, US, and predictions"}</Text>
          <Ionicons
            name={isExpanded ? "chevron-up" : "chevron-down"}
            size={18}
            color="#4A90E2"
          />
        </TouchableOpacity>

        {isExpanded ? (
          <View style={styles.details}>
            <Text style={styles.sectionLabel}>Predictions</Text>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>{displayLabel}</Text>
              <Text style={styles.detailValue}>{displayStage ? `Stage ${displayStage}` : "N/A"}</Text>
              {/* {displayConfidence !== undefined && displayConfidence !== null ? (
                <Text style={styles.detailMeta}>{(displayConfidence * 100).toFixed(1)}%</Text>
              ) : null} */}
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>eGFR</Text>
              <Text style={styles.detailValue}>{egfrValue ? `${egfrValue.toFixed(1)} mL/min` : "N/A"}</Text>
            </View>

            <Text style={[styles.sectionLabel, { marginTop: 12 }]}>Labs used</Text>
            <View style={styles.labGrid}>
              {[
                { label: "Creatinine", value: labs.creatinine, unit: "mg/dL" },
                { label: "eGFR", value: labs.egfr, unit: "mL/min" },
                { label: "BUN", value: labs.bun, unit: "mg/dL" },
                { label: "Albumin", value: labs.albumin, unit: "g/dL" },
                { label: "Hemoglobin", value: labs.hemoglobin, unit: "g/dL" },
              ].map((lab) => (
                <View key={lab.label} style={styles.labItem}>
                  <Text style={styles.labLabel}>{lab.label}</Text>
                  <Text style={styles.labValue}>{lab.value ? `${lab.value} ${lab.unit}` : "-"}</Text>
                </View>
              ))}
            </View>

            <View style={styles.metaRow}>
              {record.inputs?.age ? <Text style={styles.metaText}>Age: {record.inputs.age}</Text> : null}
              {record.inputs?.gender ? <Text style={styles.metaText}>Gender: {record.inputs.gender}</Text> : null}
            </View>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F7FA" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={24} color="#1C1C1E" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Past Future CKD Stages</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={true}>
        <View style={styles.introCard}>
          <Text style={styles.introTitle}>History for {userName}</Text>
          <Text style={styles.introText}>
            Each new submission is chained with your previous {"\n"}
            results to produce a history-aware prediction.
          </Text>
          <Text style={styles.introMeta}>{effectiveEmail || "No email provided"}</Text>
          {!effectiveEmail && (
            <View style={styles.emailCapture}>
              <Text style={styles.emailLabel}>Enter your email to load history</Text>
              <View style={styles.emailRow}>
                <TextInput
                  style={styles.emailInput}
                  value={emailOverride}
                  onChangeText={setEmailOverride}
                  placeholder="you@example.com"
                  placeholderTextColor="#9CA3AF"
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
                <TouchableOpacity
                  style={styles.emailButton}
                  onPress={fetchHistory}
                  activeOpacity={0.8}
                >
                  <Text style={styles.emailButtonText}>Load</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {loading ? (
          <ActivityIndicator size="large" color="#4A90E2" style={{ marginTop: 24 }} />
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : records.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="analytics-outline" size={48} color="#C7C7CC" />
            <Text style={styles.emptyTitle}>No saved predictions</Text>
            <Text style={styles.emptyText}>Run an analysis to see it appear here.</Text>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {records.map((record, idx) => renderRecord(record, idx))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
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
    paddingTop: 10,
    paddingBottom: 16,
    backgroundColor: "#FFFFFF",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#F0F3F6",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1C1C1E",
  },
  placeholder: {
    width: 40,
  },
  content: {
    padding: 20,
    paddingBottom: 36,
  },
  introCard: {
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 16,
  },
  introTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  introText: {
    marginTop: 8,
    color: "#4B5563",
    lineHeight: 20,
  },
  introMeta: {
    marginTop: 6,
    fontSize: 12,
    color: "#6B7280",
  },
  emailCapture: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#F9FAFB",
    gap: 8,
  },
  emailLabel: {
    fontSize: 12,
    color: "#374151",
    fontWeight: "600",
  },
  emailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  emailInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#111827",
    backgroundColor: "#FFFFFF",
  },
  emailButton: {
    backgroundColor: "#4A90E2",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  emailButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  cardMeta: {
    marginTop: 4,
    color: "#6B7280",
    fontSize: 12,
  },
  progressionHighlight: {
    color: "#1C1C1E",
    fontWeight: "700",
    backgroundColor: "#FFF4E5",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 6,
  },
  deleteButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FEE2E2",
    backgroundColor: "#FFF5F5",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#fff",
  },
  badgePrimary: {
    backgroundColor: "#4A90E2",
  },
  badgeSecondary: {
    backgroundColor: "#50E3C2",
  },
  badgeMuted: {
    backgroundColor: "#8E8E93",
  },
  expandToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    paddingVertical: 8,
  },
  expandToggleText: {
    color: "#4A90E2",
    fontWeight: "600",
    fontSize: 14,
  },
  details: {
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    paddingTop: 12,
    gap: 8,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#111827",
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  detailLabel: {
    fontSize: 13,
    color: "#4B5563",
    flex: 1,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    flex: 1,
    textAlign: "right",
  },
  detailMeta: {
    fontSize: 12,
    color: "#6B7280",
    marginLeft: 8,
  },
  labGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 6,
  },
  labItem: {
    width: "48%",
    padding: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
  },
  labLabel: {
    fontSize: 12,
    color: "#6B7280",
  },
  labValue: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  metaRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  metaText: {
    color: "#4B5563",
    fontSize: 12,
  },
  emptyState: {
    marginTop: 32,
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1C1C1E",
  },
  emptyText: {
    color: "#6B7280",
  },
  errorText: {
    color: "#EF4444",
    marginTop: 24,
    textAlign: "center",
  },
});

export default FutureCKDStageHistoryScreen;
