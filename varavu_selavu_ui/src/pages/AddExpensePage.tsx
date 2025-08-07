import React from 'react';
import AddExpenseForm from '../components/expenses/AddExpenseForm';

const AddExpensePage: React.FC = () => {
  return (
    <div>
      <h2>Log a New Expense</h2>
      <AddExpenseForm />
    </div>
  );
};

export default AddExpensePage;
