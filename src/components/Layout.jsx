import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Settings as SettingsIcon, Home, Download, ArrowUpRight, WifiOff, RefreshCw } from 'lucide-react';
import { getCurrentContact, logout } from '../services/civi';
import { isSessionMode, runtime } from '../runtime';
import { isStandaloneDisplay, requestPwaInstall, subscribeInstallPrompt, subscribeStandaloneMode } from '../services/pwa';
import { syncEngine } from '../services/syncEngine';
import packageJson from '../../package.json';

const Layout = ({ children }) => {
    const { t } = useTranslation();
    const location = useLocation();
    const isHome = location.pathname === '/';
    const isSettings = location.pathname === '/settings';
    const [canInstall, setCanInstall] = useState(false);
    const [isStandalone, setIsStandalone] = useState(isStandaloneDisplay());
    const [userName, setUserName] = useState(runtime.currentUser?.display_name || runtime.currentUser?.displayName || null);
    const [syncState, setSyncState] = useState({ isOnline: true, isSyncing: false, pendingCount: 0 });

    useEffect(() => subscribeInstallPrompt(prompt => setCanInstall(Boolean(prompt))), []);
    useEffect(() => subscribeStandaloneMode(setIsStandalone), []);
    useEffect(() => syncEngine.subscribe(setSyncState), []);

    useEffect(() => {
        const loadUser = async () => {
            if (userName) {
                return;
            }
            try {
                const contact = await getCurrentContact();
                if (contact?.display_name) {
                    setUserName(contact.display_name);
                }
            } catch {
                // Ignore footer user lookup failures.
            }
        };
        loadUser();
    }, [userName]);

    const handleLogout = () => {
        if (window.confirm(t('settings.confirmLogout'))) {
            logout();
            localStorage.removeItem('civi_magic_token');
            window.location.href = (isSessionMode ? runtime.logoutUrl : runtime.appUrl) || runtime.mainSiteUrl || '/';
        }
    };

    return (
        <div className="min-h-screen bg-base-200 flex flex-col font-roboto">
            {/* App Header */}
            <div className="navbar min-h-14 bg-primary px-2 text-primary-content shadow-md z-20 sm:min-h-16 sm:px-3">
                <div className="flex-1">
                    <div className="flex items-center gap-1">
                        <Link to="/" className="btn btn-ghost px-2 text-lg normal-case font-bold tracking-normal sm:text-xl sm:tracking-wide">
                            {runtime.branding.title || import.meta.env.VITE_APP_TITLE || 'CiviScan'}
                        </Link>
                        {isSessionMode && runtime.mainSiteUrl && !isStandalone && (
                            <a
                                href={runtime.mainSiteUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="btn btn-square btn-ghost btn-sm"
                                title={t('common.exitFullscreen')}
                                aria-label={t('common.exitFullscreen')}
                            >
                                <ArrowUpRight size={18} />
                            </a>
                        )}
                    </div>
                </div>
                <div className="flex flex-none items-center gap-1.5">
                    {syncState.pendingCount > 0 && (
                        <div
                            className="badge badge-warning badge-sm gap-1 text-[10px] font-semibold"
                            title={`${syncState.pendingCount} scan(s) en attente de synchronisation vers CiviCRM`}
                        >
                            <WifiOff size={11} />
                            <span>{syncState.pendingCount}</span>
                        </div>
                    )}
                    {syncState.isSyncing && (
                        <div
                            className="badge badge-info badge-sm gap-1 text-[10px] font-semibold animate-pulse"
                            title="Synchronisation en arrière-plan..."
                        >
                            <RefreshCw size={11} className="animate-spin" />
                            <span className="hidden xs:inline">Synchro</span>
                        </div>
                    )}
                    {runtime.pwa.enabled && canInstall && (
                        <button
                            type="button"
                            onClick={() => requestPwaInstall()}
                            className="btn btn-square btn-ghost btn-sm sm:btn-md"
                            title={t('common.installApp')}
                        >
                            <Download size={20} />
                        </button>
                    )}
                    {!isSettings && (
                        <Link to="/settings" className="btn btn-square btn-ghost btn-sm sm:btn-md" title="Paramètres & Diagnostic">
                            <SettingsIcon size={20} />
                        </Link>
                    )}
                    {!isHome && (
                        <Link to="/" className="btn btn-square btn-ghost btn-sm sm:btn-md" title="Accueil">
                            <Home size={20} />
                        </Link>
                    )}
                </div>
            </div>

            {/* Main Content */}
            <main className="flex-grow w-full max-w-md mx-auto p-3 sm:p-4">
                {children}
            </main>

            <footer className="border-t border-base-300 bg-base-100 px-4 py-2 text-center text-xs text-base-content/70">
                <div className="max-w-md mx-auto space-y-0.5">
                    <p>{userName || t('settings.connectedAs')}</p>
                    <button
                        type="button"
                        onClick={handleLogout}
                        className="btn btn-link btn-xs h-auto min-h-0 p-0 text-error no-underline"
                    >
                        {t('settings.logout')}
                    </button>
                    <p className="pt-0.5 text-[10px] opacity-60">build {packageJson.version}</p>
                </div>
            </footer>
        </div>
    );
};

export default Layout;
