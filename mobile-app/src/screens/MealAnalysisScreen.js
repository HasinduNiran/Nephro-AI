import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Image,
  ScrollView,
  TextInput,
  Alert,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  FlatList,
  Platform,
  KeyboardAvoidingView,
  Dimensions,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { Picker } from "@react-native-picker/picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "../api/axiosConfig";
import { useWallet } from "../context/WalletContext";
import { Ionicons } from "@expo/vector-icons";
import PlateCamera from "../components/PlateCamera";

// --- LOCAL DATABASE ---
// Case-insensitive lookup helper — handles "beans curry" matching "Beans curry"
const _foodDBKeys = {}; // built lazily after foodNutrientDB is defined
const lookupFood = (name) => {
  if (!name) return null;
  // Exact match first (fast path)
  if (foodNutrientDB[name]) return foodNutrientDB[name];
  // Case-insensitive fallback
  const lower = name.toLowerCase();
  if (!_foodDBKeys._built) {
    Object.keys(foodNutrientDB).forEach((k) => { _foodDBKeys[k.toLowerCase()] = k; });
    _foodDBKeys._built = true;
  }
  const canonical = _foodDBKeys[lower];
  return canonical ? foodNutrientDB[canonical] : null;
};

const foodNutrientDB = {
  avacado: {
    protein: 2,
    sodium: 7,
    potassium: 485,
    phosphorus: 52,
    units: { whole_fruit: 200, half_fruit: 100, tbsp: 15 },
  },
  "Beans curry": {
    protein: 2,
    sodium: 200,
    potassium: 250,
    phosphorus: 40,
    units: { tbsp: 15 },
  },
  beetroot: {
    protein: 1.6,
    sodium: 78,
    potassium: 325,
    phosphorus: 40,
    units: { tbsp: 15 },
  },
  chicken: {
    protein: 31,
    sodium: 74,
    potassium: 256,
    phosphorus: 228,
    units: { small_piece: 50, large_piece: 100 },
  },
  cutlet: {
    protein: 12,
    sodium: 300,
    potassium: 200,
    phosphorus: 150,
    units: { small: 40, large: 80 },
  },
  "dahl curry": {
    protein: 6,
    sodium: 250,
    potassium: 300,
    phosphorus: 180,
    units: { tbsp: 15, serving_spoon: 60 },
  },
  "fish curry": {
    protein: 20,
    sodium: 350,
    potassium: 350,
    phosphorus: 200,
    units: { small_piece: 50, large_piece: 100 },
  },
  "fried rice": {
    protein: 4,
    sodium: 400,
    potassium: 100,
    phosphorus: 90,
    units: { serving_spoon: 60, tea_cup: 150 },
  },
  mallum: {
    protein: 3,
    sodium: 20,
    potassium: 400,
    phosphorus: 50,
    units: { tbsp: 15, serving_spoon: 60 },
  },
  "mallum - gotukola": {
    protein: 2,
    sodium: 15,
    potassium: 380,
    phosphorus: 45,
    units: { tbsp: 15, serving_spoon: 60 },
  },
  "mallum - mukunuwenna": {
    protein: 3.5,
    sodium: 25,
    potassium: 420,
    phosphorus: 55,
    units: { tbsp: 15, serving_spoon: 60 },
  },
  "mallum - murunga": {
    protein: 4,
    sodium: 18,
    potassium: 450,
    phosphorus: 60,
    units: { tbsp: 15, serving_spoon: 60 },
  },
  "mallum - kathurumurunga": {
    protein: 3.8,
    sodium: 20,
    potassium: 410,
    phosphorus: 52,
    units: { tbsp: 15, serving_spoon: 60 },
  },
  "mallum - asamodagam": {
    protein: 2.5,
    sodium: 22,
    potassium: 390,
    phosphorus: 48,
    units: { tbsp: 15, serving_spoon: 60 },
  },
  pineapple: {
    protein: 0.5,
    sodium: 1,
    potassium: 109,
    phosphorus: 8,
    units: { piece_cube: 20, slice: 80 },
  },
  "Pol sambol": {
    protein: 3,
    sodium: 400,
    potassium: 300,
    phosphorus: 100,
    units: { tbsp: 15 },
  },
  "Pol sambol - tempered": {
    protein: 3,
    sodium: 450,
    potassium: 320,
    phosphorus: 105,
    units: { tbsp: 15 },
  },
  "Pol sambol - lime added": {
    protein: 3,
    sodium: 380,
    potassium: 310,
    phosphorus: 98,
    units: { tbsp: 15 },
  },
  "red rice": {
    protein: 2.5,
    sodium: 1,
    potassium: 85,
    phosphorus: 78,
    units: { serving_spoon: 60, tea_cup: 150 },
  },
  roti: {
    protein: 8,
    sodium: 320,
    potassium: 120,
    phosphorus: 100,
    units: { small: 40, large: 80 },
  },
  "tempered sprats": {
    protein: 35,
    sodium: 900,
    potassium: 400,
    phosphorus: 350,
    units: { tbsp: 15 },
  },
  "white rice": {
    protein: 2.7,
    sodium: 1,
    potassium: 35,
    phosphorus: 35,
    units: { serving_spoon: 60, tea_cup: 150 },
  },
};

