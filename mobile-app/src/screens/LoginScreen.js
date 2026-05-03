import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Alert,
  ScrollView,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import CustomInput from "../components/CustomInput";
import CustomButton from "../components/CustomButton";
import axios from "../api/axiosConfig";

const LoginScreen = ({ navigation }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const onLoginPressed = async () => {
    if (!email || !password) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }
    try {
      const response = await axios.post("/auth/login", { email, password });

      const userName = response.data?.user?.name || "User";
      const userID = response.data?.user?.id || email;
      const userEmail = response.data?.user?.email || email;
      const userData = response.data?.user || {};

      // Store complete user data in AsyncStorage
      await AsyncStorage.setItem("userData", JSON.stringify(userData));
      await AsyncStorage.setItem("userID", userID);
      await AsyncStorage.setItem("userName", userName);
      await AsyncStorage.setItem("userEmail", userEmail);

      Alert.alert("Success", "Logged in successfully");
      console.log("Navigating to Home with:", { userName, userID, userEmail });
      // Reset the entire navigation stack so old screens (with stale userId) are destroyed
      navigation.reset({
        index: 0,
        routes: [{ name: "Home", params: { userName, userID, userEmail } }],
      });
    } catch (error) {
      console.error("Login Error:", error);
      const errorMessage =
        error.response?.data?.message ||
        error.message ||
        "Something went wrong";
      Alert.alert("Error", errorMessage);
    }
  };

  const onSignUpPress = () => {
    navigation.navigate("Signup");
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <StatusBar barStyle="light-content" backgroundColor="#4A90E2" />
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.root}
          keyboardShouldPersistTaps="handled"
        >
          {/* Hero Section */}
          <View style={styles.hero}>
            <View style={styles.logoRing}>
              <Ionicons name="water" size={40} color="#FFFFFF" />
            </View>
            <Text style={styles.appName}>Nephro-AI</Text>
            <Text style={styles.appTagline}>Your kidney health companion</Text>
          </View>

          {/* Form Card */}
          <View style={styles.formCard}>
            <Text style={styles.title}>Welcome Back</Text>
            <Text style={styles.subtitle}>Sign in to continue</Text>

            <CustomInput placeholder="Email" value={email} setValue={setEmail} />
            <CustomInput
              placeholder="Password"
              value={password}
              setValue={setPassword}
              secureTextEntry
            />

            <CustomButton text="Sign In" onPress={onLoginPressed} />
            <CustomButton
              text="Don't have an account? Create one"
              onPress={onSignUpPress}
              type="TERTIARY"
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#4A90E2",
  },
  keyboardView: {
    flex: 1,
  },
  root: {
    flexGrow: 1,
    backgroundColor: "#F5F7FA",
  },
  hero: {
    backgroundColor: "#4A90E2",
    alignItems: "center",
    paddingTop: 48,
    paddingBottom: 40,
    paddingHorizontal: 24,
  },
  logoRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.4)",
  },
  appName: {
    fontSize: 28,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  appTagline: {
    fontSize: 14,
    color: "rgba(255,255,255,0.8)",
    fontWeight: "400",
  },
  formCard: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 24,
    flex: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1C1C1E",
    marginBottom: 4,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    color: "#8E8E93",
    marginBottom: 24,
    textAlign: "center",
  },
});

export default LoginScreen;
