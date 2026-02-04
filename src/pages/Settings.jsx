import React, { useState, useEffect } from 'react';
import { useAuth } from 'react-oidc-context';
import { getSettings, saveSettings, checkConnection, logout, getCurrentContact } from '../services/civi';
import { useToast } from '../components/Toast';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const Settings = () => {
    const auth = useAuth();
    const { t } = useTranslation();
    const { addToast } = useToast();
    const [url, setUrl] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [gracePeriod, setGracePeriod] = useState(30);
    const [showPastEvents, setShowPastEvents] = useState(false);
    const [sortOrder, setSortOrder] = useState('name_asc');
    const [showApiKey, setShowApiKey] = useState(false);
    const [userName, setUserName] = useState(null); // Store user name
    const [loadingConfig, setLoadingConfig] = useState(() => {
        const params = new URLSearchParams(window.location.search);
        return !!params.get('config');
    });
    const navigate = useNavigate();

    // Fetch user name on mount if we have some credentials
    useEffect(() => {
        const fetchUser = async () => {
            if (getSettings().apiKey || localStorage.getItem('civi_magic_token')) {
                const contact = await getCurrentContact();
                if (contact) {
                    setUserName(contact.display_name);
                }
            }
        };
        fetchUser();
    }, []);

    useEffect(() => {
        // Check for config param
        const params = new URLSearchParams(window.location.search);
        const config = params.get('config');
        if (config) {
            try {
                // UTF-8 safe decoding
                const decoded = decodeURIComponent(escape(atob(config)));
                const settings = JSON.parse(decoded);
                if (settings.url && settings.apiKey) {
                    saveSettings(settings.url, settings.apiKey);
                    localStorage.setItem('civi_config_locked', 'true');

                    // Reload local state
                    setUrl(settings.url);
                    setApiKey(settings.apiKey);

                    // Clear query param
                    window.history.replaceState({}, document.title, window.location.pathname);
                    addToast(t('settings.configurationLoaded'), 'success');
                    setLoadingConfig(false);
                    navigate('/'); // Redirect immediately after success
                }
            } catch (e) {
                console.error("Invalid config", e);
                addToast(t('settings.invalidConfig'), 'error');
                setLoadingConfig(false);
            }
        } else {
            const settings = getSettings();
            setUrl(settings.url);
            setApiKey(settings.apiKey);
            setGracePeriod(settings.gracePeriod);
            setShowPastEvents(settings.showPastEvents);
            setSortOrder(settings.sortOrder);
            setLoadingConfig(false);
        }
    }, [t, navigate, addToast]);

    const handleSave = async (e) => {
        e.preventDefault();
        const success = await checkConnection(url, apiKey);
        if (success) {
            saveSettings(url, apiKey, gracePeriod, showPastEvents, sortOrder);
            addToast(t('settings.saved'), 'success');
            navigate('/');
        } else {
            addToast("Connection failed! Please check URL and API Key.", 'error');
        }
    };

    const [magicToken, setMagicToken] = useState(() => localStorage.getItem('civi_magic_token'));

    // ... (rest of logic)

    const handleLogout = () => {
        if (window.confirm(t('settings.confirmLogout'))) {
            // Clear all auth methods
            logout(); // Clears api key
            localStorage.removeItem('civi_magic_token'); // Clears magic token
            try { auth.removeUser(); } catch (e) { } // Clears OAuth

            // Reload to reset state
            window.location.href = './';
        }
    };

    if (loadingConfig) {
        return (
            <div className="flex items-center justify-center h-screen">
                <span className="loading loading-spinner text-primary"></span>
            </div>
        );
    }

    return (
        <div className="p-4 max-w-md mx-auto">
            <h1 className="text-2xl font-bold mb-4">{t('settings.title')}</h1>

            {/* 1. Magic Link Status */}
            {magicToken && (
                <div className="mb-6 card bg-base-200 shadow-sm border border-success">
                    <div className="card-body p-4">
                        <h3 className="font-bold text-success flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                            {t('settings.connectedViaMagicLink')}
                        </h3>
                        {userName && <p className="font-medium text-lg my-1">{userName}</p>}
                        <p className="text-xs opacity-70 mb-2">{t('settings.magicLinkHint')}</p>
                        <button onClick={handleLogout} className="btn btn-sm btn-outline btn-error w-full">
                            {t('settings.logout')}
                        </button>
                    </div>
                </div>
            )}

            {/* 2. OAuth Connection (Feature Flagged) */}
            {(window.CIVI_CONFIG?.featureOauth || import.meta.env.VITE_FEATURE_OAUTH) === 'true' && import.meta.env.VITE_OAUTH_CLIENT_ID && (
                <div className="mb-6">
                    <button
                        type="button"
                        onClick={() => void auth.signinRedirect()}
                        className="btn btn-primary w-full gap-2 shadow-lg"
                    >
                        Login with CiviCRM
                    </button>
                    {auth.isAuthenticated && (
                        <div className="mt-2 alert alert-success text-sm py-2">
                            <span>Connected as {auth.user?.profile.email || auth.user?.profile.sub}</span>
                        </div>
                    )}
                </div>
            )}

            {/* 3. Manual Config (Only show if not connected via Magic Link) */}
            {!magicToken && (
                <>
                    {/* Show Connected Status for API Key if valid */}
                    {!showApiKey && apiKey && userName && (
                        <div className="mb-6 card bg-base-200 shadow-sm border border-info">
                            <div className="card-body p-4">
                                <h3 className="font-bold text-info flex items-center gap-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    {t('settings.connectedAs')}
                                </h3>
                                <p className="font-medium text-lg">{userName}</p>
                            </div>
                        </div>
                    )}

                    <div className="divider text-xs opacity-50">{t('settings.orManualConfig')}</div>

                    <form onSubmit={handleSave} className="space-y-4">
                        <div className="form-control w-full">
                            <label className="label">
                                <span className="label-text">{t('settings.siteUrl')}</span>
                            </label>
                            <input
                                type="url"
                                placeholder="https://example.org"
                                className="input input-bordered w-full"
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                required
                            />
                        </div>

                        <div className="form-control w-full">
                            <label className="label">
                                <span className="label-text">{t('settings.apiKey')}</span>
                            </label>
                            <div className="join w-full">
                                <input
                                    type={showApiKey ? "text" : "password"}
                                    placeholder={t('settings.apiKey')}
                                    className="input input-bordered w-full join-item"
                                    value={apiKey}
                                    onChange={(e) => setApiKey(e.target.value)}
                                    required
                                />
                                <button
                                    type="button"
                                    className="btn join-item"
                                    onClick={() => setShowApiKey(!showApiKey)}
                                >
                                    {showApiKey ? t('common.hide') : t('common.show')}
                                </button>
                            </div>
                            <label className="label">
                                <span className="label-text-alt text-base-content/60">{t('settings.apiKeyHint')}</span>
                            </label>
                        </div>

                        <div className="form-control w-full">
                            <label className="label">
                                <span className="label-text">{t('settings.defaultSort')}</span>
                            </label>
                            <select
                                className="select select-bordered w-full"
                                value={sortOrder}
                                onChange={(e) => setSortOrder(e.target.value)}
                            >
                                <option value="name_asc">{t('settings.sortNameAsc')}</option>
                                <option value="id_desc">{t('settings.sortIdDesc')}</option>
                                <option value="id_asc">{t('settings.sortIdAsc')}</option>
                            </select>
                        </div>

                        <button type="submit" className="btn btn-primary w-full">{t('settings.save')}</button>

                        <button
                            type="button"
                            className="btn btn-outline btn-error w-full mt-4"
                            onClick={() => {
                                if (window.confirm(t('settings.confirmLogout'))) {
                                    logout();
                                    window.location.href = './';
                                }
                            }}
                        >
                            {t('settings.logout')}
                        </button>
                    </form>
                </>
            )}

            {/* FEATURE FLAG: LINK SHARING - Default OFF, enable with VITE_ENABLE_SHARE_LINK=true */}
            {
                import.meta.env.VITE_ENABLE_SHARE_LINK === 'true' && (
                    <>
                        <div className="divider">{t('settings.shareConfig')}</div>

                        <div className="card bg-base-100 shadow-lg border border-base-200">
                            <div className="card-body p-4">
                                <h2 className="card-title text-lg">{t('settings.generateLink')}</h2>
                                <p className="text-sm mb-4" dangerouslySetInnerHTML={{ __html: t('settings.shareWarning') }}></p>

                                {/* Helper function for UTF-8 safe Base64 */}
                                {(() => {
                                    const json = JSON.stringify({ url, apiKey, sortOrder });
                                    const b64 = btoa(unescape(encodeURIComponent(json)));
                                    const link = `${window.location.origin}${window.location.pathname}?config=${b64}`;

                                    return (
                                        <div className="flex flex-col gap-2">
                                            <textarea
                                                id="config-link"
                                                readOnly
                                                className="textarea textarea-bordered w-full text-xs h-24 break-all font-mono bg-base-200"
                                                value={link}
                                                onClick={(e) => e.target.select()}
                                            />
                                            <button
                                                className="btn btn-neutral w-full"
                                                onClick={async () => {
                                                    try {
                                                        await navigator.clipboard.writeText(link);
                                                        addToast(t('settings.linkCopied'), 'success');
                                                    } catch (err) {
                                                        const input = document.getElementById('config-link');
                                                        if (input) {
                                                            input.select();
                                                            try {
                                                                document.execCommand('copy');
                                                                addToast(t('settings.linkCopied'), 'success');
                                                            } catch (e) {
                                                                addToast(t('settings.copyManually'), 'warning');
                                                            }
                                                        }
                                                    }
                                                }}
                                            >
                                                {t('settings.copyLink')}
                                            </button>
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>
                    </>
                )
            }
            {/* Version Info & Footer */}
            <div className="mt-8 text-center opacity-40 text-xs space-y-1">
                {import.meta.env.VITE_HIDE_POWERED_BY !== 'true' && (
                    <p className="font-medium">{t('settings.poweredBy')}</p>
                )}
                <p>v{__APP_VERSION__} • {__BUILD_DATE__}</p>
            </div>
        </div >
    );
};

export default Settings;
