"""
Patient Data Handler for Nephro-AI
Retrieves live patient records from MongoDB across four collections:
  users       → core identity (name, birthday, gender, district, email)
  labtests    → kidney function (eGFR, creatinine, bun, albumin, ckdStage)
  riskrecords → risk level & comorbidity flags (hypertension, diabetes)
  bprecords   → blood pressure (systolic, diastolic) & HbA1c
"""

import sys
from pathlib import Path
from typing import Dict
from datetime import datetime

# Allow `from chatbot import config` when running as __main__ or via server
sys.path.insert(0, str(Path(__file__).parent.parent))

from pymongo import MongoClient
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError
from bson.objectid import ObjectId
from bson.errors import InvalidId

from chatbot import config


class PatientDataManager:
    def __init__(self):
        """Connect to MongoDB. A short server-selection timeout means the AI
        server starts quickly even when MongoDB is temporarily unreachable."""
        try:
            self._client = MongoClient(
                config.MONGODB_URI,
                serverSelectionTimeoutMS=3000,
            )
            # Lightweight ping to validate the connection at startup
            self._client.admin.command("ping")
            self._db = self._client[config.MONGODB_DB_NAME]
            print(f"✅ PatientDataManager: Connected to MongoDB ({config.MONGODB_DB_NAME})")
        except (ConnectionFailure, ServerSelectionTimeoutError) as e:
            print(f"⚠️ PatientDataManager: MongoDB unavailable — {e}")
            self._client = None
            self._db = None

    # ------------------------------------------------------------------
    # Public interface (same signatures as the old mock implementation)
    # ------------------------------------------------------------------

    def get_patient_record(self, patient_id: str = "default_patient") -> Dict:
        """Retrieve a live patient record by MongoDB ObjectId string."""
        if self._db is None:
            print("⚠️ PatientDataManager: No DB connection — returning empty record.")
            return {}

        # 1. Resolve patient ObjectId
        try:
            user_obj_id = ObjectId(patient_id.strip())
        except (InvalidId, AttributeError):
            print(f"⚠️ PatientDataManager: '{patient_id}' is not a valid ObjectId.")
            return {}

        # 2. Core identity (users collection)
        user = self._db.users.find_one({"_id": user_obj_id})
        if not user:
            print(f"⚠️ PatientDataManager: No user found for id '{patient_id}'.")
            return {}

        age = "Unknown"
        if user.get("birthday"):
            age = datetime.now().year - user["birthday"].year

        # 3. Most recent lab result (labtests — FK is userEmail)
        lab = self._db.labtests.find_one(
            {"userEmail": user.get("email", "")},
            sort=[("createdAt", -1)],
        ) or {}

        # 4. Most recent risk assessment (riskrecords — FK is userId ObjectId)
        risk = self._db.riskrecords.find_one(
            {"userId": user_obj_id},
            sort=[("createdAt", -1)],
        ) or {}

        # 5. Most recent BP reading (bprecords — FK is userId ObjectId)
        bp = self._db.bprecords.find_one(
            {"userId": user_obj_id},
            sort=[("createdAt", -1)],
        ) or {}

        # 6. Comorbidities from riskrecord vitalSigns boolean flags
        vitals = risk.get("vitalSigns", {})
        comorbidities = []
        if vitals.get("hypertension"):
            comorbidities.append("Hypertension")
        if vitals.get("diabetes"):
            comorbidities.append("Diabetes Mellitus")

        # 7. BP values: prefer dedicated bprecords, fall back to vitalSigns
        systolic  = bp.get("systolic")  or vitals.get("bpSystolic")
        diastolic = bp.get("diastolic") or vitals.get("bpDiastolic")
        hba1c     = bp.get("hba1c")     or vitals.get("hba1cLevel")

        # 8. last_updated from the most recent document createdAt across all collections
        timestamps = [
            d.get("createdAt")
            for d in (lab, risk, bp)
            if d.get("createdAt")
        ]
        last_updated = (
            max(timestamps).strftime("%Y-%m-%d")
            if timestamps
            else datetime.now().strftime("%Y-%m-%d")
        )

        return {
            "id":       str(user["_id"]),
            "name":     user.get("name", "Unknown"),
            "email":    user.get("email", ""),
            "age":      age,
            "gender":   user.get("gender", "Unknown"),
            "district": user.get("district", ""),

            "diagnosis": risk.get("riskLevel", "Assessment Pending"),
            "stage":     lab.get("ckdStage", "Unknown"),
            "egfr":      lab.get("eGFR", "N/A"),

            "comorbidities": comorbidities if comorbidities else ["None detected"],
            "medications":   [],  # No medication schema yet — extend later

            "recent_labs": {
                "creatinine": lab.get("creatinine", "N/A"),
                "bun":        lab.get("bun", "N/A"),
                "albumin":    lab.get("albumin", "N/A"),
                "hba1c":      hba1c     if hba1c     is not None else "N/A",
                "systolic":   systolic  if systolic  is not None else "N/A",
                "diastolic":  diastolic if diastolic is not None else "N/A",
            },

            "dietary_restrictions": ["Check Nutrient Wallet limits"],
            "last_updated": last_updated,
        }

    def get_last_update_timestamp(self, patient_id: str = "default_patient") -> str:
        """Return last_updated string used as a cache-key component in rag_engine.py."""
        record = self.get_patient_record(patient_id)
        return record.get("last_updated", "unknown_version")

    def get_patient_context_string(self, patient_id: str = "default_patient") -> str:
        """Formatted patient summary injected into the LLM system prompt."""
        record = self.get_patient_record(patient_id)
        if not record:
            return "No patient record found."

        last_updated = record.get("last_updated", "Unknown")
        data_age_warning = ""
        try:
            days_old = (datetime.now() - datetime.strptime(last_updated, "%Y-%m-%d")).days
            data_age_warning = " (Data is from today)" if days_old == 0 else f" (Data is {days_old} days old)"
        except Exception:
            pass

        labs = record["recent_labs"]
        labs_str = ", ".join(
            f"{k.capitalize()}: {v}"
            for k, v in labs.items()
            if v != "N/A"
        )

        return (
            f"--- CRITICAL: CURRENT PATIENT STATE (As of {last_updated}{data_age_warning}) ---\n"
            f"Patient Profile:\n"
            f"- Name: {record['name']} ({record['age']} years, {record['gender']})\n"
            f"- Diagnosis / Risk: {record['diagnosis']}\n"
            f"- CKD Stage: {record['stage']}\n"
            f"- eGFR: {record['egfr']} mL/min\n"
            f"- Comorbidities: {', '.join(record['comorbidities'])}\n"
            f"- Recent Labs & Vitals: {labs_str if labs_str else 'No data available'}\n"
        )


if __name__ == "__main__":
    # Smoke-test: replace with a real ObjectId from your DB
    mgr = PatientDataManager()
    TEST_ID = "6958e269f3b8652cceae2abd"
    print(mgr.get_patient_context_string(TEST_ID))
