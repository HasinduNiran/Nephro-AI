import axios from "axios";


// For physical device, use your computer's IP address
// For Android Emulator, it will use 10.0.2.2
// For iOS Simulator, it will use localhost
//const BACKEND_URL = "http://192.168.184.97:5000/api";


// Centralized IP Configuration
// Change this ONE IP to update both Backend (5000) and Chatbot Server (8001)
const API_IP = "172.28.2.151";



// Exported URLs for use across the app
export const API_URL = `http://${API_IP}:5000/api`;
export const CHATBOT_URL = `http://${API_IP}:8001`;

console.log("API Base URL:", API_URL);
console.log("Chatbot URL:", CHATBOT_URL);

const instance = axios.create({
  baseURL: API_URL,
  timeout: 120000, 
  headers: {
    'Content-Type': 'application/json',
  },
});

export default instance;
