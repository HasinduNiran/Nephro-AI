import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";

// For physical device, use your computer's IP address
// For Android Emulator, it will use 10.0.2.2
// For iOS Simulator, it will use localhost
//const BACKEND_URL = "http://192.168.184.97:5000/api";

// Centralized IP Configuration
// Change this ONE IP to update both Backend (5000) and Chatbot Server (8001)
const API_IP = "127.0.0.1";

// Exported URLs for use across the app
export const API_URL = `http://${API_IP}:5000/api`;
export const CHATBOT_URL = `http://${API_IP}:8001`;

console.log("API Base URL:", API_URL);
console.log("Chatbot URL:", CHATBOT_URL);

const instance = axios.create({
  baseURL: API_URL,
  timeout: 120000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor – attach JWT token to every request
instance.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem("authToken");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Response interceptor – handle 401 (expired / invalid token)
let logoutCallback = null;

export const setLogoutCallback = (cb) => {
  logoutCallback = cb;
};

instance.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Clear stored auth data
      await AsyncStorage.multiRemove([
        "authToken",
        "userData",
        "userID",
        "userName",
        "userEmail",
      ]);
      if (logoutCallback) {
        logoutCallback();
      }
    }
    return Promise.reject(error);
  },
);

export default instance;
