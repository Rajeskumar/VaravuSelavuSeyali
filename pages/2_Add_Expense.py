# File: pages/2_Add_Expense.py
import streamlit as st
import pandas as pd
from datetime import date
from uuid import uuid4
import os
import gspread
from google_sheet_utils import load_data_from_google_sheet, hash_password, get_user_data_sheet
import hashlib

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
    "mobile": ("Home", "TV/Phone/Internet"),
}

# Define CATEGORY_GROUPS mapping main categories to subcategories
CATEGORY_GROUPS = {
    "Home": ["Rent", "Electronics","Furniture", "Household supplies", "Maintenance", "Mortgage", "Other", "Pets", "Services"],
    "Transportation": ["Gas/fuel", "Car", "Parking", "Plane", "Other", "Bicycle", "Bus/Train", "Taxi", "Hotel"],
    "Food & Drink": ["Groceries", "Dining out", "Liquor", "Other"],
    "Entertainment": ["Movies", "Other", "Games", "Music", "Sports"],
    "Life": ["Medical expenses", "Insurance", "Taxes", "Education", "Childcare", "Clothing", "Gifts", "Other"],
    "Other": ["Services", "General", "Electronics"],
    "Utilities": ["Heat/gas", "Electricity", "Water", "Other", "Cleaning", "Trash", "Other", "TV/Phone/Internet"],
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

# Login and Registration logic
user_data_sheet = get_user_data_sheet(sh)

# Login/Register form
if "logged_in_user" not in st.session_state:
    st.session_state.logged_in_user = None

if st.session_state.logged_in_user is None:
    st.title("🔒 Login / Register")
    login_tab, register_tab = st.tabs(["Login", "Register"])

    with login_tab:
        login_email = st.text_input("Email", key="add_expense_login_email")
        login_password = st.text_input("Password", type="password", key="add_expense_login_password")
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
        reg_name = st.text_input("Name", key="add_expense_reg_name")
        reg_email = st.text_input("Email", key="add_expense_reg_email")
        reg_phone = st.text_input("Phone", key="add_expense_reg_phone")
        reg_password = st.text_input("Password", type="password", key="add_expense_reg_password")
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

    # Add a logout button in the sidebar
    if "logged_in_user" in st.session_state:
        if st.sidebar.button("🔒 Logout"):
            # Clear session state to log out the user
            st.session_state.clear()
            st.rerun()  # Refresh the app to reflect the logout

    # Filter expenses by logged-in user
    user_id = st.session_state.logged_in_user
    all_expenses = worksheet.get_all_records()
    user_expenses = [e for e in all_expenses if e["User ID"] == user_id]

    # Display filtered expenses
    st.markdown("### Your Expenses")
    # st.write(pd.DataFrame(user_expenses))

    # Existing expense form logic
    st.markdown("Fill in the details below to add a new expense entry:")

    with st.form("expense_form"):
        expense_date = st.date_input("Date", value=date.today())
        description = st.text_input("Description")
        cost = st.number_input("Cost (USD)", min_value=0.0, format="%.2f")
        submitted = st.form_submit_button("Add Expense")

    if submitted:
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
