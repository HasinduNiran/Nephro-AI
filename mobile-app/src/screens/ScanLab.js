import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import axios from "../api/axiosConfig";

const STAGE_COLORS = ["#34C759", "#34C759", "#F5A623", "#F5A623", "#FF3B30", "#FF3B30"];

const getStageColor = (stage) => {
  const s = parseInt(stage, 10);
  if (!s || s < 1) return "#8E8E93";
  return STAGE_COLORS[Math.min(s, STAGE_COLORS.length) - 1] || "#FF3B30";
};

const formatStageLabel = (stage) => {
  if (stage === null || stage === undefined || stage === "") {
    return "";
  }

  const text = String(stage).trim();
  if (/^stage\s+/i.test(text)) {
    return text;
  }

  const numeric = text.match(/\d+/);
  if (numeric) {
    return `Stage ${numeric[0]}`;
  }

  return text;
};

const ScanLabScreen = ({ navigation, route }) => {
  const userName = route.params?.userName || "User";
  const userEmail = route.params?.userEmail || "";

  const [currentStage, setCurrentStage] = useState(null);
  const [stageLoading, setStageLoading] = useState(false);

  useEffect(() => {
    if (!userEmail) return;
    const loadLatestStage = async () => {
      try {
        setStageLoading(true);
        const response = await axios.get(
          `/stage-progression/history/${encodeURIComponent(userEmail)}`
        );
        if (response.data?.success) {
          const records = response.data.records || [];
          if (records.length > 0) {
            // Sort by date descending to get the most recent record
            const sorted = [...records].sort((a, b) => {
              const da = new Date(a.visitDate || a.inputs?.visitDate || a.createdAt || 0);
              const db = new Date(b.visitDate || b.inputs?.visitDate || b.createdAt || 0);
              return db - da;
            });
            const latest = sorted[0];
            const stage =
              latest.prediction_with_us?.predicted_stage ??
              latest.prediction_with_us?.current_stage ??
              latest.prediction_lab_only?.predicted_stage ??
              latest.prediction_lab_only?.current_stage ??
              latest.current_stage ??
              null;
            setCurrentStage(stage);
          }
        }
      } catch (_err) {
        // silently fail – stage badge simply won't show
      } finally {
        setStageLoading(false);
      }
    };
    loadLatestStage();
  }, [userEmail]);
  
  const features = [
    {
      id: 1,
      title: "CKD stage",
      subtitle: "Test results",
      icon: "flask",
      color: "#F5A623", // Orange
      onPress: () => navigation.navigate("LabAnalysis", { userName, userEmail }),
    },
    {
      id: 2,
      title: "Future CKD Stage Progression",
      subtitle: "Stage progression",
      icon: "trending-up",
      color: "#50E3C2", // Teal
      onPress: () => navigation.navigate("FutureCKDStage", { userName, userEmail }),
    },
    {
      id: 3,
      title: "Progression History",
      subtitle: "History graph",
      icon: "pulse",
      color: "#EF4444", // Red
      onPress: () => navigation.navigate("MyProgressPath", { userName, userEmail }),
    },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#4A90E2" />

      {/* Hero Header */}
      <View style={styles.heroHeader}>
        <View style={styles.heroCircleLarge} />
        <View style={styles.heroCircleSmall} />
        <View style={styles.heroInner}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.navigate("Home", { userName, userEmail })}>
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.heroTitle}>Scan & Lab</Text>
          <View style={styles.rightBtnPlaceholder} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Dashboard Title */}
        
        <Text style={styles.patientInfo}>Patient: {userName || userEmail}</Text>
        {userEmail ? (
          <Text style={styles.patientEmail}>{userEmail}</Text>
        ) : null}

        {/* Current CKD Stage Badge */}
        <View style={styles.stageBadgeRow}>
          <Ionicons name="medical" size={16} color="#4B5563" />
          <Text style={styles.stageLabel}>Current CKD Stage:</Text>
          {stageLoading ? (
            <ActivityIndicator size="small" color="#4A90E2" style={{ marginLeft: 8 }} />
          ) : currentStage !== null ? (
            <View style={[styles.stagePill, { backgroundColor: getStageColor(currentStage) }]}>
              <Text style={styles.stagePillText}>{formatStageLabel(currentStage)}</Text>
            </View>
          ) : (
            <Text style={styles.stageUnknown}>Not yet assessed</Text>
          )}
        </View>

        {/* Tiles Grid */}
        <View style={styles.grid}>
          {features.map((feature) => (
            <TouchableOpacity
              key={feature.id}
              style={styles.card}
              onPress={feature.onPress}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.iconContainer,
                  { backgroundColor: feature.color + "20" },
                ]}
              >
                <Ionicons name={feature.icon} size={28} color={feature.color} />
              </View>
              <Text style={styles.cardTitle}>{feature.title}</Text>
              <Text style={styles.cardSubtitle}>{feature.subtitle}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
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
  contentContainer: {
    padding: 24,
    paddingTop: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1C1C1E",
    marginBottom: 16,
  },
  patientInfo: {
    fontSize: 14,
    color: "#4B5563",
    marginTop: -4,
  },
  patientEmail: {
    fontSize: 12,
    color: "#6B7280",
    marginBottom: 8,
  },
  stageBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
    flexWrap: "wrap",
    gap: 6,
  },
  stageLabel: {
    fontSize: 13,
    color: "#4B5563",
    fontWeight: "600",
    marginLeft: 4,
  },
  stagePill: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  stagePillText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  stageUnknown: {
    fontSize: 13,
    color: "#8E8E93",
    fontStyle: "italic",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  card: {
    width: "48%",
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
    alignItems: "flex-start",
  },
  iconContainer: {
    width: 50,
    height: 50,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1C1C1E",
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 12,
    color: "#8E8E93",
    fontWeight: "500",
  },
});

export default ScanLabScreen;
