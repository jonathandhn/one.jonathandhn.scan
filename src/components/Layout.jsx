import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { Settings as SettingsIcon, Home, LogOut } from 'lucide-react';
import { getSettings, clearSettings } from '../services/civi';

const Layout = ({ children }) => {
    const { t } = useTranslation();
    const location = useLocation();
    const isHome = location.pathname === '/';
    const isSettings = location.pathname === '/settings';

    return (
        <div className="min-h-screen bg-base-200 flex flex-col font-roboto">
            {/* App Header */}
            <div className="navbar bg-primary text-primary-content shadow-md z-20">
                <div className="flex-1">
                    <Link to="/" className="btn btn-ghost text-xl normal-case font-bold tracking-wide">
                        {import.meta.env.VITE_APP_TITLE || 'CiviScan'}
                    </Link>
                </div>
                <div className="flex-none">
                    {!isSettings && !getSettings().isConfigLocked && (
                        <Link to="/settings" className="btn btn-square btn-ghost">
                            <SettingsIcon />
                        </Link>
                    )}
                    {getSettings().isConfigLocked && (
                        <button
                            onClick={() => {
                                if (window.confirm(t('settings.confirmLogout'))) {
                                    clearSettings();
                                    window.location.href = '/';
                                }
                            }}
                            className="btn btn-square btn-ghost text-error"
                        >
                            <LogOut />
                        </button>
                    )}
                    {!isHome && (
                        <Link to="/" className="btn btn-square btn-ghost">
                            <Home />
                        </Link>
                    )}
                </div>
            </div>

            {/* Main Content */}
            <main className="flex-grow p-4 max-w-md mx-auto w-full">
                {children}
            </main>


        </div>
    );
};

export default Layout;
