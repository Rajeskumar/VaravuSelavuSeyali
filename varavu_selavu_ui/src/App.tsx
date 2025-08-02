import React, { useState } from 'react';
import './App.css';

const App: React.FC = () => {
  const [healthStatus, setHealthStatus] = useState<string | null>(null);

  const checkBackendHealth = async () => {
    try {
      const response = await fetch('http://localhost:8000/health');
      console.log(response);
      if (response.ok) {
        const data = await response.json();
        setHealthStatus(data.status);
      } else {
        setHealthStatus('Backend is not healthy');
      }
    } catch (error) {
      setHealthStatus('Error connecting to backend');
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Varavu Selavu</h1>
        <button onClick={checkBackendHealth}>Check Backend Health</button>
        {healthStatus && <p>Backend Health: {healthStatus}</p>}
      </header>
    </div>
  );
};

export default App;
