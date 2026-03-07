import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Dimensions,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import Svg, { Line, Circle, Rect } from "react-native-svg";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "../api/axiosConfig";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const GRAPH_HEIGHT = 200;
const GRAPH_PADDING = 40;
const GRAPH_WIDTH = SCREEN_WIDTH - 60;

// Colors for 5 core SHAP features
const SHAP_COLORS = {
  age: "#9B59B6",
  gender: "#747D8C",
  bp_systolic: "#FF4757",
  bp_diastolic: "#FFA502",
  hba1c_level: "#3B71F3",
};
const SHAP_LABELS = {
  age: "Age",
  gender: "Gender",
  bp_systolic: "BP Systolic",
  bp_diastolic: "BP Diastolic",
  hba1c_level: "HbA1c",
};

const RiskHistoryScreen = ({ route }) => {
  // Resolve actual user ID from route params or AsyncStorage
  const paramUserId = route?.params?.userId || route?.params?.userID;
  const [userId, setUserId] = useState(paramUserId || null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [records, setRecords] = useState([]);
  const [trendAnalysis, setTrendAnalysis] = useState(null);
  const [shapTrends, setShapTrends] = useState(null);
  const [activeShapFeatures, setActiveShapFeatures] = useState({});
  const [error, setError] = useState(null);

  // Keep userId in sync when route params change (e.g. different user logs in)
  useEffect(() => {
    const newParamId = route?.params?.userId || route?.params?.userID;
    if (newParamId && newParamId !== userId) {
      setUserId(newParamId);
    }
  }, [route?.params?.userId, route?.params?.userID]);

  // Resolve userId from AsyncStorage if not in route params
  useEffect(() => {
    const resolveUserId = async () => {
      if (!userId) {
        const storedId = await AsyncStorage.getItem("userID");
        if (storedId) setUserId(storedId);
      }
    };
    resolveUserId();
  }, []);

  const fetchRiskHistory = useCallback(async () => {
    if (!userId) return; // Wait until userId is resolved
    try {
      setError(null);
      const response = await axios.get(`/risk-history/history/${userId}`);
      setRecords(response.data.records);
      setTrendAnalysis(response.data.trendAnalysis);
      setShapTrends(response.data.shapTrends || null);
    } catch (err) {
      console.error("Error fetching risk history:", err);
      setError("Failed to load risk history. Please try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchRiskHistory();
  }, [fetchRiskHistory]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchRiskHistory();
  }, [fetchRiskHistory]);

  // Get the trend icon and color based on trend type
  const getTrendStyle = (trend) => {
    switch (trend) {
      case "increasing":
        return {
          icon: "📈",
          color: "#FF4757",
          bgColor: "#FFE8EA",
          label: "INCREASING",
        };
      case "decreasing":
        return {
          icon: "📉",
          color: "#2ED573",
          bgColor: "#E8FFF0",
          label: "DECREASING",
        };
      case "steady":
        return {
          icon: "➡️",
          color: "#FFA502",
          bgColor: "#FFF5E6",
          label: "STEADY",
        };
      default:
        return {
          icon: "📊",
          color: "#747D8C",
          bgColor: "#F1F2F6",
          label: "NO DATA",
        };
    }
  };

  // Render the custom graph
  const renderGraph = () => {
    if (
      !trendAnalysis ||
      !trendAnalysis.dataPoints ||
      trendAnalysis.dataPoints.length < 1
    ) {
      return (
        <View style={styles.noDataContainer}>
          <Text style={styles.noDataIcon}>📊</Text>
          <Text style={styles.noDataText}>No risk data recorded yet</Text>
          <Text style={styles.noDataSubText}>
            Make predictions monthly to see your trend
          </Text>
        </View>
      );
    }

    const { dataPoints, regressionLine, slope } = trendAnalysis;

    // Extend Y-axis range to show full 0-100 scale for better visualization
    const maxY = 100;
    const minY = 0;
    const yRange = maxY - minY;

    // Scale functions
    const scaleX = (x) =>
      GRAPH_PADDING +
      (x / (dataPoints.length - 1 || 1)) * (GRAPH_WIDTH - GRAPH_PADDING * 2);
    const scaleY = (y) =>
      GRAPH_HEIGHT -
      GRAPH_PADDING -
      ((y - minY) / yRange) * (GRAPH_HEIGHT - GRAPH_PADDING * 2);

    const trendStyle = getTrendStyle(trendAnalysis.trend);

    return (
      <View style={styles.graphContainer}>
        {/* Graph Title */}
        <Text style={styles.graphTitle}>Risk Score Trend</Text>

        {/* Y-axis labels */}
        <View style={styles.yAxisLabels}>
          <Text style={styles.axisLabel}>100</Text>
          <Text style={styles.axisLabel}>50</Text>
          <Text style={styles.axisLabel}>0</Text>
        </View>

        {/* Graph Area */}
        <View style={styles.graphArea}>
          {/* Grid lines with risk zone colors */}
          <View
            style={[styles.gridLine, { top: "0%", borderColor: "#FFE8EA" }]}
          />
          <View
            style={[
              styles.gridLine,
              { top: "33.33%", borderColor: "#FFF5E6", borderWidth: 1.5 },
            ]}
          />
          <View
            style={[
              styles.gridLine,
              { top: "66.67%", borderColor: "#E8FFF0", borderWidth: 1.5 },
            ]}
          />
          <View
            style={[styles.gridLine, { top: "100%", borderColor: "#E8FFF0" }]}
          />

          {/* Risk zone labels */}
          <Text
            style={[styles.riskZoneLabel, { top: "10%", color: "#FF4757" }]}
          >
            High Risk
          </Text>
          <Text
            style={[styles.riskZoneLabel, { top: "45%", color: "#FFA502" }]}
          >
            Medium Risk
          </Text>
          <Text
            style={[styles.riskZoneLabel, { top: "80%", color: "#2ED573" }]}
          >
            Low Risk
          </Text>

          {/* Best-fit Regression Line (Straight Line) */}
          {regressionLine && regressionLine.length >= 2 && (
            <Svg
              height={GRAPH_HEIGHT}
              width={GRAPH_WIDTH}
              style={styles.svgContainer}
            >
              <Line
                x1={scaleX(regressionLine[0].x)}
                y1={scaleY(regressionLine[0].y)}
                x2={scaleX(regressionLine[regressionLine.length - 1].x)}
                y2={scaleY(regressionLine[regressionLine.length - 1].y)}
                stroke={trendStyle.color}
                strokeWidth="3"
                strokeDasharray="8,4"
              />
            </Svg>
          )}

          {/* Connect points with smooth line using SVG */}
          {dataPoints.length > 1 && (
            <Svg
              height={GRAPH_HEIGHT}
              width={GRAPH_WIDTH}
              style={styles.svgContainer}
            >
              {dataPoints.slice(0, -1).map((point, index) => {
                const nextPoint = dataPoints[index + 1];
                return (
                  <Line
                    key={`line-${index}`}
                    x1={scaleX(point.x)}
                    y1={scaleY(point.y)}
                    x2={scaleX(nextPoint.x)}
                    y2={scaleY(nextPoint.y)}
                    stroke="#3B71F3"
                    strokeWidth="2.5"
                  />
                );
              })}

              {/* Data Points as SVG Circles */}
              {dataPoints.map((point, index) => (
                <Circle
                  key={`point-${index}`}
                  cx={scaleX(point.x)}
                  cy={scaleY(point.y)}
                  r="6"
                  fill="#3B71F3"
                  stroke="#FFF"
                  strokeWidth="2"
                />
              ))}
            </Svg>
          )}

          {/* SHAP feature contribution lines (toggleable) */}
          {shapTrends && dataPoints.length > 1 && (
            <Svg
              height={GRAPH_HEIGHT}
              width={GRAPH_WIDTH}
              style={styles.svgContainer}
            >
              {Object.keys(SHAP_COLORS).map((feat) => {
                if (!activeShapFeatures[feat] || !shapTrends[feat]?.hasData)
                  return null;
                const vals = shapTrends[feat].values;
                if (!vals || vals.length < 2) return null;

                // Scale SHAP values to graph Y range (they are small decimals, normalize to 0-100 for display)
                const absMax = Math.max(...vals.map(Math.abs), 0.001);
                const scaledVals = vals.map((v) => 50 + (v / absMax) * 40); // Center at 50, ±40 range

                return scaledVals
                  .slice(0, -1)
                  .map((y, idx) => (
                    <Line
                      key={`shap-${feat}-${idx}`}
                      x1={scaleX(idx)}
                      y1={scaleY(scaledVals[idx])}
                      x2={scaleX(idx + 1)}
                      y2={scaleY(scaledVals[idx + 1])}
                      stroke={SHAP_COLORS[feat]}
                      strokeWidth="1.5"
                      strokeDasharray="4,3"
                      opacity={0.8}
                    />
                  ));
              })}
            </Svg>
          )}

          {/* Tooltips for data points */}
          {dataPoints.map((point, index) => (
            <View
              key={`tooltip-${index}`}
              style={[
                styles.dataPointTooltip,
                {
                  left: scaleX(point.x) - 20,
                  top: scaleY(point.y) - 35,
                },
              ]}
            >
              <Text style={styles.tooltipText}>{point.y.toFixed(1)}</Text>
            </View>
          ))}
        </View>

        {/* X-axis labels */}
        <View style={styles.xAxisLabels}>
          {dataPoints.map((point, index) => (
            <Text key={index} style={styles.xAxisLabel}>
              {getShortMonth(point.month)}
            </Text>
          ))}
        </View>

        {/* Legend */}
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View
              style={[styles.legendColor, { backgroundColor: "#3B71F3" }]}
            />
            <Text style={styles.legendText}>Actual Risk Score</Text>
          </View>
          <View style={styles.legendItem}>
            <View
              style={[
                styles.legendColorDashed,
                { borderColor: trendStyle.color },
              ]}
            />
            <Text style={styles.legendText}>Best-Fit Line (y=mx+c)</Text>
          </View>
        </View>

        {/* SHAP Feature Toggle Legend */}
        {shapTrends && Object.keys(shapTrends).length > 0 && (
          <View style={styles.shapToggleContainer}>
            <Text style={styles.shapToggleTitle}>
              Feature Contributions (tap to show/hide):
            </Text>
            <View style={styles.shapToggleRow}>
              {Object.keys(SHAP_COLORS).map((feat) => (
                <TouchableOpacity
                  key={feat}
                  style={[
                    styles.shapToggleBtn,
                    {
                      borderColor: SHAP_COLORS[feat],
                      backgroundColor: activeShapFeatures[feat]
                        ? SHAP_COLORS[feat] + "20"
                        : "transparent",
                    },
                  ]}
                  onPress={() =>
                    setActiveShapFeatures((prev) => ({
                      ...prev,
                      [feat]: !prev[feat],
                    }))
                  }
                >
                  <View
                    style={[
                      styles.shapToggleDot,
                      { backgroundColor: SHAP_COLORS[feat] },
                    ]}
                  />
                  <Text
                    style={[
                      styles.shapToggleText,
                      { color: SHAP_COLORS[feat] },
                    ]}
                  >
                    {SHAP_LABELS[feat]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Equation Display */}
        {trendAnalysis.equation && (
          <View style={styles.equationContainer}>
            <Text style={styles.equationText}>📐 {trendAnalysis.equation}</Text>
            <Text style={styles.slopeText}>
              Slope: {slope > 0 ? "+" : ""}
              {slope.toFixed(4)}
              {slope > 0 ? " ⬆️" : slope < 0 ? " ⬇️" : " ➡️"}
            </Text>
            <Text style={styles.r2Text}>
              R² shows correlation strength (closer to 1.0 = better fit)
            </Text>
          </View>
        )}
      </View>
    );
  };

  // Render trend card
  const renderTrendCard = () => {
    if (!trendAnalysis) return null;

    const trendStyle = getTrendStyle(trendAnalysis.trend);

    return (
      <View style={[styles.trendCard, { backgroundColor: trendStyle.bgColor }]}>
        <View style={styles.trendHeader}>
          <Text style={styles.trendIcon}>{trendStyle.icon}</Text>
          <View style={styles.trendInfo}>
            <Text style={[styles.trendLabel, { color: trendStyle.color }]}>
              {trendStyle.label}
            </Text>
            <Text style={styles.trendDescription}>
              {trendAnalysis.trendDescription}
            </Text>
          </View>
        </View>

        {/* Slope Indicator */}
        {trendAnalysis.slope !== undefined &&
          trendAnalysis.trend !== "no_data" && (
            <View style={styles.slopeIndicator}>
              <Text style={styles.slopeLabel}>Slope Analysis:</Text>
              <Text style={[styles.slopeValue, { color: trendStyle.color }]}>
                m = {trendAnalysis.slope > 0 ? "+" : ""}
                {trendAnalysis.slope.toFixed(4)}
                {trendAnalysis.slope > 0
                  ? " (Risk Increasing ⬆️)"
                  : trendAnalysis.slope < 0
                    ? " (Risk Decreasing ⬇️)"
                    : " (Risk Steady ➡️)"}
              </Text>
            </View>
          )}
      </View>
    );
  };

  // Generate personalized graph explanation — works with or without SHAP data
  const renderShapExplanation = () => {
    if (!trendAnalysis || !records || records.length === 0) return null;

    const { dataPoints, slope } = trendAnalysis;
    if (!dataPoints || dataPoints.length === 0) return null;

    // Use all records for graph-based analysis
    const sortedRecords = [...records].sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.month - b.month;
    });
    const firstRecord = sortedRecords[0];
    const latestRecord = sortedRecords[sortedRecords.length - 1];
    const hasMultiple = sortedRecords.length > 1;
    const latestScore = latestRecord.riskScore?.toFixed(1) || "N/A";
    const latestRisk = latestRecord.riskLevel || "Unknown";
    const riskColor = getRiskColor(latestRisk);

    // Check if SHAP data exists
    const shapRecords = sortedRecords.filter(
      (r) => r.shapValues && r.shapValues.age !== undefined,
    );
    const hasShap = shapRecords.length > 0;
    const latestShap = hasShap ? shapRecords[shapRecords.length - 1] : null;

    // Graph direction from slope
    const graphDirection =
      slope > 0.5 ? "rising" : slope < -0.5 ? "falling" : "stable";

    // Build graph trajectory summary (always works — uses scores)
    const buildGraphSummary = () => {
      if (!hasMultiple) {
        return `You have 1 recorded prediction with a risk score of ${latestScore} (${latestRisk}). Track more months to see your trend.`;
      }
      const firstScore = firstRecord.riskScore?.toFixed(1) || "N/A";
      const firstRisk = firstRecord.riskLevel || "Unknown";
      const months = sortedRecords.length;
      if (graphDirection === "rising") {
        return `Over ${months} months, your graph shows risk rising from ${firstScore} (${firstRisk}) to ${latestScore} (${latestRisk}). Here's what we found:`;
      } else if (graphDirection === "falling") {
        return `Over ${months} months, your graph shows risk declining from ${firstScore} (${firstRisk}) to ${latestScore} (${latestRisk}). Great progress!`;
      }
      return `Over ${months} months, your risk has remained relatively stable around ${latestScore} (${latestRisk}).`;
    };

    // Detect biggest month-over-month score jump (works without SHAP)
    let biggestJump = null;
    if (sortedRecords.length >= 2) {
      let maxScoreChange = 0;
      for (let i = 1; i < sortedRecords.length; i++) {
        const prev = sortedRecords[i - 1];
        const curr = sortedRecords[i];
        const scoreDelta = Math.abs(
          (curr.riskScore || 0) - (prev.riskScore || 0),
        );
        if (scoreDelta > maxScoreChange && scoreDelta > 2) {
          maxScoreChange = scoreDelta;
          // If both records have SHAP, find the feature that caused the jump
          let topCause = null;
          if (
            prev.shapValues?.age !== undefined &&
            curr.shapValues?.age !== undefined
          ) {
            const shapDeltas = Object.keys(SHAP_COLORS)
              .map((key) => ({
                key,
                label: SHAP_LABELS[key],
                color: SHAP_COLORS[key],
                delta:
                  (curr.shapValues[key] || 0) - (prev.shapValues[key] || 0),
              }))
              .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
            topCause = shapDeltas[0];
          }
          biggestJump = {
            fromMonth: getShortMonth(prev.month),
            toMonth: getShortMonth(curr.month),
            fromScore: prev.riskScore?.toFixed(1),
            toScore: curr.riskScore?.toFixed(1),
            direction:
              (curr.riskScore || 0) > (prev.riskScore || 0) ? "up" : "down",
            topCause,
          };
        }
      }
    }

    // Analyze vital signs from records for non-SHAP explanation
    const buildVitalInsights = () => {
      const insights = [];
      const latest = latestRecord.vitalSigns;
      if (!latest) return insights;

      if (latest.bpSystolic >= 140 || latest.bpDiastolic >= 90) {
        insights.push({
          icon: "🔴",
          color: "#FF4757",
          text: `Your blood pressure (${latest.bpSystolic || "?"}/${latest.bpDiastolic || "?"}mmHg) is in the high range — this is a major risk factor for kidney disease.`,
          advice:
            "Reduce salt intake, stay active, and follow your prescribed BP medication.",
        });
      } else if (latest.bpSystolic >= 120 || latest.bpDiastolic >= 80) {
        insights.push({
          icon: "🟡",
          color: "#FFA502",
          text: `Your blood pressure (${latest.bpSystolic || "?"}/${latest.bpDiastolic || "?"}mmHg) is slightly elevated.`,
          advice: "Monitor regularly and maintain a healthy lifestyle.",
        });
      } else if (latest.bpSystolic) {
        insights.push({
          icon: "🟢",
          color: "#2ED573",
          text: `Your blood pressure (${latest.bpSystolic}/${latest.bpDiastolic}mmHg) is in a healthy range.`,
          advice: "Keep maintaining your current routine!",
        });
      }

      if (latest.hba1cLevel || latest.hba1cLevel === 0) {
        const hba1c = latest.hba1cLevel;
        if (hba1c >= 6.5) {
          insights.push({
            icon: "🔴",
            color: "#FF4757",
            text: `Your HbA1c is ${hba1c}% (diabetic range) — elevated blood sugar accelerates kidney damage.`,
            advice: "Focus on diet control and blood sugar monitoring.",
          });
        } else if (hba1c >= 5.7) {
          insights.push({
            icon: "🟡",
            color: "#FFA502",
            text: `Your HbA1c is ${hba1c}% (pre-diabetic range).`,
            advice:
              "Consider dietary changes to prevent progression to diabetes.",
          });
        } else {
          insights.push({
            icon: "🟢",
            color: "#2ED573",
            text: `Your HbA1c is ${hba1c}% (normal range).`,
            advice: "Your blood sugar is well controlled — keep it up!",
          });
        }
      }

      if (latest.age >= 60) {
        insights.push({
          icon: "ℹ️",
          color: "#747D8C",
          text: `Age (${latest.age}) is a non-modifiable factor that contributes to kidney risk.`,
          advice:
            "Focus on the factors you can control: BP, blood sugar, and diet.",
        });
      }

      return insights;
    };

    // SHAP-based feature analysis (only if SHAP data exists)
    const shapFeatures = hasShap
      ? Object.keys(SHAP_COLORS)
          .map((key) => ({
            key,
            label: SHAP_LABELS[key],
            value: latestShap.shapValues[key] || 0,
            color: SHAP_COLORS[key],
          }))
          .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
      : [];

    const adviceMap = {
      bp_systolic:
        "Focus on blood pressure management — reduce salt intake, stay active, and follow your medication.",
      bp_diastolic:
        "Discuss with your doctor about optimizing your BP control.",
      hba1c_level:
        "Managing diet and monitoring glucose regularly can help reduce this.",
      age: "Age is non-modifiable. Focus on diet, BP, and blood sugar.",
      gender: "Gender plays a minor role. Focus on modifiable health factors.",
    };

    const vitalInsights = !hasShap ? buildVitalInsights() : [];

    return (
      <View style={styles.explanationCard}>
        <Text style={styles.explanationTitle}>🧠 Your Graph Explained</Text>
        <Text style={styles.explanationSubtitle}>
          {hasShap
            ? `AI-powered analysis of your ${sortedRecords.length}-month risk trajectory`
            : `Analysis of your ${sortedRecords.length}-month risk trajectory`}
        </Text>

        {/* Graph trajectory summary — always shows */}
        <View style={styles.explanationSection}>
          <View style={styles.explanationSectionHeader}>
            <Text style={styles.explanationSectionIcon}>📊</Text>
            <Text
              style={[styles.explanationSectionTitle, { color: riskColor }]}
            >
              {graphDirection === "rising"
                ? "Risk Trend: Increasing"
                : graphDirection === "falling"
                  ? "Risk Trend: Improving"
                  : "Risk Trend: Stable"}
            </Text>
          </View>
          <Text style={styles.explanationText}>{buildGraphSummary()}</Text>
          {hasMultiple && (
            <Text
              style={[
                styles.explanationText,
                { color: "#666", fontStyle: "italic" },
              ]}
            >
              Slope (m) = {slope > 0 ? "+" : ""}
              {slope?.toFixed(4)} per month
            </Text>
          )}
        </View>

        {/* SHAP-based risk drivers (when SHAP data exists) */}
        {hasShap && (
          <View style={styles.explanationSection}>
            <View style={styles.explanationSectionHeader}>
              <Text style={styles.explanationSectionIcon}>🎯</Text>
              <Text
                style={[styles.explanationSectionTitle, { color: "#1C1C1E" }]}
              >
                AI Risk Drivers (Latest Prediction)
              </Text>
            </View>
            {shapFeatures.map((f) => {
              const isPositive = f.value > 0.005;
              const isNegative = f.value < -0.005;
              return (
                <View key={f.key} style={styles.explanationFactorRow}>
                  <View
                    style={[
                      styles.explanationDot,
                      { backgroundColor: f.color },
                    ]}
                  />
                  <View style={styles.explanationFactorContent}>
                    <Text style={styles.explanationFactorName}>
                      {f.label}{" "}
                      <Text
                        style={{
                          color: isPositive
                            ? "#FF4757"
                            : isNegative
                              ? "#2ED573"
                              : "#FFA502",
                          fontSize: 11,
                        }}
                      >
                        ({f.value > 0 ? "+" : ""}
                        {f.value.toFixed(3)})
                      </Text>
                    </Text>
                    <Text style={styles.explanationFactorAdvice}>
                      {isPositive
                        ? `Pushing risk higher. ${adviceMap[f.key] || ""}`
                        : isNegative
                          ? "Reducing your risk — keep it up!"
                          : "Minimal impact on your risk."}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Vital signs–based insights (fallback when no SHAP data) */}
        {!hasShap && vitalInsights.length > 0 && (
          <View style={styles.explanationSection}>
            <View style={styles.explanationSectionHeader}>
              <Text style={styles.explanationSectionIcon}>🩺</Text>
              <Text
                style={[styles.explanationSectionTitle, { color: "#1C1C1E" }]}
              >
                Key Health Factors From Your Data
              </Text>
            </View>
            {vitalInsights.map((insight, idx) => (
              <View key={idx} style={styles.explanationFactorRow}>
                <Text style={{ fontSize: 14, marginRight: 10, marginTop: 2 }}>
                  {insight.icon}
                </Text>
                <View style={styles.explanationFactorContent}>
                  <Text style={styles.explanationFactorName}>
                    {insight.text}
                  </Text>
                  <Text style={styles.explanationFactorAdvice}>
                    {insight.advice}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Biggest score jump — always works */}
        {biggestJump && (
          <View style={[styles.explanationSection, styles.explanationJumpBox]}>
            <View style={styles.explanationSectionHeader}>
              <Text style={styles.explanationSectionIcon}>⚡</Text>
              <Text
                style={[
                  styles.explanationSectionTitle,
                  {
                    color:
                      biggestJump.direction === "up" ? "#FF4757" : "#2ED573",
                  },
                ]}
              >
                Biggest Change: {biggestJump.fromMonth} → {biggestJump.toMonth}
              </Text>
            </View>
            <Text style={styles.explanationText}>
              Your score {biggestJump.direction === "up" ? "jumped" : "dropped"}{" "}
              from{" "}
              <Text style={{ fontWeight: "bold" }}>
                {biggestJump.fromScore}
              </Text>{" "}
              to{" "}
              <Text style={{ fontWeight: "bold" }}>{biggestJump.toScore}</Text>.
              {biggestJump.topCause
                ? ` The main reason was ${biggestJump.topCause.label} (${
                    biggestJump.topCause.delta > 0 ? "+" : ""
                  }${biggestJump.topCause.delta.toFixed(3)}).`
                : ` Review your health inputs from this period to understand the change.`}
            </Text>
          </View>
        )}

        {/* SHAP feature changes over time (only if multiple SHAP records) */}
        {hasShap &&
          shapRecords.length > 1 &&
          (() => {
            const firstShap = shapRecords[0];
            const changes = Object.keys(SHAP_COLORS)
              .map((key) => ({
                key,
                label: SHAP_LABELS[key],
                color: SHAP_COLORS[key],
                firstVal: firstShap.shapValues[key] || 0,
                latestVal: latestShap.shapValues[key] || 0,
                delta:
                  (latestShap.shapValues[key] || 0) -
                  (firstShap.shapValues[key] || 0),
              }))
              .filter((f) => Math.abs(f.delta) > 0.001)
              .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

            if (changes.length === 0) return null;
            return (
              <View style={styles.explanationSection}>
                <View style={styles.explanationSectionHeader}>
                  <Text style={styles.explanationSectionIcon}>📈</Text>
                  <Text
                    style={[
                      styles.explanationSectionTitle,
                      { color: "#3B71F3" },
                    ]}
                  >
                    Feature Changes Over Time
                  </Text>
                </View>
                {changes.map((f) => (
                  <View key={f.key} style={styles.explanationFactorRow}>
                    <View
                      style={[
                        styles.explanationDot,
                        { backgroundColor: f.color },
                      ]}
                    />
                    <View style={styles.explanationFactorContent}>
                      <Text style={styles.explanationFactorName}>
                        {f.label}{" "}
                        <Text
                          style={{
                            color: f.delta > 0 ? "#FF4757" : "#2ED573",
                            fontSize: 11,
                          }}
                        >
                          {f.delta > 0 ? "⬆ +" : "⬇ "}
                          {f.delta.toFixed(3)}
                        </Text>
                      </Text>
                      <Text style={styles.explanationFactorAdvice}>
                        {f.firstVal.toFixed(3)} → {f.latestVal.toFixed(3)}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            );
          })()}

        {/* Actionable advice — always shows */}
        <View style={[styles.explanationSection, styles.explanationActionBox]}>
          <Text style={styles.explanationActionTitle}>
            💡 What Your Graph Means For You
          </Text>
          <Text style={styles.explanationActionText}>
            {graphDirection === "rising"
              ? hasShap
                ? `Your risk is increasing. Focus on ${shapFeatures[0]?.label || "your health factors"} — ${adviceMap[shapFeatures[0]?.key] || "consult your healthcare provider."}`
                : "Your risk is trending upward. Schedule a check-up with your doctor and focus on blood pressure and blood sugar control."
              : graphDirection === "falling"
                ? "Your risk is improving — great progress! Continue your current health routine and keep monitoring."
                : hasShap
                  ? `Your risk is steady. ${
                      shapFeatures.filter((f) => f.value > 0.005).length > 0
                        ? `Manage ${shapFeatures.filter((f) => f.value > 0.005)[0]?.label} to reduce risk further.`
                        : "Continue your current health routine."
                    }`
                  : "Your risk is stable. Continue monitoring regularly and maintaining healthy habits."}
          </Text>
        </View>
      </View>
    );
  };

  // Render SHAP waterfall bar chart showing latest prediction's feature contributions
  const renderShapWaterfall = () => {
    // Get the latest record that has SHAP data
    const latestShap = [...records]
      .reverse()
      .find((r) => r.shapValues && r.shapValues.age !== undefined);
    if (!latestShap) return null;

    const sv = latestShap.shapValues;
    const features = Object.keys(SHAP_COLORS)
      .map((key) => ({
        key,
        label: SHAP_LABELS[key],
        value: sv[key] || 0,
        color: SHAP_COLORS[key],
      }))
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

    const maxAbsVal = Math.max(
      ...features.map((f) => Math.abs(f.value)),
      0.001,
    );
    const barWidth = GRAPH_WIDTH - 100;

    return (
      <View style={styles.shapWaterfallContainer}>
        <Text style={styles.shapWaterfallTitle}>
          🔍 Feature Contributions (Latest Prediction)
        </Text>
        <Text style={styles.shapWaterfallSubtitle}>
          How each feature pushes risk up or down
        </Text>
        {features.map((f) => {
          const width = (Math.abs(f.value) / maxAbsVal) * (barWidth / 2);
          const isPositive = f.value > 0;
          return (
            <View key={f.key} style={styles.shapBarRow}>
              <Text style={styles.shapBarLabel}>{f.label}</Text>
              <View style={styles.shapBarTrack}>
                <View style={styles.shapBarCenter} />
                {isPositive ? (
                  <View
                    style={[
                      styles.shapBar,
                      {
                        left: "50%",
                        width,
                        backgroundColor: "#FF4757",
                        borderTopRightRadius: 4,
                        borderBottomRightRadius: 4,
                      },
                    ]}
                  />
                ) : (
                  <View
                    style={[
                      styles.shapBar,
                      {
                        right: "50%",
                        width,
                        backgroundColor: "#2ED573",
                        borderTopLeftRadius: 4,
                        borderBottomLeftRadius: 4,
                      },
                    ]}
                  />
                )}
              </View>
              <Text
                style={[
                  styles.shapBarValue,
                  { color: isPositive ? "#FF4757" : "#2ED573" },
                ]}
              >
                {isPositive ? "+" : ""}
                {f.value.toFixed(3)}
              </Text>
            </View>
          );
        })}
        <View style={styles.shapBarLegend}>
          <Text style={[styles.shapBarLegendText, { color: "#2ED573" }]}>
            ← Decreases Risk
          </Text>
          <Text style={[styles.shapBarLegendText, { color: "#FF4757" }]}>
            Increases Risk →
          </Text>
        </View>
      </View>
    );
  };

  // Render Top Risk Drivers card
  const renderTopRiskDrivers = () => {
    if (!shapTrends || Object.keys(shapTrends).length === 0) return null;

    // Find which feature's SHAP slope is increasing the most (most positive slope = biggest growing risk)
    const featureSlopes = Object.keys(SHAP_COLORS)
      .filter((f) => shapTrends[f]?.hasData)
      .map((f) => ({
        key: f,
        label: SHAP_LABELS[f],
        slope: shapTrends[f].slope,
        color: SHAP_COLORS[f],
      }))
      .sort((a, b) => b.slope - a.slope);

    if (featureSlopes.length === 0) return null;

    const topDriver = featureSlopes[0];
    const advice = {
      age: "Age is a non-modifiable factor — focus on controllable risk factors.",
      gender: "Gender contribution is changing — discuss with your doctor.",
      bp_systolic:
        "Blood pressure is your top rising driver — focus on BP management and medication adherence.",
      bp_diastolic:
        "Diastolic BP contribution is increasing — monitor and manage your blood pressure.",
      hba1c_level:
        "HbA1c contribution is rising — focus on blood sugar control and diet.",
    };

    return (
      <View style={styles.topDriverCard}>
        <Text style={styles.topDriverTitle}>⚡ Top Risk Driver</Text>
        <View style={styles.topDriverContent}>
          <View
            style={[
              styles.topDriverBadge,
              { backgroundColor: topDriver.color + "20" },
            ]}
          >
            <Text
              style={[styles.topDriverBadgeText, { color: topDriver.color }]}
            >
              {topDriver.label}
            </Text>
          </View>
          <Text style={styles.topDriverSlope}>
            Slope: {topDriver.slope > 0 ? "+" : ""}
            {topDriver.slope.toFixed(4)}
            {topDriver.slope > 0 ? " ⬆️" : topDriver.slope < 0 ? " ⬇️" : " ➡️"}
          </Text>
          <Text style={styles.topDriverAdvice}>
            {advice[topDriver.key] ||
              "Monitor this factor with your healthcare provider."}
          </Text>
        </View>
      </View>
    );
  };

  // Render history list
  const renderHistoryList = () => {
    if (records.length === 0) return null;

    return (
      <View style={styles.historyContainer}>
        <Text style={styles.sectionTitle}>📋 Monthly Records</Text>
        {records.map((record, index) => (
          <View key={record._id || index} style={styles.historyItem}>
            <View style={styles.historyDate}>
              <Text style={styles.historyMonth}>
                {getShortMonth(record.month)}
              </Text>
              <Text style={styles.historyYear}>{record.year}</Text>
            </View>
            <View style={styles.historyContent}>
              <View style={styles.historyRisk}>
                <Text style={styles.historyRiskLabel}>Risk Level</Text>
                <Text
                  style={[
                    styles.historyRiskValue,
                    { color: getRiskColor(record.riskLevel) },
                  ]}
                >
                  {record.riskLevel}
                </Text>
              </View>
              <View style={styles.historyScore}>
                <Text style={styles.historyScoreLabel}>Score</Text>
                <Text style={styles.historyScoreValue}>
                  {record.riskScore?.toFixed(0) || "N/A"}
                </Text>
              </View>
            </View>
          </View>
        ))}
      </View>
    );
  };

  if (!userId && !loading) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorIcon}>🔒</Text>
        <Text style={styles.errorText}>
          User not identified. Please log in again.
        </Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B71F3" />
        <Text style={styles.loadingText}>Loading risk history...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchRiskHistory}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={["#3B71F3"]}
        />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Risk History</Text>
        <Text style={styles.subtitle}>Your personal kidney health trend</Text>
      </View>

      {/* Trend Card */}
      {renderTrendCard()}

      {/* Graph */}
      {renderGraph()}

      {/* SHAP Graph Explanation */}
      {renderShapExplanation()}

      {/* SHAP Feature Contributions */}
      {renderShapWaterfall()}

      {/* Top Risk Driver */}
      {renderTopRiskDrivers()}

      {/* History List */}
      {renderHistoryList()}

      {/* Info Card */}
      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>📌 Understanding the Trend</Text>
        <View style={styles.infoItem}>
          <Text style={styles.infoEmoji}>📈</Text>
          <Text style={styles.infoText}>
            <Text style={{ fontWeight: "bold", color: "#FF4757" }}>
              m {">"} 0:
            </Text>{" "}
            Risk is increasing. Consider consulting your healthcare provider.
          </Text>
        </View>
        <View style={styles.infoItem}>
          <Text style={styles.infoEmoji}>➡️</Text>
          <Text style={styles.infoText}>
            <Text style={{ fontWeight: "bold", color: "#FFA502" }}>m = 0:</Text>{" "}
            Risk is stable. Continue with your current health routine.
          </Text>
        </View>
        <View style={styles.infoItem}>
          <Text style={styles.infoEmoji}>📉</Text>
          <Text style={styles.infoText}>
            <Text style={{ fontWeight: "bold", color: "#2ED573" }}>
              m {"<"} 0:
            </Text>{" "}
            Risk is decreasing. Great progress! Keep up the healthy habits.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
};

// Helper functions
const getShortMonth = (month) => {
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return months[month - 1] || "N/A";
};

const getRiskColor = (riskLevel) => {
  const lowerLevel = riskLevel?.toLowerCase() || "";
  if (lowerLevel.includes("low")) return "#2ED573";
  if (lowerLevel.includes("medium")) return "#FFA502";
  if (lowerLevel.includes("high")) return "#FF4757";
  return "#747D8C";
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F7FA",
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F5F7FA",
  },
  loadingText: {
    marginTop: 10,
    color: "#747D8C",
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F5F7FA",
    padding: 20,
  },
  errorIcon: {
    fontSize: 50,
    marginBottom: 10,
  },
  errorText: {
    color: "#FF4757",
    fontSize: 16,
    textAlign: "center",
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: "#3B71F3",
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#1C1C1E",
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 16,
    color: "#8E8E93",
  },
  trendCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  trendHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  trendIcon: {
    fontSize: 40,
    marginRight: 15,
  },
  trendInfo: {
    flex: 1,
  },
  trendLabel: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 5,
  },
  trendDescription: {
    fontSize: 14,
    color: "#333",
    lineHeight: 20,
  },
  slopeIndicator: {
    marginTop: 15,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.1)",
  },
  slopeLabel: {
    fontSize: 12,
    color: "#666",
    marginBottom: 5,
  },
  slopeValue: {
    fontSize: 14,
    fontWeight: "600",
  },
  graphContainer: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  graphTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1C1C1E",
    marginBottom: 15,
    textAlign: "center",
  },
  yAxisLabels: {
    position: "absolute",
    left: 5,
    top: 60,
    height: GRAPH_HEIGHT - GRAPH_PADDING * 2,
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  axisLabel: {
    fontSize: 10,
    color: "#8E8E93",
  },
  graphArea: {
    height: GRAPH_HEIGHT,
    marginLeft: 30,
    position: "relative",
    borderLeftWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#E5E5E5",
  },
  gridLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "#F0F0F0",
  },
  regressionLine: {
    opacity: 0.7,
  },
  dataPoint: {
    position: "absolute",
    width: 16,
    height: 16,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  dataPointInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#3B71F3",
    borderWidth: 2,
    borderColor: "#fff",
    shadowColor: "#3B71F3",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  dataPointTooltip: {
    position: "absolute",
    top: -25,
    backgroundColor: "#333",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tooltipText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "bold",
  },
  xAxisLabels: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 10,
    marginLeft: 30,
  },
  xAxisLabel: {
    fontSize: 10,
    color: "#8E8E93",
  },
  legend: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 20,
    gap: 20,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  legendColor: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 5,
  },
  legendColorDashed: {
    width: 20,
    height: 3,
    borderWidth: 1.5,
    borderStyle: "dashed",
    marginRight: 5,
  },
  legendText: {
    fontSize: 11,
    color: "#666",
  },
  riskZoneLabel: {
    position: "absolute",
    right: 10,
    fontSize: 9,
    fontWeight: "600",
    opacity: 0.5,
  },
  svgContainer: {
    position: "absolute",
    top: 0,
    left: 0,
  },
  equationContainer: {
    marginTop: 15,
    padding: 12,
    backgroundColor: "#F8F9FA",
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E5E5",
  },
  equationText: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
    fontFamily: "monospace",
  },
  slopeText: {
    fontSize: 13,
    color: "#666",
    marginTop: 5,
    fontWeight: "600",
  },
  r2Text: {
    fontSize: 10,
    color: "#999",
    marginTop: 3,
    fontStyle: "italic",
  },
  noDataContainer: {
    alignItems: "center",
    paddingVertical: 40,
  },
  noDataIcon: {
    fontSize: 50,
    marginBottom: 15,
  },
  noDataText: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 5,
  },
  noDataSubText: {
    fontSize: 14,
    color: "#8E8E93",
    textAlign: "center",
  },
  historyContainer: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1C1C1E",
    marginBottom: 15,
  },
  historyItem: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 15,
    flexDirection: "row",
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  historyDate: {
    width: 50,
    alignItems: "center",
    justifyContent: "center",
    borderRightWidth: 1,
    borderRightColor: "#E5E5E5",
    marginRight: 15,
  },
  historyMonth: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#3B71F3",
  },
  historyYear: {
    fontSize: 12,
    color: "#8E8E93",
  },
  historyContent: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  historyRisk: {},
  historyRiskLabel: {
    fontSize: 12,
    color: "#8E8E93",
    marginBottom: 2,
  },
  historyRiskValue: {
    fontSize: 16,
    fontWeight: "bold",
  },
  historyScore: {
    alignItems: "flex-end",
  },
  historyScoreLabel: {
    fontSize: 12,
    color: "#8E8E93",
    marginBottom: 2,
  },
  historyScoreValue: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
  },
  infoCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#1C1C1E",
    marginBottom: 15,
  },
  infoItem: {
    flexDirection: "row",
    marginBottom: 12,
    alignItems: "flex-start",
  },
  infoEmoji: {
    fontSize: 18,
    marginRight: 10,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: "#333",
    lineHeight: 20,
  },
  // --- SHAP Toggle Legend ---
  shapToggleContainer: {
    marginTop: 15,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#E5E5E5",
  },
  shapToggleTitle: {
    fontSize: 11,
    color: "#666",
    marginBottom: 8,
  },
  shapToggleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  shapToggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  shapToggleDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 4,
  },
  shapToggleText: {
    fontSize: 10,
    fontWeight: "600",
  },
  // --- SHAP Explanation Card ---
  explanationCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  explanationTitle: {
    fontSize: 17,
    fontWeight: "bold",
    color: "#1C1C1E",
    marginBottom: 4,
  },
  explanationSubtitle: {
    fontSize: 12,
    color: "#8E8E93",
    marginBottom: 16,
  },
  explanationSection: {
    marginBottom: 14,
  },
  explanationSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  explanationSectionIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  explanationSectionTitle: {
    fontSize: 14,
    fontWeight: "bold",
  },
  explanationText: {
    fontSize: 13,
    color: "#333",
    lineHeight: 20,
    marginBottom: 4,
  },
  explanationFactorRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 10,
    paddingLeft: 4,
  },
  explanationDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
    marginRight: 10,
  },
  explanationFactorContent: {
    flex: 1,
  },
  explanationFactorName: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#1C1C1E",
    marginBottom: 2,
  },
  explanationFactorAdvice: {
    fontSize: 12,
    color: "#666",
    lineHeight: 18,
  },
  explanationJumpBox: {
    backgroundColor: "#FFF8F0",
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 3,
    borderLeftColor: "#FFA502",
  },
  explanationActionBox: {
    backgroundColor: "#F0F7FF",
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 3,
    borderLeftColor: "#3B71F3",
    marginBottom: 0,
  },
  explanationActionTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#1C1C1E",
    marginBottom: 6,
  },
  explanationActionText: {
    fontSize: 13,
    color: "#333",
    lineHeight: 20,
  },
  // --- SHAP Waterfall Chart ---
  shapWaterfallContainer: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  shapWaterfallTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#1C1C1E",
    marginBottom: 4,
  },
  shapWaterfallSubtitle: {
    fontSize: 12,
    color: "#8E8E93",
    marginBottom: 16,
  },
  shapBarRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  shapBarLabel: {
    width: 75,
    fontSize: 12,
    color: "#333",
    fontWeight: "600",
  },
  shapBarTrack: {
    flex: 1,
    height: 18,
    backgroundColor: "#F5F5F5",
    borderRadius: 4,
    position: "relative",
    overflow: "hidden",
  },
  shapBarCenter: {
    position: "absolute",
    left: "50%",
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: "#CCC",
  },
  shapBar: {
    position: "absolute",
    top: 2,
    bottom: 2,
  },
  shapBarValue: {
    width: 55,
    fontSize: 11,
    fontWeight: "bold",
    textAlign: "right",
  },
  shapBarLegend: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  shapBarLegendText: {
    fontSize: 10,
    fontWeight: "600",
  },
  // --- Top Risk Driver Card ---
  topDriverCard: {
    backgroundColor: "#FFF9E6",
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: "#FFA502",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  topDriverTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#1C1C1E",
    marginBottom: 10,
  },
  topDriverContent: {
    gap: 8,
  },
  topDriverBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  topDriverBadgeText: {
    fontSize: 14,
    fontWeight: "bold",
  },
  topDriverSlope: {
    fontSize: 13,
    color: "#666",
    fontWeight: "600",
  },
  topDriverAdvice: {
    fontSize: 13,
    color: "#333",
    lineHeight: 20,
  },
});

export default RiskHistoryScreen;
