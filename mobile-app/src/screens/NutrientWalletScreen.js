import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useWallet } from '../context/WalletContext';
import { useFocusEffect } from '@react-navigation/native';

const NutrientWalletScreen = ({ navigation }) => {
  const { wallet, ckdStage, limits, resetWallet: resetWalletContext, reloadWallet } = useWallet();
  const [currentDate, setCurrentDate] = React.useState(new Date());
  
  // Update date every minute
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDate(new Date());
    }, 60000); // Update every minute
    return () => clearInterval(timer);
  }, []);
  
  // Reload wallet data when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      console.log('💳 [NutrientWallet] Screen focused - reloading wallet');
      if (reloadWallet) {
        reloadWallet();
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  useEffect(() => {
    console.log('💳 [NutrientWallet] Wallet updated:', JSON.stringify(wallet, null, 2));
    console.log('💳 [NutrientWallet] CKD Stage:', ckdStage);
    console.log('💳 [NutrientWallet] Limits:', JSON.stringify(limits, null, 2));
  }, [wallet, ckdStage, limits]);

  // Calculate percentage for each nutrient
  const getPercentage = (consumed, limit) => {
    return Math.min((consumed / limit) * 100, 100);
  };

  // Get status color based on percentage
  const getStatusColor = (percentage) => {
    if (percentage >= 90) return '#E74C3C'; // Red - Danger
    if (percentage >= 75) return '#F39C12'; // Orange - Warning
    return '#27AE60'; // Green - Safe
  };

  // Get status text
  const getStatusText = (percentage) => {
    if (percentage >= 90) return 'DANGER';
    if (percentage >= 75) return 'WARNING';
    return 'SAFE';
  };

  // Reset wallet (for testing)
  const handleResetWallet = () => {
    Alert.alert(
      'Reset Wallet',
      'Are you sure you want to reset your nutrient wallet?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            resetWalletContext();
          },
        },
      ]
    );
  };

  const renderNutrientCard = (name, icon, nutrientKey, unit) => {
    const consumed = wallet[nutrientKey];
    const limit = limits[nutrientKey];
    const percentage = getPercentage(consumed, limit);
    const statusColor = getStatusColor(percentage);
    const statusText = getStatusText(percentage);
    const remaining = limit - consumed;

    return (
      <View style={[styles.nutrientCard, { borderLeftColor: statusColor }]}>
        <View style={styles.nutrientHeader}>
          <View style={styles.nutrientTitleContainer}>
            <Ionicons name={icon} size={24} color={statusColor} />
            <Text style={styles.nutrientName}>{name}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>
              {statusText}
            </Text>
          </View>
        </View>

        {/* Progress Bar */}
        <View style={styles.progressBarContainer}>
          <View style={styles.progressBarBackground}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${percentage}%`, backgroundColor: statusColor },
              ]}
            />
          </View>
          <Text style={styles.percentageText}>{percentage.toFixed(0)}%</Text>
        </View>

        {/* Values */}
        <View style={styles.valuesContainer}>
          <View style={styles.valueItem}>
            <Text style={styles.valueLabel}>Consumed</Text>
            <Text style={styles.valueAmount}>
              {consumed.toFixed(0)} {unit}
            </Text>
          </View>
          <View style={styles.valueItem}>
            <Text style={styles.valueLabel}>Remaining</Text>
            <Text style={[styles.valueAmount, { color: statusColor }]}>
              {remaining.toFixed(0)} {unit}
            </Text>
          </View>
          <View style={styles.valueItem}>
            <Text style={styles.valueLabel}>Limit</Text>
            <Text style={styles.valueAmount}>
              {limit} {unit}
            </Text>
          </View>
        </View>
      </View>
    );
  };

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
          <Text style={styles.heroTitle}>Nutrient Wallet</Text>
          <TouchableOpacity style={styles.rightBtn} onPress={handleResetWallet}>
            <Ionicons name="refresh" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Date Info */}
        <View style={styles.dateCard}>
          <Ionicons name="calendar-outline" size={20} color="#4A90E2" />
          <View style={styles.dateTextContainer}>
            <Text style={styles.dateLabel}>Today</Text>
            <Text style={styles.dateValue}>
              {currentDate.toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
            </Text>
          </View>
        </View>

        {/* CKD Stage Info */}
        <View style={styles.stageCard}>
          <View style={styles.stageHeader}>
            <Ionicons name="medical" size={24} color="#4A90E2" />
            <Text style={styles.stageTitle}>CKD Stage {ckdStage}</Text>
          </View>
          <Text style={styles.stageDescription}>
            Daily nutrient limits are set based on your CKD stage
          </Text>
        </View>

        {/* Nutrient Cards */}
        {renderNutrientCard('Sodium', 'water', 'sodium', 'mg')}
        {renderNutrientCard('Potassium', 'nutrition', 'potassium', 'mg')}
        {renderNutrientCard('Phosphorus', 'flash', 'phosphorus', 'mg')}
        {renderNutrientCard('Protein', 'fitness', 'protein', 'g')}

        {/* Action Button */}
        <TouchableOpacity
          style={styles.scanButton}
          onPress={() => navigation.navigate('MealAnalysis')}
        >
          <Ionicons name="camera" size={24} color="#FFF" />
          <Text style={styles.scanButtonText}>Scan New Meal</Text>
        </TouchableOpacity>

        {/* Info Note */}
        <View style={styles.infoNote}>
          <Ionicons name="information-circle-outline" size={20} color="#8E8E93" />
          <Text style={styles.infoNoteText}>
            Your wallet updates automatically when you scan and confirm meals
          </Text>
        </View>
      </ScrollView>
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
    padding: 20,
  },
  dateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
    borderLeftWidth: 4,
    borderLeftColor: '#4A90E2',
  },
  dateTextContainer: {
    marginLeft: 12,
    flex: 1,
  },
  dateLabel: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
    marginBottom: 2,
  },
  dateValue: {
    fontSize: 15,
    color: '#1C1C1E',
    fontWeight: '700',
  },
  stageCard: {
    backgroundColor: '#EBF3FF',
    padding: 16,
    borderRadius: 16,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#4A90E2',
  },
  stageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  stageTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1C1E',
    marginLeft: 8,
  },
  stageDescription: {
    fontSize: 13,
    color: '#5C5C5C',
    marginLeft: 32,
  },
  nutrientCard: {
    backgroundColor: '#FFF',
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
    borderLeftWidth: 5,
    borderLeftColor: '#27AE60',
    shadowColor: '#0a1932',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  nutrientHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  nutrientTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  nutrientName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1C1C1E',
    marginLeft: 8,
    letterSpacing: 0.2,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  progressBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  progressBarBackground: {
    flex: 1,
    height: 10,
    backgroundColor: '#EAECF0',
    borderRadius: 6,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 6,
  },
  percentageText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#3D4A5C',
    marginLeft: 10,
    width: 42,
    textAlign: 'right',
  },
  valuesContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  valueItem: {
    flex: 1,
    alignItems: 'center',
  },
  valueLabel: {
    fontSize: 11,
    color: '#9AA5B4',
    marginBottom: 5,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '600',
  },
  valueAmount: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  scanButton: {
    flexDirection: 'row',
    backgroundColor: '#F5A623',
    padding: 18,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 16,
    shadowColor: '#F5A623',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  scanButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
    marginLeft: 8,
  },
  infoNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  infoNoteText: {
    fontSize: 13,
    color: '#8E8E93',
    marginLeft: 8,
    textAlign: 'center',
    flex: 1,
  },
});

export default NutrientWalletScreen;
