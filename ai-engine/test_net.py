import os
import requests
from dotenv import load_dotenv

# Load environment variables
load_dotenv()
API_KEY = os.getenv("OPENROUTER_API_KEY") # Make sure this matches your .env key name!

print(f"🔑 Key loaded? {'Yes' if API_KEY else 'No'}")

print("📡 Testing connection to OpenRouter...")
try:
    response = requests.post(
        url="https://openrouter.ai/api/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost:8000", 
            "X-Title": "Nephro-AI Test"
        },
        json={
            # ✅ FIX: Use a stable model ID
            "model": "google/gemini-2.0-flash-001", 
            "messages": [{"role": "user", "content": "Say hi"}]
        },
        timeout=10 
    )
    
    if response.status_code == 200:
        print("✅ SUCCESS! Internet is working.")
        print("Response:", response.json()['choices'][0]['message']['content'])
    else:
        print(f"❌ FAILED. Status Code: {response.status_code}")
        print(f"Response: {response.text}")

except Exception as e:
    print(f"❌ CRITICAL NETWORK ERROR: {e}")
