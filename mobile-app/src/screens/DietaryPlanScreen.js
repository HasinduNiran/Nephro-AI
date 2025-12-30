import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const DietaryPlanScreen = ({ navigation }) => {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F7FA" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color="#1C1C1E" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Dietary Plan</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Content */}
      <View style={styles.content}>
        <Text style={styles.subtitle}>Manage your nutrition intake</Text>

        {/* Nutrient Wallet Button */}
        <TouchableOpacity
          style={[styles.optionCard, { backgroundColor: '#4A90E2' }]}
          onPress={() => navigation.navigate('NutrientWallet')}
          activeOpacity={0.8}
        >
          <View style={styles.iconCircle}>
            <Ionicons name="wallet" size={32} color="#FFF" />
          </View>
          <View style={styles.optionTextContainer}>
            <Text style={styles.optionTitle}>Nutrient Wallet</Text>
            <Text style={styles.optionDescription}>
              Track your daily nutrient limits and consumption
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#FFF" />
        </TouchableOpacity>

        {/* Scan Meal Button */}
        <TouchableOpacity
          style={[styles.optionCard, { backgroundColor: '#F5A623' }]}
          onPress={() => navigation.navigate('MealAnalysis')}
          activeOpacity={0.8}
        >
          <View style={styles.iconCircle}>
            <Ionicons name="camera" size={32} color="#FFF" />
          </View>
          <View style={styles.optionTextContainer}>
            <Text style={styles.optionTitle}>Scan Meal</Text>
            <Text style={styles.optionDescription}>
              Analyze your meal plate and check nutrient safety
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#FFF" />
        </TouchableOpacity>

        {/* Info Card */}
        <View style={styles.infoCard}>
          <Ionicons name="information-circle" size={24} color="#4A90E2" />
          <Text style={styles.infoText}>
            Scan your meals to track nutrients and manage your CKD diet effectively
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  content: {
    flex: 1,
    padding: 24,
  },
  subtitle: {
    fontSize: 16,
    color: '#8E8E93',
    marginBottom: 32,
    textAlign: 'center',
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderRadius: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  optionTextContainer: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFF',
    marginBottom: 4,
  },
  optionDescription: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.9)',
    lineHeight: 18,
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: '#E3F2FD',
    padding: 16,
    borderRadius: 16,
    marginTop: 24,
    alignItems: 'center',
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#1C1C1E',
    marginLeft: 12,
    lineHeight: 20,
  },
});

export default DietaryPlanScreen;
