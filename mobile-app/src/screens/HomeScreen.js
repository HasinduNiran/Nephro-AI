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

const HomeScreen = ({ navigation, route }) => {
  const userName = route.params?.userName || "User";
  const userID = route.params?.userID; // Capture the passed userID
  const userEmail = route.params?.userEmail || ""; // Capture email if available

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
      onPress: () => navigation.navigate("RiskPrediction"),
    },
    {
      id: 2,
      title: "Future Projection",
      subtitle: "Stage progression",
      icon: "trending-up",
      color: "#50E3C2", // Teal
      onPress: () => navigation.navigate("ScanLab", { userName, userEmail }),
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
          <View style={styles.profileImageContainer}>
            <Text style={styles.profileInitials}>{getInitials(userName)}</Text>
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
});

export default HomeScreen;
