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
  
  // Reload wallet data when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      console.log('💳 [NutrientWallet] Screen focused - reloading wallet');
      if (reloadWallet) {
        reloadWallet();
      }
    }, [reloadWallet])
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
      <View style={styles.nutrientCard}>
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
      <StatusBar barStyle="dark-content" backgroundColor="#F5F7FA" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color="#1C1C1E" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Nutrient Wallet</Text>
        <TouchableOpacity onPress={handleResetWallet} style={styles.resetButton}>
          <Ionicons name="refresh" size={24} color="#4A90E2" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
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
  resetButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  content: {
    padding: 20,
  },
  stageCard: {
    backgroundColor: '#E3F2FD',
    padding: 16,
    borderRadius: 16,
    marginBottom: 20,
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
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
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1C1E',
    marginLeft: 8,
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
    backgroundColor: '#E5E5EA',
    borderRadius: 5,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 5,
  },
  percentageText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1C1C1E',
    marginLeft: 12,
    width: 45,
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
    fontSize: 12,
    color: '#8E8E93',
    marginBottom: 4,
  },
  valueAmount: {
    fontSize: 16,
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
