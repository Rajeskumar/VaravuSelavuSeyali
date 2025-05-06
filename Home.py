from datetime import datetime, timedelta

import pandas as pd
import plotly.express as px
import streamlit as st

from google_sheet_utils import load_data_from_google_sheet

st.set_page_config(page_title="🏠 Expense Dashboard", layout="wide")

# Check if user is logged in
if "logged_in_user" not in st.session_state or st.session_state.logged_in_user is None:
    st.warning("🔒 Please log in to access this page.")
    st.experimental_set_query_params(page="Login")
    st.stop()

# Add a logout button in the sidebar
if "logged_in_user" in st.session_state:
    if st.sidebar.button("🔒 Logout"):
        # Clear session state to log out the user
        st.session_state.clear()
        st.experimental_rerun()  # Refresh the app to reflect the logout

# If logged in, load user-specific data
user_id = st.session_state.logged_in_user
all_expenses = load_data_from_google_sheet()

# Filter user-specific data directly from the DataFrame
user_expenses = all_expenses[all_expenses['User ID'] == user_id]

# Convert user_expenses back to a DataFrame
user_expenses = pd.DataFrame(user_expenses)

# Display user-specific data
st.title("🏠 Home")
st.markdown("### Your Expenses")
# st.write(pd.DataFrame(user_expenses))

# Option for non-logged-in users to upload CSV
if st.session_state.logged_in_user is None:
    st.markdown("### Upload CSV for Expense Analysis")
    uploaded_file = st.file_uploader("Choose a CSV file", type="csv")

    if uploaded_file is not None:
        uploaded_data = pd.read_csv(uploaded_file)
        st.write("### Uploaded Data")
        st.write(uploaded_data)
        # Perform dynamic analysis on uploaded data
        st.write("### Analysis")
        st.write("Coming soon...")

# Add a 'year-month' column for proper grouping and ordering
user_expenses['year_month'] = user_expenses['date'].dt.to_period('M')

# Filter data for the last 12 months
current_date = datetime.now()
start_date = current_date - timedelta(days=365)
data = user_expenses[(user_expenses['date'] >= start_date) & (user_expenses['date'] <= current_date)]

# Group data by 'year_month' and calculate monthly expenses
monthly_expenses = data.groupby(data['year_month'].dt.to_timestamp())['cost'].sum().reset_index()
monthly_expenses.rename(columns={'year_month': 'Month'}, inplace=True)

# Ensure the x-axis shows the last 12 months in order
monthly_expenses['Month'] = pd.to_datetime(monthly_expenses['Month'])
monthly_expenses = monthly_expenses.sort_values('Month')

# Calculate key metrics
total_expenses = data['cost'].sum()
total_categories = data['category'].nunique()

# Display key metrics
col1, col2, col3 = st.columns(3)
with col1:
    st.metric(label="💸 Total Expenses", value=f"${total_expenses:,.2f}")
with col2:
    st.metric(label="📊 Total Categories", value=total_categories)
with col3:
    st.metric(label="📅 Months Tracked", value=data['month'].nunique())

# Visualizations
st.markdown("### 📈 Monthly Expense Trends")
line_fig = px.line(monthly_expenses, x='Month', y='cost', title='Monthly Expenses', markers=True)
st.plotly_chart(line_fig, use_container_width=True)

st.markdown("### 🔝 Top 5 Expense Categories")
top_categories = data.groupby('category')['cost'].sum().nlargest(5).reset_index()
bar_fig = px.bar(top_categories, x='category', y='cost', title='Top 5 Categories', text='cost')
bar_fig.update_traces(texttemplate='$%{text:.2f}', textposition='outside')
st.plotly_chart(bar_fig, use_container_width=True)