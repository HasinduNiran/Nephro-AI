"""
Patient Data Handler for Nephro-AI
Manages retrieval of patient records (Mock implementation for prototype).
In production, this would connect to a MongoDB database.
"""

from typing import Dict, Optional
from datetime import datetime


class PatientDataManager:
    def __init__(self):
        """Initialize with mock data"""
        self.mock_db = {
            "default_patient": {
                "id": "P001",
                "name": "John Doe",
                "age": 58,
                "diagnosis": "Chronic Kidney Disease",
                "stage": "Stage 3b",
                "egfr": 38,
                "comorbidities": ["Hypertension", "Type 2 Diabetes"],
                "medications": ["Lisinopril", "Metformin", "Atorvastatin"],
                "recent_labs": {
                    "creatinine": 1.8,
                    "potassium": 4.8,
                    "sodium": 138,
                    "calcium": 9.2,
                    "phosphorus": 3.9,
                    "albumin": 4.0
                },
                "dietary_restrictions": ["Moderate Sodium", "Monitor Potassium"],
                "last_updated": datetime.now().strftime("%Y-%m-%d") # Mock timestamp
            },
            "lasal": {
                "id": "P002",
                "name": "Lasal",
                "age": 24,
                "gender": "Male",
                "district": "Anuradhapura",
                "diagnosis": "High Risk (CKD Suspect)",
                "stage": "Observation",
                "egfr": 95, # Inferred Normal for Age 24
                "comorbidities": ["Uncontrolled Hypertension", "Diabetes Mellitus"],
                "medications": ["Metformin", "Losartan"],
                "recent_labs": {
                    "creatinine": 0.9, # Normal
                    "potassium": 4.2,
                    "sodium": 140,
                    "calcium": 9.5,
                    "phosphorus": 3.5,
                    "albumin": 4.5
                },
                "dietary_restrictions": ["Low Sugar", "Low Salt"],
                "last_updated": datetime.now().strftime("%Y-%m-%d")
            }
        }
    
    def get_patient_record(self, patient_id: str = "default_patient") -> Dict:
        """
        Retrieve patient record by ID
        
        Args:
            patient_id: Unique patient identifier
            
        Returns:
            Dictionary containing patient data or empty dict if not found
        """
        return self.mock_db.get(patient_id, {})

    def get_last_update_timestamp(self, patient_id: str = "default_patient") -> str:
        """
        Get the last updated timestamp for a patient's data.
        Used for cache invalidation.
        """
        record = self.get_patient_record(patient_id)
        if not record:
            return "unknown_version"
        return record.get("last_updated", "unknown_version")

    def get_patient_context_string(self, patient_id: str = "default_patient") -> str:
        """
        Get a formatted string summary of patient context for the LLM
        """
        record = self.get_patient_record(patient_id)
        if not record:
            return "No patient record found."
            
        # Calculate data age
        last_updated = record.get('last_updated', 'Unknown')
        data_age_warning = ""
        try:
            last_date = datetime.strptime(last_updated, "%Y-%m-%d")
            days_old = (datetime.now() - last_date).days
            if days_old > 0:
                data_age_warning = f" (Data is {days_old} days old)"
            else:
                data_age_warning = " (Data is from today)"
        except:
            pass

        context = (
            f"--- CRITICAL: CURRENT PATIENT STATE (As of {last_updated}{data_age_warning}) ---\n"
            f"Patient Profile:\n"
            f"- Name: {record['name']} ({record['age']} years)\n"
            f"- Diagnosis: {record['diagnosis']} ({record['stage']})\n"
            f"- eGFR: {record['egfr']} mL/min\n"
            f"- Comorbidities: {', '.join(record['comorbidities'])}\n"
            f"- Current Medications: {', '.join(record['medications'])}\n"
            f"- Recent Labs: Potassium {record['recent_labs']['potassium']}, "
            f"Creatinine {record['recent_labs']['creatinine']}\n"
        )
        return context

if __name__ == "__main__":
    # Test
    mgr = PatientDataManager()
    print(mgr.get_patient_context_string())