const MealAnalysisScreen = ({ route, navigation }) => {
  const { wallet, addNutrients, checkSafety, getLimits, ckdStage, updateStage } = useWallet();
  const [userId, setUserId] = useState(route.params?.userId || null);
  const [userEmail, setUserEmail] = useState(null); // used to fetch real CKD stage
  const [imageUri, setImageUri] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [ckdStageSource, setCkdStageSource] = useState(null); // 'predicted' | 'default'

  const [showGuidelines, setShowGuidelines] = useState(false);
  const [searchModalVisible, setSearchModalVisible] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [hasScanned, setHasScanned] = useState(false);
  const [showAnalysisModal, setShowAnalysisModal] = useState(false);
  const [imageSource, setImageSource] = useState(null); // 'camera' or 'gallery'
  const [showPlateCamera, setShowPlateCamera] = useState(false); // Custom camera with overlay
  const [debugImageUri, setDebugImageUri] = useState(null); // SAM segmentation debug image
  const [alignmentImageUri, setAlignmentImageUri] = useState(null); // mask alignment check

  useEffect(() => {
    const loadUser = async () => {
      try {
        const storedUser = await AsyncStorage.getItem("user");
        if (storedUser) {
          const userData = JSON.parse(storedUser);
          if (!userId) setUserId(userData._id || userData.id || "temp_user_001");
          setUserEmail(userData.email || null);  // always load email for CKD stage lookup
        } else if (!userId) {
          setUserId("temp_user_001");
        }
      } catch (error) {
        console.error("Error loading user:", error);
        if (!userId) setUserId("temp_user_001");
      }
    };
    loadUser();
  }, []);

  // --- FETCH REAL CKD STAGE FROM BACKEND ---
  // Fires once userEmail is available. Looks up the patient's latest
  // StageProgressionRecord and applies the correct nutrient limits.
  useEffect(() => {
    if (!userEmail) {
      console.log("[CKD-STAGE] ⚠️  userEmail not yet available — skipping stage fetch");
      return;
    }

    const fetchRealCKDStage = async () => {
      const url = `/mealPlate/ckd-stage/${encodeURIComponent(userEmail)}`;
      console.log(`[CKD-STAGE] 🔍 Fetching CKD stage for email: "${userEmail}"`);
      console.log(`[CKD-STAGE] 🌐 Request URL: ${url}`);

      try {
        const response = await axios.get(url);
        console.log("[CKD-STAGE] 📦 Raw server response:", JSON.stringify(response.data));

        if (response.data?.success && response.data?.ckdStage) {
          const fetchedStage = response.data.ckdStage;
          const source = response.data.source; // 'predicted' or 'default'

          console.log(`[CKD-STAGE] ✅ Stage received: ${fetchedStage}  |  Source: "${source}"`);
          console.log(`[CKD-STAGE] 🔄 Calling updateStage(${fetchedStage}) — WalletContext limits will update now`);

          updateStage(fetchedStage);
          setCkdStageSource(source);

          console.log(`[CKD-STAGE] ✔️  Done — MealAnalysisScreen is now using Stage ${fetchedStage} nutrient limits`);
        } else {
          console.warn("[CKD-STAGE] ⚠️  Response missing ckdStage or success=false:", response.data);
        }
      } catch (err) {
        console.warn("[CKD-STAGE] 🔴 Network/server error fetching CKD stage:", err.message);
        console.warn("[CKD-STAGE]    Keeping existing WalletContext stage value as fallback");
      }
    };

    fetchRealCKDStage();
  }, [userEmail]);

  const handleCameraPress = () => {
    setImageSource("camera");
    setShowGuidelines(true);
  };

  const handleGalleryPress = () => {
    setImageSource("gallery");
    setShowGuidelines(true);
  };

  const confirmAndProceed = () => {
    setShowGuidelines(false);
    setTimeout(() => {
      if (imageSource === "camera") {
        // Open the custom camera with plate overlay
        setShowPlateCamera(true);
      } else if (imageSource === "gallery") {
        pickImageGallery();
      }
    }, 300);
  };

  // --- HANDLE PHOTO FROM PLATE CAMERA ---
  const handlePlateCameraCapture = (uri) => {
    setShowPlateCamera(false);
    setImageUri(uri);
    detectFoods(uri);
  };

  // --- CAMERA & GALLERY ---
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
      Alert.alert("Error", "Failed to open camera: " + error.message);
    }
  };

  const pickImageGallery = async () => {
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
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
      Alert.alert("Error", "Failed to open gallery: " + error.message);
    }
  };

  // --- HELPER: Get food variants ---
  const getFoodVariants = (foodName) => {
    const normalized = foodName.toLowerCase();

    if (normalized.includes("mallum")) {
      return [
        "mallum - gotukola",
        "mallum - mukunuwenna",
        "mallum - murunga",
        "mallum - kathurumurunga",
        "mallum - asamodagam",
      ];
    }

    if (normalized.includes("sambol") || normalized.includes("pol sambol")) {
      return ["Pol sambol - tempered", "Pol sambol - lime added"];
    }

    return null;
  };

  // --- DETECT ---
  const detectFoods = async (uri) => {
    setLoading(true);
    setAnalysisResult(null);
    setItems([]);
    setHasScanned(false);

    try {
      const formData = new FormData();

      // Handle Web vs Mobile platform differences
      if (Platform.OS === "web") {
        // For Web: Fetch the image and convert to Blob
        const response = await fetch(uri);
        const blob = await response.blob();
        formData.append("image", blob, "meal.jpg");
      } else {
        // For Mobile: Use the standard React Native approach
        formData.append("image", {
          uri: uri,
          name: "meal.jpg",
          type: "image/jpeg",
        });
      }

      const response = await axios.post("/mealPlate/detect", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      console.log("Backend Response:", response.data);

      // Store SAM debug visualization url (append timestamp to force Image reload)
      if (response.data.debug_image_url) {
        setDebugImageUri(response.data.debug_image_url + "?t=" + Date.now());
      }
      if (response.data.alignment_check_url) {
        setAlignmentImageUri(response.data.alignment_check_url + "?t=" + Date.now());
      }

      const detectedData = response.data.portions || response.data.detected_foods || response.data.detected || [];
      const hasAutoPortions = true;

      const initialItems = detectedData.map((item) => {
        // Normalize YOLO names: "Beans_curry" → "Beans curry"
        let foodName = item.food.replace(/_/g, " ");
        const variants = getFoodVariants(foodName);

        // If this food has variants, use the first one as default
        if (variants && variants.length > 0) {
          foodName = variants[0];
        }

        let units = item.availableUnits || [];
        if (
          !units ||
          units.length === 0 ||
          (units.length === 1 && units[0] === "grams")
        ) {
          const localFood = lookupFood(foodName);
          if (localFood && localFood.units) {
            units = Object.keys(localFood.units).filter(
              (u) => u && u !== "undefined",
            );
          } else {
            units = ["grams"];
          }
        } else {
          // Filter out undefined or invalid values from backend response
          units = units.filter((u) => u && u !== "undefined" && u !== null);
        }

        // --- AUTO PORTION: Use AI-estimated grams if available ---
        let autoAmount = "1";
        let autoUnit = "grams";
        let estimatedGramsValue = null;

        // Try to get estimated grams from the object, handling possible variations in the property name
        if (item.autoPortionGrams !== undefined) {
          estimatedGramsValue = item.autoPortionGrams;
        } else if (item.estimated_grams !== undefined) {
          estimatedGramsValue = item.estimated_grams;
        } else if (item.grams !== undefined) {
          estimatedGramsValue = item.grams;
        } else if (item.portion_grams !== undefined) {
          estimatedGramsValue = item.portion_grams;
        }

        if (
          hasAutoPortions &&
          estimatedGramsValue !== null &&
          estimatedGramsValue > 0
        ) {
          autoAmount = String(Math.round(estimatedGramsValue));
          autoUnit = "grams";
        }

        return {
          food: foodName,
          amount: autoAmount,
          unit: autoUnit,
          availableUnits: units && units.length > 0 ? units : ["grams"],
          hasVariants: variants !== null,
          variants: variants || [],
          autoEstimated: hasAutoPortions && estimatedGramsValue > 0,
          autoPortionGrams: estimatedGramsValue ? Math.round(estimatedGramsValue) : null, // raw AI grams — source of truth
          manuallyEdited: false,                          // set true when user changes amount/unit
          compartment: item.compartment || null,
        };
      });

      setItems(initialItems);

      if (initialItems.length === 0) {
        Alert.alert(
          "No Food Detected",
          "Try searching and adding food manually.",
        );
      } else if (hasAutoPortions) {
        Alert.alert(
          "Auto Portions Estimated",
          "Portion sizes have been automatically estimated from the plate compartments. You can adjust them if needed.",
          [{ text: "OK" }],
        );
      }
    } catch (error) {
      console.error("Detection Error:", error);
      Alert.alert(
        "Error",
        "Could not analyze the image. You can add food manually.",
      );
    } finally {
      setLoading(false);
      setHasScanned(true);
    }
  };

  // --- CALCULATE ---
  const calculateMealNutrients = () => {
    let totalNutrients = { sodium: 0, potassium: 0, phosphorus: 0, protein: 0 };
    let breakdown = [];

    items.forEach((item) => {
      // Case-insensitive lookup handles "Beans_curry" → "Beans curry" → "Beans curry" DB key
      const normalizedName = item.food.replace(/_/g, " ");
      const foodData = lookupFood(normalizedName);
      if (!foodData) return;

      let totalGrams;
      if (!item.manuallyEdited && item.autoPortionGrams && item.autoPortionGrams > 0) {
        // AI-estimated grams — most accurate, use directly
        totalGrams = item.autoPortionGrams;
      } else if (item.unit === "grams") {
        // Manual entry already in grams
        totalGrams = parseFloat(item.amount || 0);
      } else {
        // Manual household unit (e.g. 2 tbsp, 1 serving_spoon)
        totalGrams = (foodData.units[item.unit] || 100) * parseFloat(item.amount || 0);
      }

      const itemNutrients = {
        sodium:     (foodData.sodium     * totalGrams) / 100,
        potassium:  (foodData.potassium  * totalGrams) / 100,
        phosphorus: (foodData.phosphorus * totalGrams) / 100,
        protein:    (foodData.protein    * totalGrams) / 100,
      };

      // --- PORTION VERIFICATION LOG ---
      const portionSource = !item.manuallyEdited && item.autoPortionGrams && item.autoPortionGrams > 0
        ? "AI-auto"
        : item.isManuallyAdded
        ? "manual-add"
        : "manual-edit";
      console.log(
        `[Portion] ${normalizedName.padEnd(20)} | compartment: ${(item.compartment || "n/a").padEnd(12)} | source: ${portionSource.padEnd(11)} | ${totalGrams.toFixed(1)}g` +
        ` → Na:${itemNutrients.sodium.toFixed(1)}mg  K:${itemNutrients.potassium.toFixed(1)}mg  P:${itemNutrients.phosphorus.toFixed(1)}mg  Pro:${itemNutrients.protein.toFixed(1)}g`
      );

      totalNutrients.sodium     += itemNutrients.sodium;
      totalNutrients.potassium  += itemNutrients.potassium;
      totalNutrients.phosphorus += itemNutrients.phosphorus;
      totalNutrients.protein    += itemNutrients.protein;

      breakdown.push({
        food: normalizedName,
        amount: item.manuallyEdited
          ? `${item.amount} ${item.unit}`
          : `${totalGrams.toFixed(0)}g (AI)`,
        grams: totalGrams,
        ...itemNutrients,
      });
    });

    // --- TOTALS SUMMARY LOG ---
    console.log(
      `[Portion] ${"── TOTALS ──".padEnd(20)} | items: ${items.length}` +
      ` → Na:${totalNutrients.sodium.toFixed(1)}mg  K:${totalNutrients.potassium.toFixed(1)}mg  P:${totalNutrients.phosphorus.toFixed(1)}mg  Pro:${totalNutrients.protein.toFixed(1)}g`
    );

    return { totalNutrients, breakdown };
  };

  // --- SAVE ---
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
    let hasWarnings = false;
    let foodSuggestions = [];

    const checkNutrient = (name, current, meal, limit) => {
      const total = current + meal;
      const percentage = (total / limit) * 100;
      if (percentage > 100) {
        isSafe = false;
        warnings.push(
          `${name}: ${total.toFixed(0)}/${limit}mg (${percentage.toFixed(0)}%) - EXCEEDED`,
        );

        // Find food contributing most to this nutrient
        const nutrientKey = name.toLowerCase();
        const topContributor = breakdown.reduce((max, item) =>
          item[nutrientKey] > max[nutrientKey] ? item : max,
        );

        if (topContributor && topContributor[nutrientKey] > 0) {
          const contribution = (
            (topContributor[nutrientKey] / meal) *
            100
          ).toFixed(0);
          foodSuggestions.push({
            nutrient: name,
            food: topContributor.food,
            amount: topContributor[nutrientKey].toFixed(0),
            contribution: contribution,
          });
        }
      } else if (percentage > 80) {
        hasWarnings = true;
        warnings.push(
          `${name}: ${total.toFixed(0)}/${limit}mg (${percentage.toFixed(0)}%) - High`,
        );
      }
    };

    checkNutrient(
      "Sodium",
      wallet.sodium,
      totalNutrients.sodium,
      limits.sodium,
    );
    checkNutrient(
      "Potassium",
      wallet.potassium,
      totalNutrients.potassium,
      limits.potassium,
    );
    checkNutrient(
      "Phosphorus",
      wallet.phosphorus,
      totalNutrients.phosphorus,
      limits.phosphorus,
    );
    checkNutrient(
      "Protein",
      wallet.protein,
      totalNutrients.protein,
      limits.protein,
    );

    if (confirm) {
      await addNutrients(totalNutrients);

      if (userId && userId !== "temp_user_001") {
        try {
          console.log("💾 Saving to history...");
          await axios.post("/mealPlate/save-meal", {
            userId: userId,
            items: items.map((i) => ({
              food: i.food,
              amount: i.amount,
              unit: i.unit,
              grams: breakdown.find((b) => b.food === i.food)?.grams || 0,
            })),
            totalNutrients: totalNutrients,
            date: new Date().toISOString().split("T")[0],
          });
          console.log("✅ History saved!");
        } catch (saveError) {
          console.error("Failed to save history:", saveError);
        }
      }

      Alert.alert("Meal Saved", "Meal confirmed and saved!", [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    } else {
      let status = "safe";
      if (!isSafe) {
        status = "unsafe";
      } else if (hasWarnings) {
        status = "warning";
      }

      setAnalysisResult({
        isSafe: isSafe,
        status: status,
        warnings: warnings.length > 0 ? warnings : safetyCheck.warnings,
        foodSuggestions: foodSuggestions,
        breakdown: breakdown.map((b) => ({
          food: b.food,
          details: `${b.amount} (${b.grams.toFixed(0)}g): Na ${b.sodium.toFixed(0)}mg, K ${b.potassium.toFixed(0)}mg`,
        })),
        totalNutrients,
      });
      setShowAnalysisModal(true);
    }
  };

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
        style: "destructive",
        onPress: () => {
          const updated = [...items];
          updated.splice(index, 1);
          setItems(updated);
          if (updated.length === 0) setAnalysisResult(null);
        },
      },
    ]);
  };

  const addManualFood = (foodName) => {
    // Check if food already exists in the list (exact match)
    const existingFood = items.find((item) => item.food === foodName);

    if (existingFood) {
      Alert.alert(
        "Food Already Added",
        `${foodName} is already in your meal. You can adjust the amount instead.`,
        [{ text: "OK" }],
      );
      setSearchModalVisible(false);
      setSearchText("");
      return;
    }

    // Check if this food is a variant of an existing food or vice versa
    const foodBaseName = foodName.replace(
      / - (gotukola|mukunuwenna|murunga|kathurumurunga|asamodagam|tempered|lime added)/i,
      "",
    );
    const isDuplicate = items.some((item) => {
      const itemBaseName = item.food.replace(
        / - (gotukola|mukunuwenna|murunga|kathurumurunga|asamodagam|tempered|lime added)/i,
        "",
      );
      return foodBaseName.toLowerCase() === itemBaseName.toLowerCase();
    });

    if (isDuplicate) {
      const existingItem = items.find((item) => {
        const itemBaseName = item.food.replace(
          / - (gotukola|mukunuwenna|murunga|kathurumurunga|asamodagam|tempered|lime added)/i,
          "",
        );
        return foodBaseName.toLowerCase() === itemBaseName.toLowerCase();
      });
      Alert.alert(
        "Similar Food Already Added",
        `${existingItem.food} is already in your meal. You can adjust the amount or change the variety instead.`,
        [{ text: "OK" }],
      );
      setSearchModalVisible(false);
      setSearchText("");
      return;
    }

    const foodData = foodNutrientDB[foodName];
    if (foodData) {
      const units = Object.keys(foodData.units).filter(
        (u) => u && u !== "undefined",
      );
      // Give them 'grams' as a fallback if they want
      const availableUnits = units.length > 0 ? units : ["grams"];
      
      const newItem = {
        food: foodName,
        amount: "1",
        unit: availableUnits[0], // Fallback to household unit explicitly
        availableUnits: availableUnits,
        isManuallyAdded: true,
      };
      setItems([...items, newItem]);
      setSearchModalVisible(false);
      setSearchText("");
    }
  };

  const filteredFoods = Object.keys(foodNutrientDB).filter((key) =>
    key.toLowerCase().includes(searchText.toLowerCase()),
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#4A90E2" }} edges={["top"]}>
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#F0F3F8" }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      enabled
    >
      <StatusBar barStyle="light-content" backgroundColor="#4A90E2" />

      {/* Hero Header */}
      <View style={styles.heroHeader}>
        <View style={styles.heroCircleLarge} />
        <View style={styles.heroCircleSmall} />
        <View style={styles.heroInner}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.heroTitle}>Meal Analysis</Text>
          <View style={styles.rightBtnPlaceholder} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={true}
        nestedScrollEnabled={true}
        automaticallyAdjustKeyboardInsets={true}
      >
        {imageUri ? (
          <View style={styles.imageContainer}>
            <Image source={{ uri: imageUri }} style={styles.image} />
            <TouchableOpacity
              style={styles.removeImageIcon}
              onPress={() => {
                setImageUri(null);
                setItems([]);
                setAnalysisResult(null);
                setHasScanned(false);
                setDebugImageUri(null);
                setAlignmentImageUri(null);
              }}
            >
              <Ionicons name="close-circle" size={32} color="#dc3545" />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.placeholder}>
            <Text>No Image Selected</Text>
          </View>
        )}

        {/* SAM Segmentation Debug View */}
        {debugImageUri && (
          <View style={{ marginTop: 12, marginBottom: 4, alignItems: "center" }}>
            <Text style={{ fontSize: 12, color: "#555", marginBottom: 4, fontWeight: "600" }}>
              SAM Segmentation Preview
            </Text>
            <Image
              source={{ uri: debugImageUri }}
              style={{ width: "100%", height: 220, borderRadius: 10, borderWidth: 1, borderColor: "#ddd" }}
              resizeMode="contain"
            />
          </View>
        )}

        {/* Alignment Verification View */}
        {alignmentImageUri && (
          <View style={{ marginTop: 8, marginBottom: 4, alignItems: "center" }}>
            <Text style={{ fontSize: 12, color: "#555", marginBottom: 4, fontWeight: "600" }}>
              Calibration Mask Alignment Check
            </Text>
            <Text style={{ fontSize: 10, color: "#888", marginBottom: 4, textAlign: "center" }}>
              Orange = main carb · Green = side 1 · Blue = side 2{"\n"}Zones should land exactly inside the plate compartments
            </Text>
            <Image
              source={{ uri: alignmentImageUri }}
              style={{ width: "100%", height: 220, borderRadius: 10, borderWidth: 1, borderColor: "#c3e6cb" }}
              resizeMode="contain"
            />
          </View>
        )}

        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={styles.scanBtn}
            onPress={handleCameraPress}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <View style={styles.btnInner}>
                <Ionicons name="camera-outline" size={20} color="#fff" />
                <Text style={[styles.btnText, { marginLeft: 8 }]}>Scan Meal</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {hasScanned && (
          <TouchableOpacity
            style={styles.addFoodBtn}
            onPress={() => setSearchModalVisible(true)}
          >
            <Text style={styles.addFoodText}>+ Add Food Manually</Text>
          </TouchableOpacity>
        )}

        {items.length > 0 && (
          <View style={styles.listContainer}>
            <Text style={styles.subHeader}>Verify Portions:</Text>

            {items.map((item, index) => (
              <View key={index} style={styles.itemCard}>
                <View style={styles.foodRow}>
                  {item.hasVariants && item.variants.length > 0 ? (
                    <View style={styles.foodNameSection}>
                      <Text style={styles.categoryLabel}>
                        {item.food.includes("mallum")
                          ? " Mallum"
                          : " Pol Sambol"}
                      </Text>
                      <View style={styles.variantPickerWrapper}>
                        <Picker
                          selectedValue={item.food}
                          style={styles.variantPicker}
                          onValueChange={(val) => {
                            const updated = [...items];
                            updated[index].food = val;
                            const localFood = lookupFood(val);
                            if (localFood && localFood.units) {
                              const newUnits = Object.keys(
                                localFood.units,
                              ).filter((u) => u && u !== "undefined");
                              updated[index].availableUnits =
                                newUnits.length > 0 ? newUnits : ["grams"];
                              updated[index].unit = newUnits[0] || "grams";
                            }
                            setItems(updated);
                          }}
                        >
                          {item.variants.map((variant, vIdx) => (
                            <Picker.Item
                              key={`${variant}-${vIdx}`}
                              label={variant
                                .replace(/mallum - |Pol sambol - /i, "")
                                .toUpperCase()}
                              value={variant}
                            />
                          ))}
                        </Picker>
                      </View>
                    </View>
                  ) : (
                    <Text style={styles.foodLabelStatic}>{item.food}</Text>
                  )}
                  <TouchableOpacity
                    onPress={() => removeItem(index)}
                    style={styles.deleteIcon}
                  >
                    <Ionicons name="close-circle" size={24} color="#dc3545" />
                  </TouchableOpacity>
                </View>

                {/* Amount + Unit inputs for manually added items; grams display for AI-estimated */}
                {item.isManuallyAdded || item.manuallyEdited ? (
                  <View style={styles.portionRow}>
                    <View style={styles.portionControl}>
                      <Text style={styles.portionLabel}>Amount</Text>
                      <TextInput
                        style={styles.amountInput}
                        value={item.amount}
                        onChangeText={(val) => updateRow(index, "amount", val)}
                        keyboardType="numeric"
                        placeholder="1"
                      />
                    </View>
                    <View style={styles.portionControl}>
                      <Text style={styles.portionLabel}>Unit</Text>
                      <View style={styles.unitPickerWrapper}>
                        <Picker
                          selectedValue={item.unit}
                          style={styles.unitPicker}
                          onValueChange={(val) => updateRow(index, "unit", val)}
                        >
                          {item.availableUnits.map((u, uIdx) => (
                            <Picker.Item
                              key={`${u}-${uIdx}`}
                              label={u.replace(/_/g, " ")}
                              value={u}
                            />
                          ))}
                        </Picker>
                      </View>
                    </View>
                  </View>
                ) : (
                  <View style={styles.gramsRow}>
                    <Ionicons name="scale-outline" size={16} color="#007BFF" />
                    <Text style={styles.gramsText}>
                      {item.autoPortionGrams && !item.manuallyEdited
                        ? `${item.autoPortionGrams}g`
                        : item.unit === "grams"
                        ? `${item.amount}g`
                        : `${item.amount} ${item.unit?.replace(/_/g, " ")}`}
                    </Text>
                    {item.autoEstimated && !item.manuallyEdited && (
                      <Text style={styles.gramsSubLabel}>
                        {" "}· AI · {item.compartment?.replace(/_/g, " ")}
                      </Text>
                    )}
                    <TouchableOpacity
                      onPress={() => {
                        const localFood = lookupFood(item.food);
                        let firstUnit = "grams";
                        if (localFood && localFood.units) {
                          const unitKeys = Object.keys(localFood.units).filter(u => u !== "undefined");
                          if (unitKeys.length > 0) {
                            firstUnit = unitKeys[0];
                          }
                        }
                        updateRow(index, "unit", firstUnit);
                        updateRow(index, "manuallyEdited", true);
                      }}
                      style={{ marginLeft: 10, padding: 4 }}
                    >
                      <Ionicons name="create-outline" size={18} color="#555" />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))}

            <View style={styles.stageSelectorContainer}>
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
                <Text style={styles.stageSelectorLabel}>CKD Stage for Nutrient Limits:</Text>
                {ckdStageSource === "predicted" && (
                  <View style={{ backgroundColor: "#d4edda", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, marginLeft: 8 }}>
                    <Text style={{ fontSize: 10, color: "#155724", fontWeight: "700" }}>✓ Auto-loaded</Text>
                  </View>
                )}
                {ckdStageSource === "default" && (
                  <View style={{ backgroundColor: "#fff3cd", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, marginLeft: 8 }}>
                    <Text style={{ fontSize: 10, color: "#856404", fontWeight: "700" }}>No prediction found</Text>
                  </View>
                )}
              </View>
              <View style={styles.stagePickerWrapper}>
                <Picker
                  selectedValue={ckdStage}
                  style={styles.stagePicker}
                  onValueChange={(itemValue) => updateStage(parseInt(itemValue))}
                >
                  <Picker.Item label="Stage 1 (Mild)" value={1} />
                  <Picker.Item label="Stage 2 (Mild)" value={2} />
                  <Picker.Item label="Stage 3 (Moderate)" value={3} />
                  <Picker.Item label="Stage 4 (Severe)" value={4} />
                  <Picker.Item label="Stage 5 (Failure)" value={5} />
                </Picker>
              </View>
              <Text style={styles.stageHelpText}>
                {ckdStageSource === "predicted"
                  ? "Loaded from your latest CKD prediction — you can override if needed"
                  : "Nutrient safety limits adjust automatically"}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.checkBtn}
              onPress={() => handleAnalyze(false)}
            >
              <Text style={styles.btnText}>Check Safety</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* --- ANALYSIS RESULT MODAL --- */}
      <Modal
        visible={showAnalysisModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowAnalysisModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.analysisModalBox,
              analysisResult?.status === "safe"
                ? styles.safeModal
                : analysisResult?.status === "warning"
                  ? styles.warningModal
                  : styles.unsafeModal,
            ]}
          >
            <View style={styles.analysisModalTitleRow}>
              <Ionicons
                name={
                  analysisResult?.status === "safe"
                    ? "checkmark-circle"
                    : analysisResult?.status === "warning"
                    ? "warning-outline"
                    : "close-circle"
                }
                size={28}
                color={
                  analysisResult?.status === "safe"
                    ? "#28a745"
                    : analysisResult?.status === "warning"
                    ? "#e08f00"
                    : "#dc3545"
                }
              />
              <Text
                style={[
                  styles.analysisModalTitle,
                  analysisResult?.status === "safe"
                    ? styles.safeTitle
                    : analysisResult?.status === "warning"
                      ? styles.warningTitle
                      : styles.unsafeTitle,
                ]}
              >
                {analysisResult?.status === "safe"
                  ? "Meal is Safe"
                  : analysisResult?.status === "warning"
                  ? "Caution"
                  : "Unsafe Meal"}
              </Text>
            </View>

            <ScrollView
              style={styles.modalScrollView}
              showsVerticalScrollIndicator={true}
              nestedScrollEnabled={true}
            >
              <View style={styles.nutrientSummary}>
                <Text style={styles.nutrientSummaryTitle}>
                  Total Meal Nutrients:
                </Text>
                <Text style={styles.nutrientDetail}>
                  • Sodium: {analysisResult?.totalNutrients.sodium.toFixed(0)}{" "}
                  mg
                </Text>
                <Text style={styles.nutrientDetail}>
                  • Potassium:{" "}
                  {analysisResult?.totalNutrients.potassium.toFixed(0)} mg
                </Text>
                <Text style={styles.nutrientDetail}>
                  • Phosphorus:{" "}
                  {analysisResult?.totalNutrients.phosphorus.toFixed(0)} mg
                </Text>
                <Text style={styles.nutrientDetail}>
                  • Protein: {analysisResult?.totalNutrients.protein.toFixed(1)}{" "}
                  g
                </Text>
              </View>

              {analysisResult?.warnings?.length > 0 && (
                <View style={styles.warningsBox}>
                  <Text style={styles.warningsTitle}>Warnings:</Text>
                  {analysisResult.warnings.map((w, i) => (
                    <Text key={i} style={styles.warningText}>
                      • {w}
                    </Text>
                  ))}
                </View>
              )}

              {analysisResult?.foodSuggestions?.length > 0 && (
                <View style={styles.suggestionsBox}>
                  <View style={styles.suggestionsTitleRow}>
                    <Ionicons name="bulb-outline" size={15} color="#cc0000" />
                    <Text style={[styles.suggestionsTitle, { marginLeft: 6 }]}>
                      Dietary Suggestions
                    </Text>
                  </View>
                  {analysisResult.foodSuggestions.map((suggestion, i) => (
                    <View key={i} style={styles.suggestionItem}>
                      <Text style={styles.suggestionText}>
                        •{" "}
                        <Text style={styles.suggestionBold}>
                          {suggestion.food}
                        </Text>{" "}
                        contributes {suggestion.contribution}% of{" "}
                        {suggestion.nutrient} ({suggestion.amount}mg)
                      </Text>
                      <Text style={styles.suggestionAction}>
                        Consider removing or reducing this item
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>

            <View style={styles.modalButtonRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowAnalysisModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={() => {
                  setShowAnalysisModal(false);
                  handleAnalyze(true);
                }}
              >
                <Text style={styles.btnText}>Confirm & Eat</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* --- PHOTO INSTRUCTIONS MODAL --- */}
      <Modal
        visible={showGuidelines}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowGuidelines(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.guidelineBox}>
            <Text style={styles.guideTitle}>Before You Scan</Text>
            <Text style={styles.guideSubtitle}>3 quick tips for accurate results</Text>

            {/* Tip row */}
            <View style={styles.tipRow}>
              <View style={styles.tipCard}>
                <Image
                  source={require("../../assets/plate_overlay_camera.png")}
                  style={styles.tipImage}
                />
                <Text style={styles.tipLabel}>Use the standard{"\n"}3-section plate</Text>
              </View>

              <View style={styles.tipCard}>
                <View style={styles.tipIconBox}>
                  <Ionicons name="apps-outline" size={32} color="#4A90E2" />
                </View>
              <Text style={styles.tipLabel}>{"Spread food\ndon't pile it"}</Text>
              </View>

              <View style={styles.tipCard}>
                <View style={styles.tipIconBox}>
                  <Ionicons name="phone-portrait-outline" size={32} color="#4A90E2" />
                </View>
                <Text style={styles.tipLabel}>Hold camera{"\n"}directly above</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.iUnderstandBtn}
              onPress={confirmAndProceed}
            >
              <Text style={styles.btnText}>Continue</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setShowGuidelines(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
              <TouchableOpacity
                style={styles.searchItem}
                onPress={() => addManualFood(item)}
              >
                <Text style={styles.searchItemText}>{item}</Text>
                <Ionicons name="add-circle-outline" size={24} color="#007BFF" />
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <Text style={styles.emptyText}>No matching foods found.</Text>
            }
          />
        </View>
      </Modal>

      {/* --- CUSTOM PLATE CAMERA WITH OVERLAY --- */}
      <PlateCamera
        visible={showPlateCamera}
        onCapture={handlePlateCameraCapture}
        onClose={() => setShowPlateCamera(false)}
      />
    </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingTop: 10,
    paddingBottom: 30,
    backgroundColor: "#fff",
    flexGrow: 1,
  },
  heroHeader: {
    backgroundColor: "#4A90E2",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 20,
    overflow: "hidden",
    position: "relative",
  },
  heroCircleLarge: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(255,255,255,0.08)",
    top: -50,
    right: -40,
  },
  heroCircleSmall: {
    position: "absolute",
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "rgba(255,255,255,0.06)",
    bottom: -20,
    left: 30,
  },
  heroInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heroTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
    flex: 1,
    textAlign: "center",
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  rightBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  rightBtnPlaceholder: {
    width: 40,
  },
  headerSpacer: {
    width: 40,
  },
  subHeader: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 10,
    marginTop: 10,
  },
  imageContainer: { position: "relative", width: "100%", marginBottom: 15 },
  image: { width: "100%", height: 200, borderRadius: 12 },
  removeImageIcon: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 5,
  },
  placeholder: {
    width: "100%",
    height: 160,
    backgroundColor: "#EEF2F8",
    borderRadius: 14,
    marginBottom: 15,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#D4DCE8",
    borderStyle: "dashed",
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  scanBtn: {
    backgroundColor: "#E8A000",
    paddingVertical: 16,
    paddingHorizontal: 10,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    width: "100%",
    shadowColor: "#b87800",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  stageSelectorContainer: {
    backgroundColor: "#F7FAFC",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 16,
    marginTop: 10,
  },
  stageSelectorLabel: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#4A5568",
    marginBottom: 6,
  },
  stagePickerWrapper: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 8,
    overflow: "hidden",
  },
  stagePicker: {
    height: 50,
    width: "100%",
  },
  stageHelpText: {
    fontSize: 12,
    color: "#718096",
    marginTop: 6,
    fontStyle: "italic",
    textAlign: "center",
  },
  checkBtn: {
    backgroundColor: "#4A5568",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 12,
  },
  btnInner: { flexDirection: "row", alignItems: "center" },
  eatBtn: {
    backgroundColor: "#28a745",
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 15,
  },
  btnText: { color: "white", fontSize: 16, fontWeight: "bold" },
  addFoodBtn: {
    backgroundColor: "#F0FBF4",
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 6,
    marginBottom: 15,
    borderWidth: 1.5,
    borderColor: "#28a745",
  },
  addFoodText: { color: "#1e8a3e", fontSize: 15, fontWeight: "700", letterSpacing: 0.3 },
  listContainer: { marginTop: 10 },
  itemCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E8EDF2",
    borderLeftWidth: 4,
    borderLeftColor: "#4A90E2",
    shadowColor: "#0a1932",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  foodRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  foodNameSection: { flex: 1, marginRight: 10 },
  categoryLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#495057",
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  variantPickerWrapper: {
    borderWidth: 1,
    borderColor: "#007BFF",
    borderRadius: 8,
    backgroundColor: "#f0f8ff",
    height: 55,
  },
  variantPicker: { height: 55, width: "100%", color: "#007BFF", fontSize: 15 },
  foodLabelStatic: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: "#212529",
    textTransform: "capitalize",
  },
  deleteIcon: { padding: 5 },
  gramsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
  },
  gramsText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#007BFF",
    marginLeft: 6,
  },
  gramsSubLabel: {
    fontSize: 12,
    color: "#6c757d",
    fontWeight: "400",
  },
  autoEstimateBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E8F4FD",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 8,
    alignSelf: "flex-start",
  },
  autoEstimateText: {
    fontSize: 12,
    color: "#007BFF",
    marginLeft: 4,
    fontWeight: "500",
  },
  portionRow: { flexDirection: "row", gap: 12 },
  portionControl: { flex: 1 },
  portionLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6c757d",
    marginBottom: 6,
  },
  amountInput: {
    borderWidth: 1,
    borderColor: "#ced4da",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    textAlign: "center",
    backgroundColor: "#fff",
    fontWeight: "600",
    height: 55,
  },
  unitPickerWrapper: {
    borderWidth: 1,
    borderColor: "#ced4da",
    borderRadius: 8,
    backgroundColor: "#fff",
    height: 55,
  },
  unitPicker: { height: 55, width: "100%", fontSize: 15, fontWeight: "500" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#eee",
    padding: 5,
    borderRadius: 8,
  },
  foodLabel: {
    flex: 1.5,
    fontSize: 16,
    fontWeight: "500",
    paddingLeft: 5,
    textTransform: "capitalize",
  },
  input: {
    flex: 0.8,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 5,
    padding: 8,
    textAlign: "center",
    marginRight: 5,
    backgroundColor: "#f9f9f9",
  },
  pickerContainer: {
    flex: 1.7,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 5,
  },
  picker: { height: 50, width: "100%" },
  trashBtn: { marginLeft: 10, padding: 5 },
  resultBox: { marginTop: 20, padding: 15, borderRadius: 10 },
  safe: { backgroundColor: "#d4edda", borderColor: "#c3e6cb", borderWidth: 1 },
  unsafe: {
    backgroundColor: "#f8d7da",
    borderColor: "#f5c6cb",
    borderWidth: 1,
  },
  resultTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 10,
    textAlign: "center",
  },
  detailText: { fontSize: 14, marginBottom: 4 },
  divider: {
    height: 1,
    backgroundColor: "rgba(0,0,0,0.1)",
    marginVertical: 10,
  },

  // --- IMPROVED MODAL STYLES ---
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  guidelineBox: {
    width: SCREEN_W * 0.88,
    maxHeight: SCREEN_H * 0.72,
    backgroundColor: "white",
    borderRadius: 22,
    paddingHorizontal: 22,
    paddingTop: 26,
    paddingBottom: 20,
    alignItems: "center",
    elevation: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
  },
  guideTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 4,
    color: "#1C1C1E",
    textAlign: "center",
    letterSpacing: 0.3,
  },
  guideSubtitle: {
    fontSize: 13,
    color: "#7A8499",
    marginBottom: 22,
    textAlign: "center",
  },
  tipRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    marginBottom: 22,
    gap: 10,
  },
  tipCard: {
    flex: 1,
    alignItems: "center",
    backgroundColor: "#F4F8FF",
    borderRadius: 14,
    paddingVertical: 20,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: "#D8E8FF",
  },
  tipImage: {
    width: 64,
    height: 64,
    resizeMode: "contain",
    marginBottom: 12,
  },
  tipIconBox: {
    width: 64,
    height: 64,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  tipLabel: {
    fontSize: 12,
    color: "#2D4A70",
    textAlign: "center",
    fontWeight: "600",
    lineHeight: 17,
  },
  sectionTitle: {
    width: "100%",
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 10,
    marginTop: 5,
    textAlign: "left",
    paddingLeft: 10,
  },
  guideRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    width: "100%",
    marginBottom: 15,
  },
  guideItem: {
    alignItems: "center",
    width: "45%",
  },
  plateCircle: {
    width: 70, // Smaller to fit two rows
    height: 70,
    borderRadius: 35,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 5,
  },
  pileOfFood: {
    width: 40,
    height: 40,
    backgroundColor: "#ffcccc",
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  miniFood: {
    width: 25,
    height: 25,
    borderRadius: 12,
    margin: 2,
  },
  badLabel: {
    color: "#dc3545",
    fontWeight: "bold",
    fontSize: 14,
    marginBottom: 2,
  },
  goodLabel: {
    color: "#28a745",
    fontWeight: "bold",
    fontSize: 14,
    marginBottom: 2,
  },
  guideDesc: {
    textAlign: "center",
    fontSize: 11,
    color: "#666",
    lineHeight: 14,
  },

  dividerLight: {
    width: "100%",
    height: 1,
    backgroundColor: "#eee",
    marginVertical: 10,
  },

  iUnderstandBtn: {
    backgroundColor: "#E8A000",
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 14,
    marginTop: 6,
    marginBottom: 6,
    width: "100%",
    alignItems: "center",
    shadowColor: "#b87800",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  cancelText: {
    color: "#9AA5B4",
    fontSize: 14,
    paddingVertical: 8,
    paddingHorizontal: 16,
    fontWeight: "500",
  },

  // Search Modal
  modalContainer: {
    flex: 1,
    padding: 20,
    paddingTop: (StatusBar.currentHeight || 44) + 10,
    backgroundColor: "#fff",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: { fontSize: 22, fontWeight: "bold", color: "#1C1C1E" },
  searchInput: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    backgroundColor: "#f9f9f9",
    marginBottom: 15,
  },
  searchItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    alignItems: "center",
  },
  searchItemText: { fontSize: 18, textTransform: "capitalize", color: "#333" },
  emptyText: {
    textAlign: "center",
    marginTop: 20,
    color: "#666",
    fontSize: 16,
  },

  // Analysis Result Modal
  analysisModalBox: {
    width: "88%",
    maxHeight: "78%",
    backgroundColor: "white",
    borderRadius: 20,
    padding: 22,
    elevation: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
  },
  analysisModalTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginBottom: 18,
  },
  modalScrollView: {
    maxHeight: "100%",
  },
  safeModal: {
    borderWidth: 3,
    borderColor: "#28a745",
    backgroundColor: "#f0fff4",
  },
  warningModal: {
    borderWidth: 3,
    borderColor: "#ffc107",
    backgroundColor: "#fffbf0",
  },
  unsafeModal: {
    borderWidth: 3,
    borderColor: "#dc3545",
    backgroundColor: "#fff5f5",
  },
  analysisModalTitle: {
    fontSize: 21,
    fontWeight: "700",
    textAlign: "center",
    letterSpacing: 0.3,
  },
  safeTitle: {
    color: "#28a745",
  },
  warningTitle: {
    color: "#ffc107",
  },
  unsafeTitle: {
    color: "#dc3545",
  },
  nutrientSummary: {
    backgroundColor: "#F4F8FF",
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#D8E8FF",
  },
  nutrientSummaryTitle: {
    fontWeight: "700",
    fontSize: 14,
    marginBottom: 10,
    color: "#1a3060",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  nutrientDetail: {
    fontSize: 14,
    marginBottom: 5,
    color: "#495057",
  },
  warningsBox: {
    backgroundColor: "#fffbf0",
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#f5d66a",
    borderLeftWidth: 4,
    borderLeftColor: "#e08f00",
  },
  warningsTitle: {
    fontWeight: "700",
    fontSize: 14,
    color: "#7d5800",
    marginBottom: 6,
  },
  warningText: {
    color: "#856404",
    fontSize: 13,
    marginBottom: 3,
  },
  suggestionsBox: {
    backgroundColor: "#fff5f5",
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#ffc0c0",
    borderLeftWidth: 4,
    borderLeftColor: "#dc3545",
  },
  suggestionsTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  suggestionsTitle: {
    fontWeight: "700",
    fontSize: 14,
    color: "#cc0000",
  },
  suggestionItem: {
    marginBottom: 8,
  },
  suggestionText: {
    color: "#8b0000",
    fontSize: 13,
    lineHeight: 18,
  },
  suggestionBold: {
    fontWeight: "bold",
    color: "#cc0000",
  },
  suggestionAction: {
    color: "#8b0000",
    fontSize: 12,
    fontStyle: "italic",
    marginTop: 2,
  },
  modalButtonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    gap: 10,
  },
  modalCancelBtn: {
    flex: 1,
    backgroundColor: "#4A5568",
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: "center",
  },
  modalCancelText: {
    color: "white",
    fontSize: 15,
    fontWeight: "600",
  },
  modalConfirmBtn: {
    flex: 1,
    backgroundColor: "#1e8a3e",
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: "center",
  },
});

export default MealAnalysisScreen;
