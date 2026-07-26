import sys
import os
import subprocess
import csv

# Automatically verify and install required Python packages if missing
try:
    import firebase_admin
    from firebase_admin import credentials, firestore
except ImportError:
    print("Installing missing dependency (firebase-admin)...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "firebase-admin"])
    import firebase_admin
    from firebase_admin import credentials, firestore

DEFAULT_CSV_FILE = "MediTrace_50_Medicines_Updated.csv"
COLLECTION_NAME = "medicines"
SERVICE_ACCOUNT_FILE = "firebase-key.json"


def delete_collection(db, collection_name, batch_size=500):
    """Deletes all existing documents in a Firestore collection."""
    deleted_count = 0
    docs = db.collection(collection_name).limit(batch_size).get()

    while len(docs) > 0:
        batch = db.batch()
        for doc in docs:
            batch.delete(doc.reference)
            deleted_count += 1
        batch.commit()
        docs = db.collection(collection_name).limit(batch_size).get()

    return deleted_count


def import_csv_to_firestore(csv_path=DEFAULT_CSV_FILE, clear_existing=True):
    """Parses medicine records from a CSV file and uploads/updates them in Firestore using GTIN as document ID."""
    if not os.path.exists(csv_path):
        print(f"Error: CSV file '{csv_path}' not found.")
        return

    if not os.path.exists(SERVICE_ACCOUNT_FILE):
        print(f"Error: Firebase service account key '{SERVICE_ACCOUNT_FILE}' not found.")
        return

    # Initialize Firebase Admin SDK
    if not firebase_admin._apps:
        cred = credentials.Certificate(SERVICE_ACCOUNT_FILE)
        firebase_admin.initialize_app(cred)

    db = firestore.client()

    if clear_existing:
        print(f"Cleaning existing '{COLLECTION_NAME}' collection before import...")
        deleted = delete_collection(db, COLLECTION_NAME)
        print(f"Deleted {deleted} existing documents.")

    total_records = 0
    successful_uploads = 0
    failed_uploads = 0
    skipped_rows = 0

    with open(csv_path, mode="r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)

        row_index = 1
        for row in reader:
            total_records += 1

            # Extract fields with safe defaults
            gtin = str(row.get("GTIN", "") or row.get("gtin", "")).strip()
            name = str(row.get("medicineName", "")).strip()
            manufacturer = str(row.get("manufacturer", "")).strip()
            batch_number = str(row.get("batchNumber", "")).strip()
            mfg_date = str(row.get("manufacturingDate", "")).strip()
            exp_date = str(row.get("expiryDate", "")).strip()
            dosage = str(row.get("dosage", "")).strip()
            status = str(row.get("status", "")).strip()
            description = str(row.get("description", "")).strip()
            raw_serial = row.get("serialNumber")

            # Format serialNumber: store None/null if empty or missing
            serial_number = str(raw_serial).strip() if raw_serial is not None else ""
            serial_value = serial_number if serial_number else None

            # Determine medicineId
            medicine_id = str(row.get("medicineId", "") or "").strip()
            if not medicine_id:
                medicine_id = f"MED{row_index:03d}"

            row_index += 1

            # Row Validation: skip malformed rows
            if not gtin or not name or not batch_number:
                print(f"Skipping row {total_records}: Missing essential fields (GTIN/medicineName/batchNumber).")
                skipped_rows += 1
                continue

            if not gtin.isdigit() or len(gtin) < 10:
                print(f"Skipping row {total_records}: Invalid GTIN format ('{gtin}').")
                skipped_rows += 1
                continue

            doc_data = {
                "medicineId": medicine_id,
                "gtin": gtin,
                "medicineName": name,
                "manufacturer": manufacturer,
                "batchNumber": batch_number,
                "manufacturingDate": mfg_date,
                "expiryDate": exp_date,
                "serialNumber": serial_value,
                "dosage": dosage,
                "status": status,
                "description": description,
            }

            try:
                print(f"Uploading {gtin}...")
                # GTIN is used as the document ID
                doc_ref = db.collection(COLLECTION_NAME).document(gtin)
                # Merge ensures update functionality if document already exists
                doc_ref.set(doc_data, merge=True)
                successful_uploads += 1
            except Exception as e:
                print(f"Failed to upload {gtin}: {e}")
                failed_uploads += 1

    print("Upload completed successfully.")
    print("--------------------------------")
    print(f"Total Records: {total_records}")
    print(f"Successful Uploads: {successful_uploads}")
    print(f"Failed Uploads: {failed_uploads}")
    print(f"Skipped Rows: {skipped_rows}")
    print("--------------------------------")


if __name__ == "__main__":
    csv_file = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_CSV_FILE
    import_csv_to_firestore(csv_file, clear_existing=True)
