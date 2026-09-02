import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App.jsx';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <Toaster
        position="bottom-center"
        toastOptions={{
          className: 'vf-toast',
          duration: 2600,
          style: {
            background: 'var(--surface-overlay)',
            color: 'var(--text)',
            border: '1px solid var(--border-strong)',
            backdropFilter: 'var(--blur-md)',
            borderRadius: 'var(--r-control)',
            fontSize: '0.8125rem',
            fontWeight: 500,
            padding: '0.625rem 0.875rem',
            maxWidth: '92vw',
          },
        }}
      />
    </BrowserRouter>
  </React.StrictMode>,
);
