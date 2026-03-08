import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
  Alert,
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

  const handleLogout = async () => {
    Alert.alert(
      "Logout",
      "Are you sure you want to logout?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Logout",
          style: "destructive",
          onPress: async () => {
            try {
              await AsyncStorage.multiRemove(["userID", "userEmail", "userName", "token"]);
            } catch (err) {
              console.error("Logout error:", err);
            }
            navigation.reset({ index: 0, routes: [{ name: "Login" }] });
          },
        },
      ],
    );
  };

  const getInitials = (name) => {
    if (!name) return "U";
    const names = name.trim().split(" ");
    if (names.length >= 2) {
      return `${names[0][0]}${names[1][0]}`.toUpperCase();
    }
    return name[0].toUpperCase();
  };

  const features = [
    {
      id: 1,
      title: "Risk Prediction",
      subtitle: "Analyze early signs",
      icon: "pulse",
      color: "#4A90E2", // Blue
      onPress: () => navigation.navigate("RiskPrediction", { userID }),
    },
    {
      id: 2,
      title: "Future Projection",
      subtitle: "Stage progression",
      icon: "trending-up",
      color: "#50E3C2", // Teal
      onPress: () =>
        navigation.navigate("ScanLab", { userName, userEmail, userID }),
    },
    {
      id: 3,
      title: "Dietary Plan",
      subtitle: "Personalized meals",
      icon: "nutrition",
      color: "#F5A623", // Orange
      onPress: () => navigation.navigate("DietaryPlan"),
    },
    {
      id: 4,
      title: "AI Assistant",
      subtitle: "Chat & Support",
      icon: "chatbubbles",
      color: "#9013FE", // Purple
      // Pass the User ID to the Chatbot Screen
      onPress: () => navigation.navigate("Chatbot", { userID, userName }),
    },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F7FA" />
      <ScrollView
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Header Section */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Welcome back,</Text>
            <Text style={styles.userName}>{userName}</Text>
          </View>
          <View style={styles.headerRight}>
            <View style={styles.profileImageContainer}>
              <Text style={styles.profileInitials}>{getInitials(userName)}</Text>
            </View>
            <TouchableOpacity
              style={styles.logoutButton}
              onPress={handleLogout}
              activeOpacity={0.7}
            >
              <Ionicons name="log-out-outline" size={22} color="#FF4757" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Dashboard Title */}
        <Text style={styles.sectionTitle}>Your Health Dashboard</Text>

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
                {/* '20' adds transparency to hex color */}
                <Ionicons name={feature.icon} size={28} color={feature.color} />
              </View>
              <Text style={styles.cardTitle}>{feature.title}</Text>
              <Text style={styles.cardSubtitle}>{feature.subtitle}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* BP Quick View Tile */}
        <Text style={styles.sectionTitle}>Blood Pressure</Text>
        <TouchableOpacity
          style={styles.bpTile}
          onPress={() =>
            navigation.navigate("BPHistory", { userID, userName, userEmail })
          }
          activeOpacity={0.7}
        >
          <View style={styles.bpTileLeft}>
            <View
              style={[styles.iconContainer, { backgroundColor: "#FF475720" }]}
            >
              <Ionicons name="heart" size={28} color="#FF4757" />
            </View>
            <View style={styles.bpTileTextCol}>
              <Text style={styles.bpTileTitle}>Today's BP</Text>
              {todayBP ? (
                <Text style={styles.bpTileReading}>
                  <Text style={{ color: "#FF4757" }}>{todayBP.systolic}</Text>
                  {" / "}
                  <Text style={{ color: "#4A90E2" }}>{todayBP.diastolic}</Text>
                  <Text style={styles.bpTileUnit}> mmHg</Text>
                </Text>
              ) : (
                <Text style={styles.bpTileNoData}>No data for today</Text>
              )}
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
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
  contentContainer: {
    padding: 24,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 32,
    marginTop: 10,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  logoutButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FF475715",
    justifyContent: "center",
    alignItems: "center",
  },
  greeting: {
    fontSize: 16,
    color: "#8E8E93",
    fontWeight: "500",
  },
  userName: {
    fontSize: 26,
    fontWeight: "700",
    color: "#1C1C1E",
    marginTop: 4,
  },
  profileImageContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#4A90E2",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#4A90E2",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  profileInitials: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#FFF",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1C1C1E",
    marginBottom: 16,
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
  bpTile: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  bpTileLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    flex: 1,
  },
  bpTileTextCol: {
    flex: 1,
  },
  bpTileTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1C1C1E",
    marginBottom: 3,
  },
  bpTileReading: {
    fontSize: 20,
    fontWeight: "700",
  },
  bpTileUnit: {
    fontSize: 12,
    color: "#8E8E93",
    fontWeight: "400",
  },
  bpTileNoData: {
    fontSize: 13,
    color: "#8E8E93",
    fontStyle: "italic",
  },
});

export default HomeScreen;
