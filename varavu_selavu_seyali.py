import streamlit as st
import pandas as pd
import plotly.express as px

# Load the expense data from the CSV file
@st.cache_data
def load_data(file_path):
    data = pd.read_csv(file_path, parse_dates=['date'])
    data['cost'] = pd.to_numeric(data['cost'], errors='coerce')
    data['month'] = data['date'].dt.month_name()
    data['year'] = data['date'].dt.year
    return data

# Create a Streamlit app
def create_app():
    st.set_page_config(layout="wide")
    st.markdown("""
        <style>
            .card {
                background-color: #f9f9f9;
                padding: 1.2rem;
                border-radius: 10px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                margin-bottom: 20px;
            }
            .card h4 {
                margin-top: 0;
            }
        </style>
    """, unsafe_allow_html=True)
    st.title("💰 Personal Expense Dashboard")

    file_path = st.sidebar.file_uploader("📤 Upload your expense CSV file", type=["csv"])
    income = st.sidebar.number_input("💵 Enter your monthly income", min_value=0.0, format="%.2f")

    if file_path:
        data = load_data(file_path)
        with st.expander("📄 View Raw Expense Data", expanded=False):
            st.dataframe(data)

        if income <= 0:
            st.warning("⚠️ Please enter a valid income greater than 0.")
            return

        # Select Year and Month
        years = sorted(data['date'].dt.year.unique())
        selected_year = st.sidebar.selectbox("📅 Select Year", options=years)
        filtered_year_data = data[data['date'].dt.year == selected_year]

        months = sorted(filtered_year_data['date'].dt.month.unique())
        selected_month = st.sidebar.selectbox("🗓️ Select Month", options=months)
        filtered_data = filtered_year_data[filtered_year_data['date'].dt.month == selected_month]

        if filtered_data.empty:
            st.warning("No data available for the selected period.")
        else:
            total_expenses = filtered_data['cost'].sum()
            category_summary = filtered_data.groupby('category')['cost'].sum().reset_index()
            category_summary['% of Income'] = (category_summary['cost'] / income) * 100

            # ---- DASHBOARD LAYOUT ----
            st.markdown("### 🔍 Monthly Insights")

            # Top metrics
            col1, col2 = st.columns(2)
            with col1:
                with st.container():
                    st.markdown("""
                        <div class='card'>
                            <h4>💸 Total Expenses</h4>
                            <h2 style='color:#e74c3c;'>${:,.2f}</h2>
                        </div>
                    """.format(total_expenses), unsafe_allow_html=True)

            with col2:
                with st.container():
                    st.markdown("""
                        <div class='card'>
                            <h4>💰 Income</h4>
                            <h2 style='color:#2ecc71;'>${:,.2f}</h2>
                        </div>
                    """.format(income), unsafe_allow_html=True)

            # Pie Chart and Bar Chart in two columns
            col3, col4 = st.columns([1, 1])
            with col3:
                st.markdown("#### 📊 Categorywise Spend")
                bar_fig = px.bar(
                    category_summary.sort_values('cost', ascending=False),
                    x='category',
                    y='cost',
                    color='category',  # 🔹 This enables color coding by category
                    text='cost',
                    labels={'category': 'Category', 'cost': 'Amount ($)'},
                    # title='Categorywise Spending'
                )

                bar_fig.update_traces(
                    texttemplate='$%{text:.2f}',
                    textposition='outside'
                )

                bar_fig.update_layout(
                    xaxis_title=None,
                    yaxis_title="Total Expense",
                    uniformtext_minsize=8,
                    uniformtext_mode='hide',
                    showlegend=False  # Optional: hide legend since category is already on x-axis
                )

                st.plotly_chart(bar_fig, use_container_width=True)

            with col4:
                st.markdown("#### 📈 % of Income Spent by Category")
                st.dataframe(category_summary.sort_values(by='cost', ascending=False), use_container_width=True)

            # Top 5 expensive categories
            st.markdown("### 🔝 Top 5 Expense Categories")
            top5 = filtered_data.groupby('category')['cost'].sum().sort_values(ascending=False).head(5)
            st.bar_chart(top5)

            # ---- Monthly Trend Line Chart ----
            st.markdown(f"### 📅 Monthly Expense Trend - {selected_year}")
            monthly_expense = filtered_year_data.copy()
            monthly_expense['Month'] = monthly_expense['date'].dt.month_name()
            monthly_expense_summary = monthly_expense.groupby('Month', sort=False)['cost'].sum().reset_index()

            # Ensure correct month order
            from calendar import month_name
            month_order = list(month_name)[1:]  # Jan to Dec
            monthly_expense_summary['Month'] = pd.Categorical(monthly_expense_summary['Month'], categories=month_order, ordered=True)
            monthly_expense_summary = monthly_expense_summary.sort_values('Month')

            # Plot line chart
            line_fig = px.line(monthly_expense_summary, x='Month', y='cost', markers=True,
                               labels={'cost': 'Total Expense ($)'}, title='Monthly Expenses')
            line_fig.update_traces(line_shape="spline")
            st.plotly_chart(line_fig, use_container_width=True)

if __name__ == '__main__':
    create_app()