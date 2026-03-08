import json
# Replace 'patient_data' with the actual filename if it is different
from patient_data import PatientDataManager

def verify_database_integration():
    print("\n🔍 Starting Nephro-AI Database Verification...")
    
    # 1. Initialize the Manager
    try:
        mgr = PatientDataManager()
    except Exception as e:
        print(f"❌ Failed to initialize PatientDataManager: {e}")
        return

    # 2. Input a real ID from your database
    print("\n💡 Tip: Open MongoDB Compass, go to the 'users' collection, and copy an ObjectId string.")
    test_id = input("🔑 Enter a valid User ObjectId to test: ").strip()
    
    if not test_id:
        print("⚠️ No ID entered. Exiting test.")
        return

    print(f"\n📡 Fetching live data across all 4 collections for Patient ID: {test_id}...\n")
    
    # 3. Fetch the Raw Record
    record = mgr.get_patient_record(test_id)
    
    if not record or record.get("name") == "Unknown":
        print("❌ Test Failed: Could not pull a complete record. Check your ObjectId, MongoDB URI, or Database Name.")
        return

    # 4. Print the Raw Dictionary (Backend View)
    print("✅ 1. RAW DATA DICTIONARY (What your Python backend sees):")
    print("-" * 60)
    # default=str handles datetime objects so json.dumps doesn't crash
    print(json.dumps(record, indent=4, default=str))
    print("-" * 60)

    # 5. Print the LLM Context String (AI View)
    print("\n✅ 2. LLM CONTEXT STRING (What Gemini AI actually reads):")
    print("-" * 60)
    context_string = mgr.get_patient_context_string(test_id)
    print(context_string)
    print("-" * 60)
    
    print("\n🎉 Verification Complete! Check the output above to ensure no values say 'Unknown' or 'N/A' incorrectly.")

if __name__ == "__main__":
    verify_database_integration()