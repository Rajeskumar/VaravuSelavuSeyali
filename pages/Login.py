import os

import streamlit as st
import hashlib
import pandas as pd
from google_sheet_utils import load_data_from_google_sheet, hash_password, get_user_data_sheet
import gspread

# Google Sheets connection
def get_google_sheet_connection():
    if "K_SERVICE" in os.environ:
        from google.auth import default
        credentials, _ = default()
        return gspread.authorize(credentials)
    else:
        current_dir = os.path.dirname(__file__)
        google_sheet_secret_path = os.path.join(current_dir, '..', 'gold-circlet-424313-r7-fe875b4862e6.json')
        return gspread.service_account(filename=google_sheet_secret_path)

gc = get_google_sheet_connection()
sh = gc.open("MyExpenses")
user_data_sheet = get_user_data_sheet(sh)

# Login/Register form
if "logged_in_user" not in st.session_state:
    st.session_state.logged_in_user = None

if st.session_state.logged_in_user is None:
    st.title("🔒 Login / Register")
    login_tab, register_tab = st.tabs(["Login", "Register"])

    with login_tab:
        login_email = st.text_input("Email", key="login_email")
        login_password = st.text_input("Password", type="password", key="login_password")
        login_button = st.button("Login")

        if login_button:
            user_records = user_data_sheet.get_all_records()
            user = next((u for u in user_records if u["Email"] == login_email and u["Password"] == hash_password(login_password)), None)
            if user:
                st.session_state.logged_in_user = user["Email"]
                st.success("✅ Login successful!")
                st.rerun()
            else:
                st.error("❌ Invalid email or password.")

    with register_tab:
        reg_name = st.text_input("Name", key="reg_name")
        reg_email = st.text_input("Email", key="reg_email")
        reg_phone = st.text_input("Phone", key="reg_phone")
        reg_password = st.text_input("Password", type="password", key="reg_password")
        register_button = st.button("Register")

        if register_button:
            user_records = user_data_sheet.get_all_records()
            if any(u["Email"] == reg_email for u in user_records):
                st.error("❌ Email already registered.")
            else:
                hashed_password = hash_password(reg_password)
                user_data_sheet.append_row([reg_name, reg_email, reg_phone, hashed_password])
                st.success("✅ Registration successful! Please login.")
else:
    st.sidebar.success(f"Logged in as: {st.session_state.logged_in_user}")
    st.experimental_set_query_params(logged_in="true")

    # Add a logout button in the sidebar
    if "logged_in_user" in st.session_state:
        if st.sidebar.button("🔒 Logout"):
            # Clear session state to log out the user
            st.session_state.clear()
            st.experimental_rerun()  # Refresh the app to reflect the logout