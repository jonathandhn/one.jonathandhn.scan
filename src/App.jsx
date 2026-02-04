import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ToastProvider, useToast } from './components/Toast';
import Settings from './pages/Settings';
import EventList from './pages/EventList';
import ParticipantList from './pages/ParticipantList';
import Scanner from './pages/Scanner';
import AddParticipant from './pages/AddParticipant';
import Callback from './pages/Callback';
import Layout from './components/Layout';
// We need to move the logic inside a component that has access to Toast or use simple alerts
// Since App layout is fixed, we'll verify inside a wrapper or the main component

// To access translations outside logic, we might need i18next instance directly
import i18n from './i18n';
import { useTranslation } from 'react-i18next';
import { validateToken } from './services/civi';

function App() {
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState(null);

  // 1. Intercept "Magic Link" Token
  useEffect(() => {
    const processToken = async () => {
      const params = new URLSearchParams(window.location.search);
      const token = params.get('token');
      // Support optional 'url' param to configure baseURL from link
      const urlParam = params.get('url');

      if (token) {
        setValidating(true);

        // If url provided, save it temporarily or permanently? 
        // For Magic Link, we might just assume it's the right one.
        // Or we utilize the existing Settings storage for URL if we want to be persistent.
        // But 'validateToken' logic needs a URL.

        let targetURL = urlParam;
        // If no URL in param, try to find one in env or settings, or default to origin
        if (!targetURL) {
          const stored = localStorage.getItem('civi_url');
          targetURL = stored || import.meta.env.VITE_OAUTH_AUTHORITY || window.location.origin;
        }

        const result = await validateToken(token, targetURL);

        if (result === true) {
          // Success
          localStorage.setItem('civi_magic_token', token);
          if (urlParam) {
            localStorage.setItem('civi_url', urlParam); // Save URL if provided
          }

          // Clean URL
          window.history.replaceState({}, document.title, window.location.pathname);
          window.location.reload();
        } else {
          // Failed
          console.error("Magic Link Validation Error:", result);
          setError(result); // 'permission_denied', 'unauthorized', etc.
          setValidating(false);
          // Do NOT save token
        }
      }
    };

    processToken();
  }, []);

  const { t } = useTranslation();
  const { addToast } = useToast();

  useEffect(() => {
    const handleUnauthorized = () => {
      addToast(t('common.sessionExpired'), "error"); // Or translate this
      // Optionally redirect or clear state here, though civi.js might handle token clearing
    };

    window.addEventListener('civi:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('civi:unauthorized', handleUnauthorized);
  }, [addToast, t]);

  if (validating) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <span className="loading loading-spinner loading-lg text-primary"></span>
        <p className="animate-pulse">{t('magicLink.validating')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 flex flex-col items-center justify-center h-screen text-center">
        <h2 className="text-2xl font-bold text-error mb-2">{t('magicLink.connectionFailed')}</h2>
        <p className="text-lg opacity-80 mb-6">
          {error === 'permission_denied' && t('magicLink.errorPermission')}
          {error === 'unauthorized' && t('magicLink.errorUnauthorized')}
          {error === 'connection_error' && t('magicLink.errorConnection')}
        </p>
        <button className="btn btn-outline" onClick={() => {
          window.history.replaceState({}, document.title, window.location.pathname);
          setError(null);
        }}>
          {t('magicLink.returnToApp')}
        </button>
      </div>
    );
  }

  return (
    <ToastProvider>
      <Router basename="/scan">
        <Routes>
          <Route path="/" element={<Layout><EventList /></Layout>} />
          <Route path="/settings" element={<Layout><Settings /></Layout>} />
          <Route path="/event/:eventId" element={<Layout><ParticipantList /></Layout>} />
          <Route path="/event/:eventId/scan" element={<Scanner />} />
          <Route path="/event/:eventId/add" element={<Layout><AddParticipant /></Layout>} />
        </Routes>
      </Router>
    </ToastProvider>
  );
}

export default App;
