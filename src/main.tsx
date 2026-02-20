import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { applySeedData } from './data/defaultData';

// Seed localStorage with initial data on first ever load.
// Runs synchronously before React initializes — useLocalStorage picks it up on first render.
applySeedData();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
