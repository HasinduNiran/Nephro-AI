import React, { useState, useEffect } from 'react';
import { 
  View, Text, Image, ScrollView, TextInput, Alert, StyleSheet, TouchableOpacity, ActivityIndicator, Modal, FlatList 
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Picker } from '@react-native-picker/picker';
import AsyncStorage from '@react-native-async-storage/async-storage'; 
import axios from '../api/axiosConfig';
import { useWallet } from '../context/WalletContext'; 
import { Ionicons } from '@expo/vector-icons'; 

// --- LOCAL DATABASE ---
// This acts as a fallback and search source for foods
const foodNutrientDB = {
  "avacado": { protein: 2, sodium: 7, potassium: 485, phosphorus: 52, units: { "whole_fruit": 200, "half_fruit": 100, "tbsp": 15 } },
  "Beans curry": { protein: 2, sodium: 200, potassium: 250, phosphorus: 40, units: { "tbsp": 15 } },
  "beetroot": { protein: 1.6, sodium: 78, potassium: 325, phosphorus: 40, units: { "tbsp": 15 } },
  "chicken": { protein: 31, sodium: 74, potassium: 256, phosphorus: 228, units: { "small_piece": 50, "large_piece": 100 } },
  "cutlet": { protein: 12, sodium: 300, potassium: 200, phosphorus: 150, units: { "small": 40, "large": 80 } },
  "dahl curry": { protein: 6, sodium: 250, potassium: 300, phosphorus: 180, units: { "tbsp": 15, "serving_spoon": 60 } },
  "fish curry": { protein: 20, sodium: 350, potassium: 350, phosphorus: 200, units: { "small_piece": 50, "large_piece": 100 } },
  "fried rice": { protein: 4, sodium: 400, potassium: 100, phosphorus: 90, units: { "serving_spoon": 60, "tea_cup": 150 } },
  "mallum": { protein: 3, sodium: 20, potassium: 400, phosphorus: 50, units: { "tbsp": 15 } },
  "pineapple": { protein: 0.5, sodium: 1, potassium: 109, phosphorus: 8, units: { "piece_cube": 20, "slice": 80 } },
  "Pol sambol": { protein: 3, sodium: 400, potassium: 300, phosphorus: 100, units: { "tbsp": 15 } },
  "red rice": { protein: 2.5, sodium: 1, potassium: 85, phosphorus: 78, units: { "serving_spoon": 60, "tea_cup": 150 } },
  "roti": { protein: 8, sodium: 320, potassium: 120, phosphorus: 100, units: { "small": 40, "large": 80 } },
  "tempered sprats": { protein: 35, sodium: 900, potassium: 400, phosphorus: 350, units: { "tbsp": 15 } },
  "white rice": { protein: 2.7, sodium: 1, potassium: 35, phosphorus: 35, units: { "serving_spoon": 60, "tea_cup": 150 } },
};

