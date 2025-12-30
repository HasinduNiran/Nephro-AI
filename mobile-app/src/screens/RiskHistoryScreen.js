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
import axios from "../api/axiosConfig";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const GRAPH_HEIGHT = 200;
const GRAPH_PADDING = 40;
const GRAPH_WIDTH = SCREEN_WIDTH - 60;

const RiskHistoryScreen = ({ route }) => {
  // Get userId from route params or use a default for testing
  const userId = route?.params?.userId || "test-user-id";

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [records, setRecords] = useState([]);
  const [trendAnalysis, setTrendAnalysis] = useState(null);
  const [error, setError] = useState(null);

  const fetchRiskHistory = useCallback(async () => {
    try {
      setError(null);
      const response = await axios.get(`/risk-history/history/${userId}`);
      setRecords(response.data.records);
      setTrendAnalysis(response.data.trendAnalysis);
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
    if (!trendAnalysis || !trendAnalysis.dataPoints || trendAnalysis.dataPoints.length < 1) {
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
    const maxY = Math.max(...dataPoints.map((p) => p.y), 100);
    const minY = Math.min(...dataPoints.map((p) => p.y), 0);
    const yRange = maxY - minY || 100;

    // Scale functions
    const scaleX = (x) =>
      GRAPH_PADDING + (x / (dataPoints.length - 1 || 1)) * (GRAPH_WIDTH - GRAPH_PADDING * 2);
    const scaleY = (y) =>
      GRAPH_HEIGHT - GRAPH_PADDING - ((y - minY) / yRange) * (GRAPH_HEIGHT - GRAPH_PADDING * 2);

    const trendStyle = getTrendStyle(trendAnalysis.trend);

    return (
      <View style={styles.graphContainer}>
        {/* Graph Title */}
        <Text style={styles.graphTitle}>Risk Score Trend</Text>

        {/* Y-axis labels */}
        <View style={styles.yAxisLabels}>
          <Text style={styles.axisLabel}>{maxY.toFixed(0)}</Text>
          <Text style={styles.axisLabel}>{((maxY + minY) / 2).toFixed(0)}</Text>
          <Text style={styles.axisLabel}>{minY.toFixed(0)}</Text>
        </View>

        {/* Graph Area */}
        <View style={styles.graphArea}>
          {/* Grid lines */}
          <View style={[styles.gridLine, { top: "0%" }]} />
          <View style={[styles.gridLine, { top: "50%" }]} />
          <View style={[styles.gridLine, { top: "100%" }]} />

          {/* Regression Line (y = mx + c) */}
          {regressionLine && regressionLine.length >= 2 && (
            <View
              style={[
                styles.regressionLine,
                {
                  position: "absolute",
                  left: scaleX(0),
                  top: scaleY(regressionLine[0].y),
                  width: scaleX(regressionLine.length - 1) - scaleX(0),
                  height: 3,
                  backgroundColor: trendStyle.color,
                  transform: [
                    {
                      rotate: `${Math.atan2(
                        scaleY(regressionLine[regressionLine.length - 1].y) - scaleY(regressionLine[0].y),
                        scaleX(regressionLine.length - 1) - scaleX(0)
                      )}rad`,
                    },
                  ],
                  transformOrigin: "left center",
                },
              ]}
            />
          )}

          {/* Data Points */}
          {dataPoints.map((point, index) => (
            <View
              key={index}
              style={[
                styles.dataPoint,
                {
                  left: scaleX(point.x) - 8,
                  top: scaleY(point.y) - 8,
                },
              ]}
            >
              <View style={styles.dataPointInner} />
              <View style={styles.dataPointTooltip}>
                <Text style={styles.tooltipText}>{point.y.toFixed(0)}</Text>
              </View>
            </View>
          ))}

          {/* Connect points with line */}
          {dataPoints.length > 1 &&
            dataPoints.slice(0, -1).map((point, index) => {
              const nextPoint = dataPoints[index + 1];
              const x1 = scaleX(point.x);
              const y1 = scaleY(point.y);
              const x2 = scaleX(nextPoint.x);
              const y2 = scaleY(nextPoint.y);
              const length = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
              const angle = Math.atan2(y2 - y1, x2 - x1);

              return (
                <View
                  key={`line-${index}`}
                  style={{
                    position: "absolute",
                    left: x1,
                    top: y1,
                    width: length,
                    height: 2,
                    backgroundColor: "#3B71F3",
                    transform: [{ rotate: `${angle}rad` }],
                    transformOrigin: "left center",
                  }}
                />
              );
            })}
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
            <View style={[styles.legendColor, { backgroundColor: "#3B71F3" }]} />
            <Text style={styles.legendText}>Actual Risk</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendColor, { backgroundColor: trendStyle.color }]} />
            <Text style={styles.legendText}>Trend Line (y = mx + c)</Text>
          </View>
        </View>

        {/* Equation Display */}
        {trendAnalysis.equation && (
          <View style={styles.equationContainer}>
            <Text style={styles.equationText}>{trendAnalysis.equation}</Text>
            <Text style={styles.slopeText}>
              Slope (m) = {slope > 0 ? "+" : ""}{slope.toFixed(4)}
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
        {trendAnalysis.slope !== undefined && trendAnalysis.trend !== "no_data" && (
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
        <Text style={styles.subtitle}>Track your kidney health trend</Text>
      </View>

      {/* Trend Card */}
      {renderTrendCard()}

      {/* Graph */}
      {renderGraph()}

      {/* History List */}
      {renderHistoryList()}

      {/* Info Card */}
      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>📌 Understanding the Trend</Text>
        <View style={styles.infoItem}>
          <Text style={styles.infoEmoji}>📈</Text>
          <Text style={styles.infoText}>
            <Text style={{ fontWeight: "bold", color: "#FF4757" }}>m {">"} 0:</Text> Risk is increasing.
            Consider consulting your healthcare provider.
          </Text>
        </View>
        <View style={styles.infoItem}>
          <Text style={styles.infoEmoji}>➡️</Text>
          <Text style={styles.infoText}>
            <Text style={{ fontWeight: "bold", color: "#FFA502" }}>m = 0:</Text> Risk is stable.
            Continue with your current health routine.
          </Text>
        </View>
        <View style={styles.infoItem}>
          <Text style={styles.infoEmoji}>📉</Text>
          <Text style={styles.infoText}>
            <Text style={{ fontWeight: "bold", color: "#2ED573" }}>m {"<"} 0:</Text> Risk is decreasing.
            Great progress! Keep up the healthy habits.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
};

// Helper functions
const getShortMonth = (month) => {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
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
  legendText: {
    fontSize: 11,
    color: "#666",
  },
  equationContainer: {
    marginTop: 15,
    padding: 10,
    backgroundColor: "#F8F9FA",
    borderRadius: 8,
    alignItems: "center",
  },
  equationText: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
    fontFamily: "monospace",
  },
  slopeText: {
    fontSize: 12,
    color: "#666",
    marginTop: 5,
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
});

export default RiskHistoryScreen;
