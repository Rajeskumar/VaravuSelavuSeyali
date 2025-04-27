from datetime import datetime, timedelta

import pandas as pd
import plotly.express as px
import streamlit as st

from google_sheet_utils import load_data_from_google_sheet

st.set_page_config(page_title="🏠 Expense Dashboard", layout="wide")
st.title("🏠 Welcome to Your Expense Dashboard")

# Load data from Google Sheets
data = load_data_from_google_sheet()

# Add a 'year-month' column for proper grouping and ordering
data['year_month'] = data['date'].dt.to_period('M')

# Filter data for the last 12 months
current_date = datetime.now()
start_date = current_date - timedelta(days=365)
data = data[(data['date'] >= start_date) & (data['date'] <= current_date)]

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