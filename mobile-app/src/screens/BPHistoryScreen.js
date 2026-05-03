import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  Switch,
  Platform,
  PermissionsAndroid,
  RefreshControl,
  TextInput,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import {
  getSdkStatus,
  initialize,
  requestPermission,
  readRecords,
  SdkAvailabilityStatus,
} from "react-native-health-connect";
import axios from "../api/axiosConfig";

const ASYNC_KEYS = {
  LAST_SYNCED: "bp_last_synced",
  SYNC_INTERVAL: "bp_sync_interval_minutes",
  AUTO_SYNC_ENABLED: "bp_auto_sync_enabled",
};

const DEFAULT_INTERVAL = 1;

const todayStr = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const formatLastSynced = (isoStr) => {
  if (!isoStr) return null;
  const date = new Date(isoStr);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const timeStr = date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  return isToday
    ? `Today ${timeStr}`
    : `${date.toLocaleDateString()} ${timeStr}`;
};

const BPHistoryScreen = ({ navigation, route }) => {
  const userId = route?.params?.userID || route?.params?.userId || null;
  const userName = route?.params?.userName || "User";
  const userEmail = route?.params?.userEmail || "";

  // --- data state ---
  const [records, setRecords] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [monthlyAvg, setMonthlyAvg] = useState(null);
  const [loadingAvg, setLoadingAvg] = useState(true);

  // --- last synced ---
  const [lastSynced, setLastSynced] = useState(null);

  // --- manual entry ---
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualSystolic, setManualSystolic] = useState("");
  const [manualDiastolic, setManualDiastolic] = useState("");
  const [manualHba1c, setManualHba1c] = useState("");
  const [savingManual, setSavingManual] = useState(false);

  // --- health connect ---
  const [syncing, setSyncing] = useState(false);

  // --- sync check panel ---
  const [syncPanelVisible, setSyncPanelVisible] = useState(false);
  const [triggerLoading, setTriggerLoading] = useState(false);
  const [triggerResult, setTriggerResult] = useState(null); // { ok, message }
  const [syncSummaries, setSyncSummaries] = useState([]);
  const [syncSummariesLoading, setSyncSummariesLoading] = useState(false);
  const [syncMonthlyAvg, setSyncMonthlyAvg] = useState(null);
  const [syncMonthlyLoading, setSyncMonthlyLoading] = useState(false);

  // --- settings modal ---
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true);
  const [syncIntervalMinutes, setSyncIntervalMinutes] = useState(
    String(DEFAULT_INTERVAL),
  );
  const [savingSettings, setSavingSettings] = useState(false);

  const autoSyncTimer = useRef(null);

  // ── helpers ──────────────────────────────────────────────

  const resolvedUserId = useCallback(async () => {
    if (userId) return userId;
    return await AsyncStorage.getItem("userID");
  }, [userId]);

  const persistLastSynced = async () => {
    const now = new Date().toISOString();
    await AsyncStorage.setItem(ASYNC_KEYS.LAST_SYNCED, now);
    setLastSynced(now);
  };

  // ── fetch data ───────────────────────────────────────────

  const fetchHistory = useCallback(async () => {
    try {
      const uid = await resolvedUserId();
      if (!uid) return;
      const res = await axios.get(`/bp-records/${uid}`);
      setRecords(res.data.records || []);
    } catch (err) {
      console.error("fetchHistory error:", err);
    } finally {
      setLoadingHistory(false);
      setRefreshing(false);
    }
  }, [resolvedUserId]);

  const fetchMonthlyAvg = useCallback(async () => {
    try {
      const uid = await resolvedUserId();
      if (!uid) return;
      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();
      const res = await axios.get(
        `/bp-records/${uid}/monthly-average?month=${month}&year=${year}`,
      );
      setMonthlyAvg(res.data);
    } catch (err) {
      console.error("fetchMonthlyAvg error:", err);
    } finally {
      setLoadingAvg(false);
    }
  }, [resolvedUserId]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchHistory();
    fetchMonthlyAvg();
  }, [fetchHistory, fetchMonthlyAvg]);

  // ── settings load / save ─────────────────────────────────

  const loadSettings = useCallback(async () => {
    try {
      const [storedEnabled, storedInterval, storedLastSynced] =
        await Promise.all([
          AsyncStorage.getItem(ASYNC_KEYS.AUTO_SYNC_ENABLED),
          AsyncStorage.getItem(ASYNC_KEYS.SYNC_INTERVAL),
          AsyncStorage.getItem(ASYNC_KEYS.LAST_SYNCED),
        ]);
      if (storedEnabled !== null) setAutoSyncEnabled(storedEnabled === "true");
      if (storedInterval !== null) setSyncIntervalMinutes(storedInterval);
      if (storedLastSynced !== null) setLastSynced(storedLastSynced);
    } catch (err) {
      console.error("loadSettings error:", err);
    }
  }, []);

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      const intervalVal = parseInt(syncIntervalMinutes, 10);
      if (isNaN(intervalVal) || intervalVal < 15 || intervalVal > 1440) {
        Alert.alert(
          "Invalid Interval",
          "Please enter a value between 15 and 1440 minutes.",
        );
        return;
      }
      await Promise.all([
        AsyncStorage.setItem(
          ASYNC_KEYS.AUTO_SYNC_ENABLED,
          String(autoSyncEnabled),
        ),
        AsyncStorage.setItem(ASYNC_KEYS.SYNC_INTERVAL, String(intervalVal)),
      ]);
      setSyncIntervalMinutes(String(intervalVal));
      restartAutoSync(autoSyncEnabled, intervalVal);
      setSettingsVisible(false);
    } catch (err) {
      console.error("saveSettings error:", err);
    } finally {
      setSavingSettings(false);
    }
  };

  // ── auto-sync timer ──────────────────────────────────────

  const runAutoSync = useCallback(async () => {
    const uid = await resolvedUserId();
    if (!uid) return;
    try {
      const isAvailable = await getSdkStatus();
      if (isAvailable !== SdkAvailabilityStatus.SDK_AVAILABLE) return;
      const initialized = await initialize();
      if (!initialized) return;
      const perms = await requestPermission([
        { accessType: "read", recordType: "BloodPressure" },
      ]);
      if (!perms || perms.length === 0) return;
      await PermissionsAndroid.request(
        "android.permission.health.READ_HEALTH_DATA_HISTORY",
      );
      const endTime = new Date().toISOString();
      const startTime = new Date(
        Date.now() - 7 * 24 * 60 * 60 * 1000,
      ).toISOString();
      const result = await readRecords("BloodPressure", {
        timeRangeFilter: { operator: "between", startTime, endTime },
      });
      if (!result?.records?.length) return;

      // Upsert each record by its date
      const upsertPromises = result.records.map((rec) => {
        const recDate = new Date(rec.time);
        const yyyy = recDate.getFullYear();
        const mm = String(recDate.getMonth() + 1).padStart(2, "0");
        const dd = String(recDate.getDate()).padStart(2, "0");
        const dateStr = `${yyyy}-${mm}-${dd}`;
        return axios.post("/bp-records/upsert", {
          userId: uid,
          date: dateStr,
          systolic: Math.round(rec.systolic.inMillimetersOfMercury),
          diastolic: Math.round(rec.diastolic.inMillimetersOfMercury),
          source: "healthConnect",
        });
      });
      await Promise.all(upsertPromises);
      await persistLastSynced();
      fetchHistory();
      fetchMonthlyAvg();
    } catch (err) {
      console.warn("Auto-sync error:", err);
    }
  }, [resolvedUserId, fetchHistory, fetchMonthlyAvg]);

  const restartAutoSync = useCallback(
    (enabled, intervalMinutes) => {
      if (autoSyncTimer.current) clearInterval(autoSyncTimer.current);
      if (enabled && Platform.OS === "android") {
        const ms = intervalMinutes * 60 * 1000;
        autoSyncTimer.current = setInterval(runAutoSync, ms);
      }
    },
    [runAutoSync],
  );

  // ── mount ────────────────────────────────────────────────

  useEffect(() => {
    fetchHistory();
    fetchMonthlyAvg();
    loadSettings();
  }, []);

  useEffect(() => {
    const intervalVal = parseInt(syncIntervalMinutes, 10) || DEFAULT_INTERVAL;
    restartAutoSync(autoSyncEnabled, intervalVal);
    return () => {
      if (autoSyncTimer.current) clearInterval(autoSyncTimer.current);
    };
  }, [autoSyncEnabled, syncIntervalMinutes]);

  // ── manual entry submit ──────────────────────────────────

  const submitManualEntry = async () => {
    const sys = parseInt(manualSystolic, 10);
    const dia = parseInt(manualDiastolic, 10);

    if (!manualSystolic || !manualDiastolic) {
      Alert.alert("Missing Fields", "Systolic and Diastolic BP are required.");
      return;
    }
    if (isNaN(sys) || sys < 70 || sys > 250) {
      Alert.alert(
        "Invalid Input",
        "Systolic BP must be between 70 and 250 mmHg.",
      );
      return;
    }
    if (isNaN(dia) || dia < 40 || dia > 150) {
      Alert.alert(
        "Invalid Input",
        "Diastolic BP must be between 40 and 150 mmHg.",
      );
      return;
    }
    if (sys <= dia) {
      Alert.alert(
        "Invalid Input",
        "Systolic BP must be greater than Diastolic BP.",
      );
      return;
    }
    const hba1cVal = manualHba1c ? parseFloat(manualHba1c) : null;
    if (manualHba1c && (isNaN(hba1cVal) || hba1cVal < 4 || hba1cVal > 14)) {
      Alert.alert("Invalid Input", "HbA1c must be between 4.0 and 14.0%.");
      return;
    }

    setSavingManual(true);
    try {
      const uid = await resolvedUserId();
      if (!uid) {
        Alert.alert("Error", "User not found. Please log in again.");
        return;
      }
      await axios.post("/bp-records/upsert", {
        userId: uid,
        date: todayStr(),
        systolic: sys,
        diastolic: dia,
        hba1c: hba1cVal,
        source: "manual",
      });
      setManualSystolic("");
      setManualDiastolic("");
      setManualHba1c("");
      setShowManualEntry(false);
      await persistLastSynced();
      fetchHistory();
      fetchMonthlyAvg();
      Alert.alert("Saved", "Blood pressure record saved for today.");
    } catch (err) {
      console.error("submitManualEntry error:", err);
      Alert.alert("Error", "Failed to save. Please try again.");
    } finally {
      setSavingManual(false);
    }
  };

  // ── sync check helpers ────────────────────────────────────

  const triggerSyncNow = async () => {
    setTriggerLoading(true);
    setTriggerResult(null);
    try {
      const res = await axios.post("/health-sync/trigger");
      setTriggerResult({
        ok: true,
        message: res.data?.message || "Sync completed.",
      });
    } catch (err) {
      setTriggerResult({
        ok: false,
        message:
          err?.response?.data?.message || err?.message || "Trigger failed.",
      });
    } finally {
      setTriggerLoading(false);
    }
  };

  const fetchSyncSummaries = async () => {
    setSyncSummariesLoading(true);
    try {
      const uid = await resolvedUserId();
      if (!uid) return;
      const now = new Date();
      // fetch last 7 days
      const to = now.toISOString().slice(0, 10);
      const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      const res = await axios.get(
        `/health-sync/${uid}/daily?from=${from}&to=${to}`,
      );
      setSyncSummaries(res.data?.summaries || []);
    } catch (err) {
      console.error("fetchSyncSummaries error:", err);
      setSyncSummaries([]);
    } finally {
      setSyncSummariesLoading(false);
    }
  };

  const fetchSyncMonthlyAvg = async () => {
    setSyncMonthlyLoading(true);
    try {
      const uid = await resolvedUserId();
      if (!uid) return;
      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();
      const res = await axios.get(
        `/health-sync/${uid}/monthly-average?month=${month}&year=${year}`,
      );
      setSyncMonthlyAvg(res.data);
    } catch (err) {
      console.error("fetchSyncMonthlyAvg error:", err);
      setSyncMonthlyAvg(null);
    } finally {
      setSyncMonthlyLoading(false);
    }
  };

  const openSyncPanel = () => {
    setSyncPanelVisible(true);
    setTriggerResult(null);
    fetchSyncSummaries();
    fetchSyncMonthlyAvg();
  };

  // ── health connect sync ──────────────────────────────────

  const syncFromWatch = async () => {
    if (Platform.OS !== "android") {
      Alert.alert(
        "Not Supported",
        "Health Connect is only available on Android.",
      );
      return;
    }
    setSyncing(true);
    try {
      let sdkStatus;
      try {
        sdkStatus = await getSdkStatus();
      } catch {
        Alert.alert(
          "Health Connect Not Available",
          "Please install Google Health Connect from the Play Store.",
        );
        return;
      }
      if (sdkStatus !== SdkAvailabilityStatus.SDK_AVAILABLE) {
        Alert.alert(
          "Health Connect",
          sdkStatus ===
            SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED
            ? "Health Connect needs to be updated from the Play Store."
            : "Health Connect is not available on this device.",
        );
        return;
      }
      const initialized = await initialize();
      if (!initialized) {
        Alert.alert(
          "Health Connect Unavailable",
          "Could not initialize Health Connect.",
        );
        return;
      }
      const granted = await requestPermission([
        { accessType: "read", recordType: "BloodPressure" },
      ]);
      if (!granted || granted.length === 0) {
        Alert.alert(
          "Permission Denied",
          "BP read permission is required in Health Connect settings.",
        );
        return;
      }
      const historyGranted = await PermissionsAndroid.request(
        "android.permission.health.READ_HEALTH_DATA_HISTORY",
        {
          title: "Historical BP Data",
          message:
            "Allow Nephro-AI to read your blood pressure records older than 30 days so your full history is visible.",
          buttonPositive: "Allow",
          buttonNegative: "Skip",
        },
      );
      const endTime = new Date().toISOString();
      // Read 90 days when history access is granted, otherwise fall back to 30 days
      const lookbackDays =
        historyGranted === PermissionsAndroid.RESULTS.GRANTED ? 90 : 30;
      const startTime = new Date(
        Date.now() - lookbackDays * 24 * 60 * 60 * 1000,
      ).toISOString();
      const result = await readRecords("BloodPressure", {
        timeRangeFilter: { operator: "between", startTime, endTime },
      });
      if (!result?.records?.length) {
        Alert.alert(
          "No Data",
          "No BP readings found in Health Connect for the selected period.",
        );
        return;
      }

      const uid = await resolvedUserId();
      const upsertPromises = result.records.map((rec) => {
        const recDate = new Date(rec.time);
        const yyyy = recDate.getFullYear();
        const mm = String(recDate.getMonth() + 1).padStart(2, "0");
        const dd = String(recDate.getDate()).padStart(2, "0");
        return axios.post("/bp-records/upsert", {
          userId: uid,
          date: `${yyyy}-${mm}-${dd}`,
          systolic: Math.round(rec.systolic.inMillimetersOfMercury),
          diastolic: Math.round(rec.diastolic.inMillimetersOfMercury),
          source: "healthConnect",
        });
      });
      await Promise.all(upsertPromises);
      await persistLastSynced();
      fetchHistory();
      fetchMonthlyAvg();
      Alert.alert(
        "⌚ Sync Complete",
        `${result.records.length} reading(s) synced from Health Connect.`,
      );
    } catch (err) {
      console.error("syncFromWatch error:", err);
      Alert.alert(
        "Error",
        "An unexpected error occurred: " + (err?.message || "Unknown"),
      );
    } finally {
      setSyncing(false);
    }
  };

  // ── render helpers ───────────────────────────────────────

  const renderRecord = ({ item }) => {
    const isHC = item.source === "healthConnect";
    return (
      <View style={styles.recordCard}>
        <View style={styles.recordLeft}>
          <Text style={styles.recordDate}>{item.date}</Text>
          {item.hba1c != null && (
            <Text style={styles.recordHba1c}>HbA1c: {item.hba1c}%</Text>
          )}
        </View>
        <View style={styles.recordRight}>
          <Text style={styles.recordBP}>
            <Text style={styles.systolicText}>{item.systolic}</Text>
            <Text style={styles.bpSlash}> / </Text>
            <Text style={styles.diastolicText}>{item.diastolic}</Text>
            <Text style={styles.bpUnit}> mmHg</Text>
          </Text>
          <View
            style={[
              styles.sourceBadge,
              isHC ? styles.sourceBadgeHC : styles.sourceBadgeManual,
            ]}
          >
            <Ionicons
              name={isHC ? "watch-outline" : "pencil-outline"}
              size={11}
              color={isHC ? "#00897B" : "#4A90E2"}
            />
            <Text
              style={[
                styles.sourceText,
                isHC ? styles.sourceTextHC : styles.sourceTextManual,
              ]}
            >
              {isHC ? "Watch" : "Manual"}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  // ── main render ──────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <StatusBar barStyle="light-content" backgroundColor="#4A90E2" />

      {/* Hero Header */}
      <View style={styles.heroHeader}>
        <View style={styles.heroCircleLarge} />
        <View style={styles.heroCircleSmall} />
        <View style={styles.heroInner}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.heroTitle}>BP History</Text>
          <TouchableOpacity style={styles.rightBtn} onPress={() => setSettingsVisible(true)}>
            <Ionicons name="settings-outline" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={{ flex: 1, backgroundColor: "#F0F3F8" }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Last Synced Banner */}
        {lastSynced && (
          <View style={styles.lastSyncedBanner}>
            <Ionicons name="sync-outline" size={14} color="#00897B" />
            <Text style={styles.lastSyncedText}>
              Last synced: {formatLastSynced(lastSynced)}
            </Text>
          </View>
        )}

        {/* Monthly Average Card */}
        <View style={styles.avgCard}>
          <Text style={styles.avgCardTitle}>This Month's Average</Text>
          {loadingAvg ? (
            <ActivityIndicator color="#4A90E2" />
          ) : monthlyAvg?.recordCount > 0 ? (
            <View>
              <Text style={styles.avgBP}>
                <Text style={styles.avgSystolic}>{monthlyAvg.avgSystolic}</Text>
                <Text style={styles.avgSlash}> / </Text>
                <Text style={styles.avgDiastolic}>
                  {monthlyAvg.avgDiastolic}
                </Text>
                <Text style={styles.avgUnit}> mmHg</Text>
              </Text>
              <Text style={styles.avgCount}>
                Based on {monthlyAvg.recordCount} reading
                {monthlyAvg.recordCount !== 1 ? "s" : ""}
              </Text>
            </View>
          ) : (
            <Text style={styles.noDataText}>No data for this month</Text>
          )}
        </View>

        {/* Action Buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => setShowManualEntry((v) => !v)}
          >
            <Ionicons name="pencil" size={18} color="#4A90E2" />
            <Text style={styles.actionBtnText}>Add Manually</Text>
          </TouchableOpacity>

          {Platform.OS === "android" && (
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBtnWatch]}
              onPress={syncFromWatch}
              disabled={syncing}
            >
              {syncing ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="watch-outline" size={18} color="#fff" />
                  <Text
                    style={[styles.actionBtnText, styles.actionBtnTextWatch]}
                  >
                    Sync from Watch
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Manual Entry Panel */}
        {showManualEntry && (
          <View style={styles.manualPanel}>
            <Text style={styles.manualPanelTitle}>
              Add BP for Today ({todayStr()})
            </Text>

            <View style={styles.inputRow}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Systolic (mmHg) *</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. 120"
                  keyboardType="numeric"
                  value={manualSystolic}
                  onChangeText={setManualSystolic}
                  placeholderTextColor="#A0A0A8"
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Diastolic (mmHg) *</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. 80"
                  keyboardType="numeric"
                  value={manualDiastolic}
                  onChangeText={setManualDiastolic}
                  placeholderTextColor="#A0A0A8"
                />
              </View>
            </View>

            <Text style={styles.inputLabel}>HbA1c (%) — Optional</Text>
            <TextInput
              style={[styles.textInput, styles.textInputFull]}
              placeholder="e.g. 5.7"
              keyboardType="numeric"
              value={manualHba1c}
              onChangeText={setManualHba1c}
              placeholderTextColor="#A0A0A8"
            />

            <View style={styles.manualPanelButtons}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => {
                  setShowManualEntry(false);
                  setManualSystolic("");
                  setManualDiastolic("");
                  setManualHba1c("");
                }}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, savingManual && styles.saveBtnDisabled]}
                onPress={submitManualEntry}
                disabled={savingManual}
              >
                {savingManual ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.saveBtnText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Sync Check Panel ── */}
        <TouchableOpacity
          style={styles.syncCheckToggle}
          onPress={() =>
            syncPanelVisible ? setSyncPanelVisible(false) : openSyncPanel()
          }
        >
          <Ionicons
            name={syncPanelVisible ? "chevron-up" : "shield-checkmark-outline"}
            size={16}
            color="#7C3AED"
          />
          <Text style={styles.syncCheckToggleText}>
            {syncPanelVisible ? "Hide Sync Check" : "Check Sync Service"}
          </Text>
        </TouchableOpacity>

        {syncPanelVisible && (
          <View style={styles.syncCheckPanel}>
            <Text style={styles.syncCheckTitle}>
              Background Sync Verification
            </Text>

            {/* 1 – Trigger button */}
            <TouchableOpacity
              style={[
                styles.syncTriggerBtn,
                triggerLoading && { opacity: 0.6 },
              ]}
              onPress={triggerSyncNow}
              disabled={triggerLoading}
            >
              {triggerLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="flash-outline" size={15} color="#fff" />
                  <Text style={styles.syncTriggerBtnText}>
                    Trigger Sync Now
                  </Text>
                </>
              )}
            </TouchableOpacity>

            {/* Trigger result badge */}
            {triggerResult && (
              <View
                style={[
                  styles.syncResultBadge,
                  triggerResult.ok
                    ? styles.syncResultBadgeOk
                    : styles.syncResultBadgeFail,
                ]}
              >
                <Ionicons
                  name={triggerResult.ok ? "checkmark-circle" : "close-circle"}
                  size={14}
                  color={triggerResult.ok ? "#059669" : "#DC2626"}
                />
                <Text
                  style={[
                    styles.syncResultText,
                    { color: triggerResult.ok ? "#059669" : "#DC2626" },
                  ]}
                >
                  {triggerResult.message}
                </Text>
              </View>
            )}

            {/* 2 – Monthly average from deduplicated data */}
            <Text style={styles.syncSectionLabel}>
              Monthly Avg (Deduplicated)
            </Text>
            {syncMonthlyLoading ? (
              <ActivityIndicator
                color="#7C3AED"
                style={{ marginVertical: 8 }}
              />
            ) : syncMonthlyAvg?.recordCount > 0 ? (
              <View style={styles.syncAvgRow}>
                <Text style={styles.syncAvgValue}>
                  {syncMonthlyAvg.avgSystolic}
                  <Text style={styles.syncAvgSlash}> / </Text>
                  {syncMonthlyAvg.avgDiastolic}
                  <Text style={styles.syncAvgUnit}> mmHg</Text>
                </Text>
                <Text style={styles.syncAvgCount}>
                  {syncMonthlyAvg.recordCount} unique day
                  {syncMonthlyAvg.recordCount !== 1 ? "s" : ""}
                </Text>
              </View>
            ) : (
              <Text style={styles.syncEmpty}>No synced data this month.</Text>
            )}

            {/* 3 – Deduplicated daily summaries (last 7 days) */}
            <Text style={styles.syncSectionLabel}>
              Deduplicated Readings (last 7 days)
            </Text>
            <Text style={styles.syncHint}>
              Each row = the LATEST reading kept per day by the sync service.
            </Text>
            {syncSummariesLoading ? (
              <ActivityIndicator
                color="#7C3AED"
                style={{ marginVertical: 8 }}
              />
            ) : syncSummaries.length === 0 ? (
              <Text style={styles.syncEmpty}>
                No summaries yet. Push data and trigger sync.
              </Text>
            ) : (
              syncSummaries.map((s) => (
                <View key={s._id || s.date} style={styles.syncRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.syncRowDate}>{s.date}</Text>
                    <Text style={styles.syncRowTime}>
                      {s.measuredAt
                        ? new Date(s.measuredAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </Text>
                  </View>
                  <Text style={styles.syncRowBP}>
                    {s.systolic != null ? (
                      <>
                        <Text style={{ color: "#FF4757" }}>{s.systolic}</Text>
                        <Text style={{ color: "#8E8E93" }}> / </Text>
                        <Text style={{ color: "#4A90E2" }}>{s.diastolic}</Text>
                        <Text style={{ color: "#8E8E93", fontSize: 11 }}>
                          {" "}
                          mmHg
                        </Text>
                      </>
                    ) : (
                      "BP: —"
                    )}
                  </Text>
                </View>
              ))
            )}

            {/* Refresh button */}
            <TouchableOpacity
              style={styles.syncRefreshBtn}
              onPress={() => {
                fetchSyncSummaries();
                fetchSyncMonthlyAvg();
              }}
            >
              <Ionicons name="refresh-outline" size={14} color="#7C3AED" />
              <Text style={styles.syncRefreshBtnText}>Refresh Results</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Records List */}
        <Text style={styles.sectionLabel}>All Records</Text>
        {loadingHistory ? (
          <ActivityIndicator
            color="#4A90E2"
            size="large"
            style={{ marginTop: 20 }}
          />
        ) : records.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="heart-outline" size={48} color="#C7C7CC" />
            <Text style={styles.emptyText}>No BP records yet.</Text>
            <Text style={styles.emptySubText}>
              Add a reading manually or sync from your watch.
            </Text>
          </View>
        ) : (
          <FlatList
            data={records}
            keyExtractor={(item) => item._id || item.date}
            renderItem={renderRecord}
            scrollEnabled={false}
            showsVerticalScrollIndicator={false}
          />
        )}
      </ScrollView>

      {/* Settings Modal */}
      <Modal
        visible={settingsVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setSettingsVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Auto-Sync Settings</Text>
              <TouchableOpacity onPress={() => setSettingsVisible(false)}>
                <Ionicons name="close" size={22} color="#1C1C1E" />
              </TouchableOpacity>
            </View>

            <View style={styles.settingsRow}>
              <Text style={styles.settingsLabel}>Enable Auto-Sync</Text>
              <Switch
                value={autoSyncEnabled}
                onValueChange={setAutoSyncEnabled}
                trackColor={{ false: "#E5E5EA", true: "#4A90E2" }}
                thumbColor="#fff"
              />
            </View>

            <Text style={styles.settingsLabel}>Sync Interval (minutes)</Text>
            <Text style={styles.settingsHint}>15 – 1440 (24 hours)</Text>
            <TextInput
              style={[styles.textInput, styles.textInputFull, { marginTop: 8 }]}
              keyboardType="numeric"
              value={syncIntervalMinutes}
              onChangeText={setSyncIntervalMinutes}
              editable={autoSyncEnabled}
              placeholderTextColor="#A0A0A8"
            />

            <TouchableOpacity
              style={[styles.saveBtn, savingSettings && styles.saveBtnDisabled]}
              onPress={saveSettings}
              disabled={savingSettings}
            >
              {savingSettings ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.saveBtnText}>Save Settings</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#4A90E2",
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
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  lastSyncedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#E0F2F1",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  lastSyncedText: {
    fontSize: 13,
    color: "#00897B",
    fontWeight: "500",
  },
  avgCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  avgCardTitle: {
    fontSize: 14,
    color: "#8E8E93",
    fontWeight: "600",
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  avgBP: {
    fontSize: 36,
    fontWeight: "700",
  },
  avgSystolic: {
    color: "#FF4757",
    fontSize: 36,
    fontWeight: "700",
  },
  avgSlash: {
    color: "#8E8E93",
    fontSize: 28,
  },
  avgDiastolic: {
    color: "#4A90E2",
    fontSize: 36,
    fontWeight: "700",
  },
  avgUnit: {
    color: "#8E8E93",
    fontSize: 14,
    fontWeight: "500",
  },
  avgCount: {
    fontSize: 13,
    color: "#8E8E93",
    marginTop: 6,
  },
  noDataText: {
    fontSize: 15,
    color: "#8E8E93",
    fontStyle: "italic",
  },
  actionRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: "#4A90E2",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  actionBtnWatch: {
    backgroundColor: "#00897B",
    borderColor: "#00897B",
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4A90E2",
  },
  actionBtnTextWatch: {
    color: "#fff",
  },
  manualPanel: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  manualPanelTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1C1C1E",
    marginBottom: 14,
  },
  inputRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  inputGroup: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 13,
    color: "#8E8E93",
    fontWeight: "500",
    marginBottom: 6,
  },
  textInput: {
    borderWidth: 1.5,
    borderColor: "#E5E5EA",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: "#1C1C1E",
    backgroundColor: "#FAFAFA",
  },
  textInputFull: {
    width: "100%",
  },
  manualPanelButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#E5E5EA",
    alignItems: "center",
  },
  cancelBtnText: {
    color: "#8E8E93",
    fontWeight: "600",
    fontSize: 15,
  },
  saveBtn: {
    flex: 1,
    backgroundColor: "#4A90E2",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  saveBtnDisabled: {
    backgroundColor: "#A0C4F0",
  },
  saveBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#8E8E93",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
    marginTop: 4,
  },
  recordCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  recordLeft: {
    flex: 1,
  },
  recordDate: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1C1C1E",
  },
  recordHba1c: {
    fontSize: 12,
    color: "#8E8E93",
    marginTop: 3,
  },
  recordRight: {
    alignItems: "flex-end",
  },
  recordBP: {
    fontSize: 18,
    fontWeight: "700",
  },
  systolicText: {
    color: "#FF4757",
    fontSize: 18,
    fontWeight: "700",
  },
  bpSlash: {
    color: "#8E8E93",
    fontSize: 16,
  },
  diastolicText: {
    color: "#4A90E2",
    fontSize: 18,
    fontWeight: "700",
  },
  bpUnit: {
    color: "#8E8E93",
    fontSize: 12,
  },
  sourceBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginTop: 5,
  },
  sourceBadgeHC: {
    backgroundColor: "#E0F2F1",
  },
  sourceBadgeManual: {
    backgroundColor: "#EBF4FF",
  },
  sourceText: {
    fontSize: 11,
    fontWeight: "600",
  },
  sourceTextHC: {
    color: "#00897B",
  },
  sourceTextManual: {
    color: "#4A90E2",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 10,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#8E8E93",
  },
  emptySubText: {
    fontSize: 13,
    color: "#C7C7CC",
    textAlign: "center",
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 36,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1C1C1E",
  },
  settingsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  settingsLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1C1C1E",
  },
  settingsHint: {
    fontSize: 12,
    color: "#8E8E93",
    marginTop: 4,
  },

  // ── Sync Check Panel ──────────────────────────────────────
  syncCheckToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  syncCheckToggleText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#7C3AED",
  },
  syncCheckPanel: {
    backgroundColor: "#FAF5FF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#DDD6FE",
    padding: 16,
    marginBottom: 16,
    gap: 6,
  },
  syncCheckTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#5B21B6",
    marginBottom: 8,
  },
  syncTriggerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#7C3AED",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  syncTriggerBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  syncResultBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 8,
    padding: 10,
    marginBottom: 4,
  },
  syncResultBadgeOk: {
    backgroundColor: "#D1FAE5",
  },
  syncResultBadgeFail: {
    backgroundColor: "#FEE2E2",
  },
  syncResultText: {
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
  },
  syncSectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#5B21B6",
    marginTop: 10,
    marginBottom: 4,
  },
  syncHint: {
    fontSize: 11,
    color: "#8E8E93",
    marginBottom: 6,
    fontStyle: "italic",
  },
  syncAvgRow: {
    backgroundColor: "#EDE9FE",
    borderRadius: 10,
    padding: 10,
    marginBottom: 4,
  },
  syncAvgValue: {
    fontSize: 20,
    fontWeight: "700",
    color: "#4C1D95",
  },
  syncAvgSlash: {
    color: "#8E8E93",
    fontSize: 16,
  },
  syncAvgUnit: {
    fontSize: 12,
    color: "#8E8E93",
  },
  syncAvgCount: {
    fontSize: 12,
    color: "#7C3AED",
    marginTop: 2,
  },
  syncRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 10,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: "#EDE9FE",
  },
  syncRowDate: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1C1C1E",
  },
  syncRowTime: {
    fontSize: 11,
    color: "#8E8E93",
    marginTop: 2,
  },
  syncRowBP: {
    fontSize: 16,
    fontWeight: "700",
  },
  syncEmpty: {
    fontSize: 12,
    color: "#8E8E93",
    fontStyle: "italic",
    marginBottom: 4,
  },
  syncRefreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    marginTop: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#DDD6FE",
  },
  syncRefreshBtnText: {
    fontSize: 13,
    color: "#7C3AED",
    fontWeight: "600",
  },
});

export default BPHistoryScreen;
