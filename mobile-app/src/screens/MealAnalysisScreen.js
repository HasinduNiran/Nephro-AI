import React, { useState } from 'react';
import { 
  View, Text, Image, ScrollView, TextInput, Alert, StyleSheet, TouchableOpacity, ActivityIndicator 
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Picker } from '@react-native-picker/picker';
import axios from '../api/axiosConfig'; 

const MealAnalysisScreen = ({ route, navigation }) => {
  // 1. Get User ID (Passed from Home or Dashboard)
  const { userId } = route.params || {};

  const [imageUri, setImageUri] = useState(null);
  const [items, setItems] = useState([]); 
  const [loading, setLoading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);

  // --- CAMERA LOGIC ---
  const pickImage = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.granted === false) {
      Alert.alert("Permission Refused", "We need camera access.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7, 
    });

    if (!result.canceled) {
      const uri = result.assets[0].uri;
      setImageUri(uri);
      detectFoods(uri);
    }
  };

  // --- BACKEND: DETECT FOODS ---
  const detectFoods = async (uri) => {
    setLoading(true);
    setAnalysisResult(null); 

    const formData = new FormData();
    formData.append('image', {
      uri: uri,
      name: 'meal.jpg',
      type: 'image/jpeg',
    });

    try {
      const response = await axios.post('/mealPlate/detect', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const detectedData = response.data.detected || [];

      // Create initial list with default "1" amount
      const initialItems = detectedData.map((item) => ({
        food: item.food,
        amount: "1",
        unit: item.availableUnits ? item.availableUnits[0] : 'grams',
        availableUnits: item.availableUnits || ['grams']
      }));

      if (initialItems.length === 0) {
        Alert.alert("No Food Detected", "Try taking a clearer picture.");
      }
      setItems(initialItems);

    } catch (error) {
      console.error("Detection Error:", error);
      Alert.alert("Error", "Could not analyze the image.");
    } finally {
      setLoading(false);
    }
  };

  // --- BACKEND: CALCULATE & CHECK SAFETY ---
  const handleAnalyze = async (confirm = false) => {
    if (!userId) {
        Alert.alert("Error", "User ID not found. Please log in again.");
        return;
    }
    if (items.length === 0) {
      Alert.alert("Error", "No food items to analyze");
      return;
    }

    try {
        // Prepare Payload
        const payload = {
            userId: userId,
            items: items.map(i => ({ 
                food: i.food, 
                amount: i.amount || "0", 
                unit: i.unit 
            })),
            confirm: confirm // True = Save to DB, False = Just Check
        };

        const response = await axios.post('/mealPlate/confirm-meal', payload);
        const data = response.data;

        if (confirm) {
            // Success Message
            Alert.alert("Success ✅", "Meal recorded! Your daily wallet has been updated.", [
                { text: "OK", onPress: () => navigation.goBack() }
            ]);
        } else {
            // Show Safety Results
            setAnalysisResult({
                isSafe: data.isSafe,
                warnings: data.warnings,
                breakdown: data.breakdown
            });
            
            if (!data.isSafe) {
                Alert.alert("🚫 UNSAFE MEAL", "This meal exceeds your daily limits!\n\n" + data.warnings.join("\n"));
            } else if (data.warnings.length > 0) {
                Alert.alert("⚠️ Caution", "You are nearing your daily limits.\n\n" + data.warnings.join("\n"));
            } else {
                Alert.alert("✅ Safe", "This meal fits your daily limits.");
            }
        }

    } catch (error) {
        console.error("Analysis Error:", error);
        Alert.alert("Error", "Calculation failed. Server might be offline.");
    }
  };

  const updateRow = (index, field, value) => {
    const updated = [...items];
    updated[index][field] = value;
    setItems(updated);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.header}>Meal Plate Analyzer</Text>

      {/* Image Preview */}
      {imageUri ? (
        <Image source={{ uri: imageUri }} style={styles.image} />
      ) : (
        <View style={styles.placeholder}><Text>No Image Scanned</Text></View>
      )}

      {/* Scan Button */}
      <TouchableOpacity style={styles.scanBtn} onPress={pickImage} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>📸 Scan Meal</Text>}
      </TouchableOpacity>

      {/* Food List Editor */}
      {items.length > 0 && (
        <View style={styles.listContainer}>
            <Text style={styles.subHeader}>Verify Portions:</Text>
            
            {items.map((item, index) => (
                <View key={index} style={styles.row}>
                    <Text style={styles.foodLabel}>{item.food}</Text>
                    
                    <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={item.amount}
                        onChangeText={(text) => updateRow(index, 'amount', text)}
                        placeholder="Qty"
                    />

                    <View style={styles.pickerContainer}>
                        <Picker
                            selectedValue={item.unit}
                            style={styles.picker}
                            onValueChange={(val) => updateRow(index, 'unit', val)}
                        >
                            {(item.availableUnits || ['grams']).map((u) => (
                                <Picker.Item key={u} label={u.replace('_', ' ')} value={u} />
                            ))}
                        </Picker>
                    </View>
                </View>
            ))}

            <TouchableOpacity style={styles.checkBtn} onPress={() => handleAnalyze(false)}>
                <Text style={styles.btnText}>Check Safety</Text>
            </TouchableOpacity>
        </View>
      )}

      {/* Results Display */}
      {analysisResult && (
        <View style={[styles.resultBox, analysisResult.isSafe ? styles.safe : styles.unsafe]}>
            <Text style={styles.resultTitle}>
                {analysisResult.isSafe ? "Meal is Safe ✅" : "Caution ⚠️"}
            </Text>
            
            {analysisResult.breakdown?.map((b, i) => (
                <Text key={i} style={styles.detailText}>• {b.food}: {b.details}</Text>
            ))}

            {analysisResult.warnings?.length > 0 && (
                <View style={{marginTop: 10}}>
                    <Text style={{fontWeight: 'bold', color: '#721c24'}}>Warnings:</Text>
                    {analysisResult.warnings.map((w, i) => (
                        <Text key={i} style={{color: '#721c24', fontSize: 13}}>• {w}</Text>
                    ))}
                </View>
            )}

            <View style={styles.divider} />

            <TouchableOpacity style={styles.eatBtn} onPress={() => handleAnalyze(true)}>
                <Text style={styles.btnText}>Confirm & Eat</Text>
            </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { padding: 20, backgroundColor: '#fff', flexGrow: 1 },
  header: { fontSize: 24, fontWeight: 'bold', marginBottom: 15, color: '#051C60' },
  subHeader: { fontSize: 18, fontWeight: '600', marginBottom: 10, marginTop: 10 },
  image: { width: '100%', height: 200, borderRadius: 12, marginBottom: 15 },
  placeholder: { width: '100%', height: 150, backgroundColor: '#eee', borderRadius: 12, marginBottom: 15, justifyContent: 'center', alignItems: 'center' },
  scanBtn: { backgroundColor: '#007BFF', padding: 15, borderRadius: 8, alignItems: 'center' },
  checkBtn: { backgroundColor: '#6c757d', padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  eatBtn: { backgroundColor: '#28a745', padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 15 },
  btnText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  listContainer: { marginTop: 10 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: '#eee', padding: 5, borderRadius: 8 },
  foodLabel: { flex: 2, fontSize: 16, fontWeight: '500', paddingLeft: 5, textTransform: 'capitalize' },
  input: { flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 5, padding: 8, textAlign: 'center', marginRight: 5, backgroundColor: '#f9f9f9' },
  pickerContainer: { flex: 2, borderWidth: 1, borderColor: '#ccc', borderRadius: 5 },
  picker: { height: 50, width: '100%' },
  resultBox: { marginTop: 20, padding: 15, borderRadius: 10 },
  safe: { backgroundColor: '#d4edda', borderColor: '#c3e6cb', borderWidth: 1 },
  unsafe: { backgroundColor: '#f8d7da', borderColor: '#f5c6cb', borderWidth: 1 },
  resultTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 10, textAlign: 'center' },
  detailText: { fontSize: 14, marginBottom: 4 },
  divider: { height: 1, backgroundColor: 'rgba(0,0,0,0.1)', marginVertical: 10 }
});

export default MealAnalysisScreen;