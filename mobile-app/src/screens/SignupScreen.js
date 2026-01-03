import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Alert,
  ScrollView,
  TouchableOpacity,
  Platform,
} from "react-native";
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
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.root}
    >
      <Text style={styles.title}>Create an Account</Text>

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
  datePickerButton: {
    width: "100%",
    backgroundColor: "#f9fbfc",
    borderColor: "#e8e8e8",
    borderWidth: 1,
    borderRadius: 5,
    padding: 15,
    marginVertical: 5,
  },
  datePickerText: {
    fontSize: 16,
    color: "#333",
  },
  genderContainer: {
    width: "100%",
    marginVertical: 10,
  },
  genderLabel: {
    fontSize: 16,
    color: "#333",
    marginBottom: 8,
    fontWeight: "500",
  },
  genderButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
  },
  genderButton: {
    flex: 1,
    backgroundColor: "#f9fbfc",
    borderColor: "#e8e8e8",
    borderWidth: 1,
    borderRadius: 5,
    padding: 15,
    marginHorizontal: 5,
    alignItems: "center",
  },
  genderButtonActive: {
    backgroundColor: "#3B71F3",
    borderColor: "#3B71F3",
  },
  genderButtonText: {
    fontSize: 16,
    color: "#333",
    fontWeight: "500",
  },
  genderButtonTextActive: {
    color: "#fff",
  },
});

export default SignupScreen;
