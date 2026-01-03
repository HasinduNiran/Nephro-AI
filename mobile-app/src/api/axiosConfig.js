import axios from "axios";

// For physical device, use your computer's IP address
// For Android Emulator, it will use 10.0.2.2
// For iOS Simulator, it will use localhost
const BASE_URL = "http://192.168.137.1:5000/api";

console.log("API Base URL:", BASE_URL);

const instance = axios.create({
  baseURL: BASE_URL,
  timeout: 120000, 
  headers: {
    'Content-Type': 'application/json',
  },
});

export default instance;
