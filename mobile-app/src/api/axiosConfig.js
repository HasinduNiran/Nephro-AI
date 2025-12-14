import axios from "axios";
import Constants from "expo-constants";

// Function to dynamically get the base URL
const getBaseUrl = () => {
  // 1. If you have a production URL set in env vars, use it
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }

  // 2. For Expo Go (Development)
  // hostUri contains the IP and port of your computer (e.g., 192.168.1.5:8081)
  const hostUri = Constants.expoConfig?.hostUri;
  
  if (hostUri) {
    const ip = hostUri.split(':')[0];
    // Assuming your backend runs on port 5000
    return `http://${ip}:5000/api`;
  }

  // 3. Fallback for Simulators/Emulators if hostUri is missing
  return "http://localhost:5000/api";
};

const BASE_URL = getBaseUrl();

console.log("API Base URL:", BASE_URL);

const instance = axios.create({
  baseURL: BASE_URL,
});

export default instance;
