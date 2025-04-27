# File: pages/2_Add_Expense.py
import streamlit as st
import pandas as pd
from datetime import date
from uuid import uuid4
import os
import gspread
from google_sheet_utils import load_data_from_google_sheet

# Set Streamlit page config
st.set_page_config(page_title="📝 Add Expense")
st.title("📝 Log a New Expense")

# Centralize Google Sheets connection logic
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
worksheet = sh.sheet1  # First worksheet

# Create form
st.markdown("Fill in the details below to add a new expense entry:")

with st.form("expense_form"):
    user_id = st.text_input("User ID (Optional - leave blank to generate one)", value="")
    expense_date = st.date_input("Date", value=date.today())
    description = st.text_input("Description")
    category = st.selectbox("Category", ["Groceries", "Rent", "Dining", "Utilities", "Car", "Entertainment", "Other"])
    cost = st.number_input("Cost (USD)", min_value=0.0, format="%.2f")
    submitted = st.form_submit_button("Add Expense")

# Submit and save to Google Sheets
if submitted:
    if not user_id:
        user_id = str(uuid4())  # Generate a unique user ID if not provided

    new_row = [user_id, str(expense_date), description, category, cost]
    worksheet.append_row(new_row)
    st.success(f"✅ Expense saved to Google Sheets for user: `{user_id}`")
    st.markdown("**Details:**")
    st.write(pd.DataFrame([{
        "User ID": user_id,
        "Date": expense_date,
        "Description": description,
        "Category": category,
        "Cost": cost
    }]))
