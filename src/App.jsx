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

// 1. Logic Component inside ToastProvider
function AppContent() {
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState(null);
  const { t } = useTranslation();
  const { addToast } = useToast();

  // 1. Intercept "Magic Link" Token
  useEffect(() => {
    const processToken = async () => {
      const params = new URLSearchParams(window.location.search);
      const token = params.get('token');
      const urlParam = params.get('url');

      if (token) {
        setValidating(true);
        let targetURL = urlParam;
        if (!targetURL) {
          const stored = localStorage.getItem('civi_url');
          targetURL = stored || import.meta.env.VITE_OAUTH_AUTHORITY || window.location.origin;
        }

        const result = await validateToken(token, targetURL);

        if (result === true) {
          // Success
          localStorage.setItem('civi_magic_token', token);
          if (urlParam) {
            localStorage.setItem('civi_url', urlParam);
          }
          window.history.replaceState({}, document.title, window.location.pathname);
          window.location.reload();
        } else {
          // Failed
          console.error("Magic Link Validation Error:", result);
          setError(result);
          setValidating(false);
        }
      }
    };

    processToken();
  }, []);

  // 2. Listen for Global Auth Errors
  useEffect(() => {
    const handleUnauthorized = () => {
      addToast(t('common.sessionExpired'), "error");
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
    <Router basename="/scan">
      <Routes>
        <Route path="/" element={<Layout><EventList /></Layout>} />
        <Route path="/settings" element={<Layout><Settings /></Layout>} />
        <Route path="/event/:eventId" element={<Layout><ParticipantList /></Layout>} />
        <Route path="/event/:eventId/scan" element={<Scanner />} />
        <Route path="/event/:eventId/add" element={<Layout><AddParticipant /></Layout>} />
      </Routes>
    </Router>
  );
}

// 2. Main Wrapper providing Context
function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}

export default App;
