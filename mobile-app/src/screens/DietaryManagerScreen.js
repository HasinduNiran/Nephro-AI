import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import axios from '../api/axiosConfig';

const DietaryManagerScreen = ({ route, navigation }) => {
  // Get User ID passed from Home Screen
  const { userId } = route.params || {}; 
  
  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(true);

  // Fetch Wallet Data
  const fetchWalletStatus = async () => {
    try {
      if (!userId) {
          console.log("No User ID provided");
          return;
      }
      const response = await axios.get(`/mealPlate/status/${userId}`);
      setWallet(response.data);
    } catch (error) {
      console.error("Failed to fetch wallet:", error);
    } finally {
      setLoading(false);
    }
  };

  // Refresh data whenever screen comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchWalletStatus();
    }, [userId])
  );

  const NutrientBar = ({ label, value, unit = "mg" }) => {
    const isLow = value < 0; 
    return (
      <View style={styles.nutrientRow}>
        <Text style={styles.nutrientLabel}>{label}</Text>
        <Text style={[styles.nutrientValue, isLow ? styles.textDanger : styles.textSafe]}>
          {value.toFixed(0)} {unit} remaining
        </Text>
      </View>
    );
  };

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchWalletStatus} />}
    >
      <Text style={styles.headerTitle}>Dietary Manager</Text>
      <Text style={styles.subText}>Track your daily intake and manage meals.</Text>

      {/* --- SECTION 1: NUTRIENT WALLET --- */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Daily Nutrient Wallet 🥗</Text>
        
        {loading ? (
          <Text>Loading wallet...</Text>
        ) : wallet ? (
          <View>
            <NutrientBar label="Sodium" value={wallet.sodium} />
            <NutrientBar label="Potassium" value={wallet.potassium} />
            <NutrientBar label="Phosphorus" value={wallet.phosphorus} />
            <NutrientBar label="Protein" value={wallet.protein} unit="g" />
          </View>
        ) : (
          <Text style={styles.errorText}>No wallet active. Scan a meal to start tracking!</Text>
        )}
      </View>

      {/* --- SECTION 2: ACTIONS --- */}
      <Text style={styles.sectionHeader}>Actions</Text>
      
      <TouchableOpacity 
        style={styles.scanBtn} 
        onPress={() => navigation.navigate("MealAnalysis", { userId })}
      >
        <Text style={styles.btnEmoji}>📸</Text>
        <Text style={styles.btnText}>Scan New Meal</Text>
      </TouchableOpacity>
      
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FBFC', padding: 20 },
  headerTitle: { fontSize: 26, fontWeight: 'bold', color: '#051C60', marginTop: 10 },
  subText: { fontSize: 16, color: 'gray', marginBottom: 20 },
  
  card: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 15,
    marginBottom: 30,
    elevation: 3, 
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  cardTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 15, color: '#333' },
  
  nutrientRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    marginBottom: 12, 
    borderBottomWidth: 1, 
    borderBottomColor: '#f0f0f0', 
    paddingBottom: 8 
  },
  nutrientLabel: { fontSize: 16, color: '#555' },
  nutrientValue: { fontSize: 16, fontWeight: 'bold' },
  textSafe: { color: '#28a745' },
  textDanger: { color: '#dc3545' },
  errorText: { color: 'gray', fontStyle: 'italic', marginTop: 10 },

  sectionHeader: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, color: '#051C60' },
  scanBtn: {
    backgroundColor: '#007BFF',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
    borderRadius: 12,
    elevation: 3,
  },
  btnEmoji: { fontSize: 24, marginRight: 10 },
  btnText: { color: 'white', fontSize: 18, fontWeight: 'bold' }
});

export default DietaryManagerScreen;