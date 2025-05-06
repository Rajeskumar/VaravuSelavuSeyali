import os
import gspread
import pandas as pd
from google.auth import default
import hashlib

def load_data_from_google_sheet():
    # Check if running in GCP environment
    if "K_SERVICE" in os.environ:
        # Use default credentials in GCP
        credentials, project = default()
        gc = gspread.authorize(credentials)
    else:
        # Use local credentials for development
        current_dir = os.path.dirname(__file__)
        google_sheet_secret_path = os.path.join(current_dir, 'gold-circlet-424313-r7-fe875b4862e6.json')
        gc = gspread.service_account(filename=google_sheet_secret_path)

    sh = gc.open("MyExpenses")  # Google Sheet name
    worksheet = sh.sheet1
    data = pd.DataFrame(worksheet.get_all_records())
    data['date'] = pd.to_datetime(data['date'], errors='coerce')
    data['cost'] = pd.to_numeric(data['cost'], errors='coerce')
    data['month'] = data['date'].dt.month_name()
    data['year'] = data['date'].dt.year
    return data

def hash_password(password):
    """Hashes a password using SHA-256."""
    return hashlib.sha256(password.encode()).hexdigest()

def get_user_data_sheet(sh):
    """Retrieves or creates the 'user_data' sheet in the Google Sheets document."""
    try:
        return sh.worksheet("user_data")
    except gspread.exceptions.WorksheetNotFound:
        return sh.add_worksheet(title="user_data", rows="100", cols="4")