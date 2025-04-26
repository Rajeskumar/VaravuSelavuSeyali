import os

import streamlit as st
import pandas as pd
import plotly.express as px
from calendar import month_name
import gspread
from __init__ import load_data_from_google_sheet

current_dir = os.path.dirname(__file__)  # directory of the current script
google_sheet_secret_path = os.path.join(current_dir, '..', 'gold-circlet-424313-r7-fe875b4862e6.json')
@st.cache_data
def load_data(file_path):
    data = pd.read_csv(file_path, parse_dates=['date'])
    data['cost'] = pd.to_numeric(data['cost'], errors='coerce')
    data['month'] = data['date'].dt.month_name()
    data['year'] = data['date'].dt.year
    return data

st.set_page_config(page_title="💰 Insights Dashboard", layout="wide")
st.title("💰 Personal Expense Insights")

st.sidebar.markdown("### Data Source")
data_source = st.sidebar.radio("Select Data Source", ("Upload CSV", "Google Sheet"))

if data_source == "Upload CSV":
    file_path = st.sidebar.file_uploader("📤 Upload your expense CSV file", type=["csv"])
    income = st.sidebar.number_input("💵 Enter your monthly income", min_value=0.0, format="%.2f")

    if file_path:
        data = load_data(file_path)
    else:
        st.warning("Please upload a CSV file.")
        st.stop()

elif data_source == "Google Sheet":
    income = 6200
    try:
        data = load_data_from_google_sheet()
    except Exception as e:
        st.error(f"Failed to load data from Google Sheet: {e}")
        st.stop()

st.markdown("### 🔍 Monthly Insights")

years = sorted(data['date'].dt.year.unique())
selected_year = st.sidebar.selectbox("📅 Select Year", options=years)
filtered_year_data = data[data['date'].dt.year == selected_year]

months = sorted(filtered_year_data['date'].dt.month.unique())
selected_month = st.sidebar.selectbox("🗓️ Select Month", options=months)
filtered_data = filtered_year_data[filtered_year_data['date'].dt.month == selected_month]

if not filtered_data.empty:
    total_expenses = filtered_data['cost'].sum()
    category_summary = filtered_data.groupby('category')['cost'].sum().reset_index()
    category_summary['% of Income'] = (category_summary['cost'] / income) * 100

    col1, col2 = st.columns(2)
    with col1:
        st.markdown("""<div class='card'><h4>💸 Total Expenses</h4><h2 style='color:#e74c3c;'>${:,.2f}</h2></div>""".format(total_expenses), unsafe_allow_html=True)
    with col2:
        st.markdown("""<div class='card'><h4>💰 Income</h4><h2 style='color:#2ecc71;'>${:,.2f}</h2></div>""".format(income), unsafe_allow_html=True)

    col3, col4 = st.columns([1, 1])
    with col3:
        st.markdown("#### 📊 Categorywise Spend")
        bar_fig = px.bar(category_summary.sort_values('cost', ascending=False),
                         x='category', y='cost', color='category', text='cost',
                         labels={'category': 'Category', 'cost': 'Amount ($)'})
        bar_fig.update_traces(texttemplate='$%{text:.2f}', textposition='outside')
        st.plotly_chart(bar_fig, use_container_width=True)

    with col4:
        st.markdown("#### 📈 % of Income Spent by Category")
        st.dataframe(category_summary.sort_values(by='cost', ascending=False), use_container_width=True)

    st.markdown("### 🔝 Top 5 Expense Categories")
    top5 = filtered_data.groupby('category')['cost'].sum().sort_values(ascending=False).head(5)
    st.bar_chart(top5)

    st.markdown(f"### 📅 Monthly Expense Trend - {selected_year}")
    monthly_expense = filtered_year_data.copy()
    monthly_expense['Month'] = monthly_expense['date'].dt.month_name()
    monthly_summary = monthly_expense.groupby('Month', sort=False)['cost'].sum().reset_index()
    month_order = list(month_name)[1:]
    monthly_summary['Month'] = pd.Categorical(monthly_summary['Month'], categories=month_order, ordered=True)
    monthly_summary = monthly_summary.sort_values('Month')

    line_fig = px.line(monthly_summary, x='Month', y='cost', markers=True,
                       labels={'cost': 'Total Expense ($)'}, title='Monthly Expenses')
    line_fig.update_traces(line_shape="spline")
    st.plotly_chart(line_fig, use_container_width=True)
