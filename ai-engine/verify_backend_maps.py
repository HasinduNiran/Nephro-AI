import requests
import time
import sys

def test_maps_tag():
    url = "http://localhost:8000/chat/text"
    payload = {
        "text": "Where is Anuradhapura Teaching Hospital?",
        "patient_id": "test_mobile_user"
    }
    
    print(f"🚀 Sending request to {url}...")
    try:
        response = requests.post(url, json=payload)
        response.raise_for_status()
        
        data = response.json()
        bot_response = data.get("response", "")
        
        print(f"\n📩 Received Response:\n{bot_response}\n")
        
        if "[MAPS:" in bot_response:
            print("✅ SUCCESS: [MAPS:] tag found in response!")
            print(f"   Tag: {bot_response.split('[MAPS:')[1].split(']')[0]}")
            return True
        else:
            print("❌ FAILURE: [MAPS:] tag NOT found.")
            return False
            
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

if __name__ == "__main__":
    # Wait for server to potentially start
    print("⏳ Waiting 5s for server to be ready...")
    time.sleep(5)
    
    if test_maps_tag():
        sys.exit(0)
    else:
        sys.exit(1)
