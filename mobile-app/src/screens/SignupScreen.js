import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Alert,
  ScrollView,
  Switch,
} from "react-native";
import CustomInput from "../components/CustomInput";
import CustomButton from "../components/CustomButton";
import axios from "../api/axiosConfig";

const SignupScreen = ({ navigation }) => {
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [district, setDistrict] = useState("");
  const [hasDiabetes, setHasDiabetes] = useState(false);
  const [hasHypertension, setHasHypertension] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const onRegisterPressed = async () => {
    if (!name || !age || !gender || !district || !email || !password) {
      Alert.alert("Error", "Please fill in all required fields");
      return;
    }

    try {
      const response = await axios.post("/auth/register", {
        name,
        age: parseInt(age),
        gender,
        district,
        hasDiabetes,
        hasHypertension,
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

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.root}
    >
      <Text style={styles.title}>Create an Account</Text>

      <CustomInput placeholder="Full Name" value={name} setValue={setName} />
      <CustomInput
        placeholder="Age"
        value={age}
        setValue={setAge}
        keyboardType="numeric"
      />
      <CustomInput
        placeholder="Gender (Male/Female)"
        value={gender}
        setValue={setGender}
      />
      <CustomInput
        placeholder="District"
        value={district}
        setValue={setDistrict}
      />

      <View style={styles.switchContainer}>
        <Text style={styles.switchText}>Do you have Diabetes?</Text>
        <Switch value={hasDiabetes} onValueChange={setHasDiabetes} />
      </View>

      <View style={styles.switchContainer}>
        <Text style={styles.switchText}>Do you have Hypertension?</Text>
        <Switch value={hasHypertension} onValueChange={setHasHypertension} />
      </View>

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
    marginBottom: 20,
  },
  switchContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    marginBottom: 15,
    paddingHorizontal: 5,
  },
  switchText: {
    fontSize: 16,
    color: "#333",
  },
});

export default SignupScreen;
