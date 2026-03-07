import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Line, Polyline, Circle, Text as SvgText } from "react-native-svg";
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
  if (!progressionObj) return "N/A";
  const pctRaw = progressionObj?.probability_percentage;
  if (pctRaw !== undefined && pctRaw !== null && String(pctRaw).trim() !== "") {
    const text = String(pctRaw).trim();
    return text.includes("%") ? text : `${text}%`;
  }
  const prob = Number(progressionObj?.probability);
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
  const [activeGraph, setActiveGraph] = useState("health");

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
    const width = 320;
    const height = 220;
    const padding = 32;
    const { points, predicted } = chartData;

    if (!points.length) {
      return { width, height, yTicks: [], bluePolyline: "", blueDots: [], redSegment: null, xLabels: [] };
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

  const probabilityChartData = useMemo(() => {
    if (!records.length) {
      return { points: [] };
    }

    const ordered = [...records].sort((a, b) => new Date(getRecordDate(a)) - new Date(getRecordDate(b)));

    const points = ordered
      .map((record) => {
        const nextVisitProgression =
          record?.progression_to_next_stage ||
          record?.prediction_with_us?.next_stage_progression ||
          record?.prediction_lab_only?.next_stage_progression ||
          null;

        const pctRaw = nextVisitProgression?.probability_percentage;
        let probabilityPercent = null;

        if (pctRaw !== undefined && pctRaw !== null && String(pctRaw).trim() !== "") {
          const parsedPct = Number(String(pctRaw).replace("%", "").trim());
          probabilityPercent = Number.isFinite(parsedPct) ? parsedPct : null;
        }

        if (!Number.isFinite(probabilityPercent)) {
          const prob = Number(nextVisitProgression?.probability);
          if (Number.isFinite(prob)) {
            probabilityPercent = prob <= 1 ? prob * 100 : prob;
          }
        }

        if (!Number.isFinite(probabilityPercent)) return null;

        const stage =
          record?.prediction_with_us?.predicted_stage ||
          record?.prediction_lab_only?.predicted_stage ||
          record?.prediction_with_us?.current_stage ||
          record?.prediction_lab_only?.current_stage ||
          null;

        const stageText = stage !== null && stage !== undefined && String(stage).trim() !== "" ? `S${stage}` : null;
        const contextText = stageText || "";

        return {
          xLabel: formatDateShort(getRecordDate(record)),
          y: Math.max(0, Math.min(100, probabilityPercent)),
          contextText,
        };
      })
      .filter(Boolean);

    return { points };
  }, [records]);

  const probabilityChart = useMemo(() => {
    const width = 320;
    const height = 220;
    const padding = 32;

    if (!probabilityChartData.points.length) {
      return { width, height, yTicks: [], polyline: "", dots: [], xLabels: [] };
    }

    const minY = 0;
    const maxY = 100;
    const yRange = maxY - minY;

    const totalCount = probabilityChartData.points.length;
    const xStep = totalCount > 1 ? (width - 2 * padding) / (totalCount - 1) : 0;

    const toX = (index) => padding + index * xStep;
    const toY = (value) => {
      const clamped = Math.max(minY, Math.min(maxY, Number(value)));
      return height - padding - ((clamped - minY) / yRange) * (height - 2 * padding);
    };

    const dots = probabilityChartData.points.map((p, i) => ({
      x: toX(i),
      y: toY(p.y),
      label: p.xLabel,
      value: p.y,
      contextText: p.contextText || "",
    }));
    const polyline = dots.map((p) => `${p.x},${p.y}`).join(" ");

    const yTicks = [0, 20, 40, 60, 80, 100].map((value) => ({ y: toY(value), value }));
    const xLabels = dots.map((p) => ({ x: p.x, text: p.label }));

    return { width, height, yTicks, polyline, dots, xLabels };
  }, [probabilityChartData]);

  const worseningDetected = useMemo(() => {
    const current = Number(chartData.latestActualEgfr);
    const predicted = Number(chartData?.predicted?.y);
    if (!Number.isFinite(current) || !Number.isFinite(predicted)) return false;

    const currentZone = getOutlookZone(current);
    const predictedZone = getOutlookZone(predicted);
    const zoneRank = { green: 4, yellow: 3, orange: 2, red: 1, unknown: 0 };

    const dropsDown = predicted < current;
    const dropsZone = zoneRank[predictedZone] < zoneRank[currentZone];
    return dropsDown || dropsZone;
  }, [chartData]);

  const riskIncreasing = useMemo(() => {
    const points = probabilityChartData.points;
    if (!points.length || points.length < 2) return false;
    const first = Number(points[0].y);
    const last = Number(points[points.length - 1].y);
    if (!Number.isFinite(first) || !Number.isFinite(last)) return false;
    return last > first;
  }, [probabilityChartData]);

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
      latest?.prediction_with_us?.predicted_stage ??
      latest?.prediction_lab_only?.predicted_stage ??
      null;
    if (stage === null) return null;
    const egfr = Number(latest?.inputs?.labs?.egfr ?? latest?.eGFR_info?.value ?? NaN);
    const zone = Number.isFinite(egfr) ? getOutlookZone(egfr) : "unknown";
    const stageColorMap = { green: "#34C759", yellow: "#F5A623", orange: "#FF9500", red: "#FF3B30", unknown: "#8E8E93" };
    return {
      stage,
      color: stageColorMap[zone] || "#8E8E93",
      egfr: Number.isFinite(egfr) ? egfr.toFixed(1) : null,
      visitDate: formatDateOnly(getRecordDate(latest)),
    };
  }, [records]);

  const healthGraphExplanation = useMemo(() => {
    const points = chartData.points || [];
    if (!points.length) {
      return "No health trend explanation available yet because there are no usable eGFR points.";
    }

    const first = Number(points[0]?.y);
    const last = Number(points[points.length - 1]?.y);
    const hasFirst = Number.isFinite(first);
    const hasLast = Number.isFinite(last);

    const visitText = `${points.length} recorded visit${points.length > 1 ? "s" : ""}`;

    let trendText = "Trend data is limited.";
    if (hasFirst && hasLast) {
      const delta = last - first;
      const direction = delta > 0 ? "increased" : delta < 0 ? "decreased" : "stayed stable";
      const absDelta = Math.abs(delta).toFixed(1);
      trendText =
        direction === "stayed stable"
          ? `eGFR stayed stable (${last.toFixed(1)} mL/min).`
          : `eGFR ${direction} by ${absDelta} mL/min (${first.toFixed(1)} -> ${last.toFixed(1)}).`;
    }

    const nextPrediction = chartData?.predicted;
    const predictionText = nextPrediction
      ? `Predicted next visit: Stage ${nextPrediction.stage || "N/A"}, eGFR ${Number(nextPrediction.y).toFixed(1)} mL/min${
          nextPrediction.probabilityText && nextPrediction.probabilityText !== "N/A"
            ? ` (${nextPrediction.probabilityText} progression probability)`
            : ""
        }.`
      : "No next-visit prediction is available from the current history.";

    const riskText = worseningDetected
      ? "This pattern suggests possible worsening and should be reviewed with your clinician."
      : "This pattern does not show clear worsening compared with the most recent point.";

    return `${visitText}. ${trendText} ${predictionText} ${riskText}`;
  }, [chartData, worseningDetected]);

  const probabilityGraphExplanation = useMemo(() => {
    const points = probabilityChartData.points || [];
    if (!points.length) {
      return "No probability explanation available yet because there are no progression-risk points.";
    }

    const first = Number(points[0]?.y);
    const last = Number(points[points.length - 1]?.y);
    const hasFirst = Number.isFinite(first);
    const hasLast = Number.isFinite(last);
    const latest = hasLast ? `${last.toFixed(1)}%` : "N/A";

    let movementText = "Risk movement cannot be determined yet.";
    if (hasFirst && hasLast) {
      const delta = last - first;
      const absDelta = Math.abs(delta).toFixed(1);
      if (delta > 0) movementText = `Risk increased by ${absDelta}% from first to latest reading.`;
      if (delta < 0) movementText = `Risk decreased by ${absDelta}% from first to latest reading.`;
      if (delta === 0) movementText = "Risk remained stable from first to latest reading.";
    }

    const directionText = riskIncreasing
      ? "Overall direction is upward, indicating higher progression pressure over time."
      : "Overall direction is not upward based on current points.";

    return `Latest progression risk is ${latest}. ${movementText} ${directionText}`;
  }, [probabilityChartData, riskIncreasing]);

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
        <Text style={styles.headerTitle}>My Progress Path</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Your Kidney Health Journey</Text>
          <Text style={styles.cardSub}>Patient: {userName || userEmail}</Text>
        </View>
        {latestStageInfo ? (
          <View style={styles.currentStageRow}>
            <View style={styles.currentStageLeft}>
              <Ionicons name="medical" size={18} color={latestStageInfo.color} />
              <Text style={styles.currentStageLabel}>Current CKD Stage</Text>
            </View>
            <View style={styles.currentStageRight}>
              <View style={[styles.currentStagePill, { backgroundColor: latestStageInfo.color }]}>
                <Text style={styles.currentStagePillText}>Stage {latestStageInfo.stage}</Text>
              </View>
              {latestStageInfo.egfr ? (
                <Text style={styles.currentStageEgfr}>eGFR {latestStageInfo.egfr} mL/min</Text>
              ) : null}
              <Text style={styles.currentStageDate}>as of {latestStageInfo.visitDate}</Text>
            </View>
          </View>
        ) : null}
           
        {!loading && !error ? (
          <View style={styles.segmentWrap}>
            <TouchableOpacity
              style={[styles.segmentButton, activeGraph === "health" && styles.segmentButtonActive]}
              onPress={() => setActiveGraph("health")}
              activeOpacity={0.8}
            >
              <Text style={[styles.segmentText, activeGraph === "health" && styles.segmentTextActive]}>Health Trend</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segmentButton, activeGraph === "probability" && styles.segmentButtonActive]}
              onPress={() => setActiveGraph("probability")}
              activeOpacity={0.8}
            >
              <Text style={[styles.segmentText, activeGraph === "probability" && styles.segmentTextActive]}>
                Probability Trend
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {loading ? (
          <ActivityIndicator size="large" color="#4A90E2" style={{ marginTop: 24 }} />
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : activeGraph === "health" && chartData.points.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>No usable Future CKD Stage history to draw graph yet.</Text>
          </View>
        ) : activeGraph === "probability" && probabilityChartData.points.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>No usable progression probabilities yet to draw probability graph.</Text>
          </View>
        ) : (
          <View style={styles.graphCard}>
            {activeGraph === "health" ? <Text style={styles.graphTitle}>Health Trend</Text> : null}

            {activeGraph === "probability" ? <Text style={styles.graphTitle}>Risk Probability Trend</Text> : null}

            
             

            {activeGraph === "health" ? (
              <Svg width={chart.width} height={chart.height}>
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

                <Line x1={32} y1={chart.height - 32} x2={chart.width - 24} y2={chart.height - 32} stroke="#CBD5E1" strokeWidth="1" />
                <Line x1={32} y1={20} x2={32} y2={chart.height - 32} stroke="#CBD5E1" strokeWidth="1" />

                {chart.yTicks.map((tick, idx) => (
                  <React.Fragment key={`yt-${idx}`}>
                    <Line x1={28} y1={tick.y} x2={chart.width - 24} y2={tick.y} stroke="#EEF2F7" strokeWidth="1" />
                    <SvgText x={4} y={tick.y + 4} fontSize="10" fill="#64748B">
                      {tick.value}
                    </SvgText>
                  </React.Fragment>
                ))}

                {chart.bluePolyline ? (
                  <Polyline
                    points={chart.bluePolyline}
                    fill="none"
                    stroke="#3B82F6"
                    strokeWidth="3"
                  />
                ) : null}

                {chart.blueDots.map((dot, idx) => (
                  <React.Fragment key={`bd-${idx}`}>
                    <Circle cx={dot.x} cy={dot.y} r="4" fill="#2563EB" />
                    {dot.stage !== null && dot.stage !== undefined ? (
                      <SvgText
                        x={dot.x}
                        y={dot.y - 9}
                        fontSize="10"
                        fontWeight="700"
                        fill="#1D4ED8"
                        textAnchor="middle"
                      >
                        {`S${dot.stage}`}
                      </SvgText>
                    ) : null}
                  </React.Fragment>
                ))}

                {chart.redSegment ? (
                  <>
                    <Line
                      x1={chart.redSegment.fromX}
                      y1={chart.redSegment.fromY}
                      x2={chart.redSegment.toX}
                      y2={chart.redSegment.toY}
                      stroke="#EF4444"
                      strokeWidth="3"
                      strokeDasharray="6,6"
                    />
                    <Circle cx={chart.redSegment.toX} cy={chart.redSegment.toY} r="4" fill="#DC2626" />
                    {chart.redSegment.stage ? (
                      <SvgText
                        x={chart.redSegment.toX}
                        y={chart.redSegment.toY - 9}
                        fontSize="10"
                        fontWeight="700"
                        fill="#B91C1C"
                        textAnchor="middle"
                      >
                        {`S${chart.redSegment.stage}`}
                      </SvgText>
                    ) : null}
                    {chart.redSegment.probabilityText && chart.redSegment.probabilityText !== "N/A" ? (
                      <SvgText
                        x={chart.redSegment.midX + 4}
                        y={chart.redSegment.midY - 6}
                        fontSize="10"
                        fill="#B91C1C"
                        fontWeight="700"
                      >
                        {chart.redSegment.probabilityText}
                      </SvgText>
                    ) : null}
                  </>
                ) : null}

                {chart.xLabels.map((label, idx) => (
                  <SvgText key={`xl-${idx}`} x={label.x - 8} y={chart.height - 10} fontSize="10" fill="#64748B">
                    {label.text}
                  </SvgText>
                ))}
              </Svg>
            ) : null}

            {activeGraph === "probability" ? (
              <Svg width={probabilityChart.width} height={probabilityChart.height}>
                <Line
                  x1={32}
                  y1={probabilityChart.height - 32}
                  x2={probabilityChart.width - 24}
                  y2={probabilityChart.height - 32}
                  stroke="#CBD5E1"
                  strokeWidth="1"
                />
                <Line x1={32} y1={20} x2={32} y2={probabilityChart.height - 32} stroke="#CBD5E1" strokeWidth="1" />

                {probabilityChart.yTicks.map((tick, idx) => (
                  <React.Fragment key={`pt-${idx}`}>
                    <Line x1={28} y1={tick.y} x2={probabilityChart.width - 24} y2={tick.y} stroke="#EEF2F7" strokeWidth="1" />
                    <SvgText x={2} y={tick.y + 4} fontSize="10" fill="#64748B">
                      {`${tick.value}%`}
                    </SvgText>
                  </React.Fragment>
                ))}

                {probabilityChart.polyline ? (
                  <Polyline
                    points={probabilityChart.polyline}
                    fill="none"
                    stroke="#DC2626"
                    strokeWidth="3"
                    strokeDasharray="6,6"
                  />
                ) : null}

                {probabilityChart.dots.map((dot, idx) => (
                  <React.Fragment key={`pd-${idx}`}>
                    <Circle cx={dot.x} cy={dot.y} r="4" fill="#B91C1C" />
                    <SvgText x={dot.x} y={dot.y - 10} fontSize="10" fill="#991B1B" fontWeight="700" textAnchor="middle">
                      {`${dot.value.toFixed(1)}%`}
                    </SvgText>
                    {dot.contextText ? (
                      <SvgText x={dot.x} y={dot.y + 13} fontSize="9" fill="#7F1D1D" fontWeight="600" textAnchor="middle">
                        {dot.contextText}
                      </SvgText>
                    ) : null}
                  </React.Fragment>
                ))}

                {probabilityChart.xLabels.map((label, idx) => (
                  <SvgText key={`pxl-${idx}`} x={label.x - 10} y={probabilityChart.height - 10} fontSize="10" fill="#64748B">
                    {label.text}
                  </SvgText>
                ))}
              </Svg>
            ) : null}

            {activeGraph === "health" ? (
              <View style={styles.legendRow}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: "#2563EB" }]} />
                  <Text style={styles.legendText}>Past visits</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: "#DC2626" }]} />
                  <Text style={styles.legendText}>Predicted next visit</Text>
                </View>
              </View>
            ) : (
              <View style={styles.legendRow}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: "#B91C1C" }]} />
                  <Text style={styles.legendText}>Progression probability by date</Text>
                </View>
              </View>
            )}

            {activeGraph === "health" ? (
              <View style={styles.zoneLegendWrap}>
                <Text style={styles.zoneLegendTitle}>eGFR Ranges</Text>
                <Text style={styles.zoneLine}>Green (90+): Stable and healthy</Text>
                <Text style={styles.zoneLine}>Yellow (60-89): Monitor closely</Text>
                <Text style={styles.zoneLine}>Orange (30-59): Increased risk</Text>
                <Text style={styles.zoneLine}>Red (0-30): Action required</Text>
              </View>
            ) : (
              <View style={styles.riskInfoBox}>
                <Text style={styles.zoneLegendTitle}>Risk Guide</Text>
                <Text style={styles.riskInfoText}>Y-axis is progression probability (%).</Text>
                <Text style={styles.riskInfoText}>X-axis is visit date.</Text>
                <Text style={styles.riskInfoText}>Each point also shows Stage for that visit.</Text>
                <Text style={styles.riskInfoText}>Red dotted line shows risk movement over time.</Text>
              </View>
            )}

            <View style={styles.explainCard}>
              <Text style={styles.explainTitle}>
                {activeGraph === "health" ? "Health Trend Explanation" : "Probability Trend Explanation"}
              </Text>
              <Text style={styles.explainText}>
                {activeGraph === "health" ? healthGraphExplanation : probabilityGraphExplanation}
              </Text>
            </View>

            
            {activeGraph === "probability" && riskIncreasing ? (
              <View style={styles.worseningBanner}>
                <Ionicons name="trending-up" size={16} color="#B91C1C" />
                <Text style={styles.worseningText}>Risk Probability Increasing</Text>
              </View>
            ) : null}

            <View style={styles.tableWrap}>
              <Text style={styles.tableTitle}>Visit Progression History</Text>
              {progressionRows.map((row) => (
                <View key={`row-${row.visitNumber}-${row.visitDate}`} style={styles.historyCard}>
                  <View style={styles.historyCardTop}>
                    <Text style={styles.visitBadge}>{`Visit #${row.visitNumber}`}</Text>
                    <Text style={styles.historyDate}>{row.visitDate}</Text>
                  </View>

                  <View style={styles.stageFlowRow}>
                    <View style={styles.stagePill}>
                      <Text style={styles.stagePillLabel}>Current</Text>
                      <Text style={styles.stagePillValue}>{`S${row.currentStage}`}</Text>
                    </View>
                    <Ionicons name="arrow-forward" size={16} color="#94A3B8" />
                    <View style={styles.stagePillNext}>
                      <Text style={styles.stagePillLabel}>Next</Text>
                      <Text style={styles.stagePillValue}>{`S${row.nextStage}`}</Text>
                    </View>
                  </View>

                  <View style={styles.metricsRow}>
                    <View style={styles.metricBox}>
                      <Text style={styles.metricLabel}>Current History</Text>
                      <Text style={styles.metricValue}>{row.currentHistoryProbability}</Text>
                    </View>
                    <View style={styles.metricBox}>
                      <Text style={styles.metricLabel}>Next 6-Month</Text>
                      <Text style={styles.metricValue}>{row.sixMonthProbability}</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
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
    paddingTop: StatusBar.currentHeight || 0,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 10,
    paddingBottom: 16,
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
  content: {
    padding: 24,
    gap: 12,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  cardSub: {
    marginTop: 4,
    fontSize: 13,
    color: "#6B7280",
  },
  cardDesc: {
    marginTop: 10,
    fontSize: 13,
    color: "#374151",
    lineHeight: 19,
  },
  segmentWrap: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    padding: 4,
    gap: 6,
  },
  segmentButton: {
    flex: 1,
    borderRadius: 9,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
  },
  segmentButtonActive: {
    backgroundColor: "#1D4ED8",
  },
  segmentText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
  },
  segmentTextActive: {
    color: "#FFFFFF",
  },
  graphCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
  },
  graphTitle: {
    alignSelf: "flex-start",
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 8,
  },
  currentStageRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
    gap: 8,
  },
  currentStageLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  currentStageLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
  },
  currentStageRight: {
    alignItems: "flex-end",
    gap: 3,
  },
  currentStagePill: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 20,
  },
  currentStagePillText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  currentStageEgfr: {
    fontSize: 11,
    color: "#6B7280",
    fontWeight: "600",
  },
  currentStageDate: {
    fontSize: 11,
    color: "#9CA3AF",
  },
  legendRow: {
    marginTop: 8,
    flexDirection: "row",
    gap: 18,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 12,
    color: "#475569",
  },
  zoneLegendWrap: {
    width: "100%",
    marginTop: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    gap: 4,
  },
  zoneLegendTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 2,
  },
  zoneLine: {
    fontSize: 11,
    color: "#475569",
  },
  riskInfoBox: {
    width: "100%",
    marginTop: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 10,
    backgroundColor: "#FEF2F2",
    gap: 4,
  },
  riskInfoText: {
    fontSize: 11,
    color: "#7F1D1D",
  },
  explainCard: {
    width: "100%",
    marginTop: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    backgroundColor: "#F9FAFB",
    gap: 6,
  },
  explainTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#111827",
  },
  explainText: {
    fontSize: 12,
    lineHeight: 18,
    color: "#374151",
  },
  worseningBanner: {
    width: "100%",
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 9,
    paddingHorizontal: 10,
    backgroundColor: "#FEE2E2",
    borderWidth: 1,
    borderColor: "#FCA5A5",
    borderRadius: 10,
  },
  worseningText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#B91C1C",
  },
  tableWrap: {
    marginTop: 14,
    width: "100%",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    paddingTop: 12,
  },
  tableTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 8,
  },
  historyCard: {
    marginTop: 10,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  historyCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  visitBadge: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1D4ED8",
    backgroundColor: "#DBEAFE",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  historyDate: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "600",
  },
  stageFlowRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  stagePill: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  stagePillNext: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  stagePillLabel: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: "600",
  },
  stagePillValue: {
    marginTop: 2,
    fontSize: 14,
    color: "#111827",
    fontWeight: "800",
  },
  metricsRow: {
    flexDirection: "row",
    gap: 8,
  },
  metricBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  metricLabel: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: "600",
  },
  metricValue: {
    marginTop: 2,
    fontSize: 14,
    color: "#0F172A",
    fontWeight: "800",
  },
  emptyBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  emptyText: {
    color: "#6B7280",
    fontSize: 13,
  },
  errorText: {
    color: "#EF4444",
    textAlign: "center",
    marginTop: 24,
  },
});

export default MyProgressPathScreen;
