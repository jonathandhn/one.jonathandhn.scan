import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import './i18n';
import { logger } from './services/logger';

import { AuthProvider } from './auth/AuthProvider';
import { runtime } from './runtime';
import './services/pwa';

// Capture globale des exceptions non interceptées
window.addEventListener('error', (event) => {
  logger.error('FATAL_JS_ERROR', event.message, {
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    error: event.error ? event.error.stack : null,
  });
});

window.addEventListener('unhandledrejection', (event) => {
  logger.error('FATAL_UNHANDLED_PROMISE', event.reason ? (event.reason.message || String(event.reason)) : 'Unknown rejection', {
    stack: event.reason?.stack,
  });
});

document.documentElement.style.setProperty('--color-primary', runtime.branding.primaryColor);
document.title = runtime.branding.title;

const isFileProtocol = typeof window !== 'undefined' && window.location.protocol === 'file:';

if (!isFileProtocol && runtime.pwa.enabled && runtime.pwa.serviceWorkerUrl && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(runtime.pwa.serviceWorkerUrl, {
      scope: runtime.pwa.scopeUrl || undefined,
    }).catch(error => console.warn('CiviScan service worker registration failed', error));
  });
}

createRoot(document.getElementById('civiscan-root') || document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)
