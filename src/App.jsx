import { useEffect, useState, Component } from 'react';
import { BrowserRouter, HashRouter, Navigate, Routes, Route } from 'react-router-dom';
import { ToastProvider, useToast } from './components/Toast';
import Settings from './pages/Settings';
import EventList from './pages/EventList';
import ParticipantList from './pages/ParticipantList';
import Scanner from './pages/Scanner';
import AddParticipant from './pages/AddParticipant';
import ParticipantCheckout from './pages/ParticipantCheckout';
import Callback from './pages/Callback';
import Layout from './components/Layout';
import { logger } from './services/logger';
import { useTranslation } from 'react-i18next';
import { validateToken } from './services/civi';
import { hasCapability, isSessionMode, loadRuntimeContext, runtime } from './runtime';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, copied: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    logger.error('REACT_RENDER_CRASH', error?.message || String(error), {
      stack: error?.stack,
      componentStack: errorInfo?.componentStack,
    });
  }

  handleCopyLogs = async () => {
    try {
      const logs = logger.exportLogsText();
      await navigator.clipboard.writeText(logs);
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 3000);
    } catch {
      alert('Impossible de copier automatiquement. Veuillez recharger l\'application.');
    }
  };

  handleDownloadLogs = () => {
    logger.downloadLogsFile();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-slate-800 rounded-2xl p-6 shadow-2xl border border-rose-500/30 space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="w-10 h-10 rounded-full bg-rose-500/20 flex items-center justify-center font-bold text-xl">⚠️</div>
              <div>
                <h1 className="text-lg font-bold">Un incident est survenu</h1>
                <p className="text-xs text-slate-400">CiviScan a rencontré une erreur inattendue.</p>
              </div>
            </div>

            <div className="bg-slate-950 p-3 rounded-lg text-xs font-mono text-rose-300 max-h-40 overflow-y-auto break-all">
              {this.state.error?.message || String(this.state.error)}
            </div>

            <div className="space-y-2 pt-2">
              <button
                onClick={this.handleCopyLogs}
                className="btn btn-sm btn-primary w-full gap-2"
              >
                <span>{this.state.copied ? '✅ Rapport copié dans le presse-papiers !' : '📋 Copier le rapport d\'erreur'}</span>
              </button>

              <button
                onClick={this.handleDownloadLogs}
                className="btn btn-sm btn-outline btn-info w-full"
              >
                💾 Télécharger le fichier journal (.log)
              </button>

              <button
                onClick={() => window.location.reload()}
                className="btn btn-sm btn-ghost w-full text-slate-400"
              >
                🔄 Recharger l&apos;application
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// 1. Logic Component inside ToastProvider
function AppContent() {
  const [validating, setValidating] = useState(false);
  const [runtimeReady, setRuntimeReady] = useState(!isSessionMode);
  const [error, setError] = useState(null);
  const { t } = useTranslation();
  const { addToast } = useToast();

  useEffect(() => {
    if (!isSessionMode) return;
    loadRuntimeContext()
      .catch((runtimeError) => {
        console.error(runtimeError);
        setError('permission_denied');
      })
      .finally(() => setRuntimeReady(true));
  }, []);

  // 1. Intercept "Magic Link" Token & Deep Link
  useEffect(() => {
    const handleAuthToken = async (token, urlParam) => {
      if (!token) return;
      setValidating(true);
      let targetURL = urlParam;
      if (!targetURL) {
        const stored = localStorage.getItem('civi_url');
        targetURL = stored || import.meta.env.VITE_OAUTH_AUTHORITY || window.location.origin;
      }

      const result = await validateToken(token, targetURL);
      if (result === true) {
        localStorage.setItem('civi_magic_token', token);
        if (urlParam) {
          localStorage.setItem('civi_url', urlParam);
        }
        window.history.replaceState({}, document.title, window.location.pathname);
        window.location.reload();
      } else {
        console.error("Magic Link Validation Error:", result);
        setError(result);
        setValidating(false);
      }
    };

    // Deep Link Handler (civiscan://...)
    window.__civiscanHandleDeepLink = (deepLinkUrl) => {
      try {
        const clean = deepLinkUrl.replace('civiscan://', 'http://localhost/');
        const parsed = new URL(clean);
        const token = parsed.searchParams.get('token');
        const targetUrl = parsed.searchParams.get('url');
        if (token) {
          handleAuthToken(token, targetUrl);
        } else if (parsed.pathname && parsed.pathname !== '/') {
          window.location.hash = parsed.pathname;
        }
      } catch (e) {
        console.warn('Deep link parse error:', e);
      }
    };

    const params = new URLSearchParams(window.location.search);
    const token = isSessionMode ? null : params.get('token');
    const urlParam = params.get('url');
    if (token) {
      handleAuthToken(token, urlParam);
    }

    return () => {
      delete window.__civiscanHandleDeepLink;
    };
  }, []);

  // 2. Listen for Global Auth Errors
  useEffect(() => {
    const handleUnauthorized = () => {
      addToast(t('common.sessionExpired'), "error");
    };

    window.addEventListener('civi:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('civi:unauthorized', handleUnauthorized);
  }, [addToast, t]);

  if (validating || !runtimeReady) {
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

  const Router = runtime.routerMode === 'hash' ? HashRouter : BrowserRouter;
  const canViewEvents = hasCapability('viewEvents');
  const canViewParticipants = hasCapability('viewParticipants');
  const canScan = hasCapability('scan');
  const canAddParticipant = hasCapability('addParticipant');

  return (
    <Router basename={runtime.routerMode === 'hash' ? undefined : runtime.basename}>
      <Routes>
        <Route path="/" element={canViewEvents ? <Layout><EventList /></Layout> : <Layout><div className="alert alert-error">{t('common.permissionDenied')}</div></Layout>} />
        <Route path="/settings" element={<Layout><Settings /></Layout>} />
        <Route path="/event/:eventId" element={canViewParticipants ? <Layout><ParticipantList /></Layout> : <Navigate to="/" replace />} />
        <Route path="/event/:eventId/scan" element={canScan ? <Scanner /> : <Navigate to="/" replace />} />
        <Route path="/event/:eventId/add" element={canAddParticipant ? <Layout><AddParticipant /></Layout> : <Navigate to="/" replace />} />
        <Route path="/event/:eventId/add/:contactId/checkout" element={canAddParticipant ? <Layout><ParticipantCheckout /></Layout> : <Navigate to="/" replace />} />
        <Route path="/callback" element={<Callback />} />
      </Routes>
    </Router>
  );
}

// 2. Main Wrapper providing Context
function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;
