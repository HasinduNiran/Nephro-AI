import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

const FutureCKDStageResultScreen = ({ navigation, route }) => {
  const { result } = route.params || {};
  const userName = route.params?.userName || "User";
  const userEmail = route.params?.userEmail || route.params?.email || route.params?.user?.email || "";
  
  if (!result || !result.success) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#F5F7FA" />
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={24} color="#1C1C1E" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Analysis Results</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={64} color="#FF3B30" />
          <Text style={styles.errorText}>No results available</Text>
        </View>
      </SafeAreaView>
    );
  }

  const { prediction_with_us, prediction_lab_only, eGFR_info } = result;
  const visitNumber = Number.isFinite(Number(result?.submissionIndex))
    ? Number(result.submissionIndex)
    : Number.isFinite(Number(result?.prediction_context?.current_visit_number))
      ? Number(result.prediction_context.current_visit_number)
      : null;

  const primaryPrediction = prediction_with_us || prediction_lab_only;
  const primaryLabel = prediction_with_us ? "Lab + Ultrasound" : "Lab Only";
  const primaryIcon = prediction_with_us ? "analytics" : "flask";
  const primaryColor = prediction_with_us ? "#4A90E2" : "#F5A623";
  const primaryProgressionByStage =
    (prediction_with_us
      ? result.progression_by_stage_with_us
      : result.progression_by_stage_lab_only) ||
    primaryPrediction?.progression_by_stage ||
    [];

  const nextProgression =
    primaryPrediction?.next_stage_progression ||
    primaryPrediction?.progression ||
    primaryPrediction?.progression_to_next_stage ||
    null;

  const nextProgression6Month =
    primaryPrediction?.next_stage_progression_6_month ||
    result?.progression_6_month ||
    result?.progression_to_next_stage_6_month ||
    null;

  const probabilityNum = (() => {
    if (!nextProgression) return null;
    if (typeof nextProgression.probability === "number") return nextProgression.probability;
    if (typeof nextProgression.probability_percentage === "string") {
      const num = parseFloat(String(nextProgression.probability_percentage).replace("%", ""));
      if (!Number.isNaN(num)) return num / 100;
    }
    return null;
  })();

  const riskBucket = (() => {
    if (probabilityNum === null) return { header: "Progression", text: "Progression probability unavailable", steps: [] };
    if (probabilityNum < 0.3) {
      return {
        header: "Stable / Low Risk",
        text: "Your kidney function indicators appear stable based on your recent reports.",
        steps: [
          "Keep your next scheduled check-up.",
          "Maintain adequate hydration as advised by your doctor.",
          "Monitor blood pressure and blood sugar daily.",
          "Stay moderately active (~30 minutes daily).",
        ],
      };
    }
    if (probabilityNum <= 0.8) {
      return {
        header: "Caution / Moderate Risk",
        text: "There is a noticeable change in your kidney health markers. Increase vigilance.",
        steps: [
          "Schedule a follow-up with your doctor in 2-4 weeks.",
          "Review sodium and protein intake; consider a kidney-friendly meal plan.",
          "Take prescribed BP/diabetes meds exactly as directed.",
          "Avoid NSAIDs like Ibuprofen or Naproxen unless approved by your doctor.",
        ],
      };
    }
    return {
      header: "Urgent / High Risk",
      text: "Significant changes detected. Your latest data suggests urgent review.",
      steps: [
        "Contact your nephrologist immediately to review these results.",
        "Expect repeat labs (e.g., eGFR or 24-hr urine) per your doctor.",
        "Watch for swelling, shortness of breath, or urine output changes.",
        "Discuss specialized kidney care and long-term management strategies.",
      ],
    };
  })();

  const toPercentText = (item) => {
    if (!item) return "N/A";
    if (typeof item.probability === "number") return `${(item.probability * 100).toFixed(1)}%`;
    if (typeof item.probability_percentage === "string") {
      const raw = item.probability_percentage.trim();
      if (!raw) return "N/A";
      return raw.includes("%") ? raw : `${raw}%`;
    }
    return "N/A";
  };

  const sharpInsight = (() => {
    if (!primaryPrediction) {
      return "No prediction details are available yet to generate a sharp patient insight.";
    }

    const stage = primaryPrediction?.predicted_stage ?? "N/A";
    const nextStage = nextProgression?.next_stage ?? "N/A";
    const currentHistoryProb = toPercentText(nextProgression);
    const sixMonthProb = toPercentText(nextProgression6Month);
    const sourceText = prediction_with_us
      ? result?.current_visit_ultrasound_uploaded
        ? "lab + current ultrasound"
        : "lab + prior ultrasound fallback"
      : "lab-only data";

    const stageCandidates = Array.isArray(primaryProgressionByStage) ? primaryProgressionByStage : [];
    const mostLikelyNext = stageCandidates.length
      ? [...stageCandidates].sort(
          (a, b) => Number(b?.probability_percentage || 0) - Number(a?.probability_percentage || 0)
        )[0]
      : null;

    const mostLikelyText = mostLikelyNext
      ? `Most likely next stage from distribution: ${mostLikelyNext.stage_display || mostLikelyNext.stage} (${Number(
          mostLikelyNext.probability_percentage || 0
        ).toFixed(1)}%).`
      : "No per-stage distribution available for strongest-next-stage comparison.";

    const egfrText = Number.isFinite(Number(eGFR_info?.value))
      ? `Current eGFR is ${Number(eGFR_info.value).toFixed(1)} mL/min/1.73m2.`
      : "Current eGFR is not available in this result.";

    return `Using ${sourceText}, the model predicts Stage ${stage}. Next likely stage is ${nextStage} with ${currentHistoryProb} progression probability from current history and ${sixMonthProb} for the next 6 months. ${mostLikelyText} ${egfrText}`;
  })();

  const getRiskColor = (riskLevel) => {
    switch (riskLevel?.toLowerCase()) {
      case "low":
        return "#34C759";
      case "moderate":
        return "#FF9500";
      case "high":
        return "#FF3B30";
      default:
        return "#8E8E93";
    }
  };

  const getStageColor = (stage) => {
    if (stage <= 2) return "#34C759";
    if (stage <= 3) return "#FF9500";
    return "#FF3B30";
  };

  const toPercent = (value, fallback = "N/A") => {
    if (typeof value === "number") return `${(value * 100).toFixed(1)}%`;
    return fallback;
  };

  const ultrasoundToDisplay = prediction_with_us && result?.current_visit_ultrasound_uploaded
    ? {
        prediction: prediction_with_us,
        ultrasoundInfo: result?.ultrasound_info || null,
        sourceText: `From current visit${visitNumber ? ` (Visit #${visitNumber})` : ""}`,
      }
    : null;
  const usedPriorUltrasoundFallback = !!prediction_with_us && !result?.current_visit_ultrasound_uploaded;
  const predictionContext = result?.prediction_context || {};
  const visitNumbersUsed = Array.isArray(predictionContext.visit_numbers_used)
    ? predictionContext.visit_numbers_used
    : [];
  const visitWindowText = visitNumbersUsed.length
    ? visitNumbersUsed.map((v) => `Visit ${v}`).join(" + ")
    : null;

  const renderPredictionCard = (prediction, title, icon, color, hasUltrasound = false, progressionByStage = []) => {
    if (!prediction) return null;

    const {
      predicted_stage,
      confidence,
      used_ultrasound,
    } = prediction;

    const nextProgression =
      prediction.next_stage_progression ||
      prediction.progression ||
      prediction.progression_to_next_stage ||
      null;

    const nextProgression6Month =
      prediction.next_stage_progression_6_month ||
      result?.progression_6_month ||
      result?.progression_to_next_stage_6_month ||
      null;

    const nextStageLabel = nextProgression?.next_stage || "N/A";
    const probabilityNum = (() => {
      if (typeof nextProgression?.probability === "number") return nextProgression.probability;
      if (typeof nextProgression?.probability_percentage === "string") {
        const num = parseFloat(String(nextProgression.probability_percentage).replace("%", ""));
        if (!Number.isNaN(num)) return num / 100;
      }
      return null;
    })();

    const nextStageProb =
      probabilityNum !== null
        ? `${(probabilityNum * 100).toFixed(1)}%`
        : "N/A";

    const probabilityNum6Month = (() => {
      if (typeof nextProgression6Month?.probability === "number") return nextProgression6Month.probability;
      if (typeof nextProgression6Month?.probability_percentage === "string") {
        const num = parseFloat(String(nextProgression6Month.probability_percentage).replace("%", ""));
        if (!Number.isNaN(num)) return num / 100;
      }
      return null;
    })();

    const nextStageProb6Month =
      probabilityNum6Month !== null
        ? `${(probabilityNum6Month * 100).toFixed(1)}%`
        : "N/A";

    const anyDeclinePercent = (() => {
      if (typeof nextProgression?.any_decline_percentage === "string") {
        const num = parseFloat(String(nextProgression.any_decline_percentage).replace("%", ""));
        return Number.isNaN(num) ? null : `${num.toFixed(1)}%`;
      }
      if (typeof nextProgression?.any_decline_probability === "number") {
        return `${(nextProgression.any_decline_probability * 100).toFixed(1)}%`;
      }
      return null;
    })();

    return (
      <View style={styles.resultCard}>
        {/* Card Header */}
        <View style={[styles.cardHeader, { backgroundColor: color + "20" }]}>
          <Ionicons name={icon} size={28} color={color} />
          <Text style={styles.cardTitle}>{title}</Text>
        </View>

        {/* Predicted Stage */}
        <View style={styles.mainResult}>
          <Text style={styles.resultLabel}>Predicted CKD Stage</Text>
          <View style={[styles.stageBadge, { backgroundColor: getStageColor(predicted_stage) }]}>
            <Text style={styles.stageText}>Stage {predicted_stage}</Text>
          </View>
          {/* <View style={styles.confidenceContainer}>
            <Text style={styles.confidenceLabel}>Confidence:</Text>
            <Text style={styles.confidenceValue}>{(confidence * 100).toFixed(1)}%</Text>
          </View> */}
          <View style={styles.nextStageRow}>
            <Text style={styles.nextStageLabel}>Next stage:</Text>
            <Text style={styles.nextStageValue}>{nextStageLabel}</Text>
          </View>
          <View style={styles.nextStageHighlight}>
            <View style={styles.progressionMetricRow}>
              <Text style={styles.progressionMetricLabel}>Progression probability with current history</Text>
              <Text style={styles.progressionMetricValue}>{nextStageProb}</Text>
            </View>
            <View style={[styles.progressionMetricRow, styles.progressionMetricRowSecondary]}>
              <Text style={styles.progressionMetricLabel}>Next 6-month progression probability</Text>
              <Text style={styles.progressionMetricValue}>{nextStageProb6Month}</Text>
            </View>
            {anyDeclinePercent ? (
              <View style={[styles.progressionMetricRow, styles.progressionMetricRowSecondary]}>
                <Text style={styles.progressionMetricLabel}>Any decline risk (worsening to any higher stage)</Text>
                <Text style={styles.progressionMetricValue}>{anyDeclinePercent}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Data Source Badge */}
        <View style={styles.dataSourceBadge}>
          <Ionicons
            name={hasUltrasound ? "checkmark-circle" : "information-circle"}
            size={16}
            color={hasUltrasound ? "#34C759" : "#8E8E93"}
          />
          <Text style={styles.dataSourceText}>
            {hasUltrasound ? "Includes Ultrasound Data" : "Lab Data Only"}
          </Text>
        </View>

        <View style={styles.progressionByStageBox}>
          <Text style={styles.progressionByStageTitle}>Probability by next stages</Text>
          {progressionByStage.length ? (
            progressionByStage.map((item, idx) => (
              <View key={`${title}-prog-${idx}`} style={styles.progressionByStageRow}>
                <Text style={styles.progressionByStageStage}>{item.stage_display || item.stage}</Text>
                <Text style={styles.progressionByStageArrow}>→</Text>
                <Text style={styles.progressionByStagePercent}>
                  {Number(item.probability_percentage || 0).toFixed(1)}%
                </Text>
              </View>
            ))
          ) : (
            <Text style={styles.progressionByStageEmpty}>No per-stage probabilities available.</Text>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
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
        <Text style={styles.headerTitle}>Prediction Results</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={true}
        scrollEventThrottle={16}
      >
        <Text style={styles.welcomeText}>CKD Stage Progression Analysis</Text>
        <Text style={styles.subtitle}>Patient: {userName || userEmail}</Text>
        <Text style={styles.emailText}>Visit:{visitNumber ?? "N/A"}</Text>
        {userEmail ? (
          <Text style={styles.emailText}>Email: {userEmail}</Text>
        ) : (
          <Text style={styles.emailText}>Email not provided</Text>
        )}

        {/* Info Box
        <View style={styles.infoBox}>
          <Ionicons name="information-circle" size={20} color="#007AFF" />
          <Text style={styles.infoText}>
            {usedPriorUltrasoundFallback
              ? "Showing Lab + Ultrasound prediction using prior-visit ultrasound fallback for modeling. Current visit ultrasound was not uploaded."
              : prediction_with_us
              ? "Showing the Lab + Ultrasound prediction (most comprehensive)."
              : "Showing the Lab-only prediction (no ultrasound provided)."}
          </Text>
        </View> */}
        {visitWindowText ? (
          <Text style={styles.emailText}>Trend window used: {visitWindowText}</Text>
        ) : null}

        {/* Main Content Grid - Left and Right */}
        <View style={styles.gridContainer}>
          {/* LEFT COLUMN - Predictions */}
          <View style={styles.gridColumn}>
            {primaryPrediction &&
              renderPredictionCard(
                primaryPrediction,
                primaryLabel,
                primaryIcon,
                primaryColor,
                !!prediction_with_us,
                primaryProgressionByStage
              )}
          </View>

          {/* RIGHT COLUMN - eGFR Info and Recommendations */}
          <View style={styles.gridColumn}>
            {/* eGFR Information Box */}
            {eGFR_info && (
              <View style={styles.egfrInfoBox}>
                <View style={styles.egfrHeader}>
                  <Ionicons name="beaker" size={24} color="#50E3C2" />
                  <Text style={styles.egfrTitle}>eGFR Info</Text>
                </View>
                <View style={styles.egfrValueContainer}>
                  <Text style={styles.egfrLabel}>Estimated GFR</Text>
                  <Text style={styles.egfrValue}>{eGFR_info.value?.toFixed(1) || "N/A"}</Text>
                  <Text style={styles.egfrUnit}>mL/min/1.73m²</Text>
                </View>
                <View style={styles.egfrSourceContainer}>
                  <View style={styles.egfrSourceItem}>
                    <Ionicons name="checkmark-circle" size={16} color="#50E3C2" />
                    <Text style={styles.egfrSourceLabel}>Source:</Text>
                    <Text style={styles.egfrSourceValue}>{eGFR_info.source || "Unknown"}</Text>
                  </View>
                  <View style={styles.egfrSourceItem}>
                    <Ionicons name="info-circle" size={16} color="#8E8E93" />
                    <Text style={styles.egfrSourceLabel}>Method:</Text>
                  </View>
                  <Text style={styles.egfrMethod}>{eGFR_info.method}</Text>
                </View>
              </View>
            )}

            {ultrasoundToDisplay?.prediction && (() => {
              const p = ultrasoundToDisplay.prediction || {};
              // Attempt common keys for kidney length
              const kidneyLength =
                ultrasoundToDisplay.ultrasoundInfo?.kidney_length_cm ||
                p.kidney_length_cm ||
                (p.ultrasound && p.ultrasound.kidney_length_cm) ||
                (p.kidney && (p.kidney.length_cm || p.kidney.length)) ||
                null;

              if (!kidneyLength) return null; // hide block entirely when no kidney length available

              return (
                <View style={styles.egfrInfoBox}>
                  <View style={styles.egfrHeader}>
                    <Ionicons name="scan" size={24} color="#4A90E2" />
                    <Text style={styles.egfrTitle}>Ultrasound Result</Text>
                  </View>

                  <View style={styles.egfrValueContainer}>
                    <Text style={styles.egfrLabel}>Kidney Length</Text>
                    <Text style={styles.egfrValue}>{Number(kidneyLength).toFixed(2)} cm</Text>
                    <Text style={styles.egfrUnit}>{ultrasoundToDisplay.sourceText}</Text>
                  </View>
                </View>
              );
            })()}

            {/* Recommendations driven by progression probability */}
            <View style={styles.recommendationsCard}>
              <View style={styles.recommendationsHeader}>
                <Ionicons name="medical" size={24} color="#34C759" />
                <Text style={styles.recommendationsTitle}>{riskBucket.header}</Text>
              </View>
              <Text style={styles.recommendationText}>{riskBucket.text}</Text>
              <View style={{ marginTop: 12, gap: 10 }}>
                {riskBucket.steps.map((step, idx) => (
                  <View key={idx} style={styles.recommendationItem}>
                    <Ionicons name="checkmark-circle" size={16} color="#34C759" />
                    <Text style={styles.recommendationText}>{step}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.sharpInsightCard}>
              <View style={styles.sharpInsightHeader}>
                <Ionicons name="sparkles" size={20} color="#4A90E2" />
                <Text style={styles.sharpInsightTitle}></Text>
              </View>
              <Text style={styles.sharpInsightText}>{sharpInsight}</Text>
            </View>
          </View>
        </View>

        {/* Action Buttons - Full Width */}
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate("Home", { userName, userEmail })}
          activeOpacity={0.8}
        >
          <Ionicons name="home" size={24} color="#FFFFFF" />
          <Text style={styles.actionButtonText}>Back to Home</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.secondaryButton]}
          onPress={() => navigation.navigate("FutureCKDStageHistory", { userName, userEmail })}
          activeOpacity={0.8}
        >
          <Ionicons name="time-outline" size={24} color="#4A90E2" />
          <Text style={[styles.actionButtonText, styles.secondaryButtonText]}>
            Go to History
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.secondaryButton]}
          onPress={() => navigation.navigate("FutureCKDStage", { userName, userEmail })}
          activeOpacity={0.8}
        >
          <Ionicons name="refresh" size={24} color="#4A90E2" />
          <Text style={[styles.actionButtonText, styles.secondaryButtonText]}>
            New Analysis
          </Text>
        </TouchableOpacity>
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
  emailText: {
    fontSize: 13,
    color: "#4B5563",
    marginBottom: 12,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: 24,
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
    marginBottom: 16,
  },
  infoBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E3F2FD",
    padding: 12,
    borderRadius: 12,
    marginBottom: 20,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: "#007AFF",
    marginLeft: 8,
    lineHeight: 18,
  },
  resultCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
    borderRadius: 12,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1C1C1E",
    marginLeft: 8,
  },
  mainResult: {
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E5EA",
  },
  resultLabel: {
    fontSize: 12,
    color: "#8E8E93",
    marginBottom: 8,
  },
  stageBadge: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    marginBottom: 8,
  },
  stageText: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  confidenceContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  confidenceLabel: {
    fontSize: 14,
    color: "#8E8E93",
    marginRight: 6,
  },
  confidenceValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1C1C1E",
  },
  nextStageRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    gap: 6,
  },
  nextStageLabel: {
    fontSize: 13,
    color: "#8E8E93",
  },
  nextStageValue: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1C1C1E",
  },
  nextStageHighlight: {
    marginTop: 8,
    width: "100%",
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "#E8F4FF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#C7E3FF",
    alignItems: "center",
  },
  progressionMetricRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 2,
    gap: 8,
  },
  progressionMetricRowSecondary: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#D6E8FF",
  },
  progressionMetricLabel: {
    flex: 1,
    fontSize: 12,
    color: "#4A90E2",
    fontWeight: "600",
  },
  progressionMetricValue: {
    fontSize: 17,
    fontWeight: "800",
    color: "#1C1C1E",
  },
  nextStageHighlightLabel: {
    fontSize: 12,
    color: "#4A90E2",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  nextStageHighlightValue: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1C1C1E",
  },
  dataSourceBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#E5E5EA",
  },
  dataSourceText: {
    fontSize: 12,
    color: "#8E8E93",
    marginLeft: 6,
  },
  progressionByStageBox: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#E5E5EA",
    gap: 6,
  },
  progressionByStageTitle: {
    fontSize: 12,
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    fontWeight: "700",
    marginBottom: 2,
  },
  progressionByStageRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  progressionByStageStage: {
    minWidth: 50,
    fontSize: 13,
    fontWeight: "700",
    color: "#111827",
  },
  progressionByStageArrow: {
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "700",
  },
  progressionByStagePercent: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1C1C1E",
  },
  progressionByStageEmpty: {
    fontSize: 12,
    color: "#8E8E93",
  },
  recommendationsCard: {
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
  egfrInfoBox: {
    backgroundColor: "#F0FFFE",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: "#50E3C2",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  egfrHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  egfrTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1C1C1E",
    marginLeft: 8,
  },
  egfrValueContainer: {
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E5EA",
    marginBottom: 12,
  },
  egfrLabel: {
    fontSize: 13,
    color: "#8E8E93",
    marginBottom: 4,
  },
  egfrValue: {
    fontSize: 28,
    fontWeight: "700",
    color: "#50E3C2",
  },
  egfrUnit: {
    fontSize: 12,
    color: "#8E8E93",
    marginTop: 4,
  },
  egfrSourceContainer: {
    gap: 8,
  },
  egfrSourceItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  egfrSourceLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1C1C1E",
    minWidth: 70,
  },
  egfrSourceValue: {
    fontSize: 13,
    color: "#50E3C2",
    fontWeight: "600",
  },
  egfrMethod: {
    fontSize: 12,
    color: "#8E8E93",
    lineHeight: 16,
    marginLeft: 22,
  },
  recommendationsHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  recommendationsTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1C1C1E",
    marginLeft: 12,
  },
  recommendationItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  recommendationText: {
    flex: 1,
    fontSize: 14,
    color: "#1C1C1E",
    marginLeft: 8,
    lineHeight: 20,
  },
  sharpInsightCard: {
    backgroundColor: "#F8FAFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#D6E8FF",
  },
  sharpInsightHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 8,
  },
  sharpInsightTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1C1C1E",
  },
  sharpInsightText: {
    fontSize: 13,
    lineHeight: 19,
    color: "#374151",
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4A90E2",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#4A90E2",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  secondaryButton: {
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: "#4A90E2",
    shadowColor: "#000",
    shadowOpacity: 0.05,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
    marginLeft: 8,
  },
  secondaryButtonText: {
    color: "#4A90E2",
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  errorText: {
    fontSize: 18,
    color: "#8E8E93",
    marginTop: 16,
  },
});

export default FutureCKDStageResultScreen;
