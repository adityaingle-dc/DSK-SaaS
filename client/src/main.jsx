import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { ConfirmHost } from './components/ConfirmDialog.jsx';
import './styles.css';
import './admin.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
        <ConfirmHost />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
