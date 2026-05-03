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
      <StatusBar barStyle="light-content" backgroundColor="#4A90E2" />

      {/* Hero Header */}
      <View style={styles.heroHeader}>
        <View style={styles.heroCircleLarge} />
        <View style={styles.heroCircleSmall} />
        <View style={styles.heroInner}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.heroTitle}>Dietary Plan</Text>
          <View style={styles.rightBtnPlaceholder} />
        </View>
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
    backgroundColor: '#F0F3F8',
  },
  heroHeader: {
    backgroundColor: '#4A90E2',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 20,
    overflow: 'hidden',
    position: 'relative',
  },
  heroCircleLarge: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.08)',
    top: -50,
    right: -40,
  },
  heroCircleSmall: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.06)',
    bottom: -20,
    left: 30,
  },
  heroInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    flex: 1,
    textAlign: 'center',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rightBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rightBtnPlaceholder: {
    width: 40,
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
    borderRadius: 18,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 6,
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
    fontSize: 17,
    fontWeight: '700',
    color: '#FFF',
    marginBottom: 5,
    letterSpacing: 0.2,
  },
  optionDescription: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.88)',
    lineHeight: 17,
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: '#EBF3FF',
    padding: 16,
    borderRadius: 14,
    marginTop: 24,
    alignItems: 'center',
    borderLeftWidth: 4,
    borderLeftColor: '#4A90E2',
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#2D4A70',
    marginLeft: 12,
    lineHeight: 20,
  },
});

export default DietaryPlanScreen;
