import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Alert,
  ScrollView,
  TouchableOpacity,
  Platform,
  StatusBar,
  KeyboardAvoidingView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import CustomInput from "../components/CustomInput";
import CustomButton from "../components/CustomButton";
import axios from "../api/axiosConfig";

const SignupScreen = ({ navigation }) => {
  const [name, setName] = useState("");
  const [birthday, setBirthday] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [gender, setGender] = useState("Male");
  const [district, setDistrict] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const onRegisterPressed = async () => {
    if (!name || !birthday || !gender || !district || !email || !password) {
      Alert.alert("Error", "Please fill in all required fields");
      return;
    }

    try {
      const response = await axios.post("/auth/register", {
        name,
        birthday: birthday.toISOString(),
        gender,
        district,
        email,
        password,
      });
      Alert.alert("Success", "Registered successfully");
      navigation.navigate("Login");
    } catch (error) {
      console.error("Registration Error:", error);
      const errorMessage =
        error.response?.data?.message ||
        error.message ||
        "Something went wrong";
      Alert.alert("Error", errorMessage);
    }
  };

  const onLoginPress = () => {
    navigation.navigate("Login");
  };

  const onDateChange = (event, selectedDate) => {
    setShowDatePicker(Platform.OS === "ios");
    if (selectedDate) {
      setBirthday(selectedDate);
    }
  };

  const formatDate = (date) => {
    const day = date.getDate().toString().padStart(2, "0");
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
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
          <Text style={styles.appTagline}>Create your account</Text>
        </View>

        <View style={styles.formCard}>
        <Text style={styles.title}>Create an Account</Text>
        <Text style={styles.subtitle}>Join to start monitoring your kidney health</Text>

      <CustomInput placeholder="Full Name" value={name} setValue={setName} />

      <TouchableOpacity
        style={styles.datePickerButton}
        onPress={() => setShowDatePicker(true)}
      >
        <Text style={styles.datePickerText}>
          Birthday: {formatDate(birthday)}
        </Text>
      </TouchableOpacity>

      {showDatePicker && (
        <DateTimePicker
          value={birthday}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={onDateChange}
          maximumDate={new Date()}
        />
      )}

      <View style={styles.genderContainer}>
        <Text style={styles.genderLabel}>Gender:</Text>
        <View style={styles.genderButtons}>
          <TouchableOpacity
            style={[
              styles.genderButton,
              gender === "Male" && styles.genderButtonActive,
            ]}
            onPress={() => setGender("Male")}
          >
            <Text
              style={[
                styles.genderButtonText,
                gender === "Male" && styles.genderButtonTextActive,
              ]}
            >
              Male
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.genderButton,
              gender === "Female" && styles.genderButtonActive,
            ]}
            onPress={() => setGender("Female")}
          >
            <Text
              style={[
                styles.genderButtonText,
                gender === "Female" && styles.genderButtonTextActive,
              ]}
            >
              Female
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <CustomInput
        placeholder="District"
        value={district}
        setValue={setDistrict}
      />

      <CustomInput placeholder="Email" value={email} setValue={setEmail} />
      <CustomInput
        placeholder="Password"
        value={password}
        setValue={setPassword}
        secureTextEntry
      />

      <CustomButton text="Register" onPress={onRegisterPressed} />
      <CustomButton
        text="Have an account? Sign in"
        onPress={onLoginPress}
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
    paddingTop: 40,
    paddingBottom: 32,
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
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1C1C1E",
    marginBottom: 4,
    textAlign: "center",
    width: "100%",
  },
  subtitle: {
    fontSize: 13,
    color: "#8E8E93",
    marginBottom: 20,
    textAlign: "center",
    width: "100%",
  },
  datePickerButton: {
    width: "100%",
    backgroundColor: "#F5F7FA",
    borderColor: "#E5E5EA",
    borderWidth: 1,
    borderRadius: 8,
    padding: 15,
    marginVertical: 5,
    minHeight: 44,
    justifyContent: "center",
  },
  datePickerText: {
    fontSize: 16,
    color: "#1C1C1E",
  },
  genderContainer: {
    width: "100%",
    marginVertical: 8,
  },
  genderLabel: {
    fontSize: 14,
    color: "#4B5563",
    marginBottom: 8,
    fontWeight: "600",
  },
  genderButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
  },
  genderButton: {
    flex: 1,
    backgroundColor: "#F5F7FA",
    borderColor: "#E5E5EA",
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 13,
    marginHorizontal: 4,
    alignItems: "center",
    minHeight: 44,
    justifyContent: "center",
  },
  genderButtonActive: {
    backgroundColor: "#4A90E2",
    borderColor: "#4A90E2",
  },
  genderButtonText: {
    fontSize: 15,
    color: "#4B5563",
    fontWeight: "600",
  },
  genderButtonTextActive: {
    color: "#fff",
  },
});

export default SignupScreen;