const MealAnalysisScreen = ({ route, navigation }) => {
  const { wallet, addNutrients, checkSafety, getLimits } = useWallet();
  const [userId, setUserId] = useState(route.params?.userId || null);
  const [imageUri, setImageUri] = useState(null);
  const [items, setItems] = useState([]); 
  const [loading, setLoading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);

  // --- TRACK IF SCAN HAS HAPPENED ---
  const [hasScanned, setHasScanned] = useState(false); 

  // --- SEARCH STATE ---
  const [searchModalVisible, setSearchModalVisible] = useState(false);
  const [searchText, setSearchText] = useState('');

  // --- 1. LOAD USER ID ---
  useEffect(() => {
    const loadUserId = async () => {
      if (!userId) {
        try {
          const storedUser = await AsyncStorage.getItem('user');
          if (storedUser) {
            const userData = JSON.parse(storedUser);
            setUserId(userData._id || userData.id || 'temp_user_001');
          } else {
            setUserId('temp_user_001');
          }
        } catch (error) {
          console.error('Error loading user:', error);
          setUserId('temp_user_001');
        }
      }
    };
    loadUserId();
  }, []);

  // --- 2. CAMERA & GALLERY ---
  const pickImageCamera = async () => {
    try {
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
        setImageUri(result.assets[0].uri);
        detectFoods(result.assets[0].uri);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to open camera: ' + error.message);
    }
  };

  const pickImageGallery = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission.granted === false) {
        Alert.alert("Permission Refused", "We need gallery access.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7, 
      });

      if (!result.canceled) {
        setImageUri(result.assets[0].uri);
        detectFoods(result.assets[0].uri);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to open gallery: ' + error.message);
    }
  };

  // --- 3. BACKEND DETECTION ---
  const detectFoods = async (uri) => {
    setLoading(true);
    setAnalysisResult(null); 
    setItems([]); 
    setHasScanned(false); // Reset while loading

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

      const initialItems = detectedData.map((item) => {
        let units = item.availableUnits || [];
        // Fallback logic if backend didn't find units
        if (!units || units.length === 0 || (units.length === 1 && units[0] === 'grams')) {
          const localFood = foodNutrientDB[item.food];
          if (localFood && localFood.units) {
            units = Object.keys(localFood.units);
          } else {
            units = ['grams'];
          }
        }
        
        return {
          food: item.food,
          amount: "1",
          unit: units[0],
          availableUnits: units
        };
      });

      setItems(initialItems);
      
      if (initialItems.length === 0) {
        Alert.alert("No Food Detected", "Try searching and adding food manually.");
      }

    } catch (error) {
      console.error("Detection Error:", error);
      Alert.alert("Error", "Could not analyze the image. You can add food manually.");
    } finally {
      setLoading(false);
      setHasScanned(true); // <--- SHOW "ADD FOOD" BUTTON NOW
    }
  };

  // --- 4. CALCULATION & SAFETY ---
  const calculateMealNutrients = () => {
    let totalNutrients = { sodium: 0, potassium: 0, phosphorus: 0, protein: 0 };
    let breakdown = [];

    items.forEach((item) => {
      const foodData = foodNutrientDB[item.food];
      if (foodData) {
        const unitWeight = foodData.units[item.unit] || 100; 
        const totalGrams = unitWeight * parseFloat(item.amount || 0);
        
        const itemNutrients = {
          sodium: (foodData.sodium * totalGrams) / 100,
          potassium: (foodData.potassium * totalGrams) / 100,
          phosphorus: (foodData.phosphorus * totalGrams) / 100,
          protein: (foodData.protein * totalGrams) / 100
        };

        totalNutrients.sodium += itemNutrients.sodium;
        totalNutrients.potassium += itemNutrients.potassium;
        totalNutrients.phosphorus += itemNutrients.phosphorus;
        totalNutrients.protein += itemNutrients.protein;

        breakdown.push({
          food: item.food,
          amount: `${item.amount} ${item.unit}`,
          grams: totalGrams,
          ...itemNutrients
        });
      }
    });
    return { totalNutrients, breakdown };
  };

  const handleAnalyze = async (confirm = false) => {
    if (items.length === 0) {
      Alert.alert("Error", "No food items to analyze. Please add a food.");
      return;
    }

    const { totalNutrients, breakdown } = calculateMealNutrients();
    const limits = getLimits();
    const safetyCheck = checkSafety(totalNutrients);
    let warnings = [];
    let isSafe = true;

    const checkNutrient = (name, current, meal, limit) => {
      const total = current + meal;
      const percentage = (total / limit) * 100;
      if (percentage > 100) {
        isSafe = false;
        warnings.push(`🚫 ${name}: ${total.toFixed(0)}/${limit}mg (${percentage.toFixed(0)}%) - EXCEEDED!`);
      } else if (percentage > 80) {
        warnings.push(`⚠️ ${name}: ${total.toFixed(0)}/${limit}mg (${percentage.toFixed(0)}%) - Getting high`);
      }
    };

    checkNutrient('Sodium', wallet.sodium, totalNutrients.sodium, limits.sodium);
    checkNutrient('Potassium', wallet.potassium, totalNutrients.potassium, limits.potassium);
    checkNutrient('Phosphorus', wallet.phosphorus, totalNutrients.phosphorus, limits.phosphorus);
    checkNutrient('Protein', wallet.protein, totalNutrients.protein, limits.protein);

    if (confirm) {
      await addNutrients(totalNutrients);
      Alert.alert("Success ✅", "Meal confirmed!", [{ text: "OK", onPress: () => navigation.goBack() }]);
    } else {
      setAnalysisResult({
        isSafe: safetyCheck.safe && isSafe,
        warnings: warnings.length > 0 ? warnings : safetyCheck.warnings,
        breakdown: breakdown.map(b => ({
          food: b.food,
          details: `${b.amount} (${b.grams.toFixed(0)}g): Na ${b.sodium.toFixed(0)}mg, K ${b.potassium.toFixed(0)}mg`
        })),
        totalNutrients
      });

      if (!isSafe) {
        Alert.alert("🚫 UNSAFE MEAL", "This meal exceeds your daily limits!\n\n" + warnings.join("\n"));
      } else if (warnings.length > 0) {
        Alert.alert("⚠️ Caution", "You are nearing your daily limits.\n\n" + warnings.join("\n"));
      } else {
        Alert.alert("✅ Safe", "This meal fits your daily limits.");
      }
    }
  };

  // --- 5. ITEM MANAGEMENT (Edit/Delete/Add) ---
  const updateRow = (index, field, value) => {
    const updated = [...items];
    updated[index][field] = value;
    setItems(updated);
  };

  const removeItem = (index) => {
    Alert.alert("Remove Item", `Remove ${items[index].food}?`, [
      { text: "Cancel", style: "cancel" },
      { 
        text: "Remove", 
        style: 'destructive', 
        onPress: () => {
          const updated = [...items];
          updated.splice(index, 1);
          setItems(updated);
          if (updated.length === 0) setAnalysisResult(null);
        }
      }
    ]);
  };

  const addManualFood = (foodName) => {
    const foodData = foodNutrientDB[foodName];
    if (foodData) {
      const units = Object.keys(foodData.units);
      const newItem = {
        food: foodName,
        amount: "1",
        unit: units[0],
        availableUnits: units
      };
      setItems([...items, newItem]);
      setSearchModalVisible(false);
      setSearchText('');
    }
  };

  const filteredFoods = Object.keys(foodNutrientDB).filter(key => 
    key.toLowerCase().includes(searchText.toLowerCase())
  );

  return (
    <View style={{flex: 1, backgroundColor: '#fff'}}> 
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.header}>Meal Plate Analyzer</Text>

        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.image} />
        ) : (
          <View style={styles.placeholder}><Text>No Image Selected</Text></View>
        )}

        <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.scanBtn} onPress={pickImageCamera} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>📸 Camera</Text>}
            </TouchableOpacity>

            <TouchableOpacity style={[styles.scanBtn, styles.galleryBtn]} onPress={pickImageGallery} disabled={loading}>
              <Text style={styles.btnText}>🖼️ Gallery</Text>
            </TouchableOpacity>
        </View>

        {/* --- ADD FOOD BUTTON (Visible only after scan) --- */}
        {hasScanned && (
            <TouchableOpacity style={styles.addFoodBtn} onPress={() => setSearchModalVisible(true)}>
                <Text style={styles.addFoodText}>+ Add Food Manually</Text>
            </TouchableOpacity>
        )}

        {/* --- LIST OF FOODS --- */}
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
                              {(item.availableUnits || ['grams']).map((u, idx) => (
                                  <Picker.Item key={`${u}-${idx}`} label={u.replace(/_/g, ' ')} value={u} />
                              ))}
                          </Picker>
                      </View>

                      <TouchableOpacity onPress={() => removeItem(index)} style={styles.trashBtn}>
                          <Ionicons name="trash-outline" size={24} color="#dc3545" />
                      </TouchableOpacity>
                  </View>
              ))}

              <TouchableOpacity style={styles.checkBtn} onPress={() => handleAnalyze(false)}>
                  <Text style={styles.btnText}>Check Safety</Text>
              </TouchableOpacity>
          </View>
        )}

        {/* --- RESULTS BOX --- */}
        {analysisResult && (
          <View style={[styles.resultBox, analysisResult.isSafe ? styles.safe : styles.unsafe]}>
              <Text style={styles.resultTitle}>
                  {analysisResult.isSafe ? "Meal is Safe ✅" : "Caution ⚠️"}
              </Text>
              
              <View style={{backgroundColor: '#f8f9fa', padding: 10, borderRadius: 8, marginVertical: 10}}>
                  <Text style={{fontWeight: 'bold', fontSize: 14, marginBottom: 5}}>Total Meal Nutrients:</Text>
                  <Text style={styles.detailText}>• Sodium: {analysisResult.totalNutrients.sodium.toFixed(0)} mg</Text>
                  <Text style={styles.detailText}>• Potassium: {analysisResult.totalNutrients.potassium.toFixed(0)} mg</Text>
                  <Text style={styles.detailText}>• Phosphorus: {analysisResult.totalNutrients.phosphorus.toFixed(0)} mg</Text>
                  <Text style={styles.detailText}>• Protein: {analysisResult.totalNutrients.protein.toFixed(1)} g</Text>
              </View>

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

      {/* --- SEARCH MODAL --- */}
      <Modal
        visible={searchModalVisible}
        animationType="slide"
        presentationStyle="pageSheet" 
        onRequestClose={() => setSearchModalVisible(false)}
      >
        <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Search Food</Text>
                <TouchableOpacity onPress={() => setSearchModalVisible(false)}>
                    <Ionicons name="close" size={28} color="#333" />
                </TouchableOpacity>
            </View>

            <TextInput
                style={styles.searchInput}
                placeholder="Type food name (e.g. rice)..."
                value={searchText}
                onChangeText={setSearchText}
                autoFocus={true}
            />

            <FlatList
                data={filteredFoods}
                keyExtractor={(item) => item}
                renderItem={({ item }) => (
                    <TouchableOpacity style={styles.searchItem} onPress={() => addManualFood(item)}>
                        <Text style={styles.searchItemText}>{item}</Text>
                        <Ionicons name="add-circle-outline" size={24} color="#007BFF" />
                    </TouchableOpacity>
                )}
                ListEmptyComponent={<Text style={styles.emptyText}>No matching foods found.</Text>}
            />
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 50, backgroundColor: '#fff', flexGrow: 1 },
  header: { fontSize: 24, fontWeight: 'bold', marginBottom: 15, color: '#051C60' },
  subHeader: { fontSize: 18, fontWeight: '600', marginBottom: 10, marginTop: 10 },
  image: { width: '100%', height: 200, borderRadius: 12, marginBottom: 15 },
  placeholder: { width: '100%', height: 150, backgroundColor: '#eee', borderRadius: 12, marginBottom: 15, justifyContent: 'center', alignItems: 'center' },
  buttonRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  scanBtn: { backgroundColor: '#007BFF', padding: 15, borderRadius: 8, alignItems: 'center', width: '48%' },
  galleryBtn: { backgroundColor: '#5D3FD3' },
  checkBtn: { backgroundColor: '#6c757d', padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  eatBtn: { backgroundColor: '#28a745', padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 15 },
  btnText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  
  // Add Food Button
  addFoodBtn: { backgroundColor: '#E7F9EE', padding: 12, borderRadius: 8, alignItems: 'center', marginTop: 5, marginBottom: 15, borderWidth: 1, borderColor: '#28a745' },
  addFoodText: { color: '#28a745', fontSize: 16, fontWeight: '600' },

  listContainer: { marginTop: 10 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: '#eee', padding: 5, borderRadius: 8 },
  foodLabel: { flex: 1.5, fontSize: 16, fontWeight: '500', paddingLeft: 5, textTransform: 'capitalize' }, 
  input: { flex: 0.8, borderWidth: 1, borderColor: '#ccc', borderRadius: 5, padding: 8, textAlign: 'center', marginRight: 5, backgroundColor: '#f9f9f9' },
  pickerContainer: { flex: 1.7, borderWidth: 1, borderColor: '#ccc', borderRadius: 5 },
  picker: { height: 50, width: '100%' },
  trashBtn: { marginLeft: 10, padding: 5 },

  resultBox: { marginTop: 20, padding: 15, borderRadius: 10 },
  safe: { backgroundColor: '#d4edda', borderColor: '#c3e6cb', borderWidth: 1 },
  unsafe: { backgroundColor: '#f8d7da', borderColor: '#f5c6cb', borderWidth: 1 },
  resultTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 10, textAlign: 'center' },
  detailText: { fontSize: 14, marginBottom: 4 },
  divider: { height: 1, backgroundColor: 'rgba(0,0,0,0.1)', marginVertical: 10 },

  // Modal Styles
  modalContainer: { flex: 1, padding: 20, paddingTop: 50, backgroundColor: '#fff' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 22, fontWeight: 'bold', color: '#051C60' },
  searchInput: { borderWidth: 1, borderColor: '#ccc', borderRadius: 10, padding: 12, fontSize: 16, backgroundColor: '#f9f9f9', marginBottom: 15 },
  searchItem: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, borderBottomWidth: 1, borderBottomColor: '#eee', alignItems: 'center' },
  searchItemText: { fontSize: 18, textTransform: 'capitalize', color: '#333' },
  emptyText: { textAlign: 'center', marginTop: 20, color: '#666', fontSize: 16 }
});

export default MealAnalysisScreen;