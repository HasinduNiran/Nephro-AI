import React, { useCallback, useMemo, useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Modal,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Line, Polyline, Circle, Rect, Text as SvgText } from "react-native-svg";
import axios from "../api/axiosConfig";

const STAGE_TO_EGFR = {
  "1": 95,
  "2": 75,
  "3": 55,
  "3.1": 52,
  "3.2": 37,
  "4": 22,
  "5": 10,
  G1: 95,
  G2: 75,
  G3: 55,
  G3A: 52,
  G3B: 37,
  G4: 22,
  G5: 10,
};

const normalizeStageKey = (value) => {
  if (!value) return null;
  const text = String(value).trim().toUpperCase().replace("STAGE", "").replace(/\s+/g, "");
  if (text === "3A") return "3.1";
  if (text === "3B") return "3.2";
  if (text === "G3A") return "3.1";
  if (text === "G3B") return "3.2";
  if (text.startsWith("G")) return text;
  return text;
};

const formatStageLabel = (value) => {
  const normalized = normalizeStageKey(value);
  if (!normalized) return "";
  return `S${String(normalized).replace(/^G/, "")}`;
};

const getRecommendationStage = (value) => {
  const normalized = normalizeStageKey(value);
  if (!normalized) return null;

  if (normalized === "3.1" || normalized === "3.2") {
    return 3;
  }

  if (typeof normalized === "string" && normalized.startsWith("G")) {
    return Number(normalized.slice(1));
  }

  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
};

const getRecommendations = (stage) => {
  switch (stage) {
    case 1:
    case 2:
      return [
        { icon: "🥗", text: "Follow a low-salt healthy diet" },
        { icon: "🚶", text: "Exercise 30 min daily" },
        { icon: "💧", text: "Stay properly hydrated" },
        { icon: "🩺", text: "Keep regular health checkups" },
        { icon: "🩸", text: "Control BP and blood sugar" },
        { icon: "🚭", text: "Stop smoking" },
      ];

    case 3:
      return [
        { icon: "🥩", text: "Limit protein intake" },
        { icon: "💊", text: "Take medicines as prescribed" },
        { icon: "🧪", text: "Monitor creatinine and eGFR" },
        { icon: "👨‍⚕️", text: "Consult a nephrologist" },
        { icon: "🩸", text: "Manage anemia and cholesterol" },
        { icon: "🚫", text: "Avoid NSAID painkillers" },
      ];

    case 4:
      return [
        { icon: "🥗", text: "Follow a low potassium and phosphorus diet" },
        { icon: "💧", text: "Control fluid intake" },
        { icon: "🧪", text: "Do frequent lab monitoring" },
        { icon: "🏥", text: "Prepare for dialysis or transplant" },
        { icon: "💊", text: "Follow medications strictly" },
        { icon: "⚠️", text: "Manage complications early" },
      ];

    case 5:
      return [
        { icon: "🏥", text: "Start dialysis treatment" },
        { icon: "🫀", text: "Consider kidney transplant" },
        { icon: "💧", text: "Use strict fluid restriction" },
        { icon: "🥗", text: "Follow the renal diet strictly" },
        { icon: "💊", text: "Take all prescribed medicines" },
        { icon: "👨‍⚕️", text: "Stay under close medical supervision" },
      ];

    default:
      return [];
  }
};

const getRecordDate = (record) => record?.visitDate || record?.inputs?.visitDate || record?.createdAt;

const formatDateOnly = (isoString) => {
  try {
    const date = new Date(isoString);
    return date.toLocaleDateString();
  } catch (_e) {
    return "-";
  }
};

