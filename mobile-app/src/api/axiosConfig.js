import axios from "axios";

// Backend API URL - Change IP to your computer's IP and port to 5000
const BACKEND_URL = "http://192.168.8.128:5000/api"; 

console.log("API Base URL:", BACKEND_URL);

const instance = axios.create({
  baseURL: BACKEND_URL,
  timeout: 120000, 
  headers: {
    'Content-Type': 'application/json',
  },
});

export default instance;
