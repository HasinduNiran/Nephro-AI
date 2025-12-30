import axios from "axios";

// 1. CHANGE Port to 8000
// 2. REMOVE "/api" from the end (unless you really need it)
const BACKEND_URL = "http://172.20.10.2:8081"; 

console.log("API Base URL:", BACKEND_URL);

const instance = axios.create({
  baseURL: BACKEND_URL,
  timeout: 120000, 
  headers: {
    'Content-Type': 'application/json',
  },
});

export default instance;
