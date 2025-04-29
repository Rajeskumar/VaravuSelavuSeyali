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

# Define a mapping of keywords to categories and subcategories
KEYWORD_TO_CATEGORY = {
    "rent": ("Home", "Rent"),
    "apartment": ("Home", "Rent"),
    "electricity": ("Home", "Electricity"),
    "fuel": ("Transportation", "Gas/fuel"),
    "gas": ("Transportation", "Gas/fuel"),
    "plane": ("Transportation", "Plane"),
    "groceries": ("Food & Drink", "Groceries"),
    "dining": ("Food & Drink", "Dining out"),
    "liquor": ("Food & Drink", "Liquor"),
    "movie": ("Entertainment", "Movies"),
    "music": ("Entertainment", "Music"),
    "insurance": ("Life", "Insurance"),
    "medical": ("Life", "Medical expenses"),
    "tax": ("Life", "Taxes"),
    "education": ("Life", "Education"),
    "cleaning": ("Home", "Cleaning"),
    "furniture": ("Home", "Furniture"),
    "services": ("Other", "Services"),
    "electronics": ("Other", "Electronics"),
}

# Define CATEGORY_GROUPS mapping main categories to subcategories
CATEGORY_GROUPS = {
    "Home": ["Rent", "Electricity", "Utilities - Other", "Household supplies", "Furniture", "Cleaning", "Heat/gas", "Home - Other"],
    "Transportation": ["Gas/fuel", "Car", "Parking", "Plane", "Transportation - Other"],
    "Food & Drink": ["Groceries", "Dining out", "Liquor"],
    "Entertainment": ["Movies", "Entertainment", "Other", "Games", "Music", "Sports"],
    "Life": ["Medical expenses", "Insurance", "Taxes", "Education", "Life - Other"],
    "Other": ["Services", "General", "Electronics"]
}

# Initialize session state for main category and subcategory if not already set
if "main_category" not in st.session_state:
    st.session_state.main_category = "Other"
if "subcategory" not in st.session_state:
    st.session_state.subcategory = "General"

# Fix the issue where the subcategory dropdown throws an error for the "Other" category

def update_subcategory():
    # Ensure the subcategory is updated to the first item in the selected main category's list
    st.session_state.subcategory = CATEGORY_GROUPS[st.session_state.main_category][0]

# Main category selection
st.selectbox(
    "Choose a main category",
    list(CATEGORY_GROUPS.keys()),
    index=list(CATEGORY_GROUPS.keys()).index(st.session_state.main_category),
    key="main_category",
    on_change=update_subcategory
)

# Subcategory selection based on main category
st.selectbox(
    "Choose a subcategory",
    CATEGORY_GROUPS[st.session_state.main_category],
    index=0,  # Always default to the first subcategory in the list
    key="subcategory"
)

# Create form for other inputs and submission
st.markdown("Fill in the details below to add a new expense entry:")

with st.form("expense_form"):
    expense_date = st.date_input("Date", value=date.today())
    description = st.text_input("Description")
    cost = st.number_input("Cost (USD)", min_value=0.0, format="%.2f")
    submitted = st.form_submit_button("Add Expense")

# Submit and save to Google Sheets
if submitted:
    user_id = "Rajesh"
    if not user_id:
        user_id = str(uuid4())  # Generate a unique user ID if not provided

    new_row = [user_id, str(expense_date), description, st.session_state.subcategory, cost]
    worksheet.append_row(new_row)
    st.success(f"✅ Expense saved to Google Sheets for user: `{user_id}`")
    st.markdown("**Details:**")
    st.write(pd.DataFrame([{
        "User ID": user_id,
        "Date": expense_date,
        "Description": description,
        "Category": st.session_state.subcategory,
        "Cost": cost
    }]))
