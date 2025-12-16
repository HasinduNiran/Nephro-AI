import axios from "axios";

// 1. CHANGE Port to 8000
// 2. REMOVE "/api" from the end (unless you really need it)
const BACKEND_URL = "http://10.143.248.166:8000"; 

console.log("API Base URL:", BACKEND_URL);

const instance = axios.create({
  baseURL: BACKEND_URL,
  timeout: 120000, 
  headers: {
    'Content-Type': 'application/json',
  },
});

export default instance;