const formatDateShort = (isoString) => {
  try {
    const date = new Date(isoString);
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${mm}/${dd}`;
  } catch (_e) {
    return "--/--";
  }
};

const toPercentText = (progressionObj) => {
  if (progressionObj === null || progressionObj === undefined) return "N/A";

  // Allow raw numeric probability (0-1)
  if (typeof progressionObj === "number" && Number.isFinite(progressionObj)) {
    return `${(progressionObj * 100).toFixed(1)}%`;
  }

  // Allow numeric string like "0.0926"
  if (typeof progressionObj === "string" && progressionObj.trim() !== "" && !Number.isNaN(Number(progressionObj))) {
    const num = Number(progressionObj);
    return `${(num * 100).toFixed(1)}%`;
  }

  const pctRaw = progressionObj?.probability_percentage;
  if (pctRaw !== undefined && pctRaw !== null && String(pctRaw).trim() !== "") {
    const text = String(pctRaw).trim();
    return text.includes("%") ? text : `${text}%`;
  }

  // Accept common property names carrying probability
  const prob = Number(
    progressionObj?.probability ?? progressionObj?.prob ?? progressionObj?.value ?? NaN
  );
  if (Number.isFinite(prob)) return `${(prob * 100).toFixed(1)}%`;
  return "N/A";
};

const getOutlookZone = (egfr) => {
  const value = Number(egfr);
  if (!Number.isFinite(value)) return "unknown";
  if (value >= 90) return "green";
  if (value >= 60) return "yellow";
  if (value >= 30) return "orange";
  return "red";
};

const MyProgressPathScreen = ({ navigation, route }) => {
  const [userEmail, setUserEmail] = useState(
    route.params?.userEmail ||
      route.params?.email ||
      route.params?.user?.email ||
      route.params?.user?.userEmail ||
      ""
  );
  const userName = route.params?.userName || route.params?.user?.name || "User";

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPastRecordsModal, setShowPastRecordsModal] = useState(false);

  const fetchHistory = useCallback(async () => {
    let effectiveEmail = (userEmail || "").trim();
    if (!effectiveEmail) {
      const storedEmail = await AsyncStorage.getItem("userEmail");
      effectiveEmail = (storedEmail || "").trim();
      if (effectiveEmail) setUserEmail(effectiveEmail);
    }

    if (!effectiveEmail) {
      setError("No user email provided");
      setRecords([]);
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
        setError("Failed to load progression history");
      }
    } catch (err) {
      setError("Unable to load progression history");
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [userEmail]);

  useFocusEffect(
    useCallback(() => {
      fetchHistory();
    }, [fetchHistory])
  );

  const chartData = useMemo(() => {
    if (!records.length) {
      return { points: [], predicted: null, labels: [] };
    }

    const ordered = [...records].sort((a, b) => new Date(getRecordDate(a)) - new Date(getRecordDate(b)));

    const points = ordered
      .map((record, index) => {
        const egfr = Number(record?.inputs?.labs?.egfr ?? record?.eGFR_info?.value ?? NaN);
        if (!Number.isFinite(egfr)) return null;
        const stage =
          record?.prediction_with_us?.predicted_stage ??
          record?.prediction_lab_only?.predicted_stage ??
          null;
        return {
          xLabel: formatDateShort(getRecordDate(record)),
          y: egfr,
          stage,
          record,
        };
      })
      .filter(Boolean);

    if (!points.length) {
      return { points: [], predicted: null, labels: [] };
    }

    const latest = ordered[ordered.length - 1] || {};
    const latestVisitLabel = `V${ordered.length + 1}`;

    const nextVisitProgression =
      latest?.progression_to_next_stage ||
      latest?.prediction_with_us?.next_stage_progression ||
      latest?.prediction_lab_only?.next_stage_progression ||
      null;
    const nextStageProbabilityText = toPercentText(nextVisitProgression);

    const nextStage = normalizeStageKey(
      latest?.progression_to_next_stage?.next_stage ||
        latest?.prediction_with_us?.next_stage_progression?.next_stage ||
        latest?.prediction_lab_only?.next_stage_progression?.next_stage
    );
    const predictedEgfr = STAGE_TO_EGFR[nextStage] ?? null;

    return {
      points,
      predicted: Number.isFinite(predictedEgfr)
        ? { xLabel: latestVisitLabel, y: predictedEgfr, probabilityText: nextStageProbabilityText, stage: nextStage }
        : null,
      labels: points.map((p) => p.xLabel),
      latestActualEgfr: points[points.length - 1]?.y ?? null,
    };
  }, [records]);

  const chart = useMemo(() => {
    const width = 360;
    const height = 260;
    const padding = 36;
    const { points, predicted } = chartData;

    if (!points.length) {
      return { width, height, yTicks: [], bluePolyline: "", blueDots: [], redSegment: null, xLabels: [], zoneBands: [] };
    }

    const minY = 0;
    const maxY = 100;
    const yRange = maxY - minY;

    const totalCount = points.length + (predicted ? 1 : 0);
    const xStep = totalCount > 1 ? (width - 2 * padding) / (totalCount - 1) : 0;

    const toX = (index) => padding + index * xStep;
    const toY = (value) => {
      const clamped = Math.max(minY, Math.min(maxY, Number(value)));
      return height - padding - ((clamped - minY) / yRange) * (height - 2 * padding);
    };

    const blueDots = points.map((p, i) => ({ x: toX(i), y: toY(p.y), label: p.xLabel, stage: p.stage }));
    const bluePolyline = blueDots.map((p) => `${p.x},${p.y}`).join(" ");

    let redSegment = null;
    if (predicted && points.length) {
      const lastBlue = blueDots[blueDots.length - 1];
      const predX = toX(points.length);
      const predY = toY(predicted.y);
      redSegment = {
        fromX: lastBlue.x,
        fromY: lastBlue.y,
        toX: predX,
        toY: predY,
        label: predicted.xLabel,
        probabilityText: predicted.probabilityText,
        midX: (lastBlue.x + predX) / 2,
        midY: (lastBlue.y + predY) / 2,
        stage: predicted.stage,
      };
    }

    const yTicks = [0, 30, 60, 90, 100].map((value) => ({ y: toY(value), value }));

    const xLabels = blueDots.map((p) => ({ x: p.x, text: p.label }));
    if (redSegment) xLabels.push({ x: redSegment.toX, text: redSegment.label });

    const zoneBands = [
      { from: 90, to: 100, color: "#DCFCE7" },
      { from: 60, to: 90, color: "#FEF9C3" },
      { from: 30, to: 60, color: "#FFEDD5" },
      { from: 0, to: 30, color: "#FEE2E2" },
    ].map((zone) => ({
      yTop: toY(zone.to),
      yBottom: toY(zone.from),
      color: zone.color,
    }));

    return { width, height, yTicks, bluePolyline, blueDots, redSegment, xLabels, zoneBands };
  }, [chartData]);

  const progressionRows = useMemo(() => {
    if (!records.length) return [];

    const ordered = [...records].sort((a, b) => new Date(getRecordDate(a)) - new Date(getRecordDate(b)));
    return ordered.map((record, index) => {
      const nextVisitProgression =
        record?.progression_to_next_stage ||
        record?.prediction_with_us?.next_stage_progression ||
        record?.prediction_lab_only?.next_stage_progression ||
        null;

      const sixMonthProgression =
        record?.progression_to_next_stage_6_month ||
        record?.prediction_with_us?.next_stage_progression_6_month ||
        record?.prediction_lab_only?.next_stage_progression_6_month ||
        null;

      return {
        visitNumber: index + 1,
        visitDate: formatDateOnly(getRecordDate(record)),
        currentStage:
          record?.prediction_with_us?.predicted_stage ||
          record?.prediction_lab_only?.predicted_stage ||
          record?.prediction_with_us?.current_stage ||
          record?.prediction_lab_only?.current_stage ||
          "N/A",
        nextStage: nextVisitProgression?.next_stage || "N/A",
        currentHistoryProbability: toPercentText(nextVisitProgression),
        sixMonthProbability: toPercentText(sixMonthProgression),
      };
    });
  }, [records]);

  const latestStageInfo = useMemo(() => {
    if (!records.length) return null;
    const ordered = [...records].sort((a, b) => new Date(getRecordDate(a)) - new Date(getRecordDate(b)));
    const latest = ordered[ordered.length - 1];
    const stage =
      latest?.prediction_with_us?.predicted_stage ?? latest?.prediction_lab_only?.predicted_stage ?? null;
    if (stage === null) return null;
    const egfr = Number(latest?.inputs?.labs?.egfr ?? latest?.eGFR_info?.value ?? NaN);
    const zone = Number.isFinite(egfr) ? getOutlookZone(egfr) : "unknown";
    const stageColorMap = { green: "#10B981", yellow: "#F59E0B", orange: "#F97316", red: "#EF4444", unknown: "#6B7280" };
    return {
      stage,
      color: stageColorMap[zone] || "#6B7280",
      egfr: Number.isFinite(egfr) ? egfr.toFixed(1) : null,
      visitDate: formatDateOnly(getRecordDate(latest)),
    };
  }, [records]);

  const latestKidneyLength = useMemo(() => {
    if (!records.length) return null;
    const ordered = [...records].sort(
      (a, b) => new Date(b?.createdAt || b?.inputs?.visitDate || b?.visitDate || 0) - new Date(a?.createdAt || a?.inputs?.visitDate || a?.visitDate || 0)
    );
    const latest = ordered[0];
    const us = latest?.ultrasound_info || latest?.ultrasound_data || latest?.ultrasoundData || {};
    const kidneyLengthRaw =
      us?.kidney_length_cm ??
      us?.kidneyLengthCm ??
      null;
    const kidneyLength = Number(kidneyLengthRaw);
    return Number.isFinite(kidneyLength) ? kidneyLength.toFixed(1) : null;
  }, [records]);

  const recommendationStage = useMemo(
    () => getRecommendationStage(latestStageInfo?.stage),
    [latestStageInfo?.stage]
  );

  const recommendations = useMemo(
    () => getRecommendations(recommendationStage),
    [recommendationStage]
  );

  const healthGraphExplanation = useMemo(() => {
    const points = chartData.points || [];
    if (!points.length) {
      return "No graph data yet.";
    }

    const firstPoint = points[0];
    const lastPoint = points[points.length - 1];
    const firstValue = Number(firstPoint?.y);
    const lastValue = Number(lastPoint?.y);
    const firstDate = firstPoint?.xLabel || "the first visit";
    const lastDate = lastPoint?.xLabel || "the latest visit";
    const nextPrediction = chartData?.predicted;

    const valueText = Number.isFinite(lastValue)
      ? `Your latest eGFR is ${lastValue.toFixed(1)} on ${lastDate}.`
      : `Your latest eGFR is not available on ${lastDate}.`;

    let trendText = `From ${firstDate} to ${lastDate}, the line is steady.`;
    if (Number.isFinite(firstValue) && Number.isFinite(lastValue)) {
      if (lastValue > firstValue) {
        trendText = `From ${firstDate} to ${lastDate}, the line goes up, which is a good sign.`;
      } else if (lastValue < firstValue) {
        trendText = `From ${firstDate} to ${lastDate}, the line goes down, so kidney function is getting lower.`;
      } else {
        trendText = `From ${firstDate} to ${lastDate}, the line stays about the same.`;
      }
    }

    const nextText = nextPrediction?.probabilityText && nextPrediction.probabilityText !== "N/A"
      ? `The dotted line shows the next visit may be around ${nextPrediction.probabilityText}.`
      : "There is no next visit prediction yet.";

    // Add a simple SHAP explanation if available from the latest record
    const orderedAll = [...records].sort((a, b) => new Date(getRecordDate(a)) - new Date(getRecordDate(b)));
    const latestRecord = orderedAll[orderedAll.length - 1] || {};
    const shapCandidates = (
      latestRecord?.prediction_with_us?.prediction_context?.shap_values ||
      latestRecord?.prediction_lab_only?.prediction_context?.shap_values ||
      latestRecord?.prediction_with_us?.prediction_context?.shap ||
      latestRecord?.prediction_lab_only?.prediction_context?.shap ||
      chartData?.predicted?.shap ||
      null
    );

    let shapText = "";
    if (shapCandidates && typeof shapCandidates === "object") {
      try {
        const entries = Object.entries(shapCandidates)
          .map(([k, v]) => ({ key: k, val: Number(v) }))
          .filter((e) => Number.isFinite(e.val))
          .sort((a, b) => Math.abs(b.val) - Math.abs(a.val));

        if (entries.length) {
          const top = entries.slice(0, 2);
          const pretty = {
            creatinine: "Creatinine",
            egfr: "eGFR",
            age: "Age",
            albumin: "Albumin",
            hemoglobin: "Hemoglobin",
            bun: "BUN",
            kidney_length_cm: "Kidney length",
            kidneyLength: "Kidney length",
          };

          const parts = top.map((t) => {
            const name = pretty[t.key] || t.key;
            const direction = t.val > 0 ? "increases" : "decreases";
            return `${name} ${direction} risk (${t.val.toFixed(2)})`;
          });

          shapText = ` Model explanation (SHAP): top contributors — ${parts.join(", ")}.`;
        }
      } catch (_e) {
        shapText = "";
      }
    }

    return `${valueText} ${trendText} ${nextText}${shapText}`;
  }, [chartData]);

  // Patient info
  const initials = (userName || userEmail || "").split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase();
  const patientId = route.params?.user?.patientId || route.params?.user?.id || route.params?.patientId || (userEmail ? `CKD-${String(userEmail).slice(0, 6)}` : "CKD-00000");
  const patientAgeGender = route.params?.user ? `${route.params.user.gender || ""} · ${route.params.user.age ? `${route.params.user.age} years` : ""}` : "";
  const nextVisitLabel = route.params?.nextVisit || "";

  const declineRisk = useMemo(() => {
    if (!records.length) return "N/A";
    const ordered = [...records].sort((a, b) => new Date(getRecordDate(a)) - new Date(getRecordDate(b)));
    const latest = ordered[ordered.length - 1] || {};
    const candidates = [
      latest?.progression_to_next_stage?.any_decline_probability,
      latest?.any_decline_probability,
      latest?.prediction_with_us?.next_stage_progression?.any_decline_probability,
      latest?.prediction_lab_only?.next_stage_progression?.any_decline_probability,
    ];

    let found = null;
    for (const c of candidates) {
      if (typeof c === "number" && Number.isFinite(c)) {
        found = c;
        break;
      }
      if (typeof c === "string" && c.trim() !== "" && !Number.isNaN(Number(c))) {
        found = Number(c);
        break;
      }
    }

    if (found !== null) return `${(found * 100).toFixed(1)}%`;
    return "N/A";
  }, [records]);

  const progressionRisk = useMemo(() => {
    if (!records.length) return "N/A";
    const ordered = [...records].sort((a, b) => new Date(getRecordDate(a)) - new Date(getRecordDate(b)));
    const latest = ordered[ordered.length - 1] || {};
    const candidates = [
      latest?.progression_to_next_stage?.probability,
      latest?.probability,
      latest?.prediction_with_us?.next_stage_progression?.probability,
      latest?.prediction_lab_only?.next_stage_progression?.probability,
    ];

    let found = null;
    for (const c of candidates) {
      if (typeof c === "number" && Number.isFinite(c)) {
        found = c;
        break;
      }
      if (typeof c === "string" && c.trim() !== "" && !Number.isNaN(Number(c))) {
        found = Number(c);
        break;
      }
    }

    if (found !== null) return `${(found * 100).toFixed(1)}%`;
    return "N/A";
  }, [records]);

  const latestNext = useMemo(() => {
    if (!records.length) return null;
    const ordered = [...records].sort((a, b) => new Date(getRecordDate(a)) - new Date(getRecordDate(b)));
    const latest = ordered[ordered.length - 1] || {};
    const prediction = latest?.prediction_with_us || latest?.prediction_lab_only || {};
    const next = prediction?.next_stage_progression || {};
    const nextStage = next?.next_stage ?? null;
    const prob = next?.probability ?? next?.any_decline_probability ?? null;
    const probabilityText = typeof prob === 'number' && Number.isFinite(prob) ? `${(prob * 100).toFixed(1)}%` : null;
    return nextStage ? { nextStage, probabilityText } : null;
  }, [records]);

  const pastRecordsCards = useMemo(() => {
    if (!records.length) return [];

    const orderedDesc = [...records].sort((a, b) => new Date(getRecordDate(b)) - new Date(getRecordDate(a)));

    const toDisplay = (val, digits = 1) => {
      const num = Number(val);
      if (Number.isFinite(num)) return num.toFixed(digits);
      return "N/A";
    };

    return orderedDesc.map((record) => {
      const date = formatDateOnly(getRecordDate(record));
      const egfr = toDisplay(record?.inputs?.labs?.egfr ?? record?.eGFR_info?.value, 1);
      const creatinine = toDisplay(record?.inputs?.labs?.creatinine, 2);

      const us = record?.ultrasound_info || record?.ultrasound_data || record?.ultrasoundData || {};
      const kidneyLengthRaw =
        
        
       
        
        us?.kidney_length_cm ??
        us?.kidneyLengthCm ??
        
        
        null;
      const kidneyLength = toDisplay(kidneyLengthRaw, 2);

      const probabilityText =
        toPercentText(
          record?.progression_to_next_stage ||
           record?.probability ||
            record?.prediction_with_us?.next_stage_progression ||
            record?.prediction_lab_only?.next_stage_progression ||
            null
        ) || "N/A";

      return {
        id: String(record?._id || `${date}-${egfr}-${creatinine}`),
        date,
        egfr,
        creatinine,
        kidneyLength,
        probability: probabilityText,
      };
    });
  }, [records]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.iconCircle} onPress={() => navigation.goBack()}>
          <Ionicons name="menu" size={20} color="#475569" />
        </TouchableOpacity>
        <Text style={styles.topTitle}>My Progress Path</Text>
        <View style={styles.topPlaceholder} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollBody}>
        {/* Patient card */}
        <View style={styles.patientCard}>
          <View style={styles.patientAvatar}>
            <Text style={styles.avatarText}>{initials || 'U'}</Text>
          </View>
          <View style={styles.patientInfo}>
            <Text style={styles.patientName}>{userName || userEmail || 'User'}</Text>
            <Text style={styles.patientId}>ID: {patientId}</Text>
          </View>
          {nextVisitLabel ? (
            <View style={styles.visitPill}>
              <Text style={styles.visitPillText}>Next: {nextVisitLabel}</Text>
            </View>
          ) : null}
        </View>

        {/* Current Stage Banner */}
        <Text style={styles.sectionLabel}>CURRENT STATUS</Text>
        <View style={styles.stageBanner}>
          <View style={styles.stageLeft}>
            <View style={styles.stageLeftIcon}>
              <Ionicons name="color-filter" size={20} color="#10B981" />
            </View>
            <View>
              <Text style={styles.stageBadgeText}>Current CKD Stage  {latestStageInfo?.stage ?? '—'}</Text>
              <Text style={styles.stageVal}>as of {latestStageInfo?.visitDate ?? '—'}</Text>
               {latestNext ? (
              <Text style={styles.stageNext}> Next Stage {latestNext.nextStage}</Text>
            ) : null}
            </View>
          </View>
        </View>

        {/* Assessment Cards */}
        <View style={styles.assessmentRow}>
          <View style={styles.assessCard}>
            <Text style={styles.assessTitle}>Stage Progression Risk (Next Visit)</Text>
            <Text style={[styles.assessPct, { color: '#10B981' }]}>{progressionRisk}</Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: progressionRisk.includes('%') ? progressionRisk : '0%', backgroundColor: '#10B981' }]} />
            </View>
            <Text style={styles.assessDesc}>Chance of stage progressing at next visit</Text>
          </View>

          <View style={styles.assessCard}>
            <Text style={styles.assessTitle}>Kidney Function Decline Risk</Text>
            <Text style={[styles.assessPct, { color: '#EF4444' }]}>{declineRisk}</Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: declineRisk.includes('%') ? declineRisk : '0%', backgroundColor: '#EF4444' }]} />
            </View>
            <Text style={styles.assessDesc}>Overall risk of kidney function decline</Text>
          </View>
        </View>

        {/* Key Health Indicators */}
        <Text style={styles.sectionLabel}>KEY HEALTH INDICATORS</Text>
        <ScrollView
          style={styles.khiScrollView}
          horizontal={true}
          showsHorizontalScrollIndicator={true}
          scrollEventThrottle={16}
        >
          <View style={styles.khiRow}>
            <View style={styles.khiCard}>
              <Text style={styles.khiIcon}>🧪</Text>
              <Text style={styles.khiName}>Creatinine</Text>
              <Text style={styles.khiValue}>{records[records.length - 1]?.inputs?.labs?.creatinine ?? '—'}</Text>
              <Text style={styles.khiUnit}>mg/dL</Text>
            </View>
            <View style={styles.khiCard}>
              <Text style={styles.khiIcon}>🫀</Text>
              <Text style={styles.khiName}>eGFR</Text>
              <Text style={styles.khiValue}>{latestStageInfo?.egfr ?? '—'}</Text>
              <Text style={styles.khiUnit}>ml/min/1.73m²</Text>
            </View>
            <View style={styles.khiCard}>
              <Text style={styles.khiIcon}>📏</Text>
              <Text style={styles.khiName}>Kidney Length</Text>
              <Text style={styles.khiValue}>{latestKidneyLength ?? '—'}</Text>
              <Text style={styles.khiUnit}>cm</Text>
            </View>
          </View>
        </ScrollView>

        {/* Graph Card */}
        <Text style={styles.sectionLabel}>eGFR TREND</Text>
        <View style={styles.graphCard}>
          <View style={styles.graphLegend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#10B981' }]} />
              <Text style={styles.legendText}>Actual eGFR</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={styles.legendDash} />
              <Text style={styles.legendText}>Predicted</Text>
            </View>
          </View>

          <View style={styles.chartWrap}>
            <Svg width={chart.width} height={chart.height}>
              {/* Axes */}
              <Line x1={32} y1={32} x2={32} y2={chart.height - 32} stroke="#CBD5E1" strokeWidth="1.5" />
              <Line x1={32} y1={chart.height - 32} x2={chart.width - 24} y2={chart.height - 32} stroke="#CBD5E1" strokeWidth="1.5" />

              {/* Zone Bands */}
              {chart.zoneBands?.map((zone, idx) => (
                <Line
                  key={`zone-${idx}`}
                  x1={32}
                  y1={(zone.yTop + zone.yBottom) / 2}
                  x2={chart.width - 24}
                  y2={(zone.yTop + zone.yBottom) / 2}
                  stroke={zone.color}
                  strokeWidth={Math.max(1, zone.yBottom - zone.yTop)}
                />
              ))}

              {/* Y Ticks */}
              {chart.yTicks?.map((tick) => (
                <React.Fragment key={`yt-${tick.value}`}>
                  <Line x1={28} y1={tick.y} x2={32} y2={tick.y} stroke="#CBD5E1" strokeWidth="1" />
                  <SvgText x={20} y={tick.y + 4} fill="#64748B" fontSize="10" textAnchor="end">
                    {tick.value}
                  </SvgText>
                </React.Fragment>
              ))}

              {/* Blue Line & Dots */}
              {chart.bluePolyline && (
                <Polyline points={chart.bluePolyline} fill="none" stroke="#10B981" strokeWidth="3" />
              )}

              {chart.blueDots.map((dot, idx) => (
                <React.Fragment key={`bd-${idx}`}>
                  <Circle cx={dot.x} cy={dot.y} r="4.5" fill="#10B981" />
                  {dot.stage && (
                    <SvgText x={dot.x} y={dot.y - 12} fill="#1E40AF" fontSize="9" fontWeight="700" textAnchor="middle">
                      {formatStageLabel(dot.stage)}
                    </SvgText>
                  )}
                </React.Fragment>
              ))}

              {/* Red Predicted Segment */}
              {chart.redSegment && (
                <>
                  <Line
                    x1={chart.redSegment.fromX}
                    y1={chart.redSegment.fromY}
                    x2={chart.redSegment.toX}
                    y2={chart.redSegment.toY}
                    stroke="#EF4444"
                    strokeWidth="3"
                    strokeDasharray="5,5"
                  />
                  <Circle cx={chart.redSegment.toX} cy={chart.redSegment.toY} r="4.5" fill="#EF4444" />
                  {chart.redSegment.stage && (
                    <SvgText
                      x={chart.redSegment.toX}
                      y={chart.redSegment.toY - 12}
                      fill="#EF4444"
                      fontSize="9"
                      fontWeight="700"
                      textAnchor="middle"
                    >
                      {formatStageLabel(chart.redSegment.stage)}
                    </SvgText>
                  )}
                  {chart.redSegment.probabilityText && (
                    <SvgText
                      x={chart.redSegment.midX}
                      y={chart.redSegment.midY - 18}
                      fill="#EF4444"
                      fontSize="9"
                      fontWeight="600"
                      textAnchor="middle"
                    >
                      {chart.redSegment.probabilityText}
                    </SvgText>
                  )}
                </>
              )}

              {/* X Labels */}
              {chart.xLabels?.map((label, idx) => (
                <SvgText
                  key={`xl-${idx}`}
                  x={label.x}
                  y={chart.height - 12}
                  fill="#64748B"
                  fontSize="10"
                  textAnchor="middle"
                >
                  {label.text}
                </SvgText>
              ))}

              <SvgText x={16} y={chart.height / 2} fill="#475569" fontSize="11" fontWeight="700" textAnchor="middle" transform={`rotate(-90 16 ${chart.height / 2})`}>
                eGFR
              </SvgText>
              <SvgText x={chart.width / 2} y={chart.height - 2} fill="#475569" fontSize="11" fontWeight="700" textAnchor="middle">
                Visit Dates
              </SvgText>
            </Svg>
          </View>

          <View style={styles.chartNote}>
            <Text style={styles.chartNoteText}>
              {chartData.predicted?.probabilityText 
                ? `${chartData.predicted.probabilityText} probability of progressing to next stage` 
                : 'No prediction available yet'}
            </Text>
          </View>

          <View style={styles.explainCard}>
            <Text style={styles.explainTitle}>Health Trend Summary</Text>
            <Text style={styles.explainText}>{healthGraphExplanation}</Text>
          </View>

          <TouchableOpacity
            style={styles.pastRecordsButton}
            onPress={() => setShowPastRecordsModal(true)}
          >
            <Ionicons name="time-outline" size={18} color="#1E40AF" />
            <Text style={styles.pastRecordsButtonText}>View Past Records</Text>
          </TouchableOpacity>
        </View>

        {/* What You Can Do */}
        <Text style={styles.sectionLabel}>WHAT YOU CAN DO</Text>
        <View style={styles.wydGrid}>
          {recommendations.length > 0 ? (
            recommendations.map((item, index) => (
              <View key={`${item.text}-${index}`} style={styles.wydItem}>
                <Text style={styles.wydIcon}>{item.icon}</Text>
                <Text style={styles.wydText}>{item.text}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.emptyRecommendationsText}>No stage-specific recommendations available yet.</Text>
          )}
        </View>
      </ScrollView>

      {/* Past Records Modal */}
      <Modal
        visible={showPastRecordsModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowPastRecordsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowPastRecordsModal(false)} style={styles.modalBackBtn}>
                <Ionicons name="arrow-back" size={22} color="#0F172A" />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Progression History</Text>
              <TouchableOpacity onPress={() => setShowPastRecordsModal(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={24} color="#0F172A" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {pastRecordsCards.length === 0 ? (
                <Text style={styles.modalEmptyText}>No records available yet.</Text>
              ) : (
                pastRecordsCards.map((item, index) => (
                  <View key={item.id || index} style={styles.pastRecordCard}>
                    <Text style={styles.pastRecordDate}>{item.date}</Text>
                    <View style={styles.pastRecordGrid}>
                      <Text style={styles.pastRecordValue}>eGFR: {item.egfr}</Text>
                      <Text style={styles.pastRecordValue}>Creatinine: {item.creatinine}</Text>
                      <Text style={styles.pastRecordValue}>Kidney Length: {item.kidneyLength} cm</Text>
                      <Text style={styles.pastRecordValue}>Progression Risk: {item.probability}</Text>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  topBar: {
    paddingTop: 40,
    paddingBottom: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: {
    color: '#1E2937',
    fontSize: 18,
    fontWeight: '600',
  },
  topPlaceholder: { width: 40 },
  scroll: { flex: 1 },
  scrollBody: { paddingHorizontal: 16, paddingBottom: 40, paddingTop: 8 },

  patientCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  patientAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#0C4A6E',
    fontWeight: '700',
    fontSize: 18,
  },
  patientInfo: { flex: 1 },
  patientName: { color: '#1E2937', fontSize: 17, fontWeight: '600' },
  patientMeta: { color: '#64748B', fontSize: 13, marginTop: 2 },
  patientId: { color: '#94A3B8', fontSize: 12, marginTop: 4 },
  visitPill: {
    backgroundColor: '#EFF6FF',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  visitPillText: { color: '#1E40AF', fontSize: 12, fontWeight: '500' },

  sectionLabel: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 20,
    marginBottom: 8,
  },

  stageBanner: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  stageLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stageLeftIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#F0FDF4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageLbl: { color: '#64748B', fontSize: 13 },
  stageVal: { color: '#1E2937', fontSize: 16, fontWeight: '600', marginTop: 2 },
  stageRight: { alignItems: 'flex-end' },
  stageBadge: {
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  stageBadgeText: { color: '#10B981', fontWeight: '700', fontSize: 15 },
  stageNext: { color: '#1E40AF', fontSize: 15, marginTop: 20, fontWeight: '500' },

  assessmentRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
  assessCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  assessTitle: { color: '#64748B', fontSize: 13, fontWeight: '500' },
  assessPct: { fontSize: 32, fontWeight: '700', marginVertical: 8 },
  assessDesc: { color: '#64748B', fontSize: 13, marginTop: 8, lineHeight: 18 },

  progressTrack: {
    height: 8,
    backgroundColor: '#F1F5F9',
    borderRadius: 999,
    overflow: 'hidden',
    marginTop: 8,
  },
  progressFill: { height: '100%', borderRadius: 999 },

  khiScrollView: { marginTop: 8 },
  khiRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 0 },
  khiCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    alignItems: 'center',
    minWidth: 140,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  khiIcon: { fontSize: 24, marginBottom: 6 },
  khiName: { color: '#64748B', fontSize: 13 },
  khiValue: { color: '#1E2937', fontSize: 26, fontWeight: '700', marginVertical: 6 },
  khiUnit: { color: '#94A3B8', fontSize: 12 },

  graphCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 16,
    marginTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },
  graphLegend: { flexDirection: 'row', gap: 16, marginBottom: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 12, height: 12, borderRadius: 6 },
  legendDash: { width: 24, height: 3, backgroundColor: '#3B82F6', borderRadius: 2 },
  legendText: { color: '#64748B', fontSize: 13 },

  chartWrap: { alignItems: 'center', marginVertical: 8 },
  chartNote: {
    backgroundColor: '#F0F9FF',
    padding: 12,
    borderRadius: 12,
    marginTop: 12,
  },
  chartNoteText: { color: '#1E40AF', fontSize: 13, lineHeight: 18 },

  explainCard: {
    backgroundColor: '#F8FAFC',
    padding: 16,
    borderRadius: 14,
    marginTop: 16,
  },
  explainTitle: { color: '#10B981', fontWeight: '700', fontSize: 13, textTransform: 'uppercase' },
  explainText: { color: '#475569', marginTop: 6, lineHeight: 18 },

  pastRecordsButton: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    backgroundColor: '#EFF6FF',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  pastRecordsButtonText: {
    color: '#1E40AF',
    fontWeight: '600',
    fontSize: 14,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
    padding: 0,
  },
  modalBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    maxHeight: '92%',
    paddingBottom: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: 2,
    borderBottomColor: '#F1F5F9',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 0.3,
    flex: 1,
    textAlign: 'center',
  },
  modalBackBtn: {
    padding: 8,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseBtn: {
    padding: 8,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBody: {
    maxHeight: '100%',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  modalEmptyText: {
    textAlign: 'center',
    color: '#94A3B8',
    fontSize: 16,
    marginTop: 60,
    fontWeight: '500',
  },
  pastRecordCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  pastRecordDate: {
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 14,
    fontSize: 16,
    letterSpacing: 0.2,
  },
  pastRecordGrid: {
    gap: 10,
  },
  pastRecordValue: {
    color: '#334155',
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#10B981',
    fontWeight: '500',
  },

  wydGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
  },
  emptyRecommendationsText: {
    color: '#64748B',
    fontSize: 14,
  },
  wydItem: {
    flex: 1,
    minWidth: '48%',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  wydIcon: { fontSize: 26, marginBottom: 8 },
  wydText: { color: '#475569', fontSize: 13, textAlign: 'center', fontWeight: '500' },
});

export default MyProgressPathScreen;