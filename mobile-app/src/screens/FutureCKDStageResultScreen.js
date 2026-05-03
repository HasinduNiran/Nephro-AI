import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

const FutureCKDStageResultScreen = ({ navigation, route }) => {
  const { result } = route.params || {};
  const [showRecommendations, setShowRecommendations] = useState(false);
  
  if (!result || !result.success) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.emptyText}>No data available</Text>
      </SafeAreaView>
    );
  }

  const prediction = result.prediction_with_us || result.prediction_lab_only || {};
  const stage = prediction?.predicted_stage ?? "N/A";
  const nextStage = prediction?.next_stage_progression?.next_stage ?? "N/A";
  const eGFR = result?.eGFR_info?.value ?? "N/A";

  // Extract kidney length from ultrasound data
  const kidneyLength =
    result?.ultrasound_info?.kidney_length_cm ??
    result?.ultrasound_info?.kidney_length ??
    result?.kidney_length_cm ??
    result?.kidney_length ??
    result?.us_info?.kidney_length ??
    null;

  const next = prediction?.next_stage_progression || {};
  const next6 = prediction?.next_stage_progression_6_month || {};

  const toPercent = (val) =>
    typeof val === "number" ? `${(val * 100).toFixed(1)}%` : "N/A";

  const nextRisk = toPercent(next?.probability);
  const sixRisk = toPercent(next6?.probability);
  const declineRisk = toPercent(next?.any_decline_probability ?? next6?.any_decline_probability ?? null);

  const riskLabel = (val) => {
    if (typeof val !== "number") return "Unknown";
    if (val < 0.3) return "Low";
    if (val < 0.8) return "Moderate";
    return "High";
  };

  const nextRiskLabel = riskLabel(next?.probability);
  const sixRiskLabel = riskLabel(next6?.probability);
  const declineRiskLabel = riskLabel(next?.any_decline_probability ?? next6?.any_decline_probability);

  const sharpInsight = [
    `You are currently in Stage ${stage}.`,
    next?.probability !== undefined
      ? `By your next visit there is a ${nextRisk} (${nextRiskLabel}) chance of worsening.`
      : `Risk for the next visit is not available.`,
    next6?.probability !== undefined
      ? `Within 6 months there is a ${sixRisk} (${sixRiskLabel}) chance of worsening.`
      : `6-month risk is not available.`,
    declineRisk !== "N/A"
      ? `Overall decline risk: ${declineRisk} (${declineRiskLabel}).`
      : `Overall decline risk is not available.`,
    "Watch for: swelling in legs, shortness of breath, reduced urine — seek care if these appear.",
  ].join("\n\n");

  const recommendations = [
    { title: "Stay Hydrated", text: "Drink water regularly unless your doctor advises fluid restriction." },
    { title: "Blood Pressure", text: "Take blood pressure medicines exactly as prescribed and check daily." },
    { title: "Diet", text: "Reduce salt and processed foods; follow a kidney-friendly meal plan." },
    { title: "Medication", text: "Avoid NSAIDs (e.g., ibuprofen) unless approved by your doctor." },
    { title: "Follow-up", text: "Book a follow-up visit if your risk is Moderate or High." },
  ];



  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#4A90E2" />

      {/* Hero Header */}
      <View style={styles.heroHeader}>
        <View style={styles.heroCircleLarge} />
        <View style={styles.heroCircleSmall} />
        <View style={styles.heroInner}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.heroTitle}>Stage Result</Text>
          <View style={styles.rightBtnPlaceholder} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.stageBox}>
          <Text style={styles.stageLabel}>Current Stage</Text>
          <Text style={styles.stageText}>Stage {stage}</Text>
        </View>

        {/* ── Data Row: always shows Next Stage Risk + eGFR; 
               adds Kidney Length only when the value exists ── */}
        <View style={styles.dataRow}>
          <View style={styles.dataItem}>
            <Text style={styles.dataLabel}>Next Stage Risk</Text>
            <Text style={styles.dataValue}>
              {nextStage !== "N/A" ? `Stage ${nextStage}` : nextStage}
            </Text>
          </View>

          <View style={styles.dataItem}>
            <Text style={styles.dataLabel}>eGFR</Text>
            <Text style={styles.dataValue}>
              {eGFR !== "N/A" ? `${Number(eGFR).toFixed(1)}` : eGFR}
            </Text>
            <Text style={styles.dataUnit}>mL/min</Text>
          </View>

          {/* Conditionally rendered Kidney Length box */}
          {kidneyLength != null && (
            <View style={styles.dataItem}>
              <Text style={styles.dataLabel}>Kidney Length</Text>
              <Text style={styles.dataValue}>
                {typeof kidneyLength === "number"
                  ? `${kidneyLength.toFixed(1)}`
                  : kidneyLength}
              </Text>
              <Text style={styles.dataUnit}>cm</Text>
            </View>
          )}
        </View>

        <View style={styles.timelineContainer}>
          <View style={styles.timelineItem}>
            <View style={[styles.circle, { backgroundColor: "#34C759" }]}>
              <Ionicons name="checkmark" size={18} color="#fff" />
            </View>
            <Text style={styles.timelineLabel}>Today</Text>
            <Text style={styles.timelineSub}>Stage {stage}</Text>
          </View>

          <View style={styles.line} />

          <View style={styles.timelineItem}>
            <View style={[styles.circle, { backgroundColor: "#FF9500" }]}>
              <Ionicons name="alert" size={18} color="#fff" />
            </View>
            <Text style={styles.timelineLabel}>Next Visit</Text>
            <Text style={styles.timelineSub}>{nextRisk}</Text>
            <Text style={styles.timelineSmall}>{nextRiskLabel} risk</Text>
          </View>

          <View style={styles.line} />

          <View style={styles.timelineItem}>
            <View style={[styles.circle, { backgroundColor: "#FF3B30" }]}>
              <Ionicons name="time" size={18} color="#fff" />
            </View>
            <Text style={styles.timelineLabel}>6 Months</Text>
            <Text style={styles.timelineSub}>{sixRisk}</Text>
            <Text style={styles.timelineSmall}>{sixRiskLabel} risk</Text>
          </View>
        </View>

        <View style={styles.declineBox}>
          <Text style={styles.declineTitle}>Overall Decline Risk</Text>
          <Text style={styles.declineValue}>{declineRisk}</Text>
        </View>

        <View style={styles.insightCard}>
          <Text style={styles.insightTitle}>Clear Insight</Text>
          <Text style={styles.insightText}>{sharpInsight}</Text>
        </View>

        <TouchableOpacity 
          style={styles.card} 
          onPress={() => setShowRecommendations(true)}
          activeOpacity={0.7}
        >
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>What You Can Do</Text>
            <Ionicons name="chevron-forward" size={20} color="#4A90E2" />
          </View>
          <Text style={styles.cardSubtext}>Tap to view recommendations</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.button} onPress={() => navigation.goBack()}>
          <Text style={styles.buttonText}>Back</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Recommendations Popup Modal */}
      <Modal
        visible={showRecommendations}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowRecommendations(false)}
      >
        <View style={styles.popupOverlay}>
          <View style={styles.popupBox}>
            <View style={styles.popupHeader}>
              <Text style={styles.popupTitle}>What You Can Do</Text>
              <TouchableOpacity 
                style={styles.popupCloseButton}
                onPress={() => setShowRecommendations(false)}
              >
                <Ionicons name="close" size={24} color="#1C1C1E" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.popupContent}>
              {recommendations.map((r, i) => (
                <View key={i} style={styles.popupRecoItem}>
                  <View style={styles.popupRecoIcon}>
                    <Ionicons name="chevron-forward-circle" size={24} color="#4A90E2" />
                  </View>
                  <View style={styles.popupRecoTextWrap}>
                    <Text style={styles.popupRecoTitle}>{r.title}</Text>
                    <Text style={styles.popupRecoText}>{r.text}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>

            <TouchableOpacity 
              style={styles.popupButton}
              onPress={() => setShowRecommendations(false)}
            >
              <Text style={styles.popupButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F0F3F8",
  },
  heroHeader: {
    backgroundColor: "#4A90E2",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 20,
    overflow: "hidden",
    position: "relative",
  },
  heroCircleLarge: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(255,255,255,0.08)",
    top: -50,
    right: -40,
  },
  heroCircleSmall: {
    position: "absolute",
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "rgba(255,255,255,0.06)",
    bottom: -20,
    left: 30,
  },
  heroInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heroTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
    flex: 1,
    textAlign: "center",
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  rightBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  rightBtnPlaceholder: {
    width: 40,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#0F172A",
    fontStyle: "italic",
    letterSpacing: -0.3,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 2,
    color: "#64748B",
    marginBottom: 10,
    marginTop: 20,
    textTransform: "uppercase",
  },
  stageBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 20,
    alignItems: "center",
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  stageLabel: {
    fontSize: 12,
    color: "#64748B",
    marginBottom: 8,
    fontWeight: "500",
  },
  stageText: {
    color: "#0F172A",
    fontSize: 25,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  dataRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 18,
  },
  dataItem: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    paddingVertical: 16,
    paddingHorizontal: 10,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  dataLabel: {
    fontSize: 10,
    color: "#64748B",
    marginBottom: 8,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    textAlign: "center",
  },
  dataValue: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0F172A",
  },
  // Unit label shown below the value (e.g. "mL/min", "cm")
  dataUnit: {
    fontSize: 10,
    color: "#94A3B8",
    fontWeight: "500",
    marginTop: 3,
  },
  timelineContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginVertical: 18,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  timelineItem: {
    alignItems: "center",
    width: 96,
    flex: 1,
  },
  circle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  line: {
    flex: 1,
    height: 2,
    backgroundColor: "#E2E8F0",
    marginTop: 22,
    marginHorizontal: 4,
  },
  timelineLabel: {
    fontSize: 10,
    color: "#64748B",
    fontWeight: "700",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  timelineSub: {
    fontWeight: "800",
    fontSize: 16,
    color: "#0F172A",
    marginBottom: 2,
  },
  timelineSmall: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 2,
    fontWeight: "500",
  },
  declineBox: {
    backgroundColor: "#FEF2F2",
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: "#E8705A",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "#FDD8D3",
  },
  declineText: { flex: 1 },
  declineTitle: {
    fontSize: 11,
    color: "#E8705A",
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  declineDesc: {
    fontSize: 13,
    color: "#64748B",
    fontWeight: "300",
  },
  declineValue: {
    fontSize: 25,
    fontWeight: "900",
    color: "#E8705A",
    letterSpacing: -0.5,
  },
  insightCard: {
    backgroundColor: "#FFFFFF",
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: 16,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  insightTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#2ABFBF",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  insightText: {
    fontSize: 14,
    lineHeight: 22,
    color: "#475569",
    fontWeight: "300",
  },
  card: {
    backgroundColor: "#FFFFFF",
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardTitle: {
    fontWeight: "700",
    fontSize: 16,
    marginBottom: 0,
    color: "#0F172A",
    fontStyle: "italic",
  },
  cardSubtext: {
    fontSize: 12,
    color: "#94A3B8",
    fontWeight: "500",
    marginTop: 8,
  },
  recoItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 13,
    marginBottom: 0,
  },
  recoIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  recoTextWrap: {
    flex: 1,
  },
  recoTitle: {
    fontWeight: "700",
    color: "#0F172A",
    fontSize: 13,
    marginBottom: 3,
  },
  recoText: {
    color: "#64748B",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "300",
  },
  button: {
    backgroundColor: "#2ABFBF",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: "center",
    shadowColor: "#2ABFBF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
  emptyText: {
    fontSize: 16,
    color: "#94A3B8",
    textAlign: "center",
    marginTop: 20,
  },

  /* Popup Styles */
  popupOverlay: {
    flex: 1,
    backgroundColor: "rgba(8, 18, 30, 0.82)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  popupBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 24,
    maxHeight: "85%",
    width: "100%",
    maxWidth: 380,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 8,
  },
  popupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  popupTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0F172A",
    fontStyle: "italic",
  },
  popupCloseButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 50,
    backgroundColor: "#F1F5F9",
  },
  popupContent: {
    marginBottom: 20,
    maxHeight: 400,
  },
  popupRecoItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
    marginBottom: 18,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  popupRecoIcon: {
    marginTop: 2,
  },
  popupRecoTextWrap: {
    flex: 1,
  },
  popupRecoTitle: {
    fontWeight: "700",
    color: "#0F172A",
    fontSize: 15,
    marginBottom: 6,
  },
  popupRecoText: {
    color: "#64748B",
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "300",
  },
  popupButton: {
    backgroundColor: "#2ABFBF",
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: "center",
    shadowColor: "#2ABFBF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  popupButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
});

export default FutureCKDStageResultScreen;
