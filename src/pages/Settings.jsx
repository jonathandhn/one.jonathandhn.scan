import React, { useState, useEffect } from 'react';
import { getSettings, saveSettings, checkConnection, logout } from '../services/civi';
import { useToast } from '../components/Toast';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const Settings = () => {
    const { t } = useTranslation();
    const { addToast } = useToast();
    const [url, setUrl] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [gracePeriod, setGracePeriod] = useState(30);
    const [showPastEvents, setShowPastEvents] = useState(false);
    const [sortOrder, setSortOrder] = useState('name_asc');
    const [showApiKey, setShowApiKey] = useState(false);
    const [loadingConfig, setLoadingConfig] = useState(() => {
        const params = new URLSearchParams(window.location.search);
        return !!params.get('config');
    });
    const navigate = useNavigate();

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

    if (loadingConfig) {
        return (
            <div className="flex items-center justify-center h-screen">
                <span className="loading loading-spinner loading-lg text-primary"></span>
            </div>
        );
    }

    return (
        <div className="p-4 max-w-md mx-auto">
            <h1 className="text-2xl font-bold mb-4">{t('settings.title')}</h1>
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
                            // Redirect to current path (reload) to force login screen
                            // Using ./ ensures we stay in the app folder if implied
                            window.location.href = './';
                        }
                    }}
                >
                    {t('settings.logout')}
                </button>
            </form>

            {/* FEATURE FLAG: LINK SHARING - Default OFF, enable with VITE_ENABLE_SHARE_LINK=true */}
            {import.meta.env.VITE_ENABLE_SHARE_LINK === 'true' && (
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
            )}
            {/* Version Info */}
            <div className="mt-8 text-center opacity-50 text-xs">
                <p>v{__APP_VERSION__} ({__BUILD_DATE__})</p>
                {import.meta.env.VITE_HIDE_POWERED_BY !== 'true' && (
                    <p className="mt-1">Powered by CiviCRM</p>
                )}
            </div>
        </div>
    );
};

export default Settings;
