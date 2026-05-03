import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import axios from "../api/axiosConfig";

const HomeScreen = ({ navigation, route }) => {
  const userName = route.params?.userName || "User";
  const userID = route.params?.userID;
  const [userEmail, setUserEmail] = useState(route.params?.userEmail || "");
  const [todayBP, setTodayBP] = useState(null);

  // Retrieve userEmail from AsyncStorage if not in route params
  useEffect(() => {
    const loadUserEmail = async () => {
      if (!userEmail) {
        try {
          const storedEmail = await AsyncStorage.getItem("userEmail");
          if (storedEmail) {
            setUserEmail(storedEmail);
          }
        } catch (error) {
          console.error("Error loading user email:", error);
        }
      }
    };
    loadUserEmail();
  }, []);

  // Fetch today's BP record for the Quick View tile
  useEffect(() => {
    const fetchTodayBP = async () => {
      try {
        const uid = userID || (await AsyncStorage.getItem("userID"));
        if (!uid) return;
        const res = await axios.get(`/bp-records/${uid}`);
        const records = res.data.records || [];
        const d = new Date();
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        const todayStr = `${yyyy}-${mm}-${dd}`;
        const todayRecord = records.find((r) => r.date === todayStr) || null;
        setTodayBP(todayRecord);
      } catch (err) {
        // silently fail — tile will show "No data for today"
      }
    };
    fetchTodayBP();
  }, [userID]);

  const getInitials = (name) => {
    if (!name) return "U";
    const names = name.trim().split(" ");
    if (names.length >= 2) {
      return `${names[0][0]}${names[1][0]}`.toUpperCase();
    }
    return name[0].toUpperCase();
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  const handleLogout = async () => {
    try {
      await AsyncStorage.multiRemove(["userID", "userEmail", "userName", "token"]);
    } catch (error) {
      console.error("Error clearing storage on logout:", error);
    }
    navigation.reset({ index: 0, routes: [{ name: "Login" }] });
  };

  const features = [
    {
      id: 1,
      title: "Risk Prediction",
      subtitle: "Analyze early signs",
      icon: "pulse",
      color: "#4A90E2",
      onPress: () => navigation.navigate("RiskPrediction", { userID }),
    },
    {
      id: 2,
      title: "Future Projection",
      subtitle: "Stage progression",
      icon: "trending-up",
      color: "#00BFA5",
      onPress: () =>
        navigation.navigate("ScanLab", { userName, userEmail, userID }),
    },
    {
      id: 3,
      title: "Dietary Plan",
      subtitle: "Personalized meals",
      icon: "nutrition",
      color: "#F5A623",
      onPress: () => navigation.navigate("DietaryPlan"),
    },
    {
      id: 4,
      title: "AI Assistant",
      subtitle: "Chat & Support",
      icon: "chatbubbles",
      color: "#9B59B6",
      onPress: () => navigation.navigate("Chatbot", { userID, userName }),
    },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#4A90E2" />
      <ScrollView
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero Banner ── */}
        <View style={styles.heroBanner}>
          {/* Decorative circles */}
          <View style={styles.heroCircleLarge} />
          <View style={styles.heroCircleSmall} />

          <View style={styles.heroTop}>
            <View style={styles.heroTextGroup}>
              <Text style={styles.greeting}>{getGreeting()},</Text>
              <Text style={styles.userName}>{userName} 👋</Text>
              <Text style={styles.heroSubtitle}>
                Track. Predict. Stay healthy.
              </Text>
            </View>

            <View style={styles.heroActions}>
              <View style={styles.profileAvatar}>
                <Text style={styles.profileInitials}>{getInitials(userName)}</Text>
              </View>
              <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
                <Ionicons name="log-out-outline" size={20} color="rgba(255,255,255,0.85)" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Health status chip */}
          <View style={styles.statusChip}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>Monitoring active</Text>
          </View>
        </View>

        {/* ── Feature Cards ── */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionLabel}>HEALTH TOOLS</Text>
        </View>

        <View style={styles.grid}>
          {features.map((feature) => (
            <TouchableOpacity
              key={feature.id}
              style={styles.card}
              onPress={feature.onPress}
              activeOpacity={0.75}
            >
              {/* Decorative background blob */}
              <View
                style={[
                  styles.cardBlob,
                  { backgroundColor: feature.color + "18" },
                ]}
              />

              {/* Top row: icon badge + arrow */}
              <View style={styles.cardTopRow}>
                <View
                  style={[styles.iconBadge, { backgroundColor: feature.color }]}
                >
                  <Ionicons name={feature.icon} size={22} color="#FFFFFF" />
                </View>
                <View
                  style={[styles.arrowBadge, { borderColor: feature.color + "40" }]}
                >
                  <Ionicons
                    name="arrow-forward"
                    size={12}
                    color={feature.color}
                  />
                </View>
              </View>

              {/* Text */}
              <Text style={styles.cardTitle}>{feature.title}</Text>
              <Text style={styles.cardSubtitle}>{feature.subtitle}</Text>

              {/* Color accent bar at bottom */}
              <View
                style={[styles.cardAccentBar, { backgroundColor: feature.color }]}
              />
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Blood Pressure Tile ── */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionLabel}>BLOOD PRESSURE</Text>
          <TouchableOpacity
            onPress={() =>
              navigation.navigate("BPHistory", { userID, userName, userEmail })
            }
          >
            <Text style={styles.seeAllText}>View all</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.bpTile}
          onPress={() =>
            navigation.navigate("BPHistory", { userID, userName, userEmail })
          }
          activeOpacity={0.75}
        >
          {/* Decorative background */}
          <View style={styles.bpTileBlob} />

          <View style={styles.bpTileLeft}>
            <View style={styles.bpIconBadge}>
              <Ionicons name="heart" size={22} color="#FFFFFF" />
            </View>
            <View style={styles.bpTileTextCol}>
              <Text style={styles.bpTileLabel}>Today's Reading</Text>
              {todayBP ? (
                <View style={styles.bpReadingRow}>
                  <Text style={styles.bpSystolic}>{todayBP.systolic}</Text>
                  <Text style={styles.bpSeparator}>/</Text>
                  <Text style={styles.bpDiastolic}>{todayBP.diastolic}</Text>
                  <Text style={styles.bpUnit}> mmHg</Text>
                </View>
              ) : (
                <Text style={styles.bpNoData}>No reading for today</Text>
              )}
            </View>
          </View>

          <View style={styles.bpChevronWrap}>
            <Ionicons name="chevron-forward" size={18} color="#FF4757" />
          </View>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F0F3F8",
  },
  contentContainer: {
    paddingBottom: 32,
  },

  // ── Hero Banner ──
  heroBanner: {
    backgroundColor: "#4A90E2",
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 22,
    overflow: "hidden",
    position: "relative",
  },
  heroCircleLarge: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(255,255,255,0.08)",
    top: -60,
    right: -50,
  },
  heroCircleSmall: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(255,255,255,0.06)",
    bottom: -20,
    left: 20,
  },
  heroTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  heroTextGroup: {
    flex: 1,
    marginRight: 12,
  },
  greeting: {
    fontSize: 14,
    color: "rgba(255,255,255,0.75)",
    fontWeight: "500",
    marginBottom: 2,
  },
  userName: {
    fontSize: 24,
    fontWeight: "800",
    color: "#FFFFFF",
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  heroSubtitle: {
    fontSize: 13,
    color: "rgba(255,255,255,0.65)",
    fontWeight: "400",
  },
  heroActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  profileAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.25)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.4)",
  },
  profileInitials: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  logoutButton: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 22,
  },
  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#5EFF8B",
  },
  statusText: {
    fontSize: 12,
    color: "rgba(255,255,255,0.9)",
    fontWeight: "600",
  },

  // ── Section Row ──
  sectionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    marginTop: 16,
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#8E9AAE",
    letterSpacing: 1.2,
  },
  seeAllText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#4A90E2",
  },

  // ── Feature Cards ──
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    gap: 12,
  },
  card: {
    width: "46.5%",
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 18,
    overflow: "hidden",
    position: "relative",
    shadowColor: "#8A9BB5",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 4,
  },
  cardBlob: {
    position: "absolute",
    width: 100,
    height: 100,
    borderRadius: 50,
    bottom: -20,
    right: -20,
  },
  cardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  iconBadge: {
    width: 46,
    height: 46,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  arrowBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    justifyContent: "center",
    alignItems: "center",
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1C1C1E",
    marginBottom: 4,
    lineHeight: 18,
  },
  cardSubtitle: {
    fontSize: 11,
    color: "#8E9AAE",
    fontWeight: "500",
    marginBottom: 14,
  },
  cardAccentBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },

  // ── BP Tile ──
  bpTile: {
    marginHorizontal: 24,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    overflow: "hidden",
    position: "relative",
    shadowColor: "#FF4757",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 4,
  },
  bpTileBlob: {
    position: "absolute",
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: "#FF475710",
    top: -40,
    right: -30,
  },
  bpTileLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    flex: 1,
  },
  bpIconBadge: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: "#FF4757",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#FF4757",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  bpTileTextCol: {
    flex: 1,
  },
  bpTileLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#8E9AAE",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  bpReadingRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  bpSystolic: {
    fontSize: 26,
    fontWeight: "800",
    color: "#FF4757",
  },
  bpSeparator: {
    fontSize: 20,
    fontWeight: "400",
    color: "#C7C7CC",
    marginHorizontal: 4,
  },
  bpDiastolic: {
    fontSize: 26,
    fontWeight: "800",
    color: "#4A90E2",
  },
  bpUnit: {
    fontSize: 12,
    color: "#8E9AAE",
    fontWeight: "500",
    marginLeft: 4,
    alignSelf: "flex-end",
    marginBottom: 3,
  },
  bpNoData: {
    fontSize: 13,
    color: "#8E9AAE",
    fontStyle: "italic",
  },
  bpChevronWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#FFF1F2",
    justifyContent: "center",
    alignItems: "center",
  },
});

export default HomeScreen;
