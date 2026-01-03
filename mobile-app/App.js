import "react-native-gesture-handler";
import React from "react";
import { SafeAreaView, StyleSheet } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import { WalletProvider } from './src/context/WalletContext';
import LoginScreen from "./src/screens/LoginScreen";
import SignupScreen from "./src/screens/SignupScreen";
import HomeScreen from "./src/screens/HomeScreen";
import RiskPredictionScreen from "./src/screens/RiskPredictionScreen";
import MealAnalysisScreen from './src/screens/MealAnalysisScreen';
import DietaryManagerScreen from './src/screens/DietaryManagerScreen';
import DietaryPlanScreen from './src/screens/DietaryPlanScreen';
import NutrientWalletScreen from './src/screens/NutrientWalletScreen';
import RiskHistoryScreen from "./src/screens/RiskHistoryScreen";
import ChatbotScreen from "./src/screens/ChatbotScreen";
import ScanLab from "./src/screens/ScanLab";
import ScanAnalysisScreen from "./src/screens/ScanAnalysisScreen";
import ScanResultScreen from "./src/screens/ScanResultScreen";
import LabImageUploadScreen from "./src/screens/LabImageUploadScreen";
import LabAnalysisScreen from "./src/screens/LabAnalysisScreen";
import LabResultScreen from "./src/screens/LabResultScreen";
import ManualLabEntryScreen from "./src/screens/ManualLabEntryScreen";
import FutureCKDStageScreen from "./src/screens/FutureCKDStageScreen";
import FutureCKDStageResultScreen from "./src/screens/FutureCKDStageResultScreen";
import FutureCKDStageHistoryScreen from "./src/screens/FutureCKDStageHistoryScreen";

const Stack = createStackNavigator();

const App = () => {
  return (
    <WalletProvider>
      <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Signup" component={SignupScreen} />
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="RiskPrediction" component={RiskPredictionScreen} />
        <Stack.Screen name="DietaryManager" component={DietaryManagerScreen} />
        <Stack.Screen name="DietaryPlan" component={DietaryPlanScreen} />
        <Stack.Screen name="NutrientWallet" component={NutrientWalletScreen} />
        <Stack.Screen name="MealAnalysis" component={MealAnalysisScreen} />
        <Stack.Screen name="ScanLab" component={ScanLab} />
        <Stack.Screen name="ScanAnalysis" component={ScanAnalysisScreen} />
        <Stack.Screen name="ScanResult" component={ScanResultScreen} />
        <Stack.Screen name="LabImageUpload" component={LabImageUploadScreen} />
        <Stack.Screen name="LabAnalysis" component={LabAnalysisScreen} />
        <Stack.Screen name="LabResult" component={LabResultScreen} />
        <Stack.Screen name="ManualLabEntry" component={ManualLabEntryScreen} />
        <Stack.Screen name="FutureCKDStage" component={FutureCKDStageScreen} />
        <Stack.Screen name="FutureCKDStageResult" component={FutureCKDStageResultScreen} />
        <Stack.Screen name="FutureCKDStageHistory" component={FutureCKDStageHistoryScreen} />
        <Stack.Screen 
          name="RiskHistory" 
          component={RiskHistoryScreen}
          options={{
            headerShown: true,
            title: "Risk History",
            headerStyle: { backgroundColor: "#F5F7FA" },
            headerTintColor: "#1C1C1E",
          }}
        />
        <Stack.Screen name="Chatbot" component={ChatbotScreen} />
      </Stack.Navigator>
    </NavigationContainer>
    </WalletProvider>
  );
};


const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#F9FBFC",
  },
});

export default App;