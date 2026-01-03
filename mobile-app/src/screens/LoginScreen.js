import React, { useState } from "react";
import { View, Text, StyleSheet, Alert, ScrollView } from "react-native";
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
      const userData = response.data?.user || {};

      // Store complete user data in AsyncStorage
      await AsyncStorage.setItem("userData", JSON.stringify(userData));
      await AsyncStorage.setItem("userID", userID);
      await AsyncStorage.setItem("userName", userName);

      Alert.alert("Success", "Logged in successfully");
      console.log("Navigating to Home with:", { userName, userID });
      navigation.navigate("Home", { userName, userID });
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
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.root}
    >
      <Text style={styles.title}>Welcome Back</Text>

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
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  root: {
    alignItems: "center",
    padding: 20,
    paddingTop: 50,
    backgroundColor: "#fff",
    flexGrow: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#051C60",
    margin: 10,
    marginBottom: 30,
  },
});

export default LoginScreen;
