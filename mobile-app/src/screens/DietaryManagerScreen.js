import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
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
        <Text style={styles.cardTitle}>Daily Nutrient Wallet</Text>
        
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
        <Ionicons name="camera-outline" size={22} color="white" />
        <Text style={styles.btnText}>Scan New Meal</Text>
      </TouchableOpacity>
      
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F7FB', padding: 20 },
  headerTitle: { fontSize: 26, fontWeight: '700', color: '#0B2560', marginTop: 14, marginBottom: 4 },
  subText: { fontSize: 14, color: '#7A8499', marginBottom: 22, letterSpacing: 0.2 },
  
  card: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 16,
    marginBottom: 28,
    borderWidth: 1,
    borderColor: '#E8EDF4',
    borderLeftWidth: 4,
    borderLeftColor: '#1a6fe0',
    shadowColor: '#0a1932',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3, 
  },
  cardTitle: { fontSize: 17, fontWeight: '700', marginBottom: 16, color: '#0B2560', letterSpacing: 0.3 },
  
  nutrientRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    marginBottom: 10, 
    borderBottomWidth: 1, 
    borderBottomColor: '#F0F4F9', 
    paddingBottom: 10,
  },
  nutrientLabel: { fontSize: 15, color: '#3D4A5C', fontWeight: '500' },
  nutrientValue: { fontSize: 15, fontWeight: '700' },
  textSafe: { color: '#1e8a3e' },
  textDanger: { color: '#dc3545' },
  errorText: { color: '#9AA5B4', fontStyle: 'italic', marginTop: 10, fontSize: 14 },

  sectionHeader: { fontSize: 16, fontWeight: '700', marginBottom: 14, color: '#0B2560', letterSpacing: 0.3, textTransform: 'uppercase' },
  scanBtn: {
    backgroundColor: '#1a6fe0',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 14,
    shadowColor: '#1a6fe0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  btnText: { color: 'white', fontSize: 16, fontWeight: '700' },
});

export default DietaryManagerScreen;