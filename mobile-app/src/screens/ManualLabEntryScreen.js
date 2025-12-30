import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  StatusBar,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";
import api from "../api/axiosConfig";

const ManualLabEntryScreen = ({ navigation, route }) => {
  const userName = route.params?.userName || "User";
  const userEmail = route.params?.userEmail || "";
  
  const [formData, setFormData] = useState({
    name: userName || userEmail || "",
    age: "",
    gender: "M",
    creatinine: "",
    eGFR: "",
    bun: "",
    albumin: "",
  });
  const [loading, setLoading] = useState(false);

  const updateField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    // Validation
    if (!formData.name.trim()) {
      Alert.alert("Validation Error", "Please enter patient name");
      return;
    }

    if (!formData.age || parseInt(formData.age) < 1 || parseInt(formData.age) > 120) {
      Alert.alert("Validation Error", "Please enter a valid age (1-120)");
      return;
    }

    if (!formData.creatinine && !formData.eGFR) {
      Alert.alert("Validation Error", "Please enter either Creatinine or eGFR value");
      return;
    }

    setLoading(true);

    try {
      // Prepare data for backend
      const submitData = {
        name: formData.name.trim(),
        age: parseInt(formData.age),
        gender: formData.gender,
        creatinine: formData.creatinine ? parseFloat(formData.creatinine) : undefined,
        eGFR: formData.eGFR ? parseFloat(formData.eGFR) : undefined,
        bun: formData.bun ? parseFloat(formData.bun) : undefined,
        albumin: formData.albumin ? parseFloat(formData.albumin) : undefined,
      };

      console.log("Submitting lab data:", submitData);

      const response = await api.post("/lab", submitData);

      if (response.data) {
        Alert.alert("Success", "Lab test results saved successfully!");
        // Pass the actual lab test data (response.data.data)
        navigation.navigate("LabResult", { result: response.data.data });
      }
    } catch (error) {
      console.error("Error submitting lab data:", error);
      Alert.alert(
        "Error",
        error.response?.data?.message || "Failed to save lab results"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F7FA" />
      
      {/* Header with Back Button */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color="#1C1C1E" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Manual Lab Entry</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={true}
      >
        <Text style={styles.sectionTitle}>Patient Information</Text>

        {/* Name Input - Full Width (Read-only from login) */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Patient Name</Text>
          <View style={styles.readOnlyInput}>
            <Text style={styles.readOnlyText}>{formData.name}</Text>
          </View>
        </View>

        {/* Age and Gender Row */}
        <View style={styles.row}>
          <View style={styles.halfInputGroup}>
            <Text style={styles.label}>Age *</Text>
            <TextInput
              style={styles.input}
              value={formData.age}
              onChangeText={(value) => updateField("age", value)}
              placeholder="Enter age"
              placeholderTextColor="#C7C7CC"
              keyboardType="numeric"
            />
          </View>

          <View style={styles.halfInputGroup}>
            <Text style={styles.label}>Gender *</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={formData.gender}
                onValueChange={(value) => updateField("gender", value)}
                style={styles.picker}
              >
                <Picker.Item label="Male" value="M" />
                <Picker.Item label="Female" value="F" />
              </Picker>
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Lab Values</Text>
        <Text style={styles.hint}>
          * Enter either Creatinine or eGFR
        </Text>

        {/* Creatinine and eGFR Row */}
        <View style={styles.row}>
          <View style={styles.halfInputGroup}>
            <Text style={styles.label}>Creatinine</Text>
            <TextInput
              style={styles.input}
              value={formData.creatinine}
              onChangeText={(value) => updateField("creatinine", value)}
              placeholder="1.2"
              placeholderTextColor="#C7C7CC"
              keyboardType="decimal-pad"
            />
            <Text style={styles.unit}>mg/dL</Text>
          </View>

          <View style={styles.halfInputGroup}>
            <Text style={styles.label}>eGFR</Text>
            <TextInput
              style={styles.input}
              value={formData.eGFR}
              onChangeText={(value) => updateField("eGFR", value)}
              placeholder="75"
              placeholderTextColor="#C7C7CC"
              keyboardType="decimal-pad"
            />
            <Text style={styles.unit}>mL/min/1.73m²</Text>
          </View>
        </View>

        {/* BUN and Albumin Row */}
        <View style={styles.row}>
          <View style={styles.halfInputGroup}>
            <Text style={styles.label}>BUN (Optional)</Text>
            <TextInput
              style={styles.input}
              value={formData.bun}
              onChangeText={(value) => updateField("bun", value)}
              placeholder="20"
              placeholderTextColor="#C7C7CC"
              keyboardType="decimal-pad"
            />
            <Text style={styles.unit}>mg/dL</Text>
          </View>

          <View style={styles.halfInputGroup}>
            <Text style={styles.label}>Albumin (Optional)</Text>
            <TextInput
              style={styles.input}
              value={formData.albumin}
              onChangeText={(value) => updateField("albumin", value)}
              placeholder="4.0"
              placeholderTextColor="#C7C7CC"
              keyboardType="decimal-pad"
            />
            <Text style={styles.unit}>g/dL</Text>
          </View>
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={styles.submitButton}
          onPress={handleSubmit}
          activeOpacity={0.8}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Text style={styles.submitButtonText}>Analyze Results</Text>
              <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F7FA",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 50,
    paddingBottom: 16,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E5EA",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F5F7FA",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1C1C1E",
  },
  placeholder: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1C1C1E",
    marginBottom: 12,
    marginTop: 8,
  },
  hint: {
    fontSize: 12,
    color: "#8E8E93",
    marginBottom: 12,
    lineHeight: 18,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  halfInputGroup: {
    flex: 1,
    marginHorizontal: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1C1C1E",
    marginBottom: 6,
  },
  input: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: "#1C1C1E",
    borderWidth: 1,
    borderColor: "#E5E5EA",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  readOnlyInput: {
    backgroundColor: "#F5F7FA",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E5E5EA",
  },
  readOnlyText: {
    fontSize: 14,
    color: "#1C1C1E",
    fontWeight: "600",
  },
  unit: {
    fontSize: 11,
    color: "#8E8E93",
    marginTop: 4,
  },
  pickerContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E5EA",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  picker: {
    height: 45,
  },
  submitButton: {
    backgroundColor: "#4A90E2",
    borderRadius: 12,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
    shadowColor: "#4A90E2",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  submitButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
    marginRight: 8,
  },
});

export default ManualLabEntryScreen;
