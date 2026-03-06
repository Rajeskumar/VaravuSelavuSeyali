-- PostgreSQL Database Schema for VaravuSelavuSeyali
-- Derived from the existing Google Sheets data structure

-- Create a dedicated schema to isolate application tables from public
CREATE SCHEMA IF NOT EXISTS trackspense;

-- 1. Users Table (from user_data_sheet)
CREATE TABLE trackspense.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    phone VARCHAR(50),
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Expenses Table (from main_worksheet and expenses sheet)
-- Handles both manually entered minimal rows and receipt-parsed comprehensive rows
CREATE TABLE trackspense.expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_email VARCHAR(255) NOT NULL REFERENCES trackspense.users(email) ON DELETE CASCADE,
    purchased_at TIMESTAMP WITH TIME ZONE,                 -- Often mapped from string dates like MM/DD/YYYY
    merchant_name VARCHAR(255),                            -- Receipt extracted fields
    merchant_id VARCHAR(255),
    category_id VARCHAR(100) NOT NULL,                     -- Also used as generic string category for manual entries
    amount NUMERIC(12, 2) NOT NULL,                        -- Also used as 'cost'
    currency VARCHAR(10) DEFAULT 'USD',
    tax NUMERIC(12, 2) DEFAULT 0,
    tip NUMERIC(12, 2) DEFAULT 0,
    discount NUMERIC(12, 2) DEFAULT 0,
    payment_method VARCHAR(100),
    description TEXT,                                      -- Used for manual entry item notes
    notes TEXT,
    fingerprint VARCHAR(255),                              -- Receipt hashing block deduplication marker
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for querying user expenses quickly
CREATE INDEX idx_expenses_user_email ON trackspense.expenses(user_email);
-- Optional index for time-range lookups
CREATE INDEX idx_expenses_purchased_at ON trackspense.expenses(purchased_at);

-- 3. Expense Items Table (from expense_items sheet)
-- Stores detailed line items parsed from receipts
CREATE TABLE trackspense.expense_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_id UUID NOT NULL REFERENCES trackspense.expenses(id) ON DELETE CASCADE,
    user_email VARCHAR(255) NOT NULL REFERENCES trackspense.users(email) ON DELETE CASCADE,
    line_no INTEGER NOT NULL,
    item_name VARCHAR(255) NOT NULL,
    normalized_name VARCHAR(255),
    category_id VARCHAR(100),
    quantity NUMERIC(10, 2),
    unit VARCHAR(50),
    unit_price NUMERIC(12, 2),
    line_total NUMERIC(12, 2) NOT NULL,
    tax NUMERIC(12, 2) DEFAULT 0,
    discount NUMERIC(12, 2) DEFAULT 0,
    attributes_json JSONB,                                 -- Stores dynamic receipt data flags
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_expense_items_expense_id ON trackspense.expense_items(expense_id);

-- 4. Recurring Templates Table (from recurring_sheet)
-- Manages subscriptions and recurring expense layouts
CREATE TABLE trackspense.recurring_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),         -- Previously template_id string
    user_email VARCHAR(255) NOT NULL REFERENCES trackspense.users(email) ON DELETE CASCADE,
    description VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    day_of_month INTEGER NOT NULL CHECK (day_of_month >= 1 AND day_of_month <= 31),
    default_cost NUMERIC(12, 2) NOT NULL,
    start_date DATE NOT NULL,                              -- ISO Date YYYY-MM-DD
    last_processed_date DATE,                              -- ISO Date YYYY-MM-DD
    status VARCHAR(50) DEFAULT 'Active',                   -- Active, Paused, etc.
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_recurring_templates_user_email ON trackspense.recurring_templates(user_email);
