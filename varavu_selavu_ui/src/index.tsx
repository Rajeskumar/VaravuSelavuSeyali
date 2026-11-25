import React from 'react';
import ReactDOM from 'react-dom/client';
import './fonts.css';
import './index.css';
import App from './App'; // Ensure the correct file extension is resolved
import reportWebVitals from './reportWebVitals';
import { initializeAnalytics } from './analytics/browser';

initializeAnalytics();

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

reportWebVitals();
