import "react-native-gesture-handler";
import React from "react";
import { SafeAreaView, StyleSheet } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import LoginScreen from "./src/screens/LoginScreen";
import SignupScreen from "./src/screens/SignupScreen";
import HomeScreen from "./src/screens/HomeScreen";
import RiskPredictionScreen from "./src/screens/RiskPredictionScreen";
import RiskHistoryScreen from "./src/screens/RiskHistoryScreen";

const Stack = createStackNavigator();

const App = () => {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Signup" component={SignupScreen} />
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="RiskPrediction" component={RiskPredictionScreen} />
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
      </Stack.Navigator>
    </NavigationContainer>
  );
};


const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#F9FBFC",
  },
});

export default App;
