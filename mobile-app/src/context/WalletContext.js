import React, { createContext, useState, useContext, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const WalletContext = createContext();

// CKD Stage-based daily limits
const CKD_LIMITS = {
  1: { sodium: 2300, potassium: 4700, phosphorus: 1200, protein: 60 },
  2: { sodium: 2000, potassium: 4000, phosphorus: 1000, protein: 60 },
  3: { sodium: 1500, potassium: 3000, phosphorus: 800, protein: 50 },
  4: { sodium: 1500, potassium: 2000, phosphorus: 800, protein: 45 },
  5: { sodium: 1000, potassium: 2000, phosphorus: 800, protein: 40 },
};

export const WalletProvider = ({ children }) => {
  const [ckdStage, setCkdStage] = useState(3); // Default stage 3
  const [wallet, setWallet] = useState({
    sodium: 0,
    potassium: 0,
    phosphorus: 0,
    protein: 0,
  });

  // Load wallet from storage on mount
  useEffect(() => {
    loadWallet();
    checkAndResetDaily();
  }, []);

  // Check if wallet needs to be reset at midnight
  useEffect(() => {
    const checkMidnight = setInterval(() => {
      checkAndResetDaily();
    }, 60000); // Check every minute

    return () => clearInterval(checkMidnight);
  }, []);

  const checkAndResetDaily = async () => {
    try {
      const lastResetDate = await AsyncStorage.getItem('lastWalletReset');
      const today = new Date().toDateString();

      console.log('🕐 [WalletContext] Checking daily reset...');
      console.log('🕐 [WalletContext] Last reset:', lastResetDate);
      console.log('🕐 [WalletContext] Today:', today);

      if (lastResetDate !== today) {
        console.log('🔄 [WalletContext] New day detected! Auto-resetting wallet...');
        const emptyWallet = { sodium: 0, potassium: 0, phosphorus: 0, protein: 0 };
        await AsyncStorage.setItem('nutrientWallet', JSON.stringify(emptyWallet));
        await AsyncStorage.setItem('lastWalletReset', today);
        setWallet(emptyWallet);
        console.log('✅ [WalletContext] Wallet auto-reset completed');
      } else {
        console.log('✅ [WalletContext] Wallet already reset today');
      }
    } catch (error) {
      console.error('❌ [WalletContext] Error checking daily reset:', error);
    }
  };

  const loadWallet = async () => {
    console.log('💰 [WalletContext] Loading wallet from storage...');
    try {
      const savedWallet = await AsyncStorage.getItem('nutrientWallet');
      const savedStage = await AsyncStorage.getItem('ckdStage');
      
      console.log('💰 [WalletContext] Saved wallet:', savedWallet);
      console.log('💰 [WalletContext] Saved stage:', savedStage);
      
      if (savedWallet) {
        const parsed = JSON.parse(savedWallet);
        console.log('💰 [WalletContext] Parsed wallet:', JSON.stringify(parsed, null, 2));
        setWallet(parsed);
      } else {
        console.log('💰 [WalletContext] No saved wallet found, using defaults');
      }
      if (savedStage) {
        setCkdStage(parseInt(savedStage));
      }
      console.log('✅ [WalletContext] Wallet loaded successfully');
    } catch (error) {
      console.error('❌ [WalletContext] Error loading wallet:', error);
    }
  };

  const saveWallet = async (newWallet) => {
    console.log('💰 [WalletContext] Saving wallet:', JSON.stringify(newWallet, null, 2));
    try {
      await AsyncStorage.setItem('nutrientWallet', JSON.stringify(newWallet));
      setWallet(newWallet);
      console.log('✅ [WalletContext] Wallet saved successfully');
    } catch (error) {
      console.error('❌ [WalletContext] Error saving wallet:', error);
    }
  };

  const updateStage = async (stage) => {
    try {
      await AsyncStorage.setItem('ckdStage', stage.toString());
      setCkdStage(stage);
    } catch (error) {
      console.error('Error saving CKD stage:', error);
    }
  };

  // Add nutrients to wallet (when meal is consumed)
  const addNutrients = async (nutrients) => {
    console.log('➕ [WalletContext] Adding nutrients:', JSON.stringify(nutrients, null, 2));
    console.log('➕ [WalletContext] Current wallet:', JSON.stringify(wallet, null, 2));
    
    const newWallet = {
      sodium: wallet.sodium + (nutrients.sodium || 0),
      potassium: wallet.potassium + (nutrients.potassium || 0),
      phosphorus: wallet.phosphorus + (nutrients.phosphorus || 0),
      protein: wallet.protein + (nutrients.protein || 0),
    };
    
    console.log('➕ [WalletContext] New wallet:', JSON.stringify(newWallet, null, 2));
    await saveWallet(newWallet);
    console.log('✅ [WalletContext] Nutrients added and saved');
  };

  // Reset wallet (start new day) - Manual reset for testing/demos
  const resetWallet = async () => {
    console.log('🔄 [WalletContext] Manual reset requested');
    const emptyWallet = { sodium: 0, potassium: 0, phosphorus: 0, protein: 0 };
    const today = new Date().toDateString();
    await AsyncStorage.setItem('lastWalletReset', today);
    await saveWallet(emptyWallet);
    console.log('✅ [WalletContext] Manual reset completed');
  };

  // Get current limits based on CKD stage
  const getLimits = () => {
    return CKD_LIMITS[ckdStage] || CKD_LIMITS[3];
  };

  // Check if adding nutrients would exceed limits
  const checkSafety = (nutrients) => {
    const limits = getLimits();
    const warnings = [];
    let isSafe = true;

    const checks = [
      { name: 'Sodium', current: wallet.sodium, adding: nutrients.sodium || 0, limit: limits.sodium, unit: 'mg' },
      { name: 'Potassium', current: wallet.potassium, adding: nutrients.potassium || 0, limit: limits.potassium, unit: 'mg' },
      { name: 'Phosphorus', current: wallet.phosphorus, adding: nutrients.phosphorus || 0, limit: limits.phosphorus, unit: 'mg' },
      { name: 'Protein', current: wallet.protein, adding: nutrients.protein || 0, limit: limits.protein, unit: 'g' },
    ];

    checks.forEach(check => {
      const total = check.current + check.adding;
      const percentage = (total / check.limit) * 100;

      if (percentage >= 90) {
        isSafe = false;
        warnings.push(`🔴 ${check.name}: ${total.toFixed(0)}${check.unit} (${percentage.toFixed(0)}% of limit) - DANGER!`);
      } else if (percentage >= 75) {
        warnings.push(`🟡 ${check.name}: ${total.toFixed(0)}${check.unit} (${percentage.toFixed(0)}% of limit) - Warning`);
      }
    });

    return { isSafe, warnings };
  };

  const reloadWallet = () => {
    console.log('🔄 [WalletContext] Manual reload requested');
    loadWallet();
  };

  const value = {
    wallet,
    ckdStage,
    limits: getLimits(),
    getLimits,
    addNutrients,
    resetWallet,
    updateStage,
    checkSafety,
    reloadWallet,
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
};

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within WalletProvider');
  }
  return context;
};
