import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { ConfirmHost } from './components/ConfirmDialog.jsx';
import './styles.css';
import './admin.css';

// inside the DSKRISHNA Android app (WebView user agent ends with "DSKRISHNA-App/x"): app-like touch behaviour
if (/DSKRISHNA-App/.test(navigator.userAgent)) document.documentElement.classList.add('in-app');

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
