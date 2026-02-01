import React, { useState, useEffect } from 'react';
import { getSettings, saveSettings, checkConnection } from '../services/civi';
import { useNavigate } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const Settings = () => {
    const { t } = useTranslation();
    const [url, setUrl] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [siteKey, setSiteKey] = useState('');
    const [restPath, setRestPath] = useState('');
    const [apiVersion, setApiVersion] = useState('3');
    const [detecting, setDetecting] = useState(false);
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
                    saveSettings(
                        settings.url,
                        settings.apiKey,
                        settings.siteKey || '',
                        settings.restPath || '',
                        settings.apiVersion || '3'
                    );
                    localStorage.setItem('civi_config_locked', 'true');
                    // Reload local state
                    setUrl(settings.url);
                    setApiKey(settings.apiKey);
                    setSiteKey(settings.siteKey || '');
                    setRestPath(settings.restPath || '');
                    setApiVersion(settings.apiVersion || '3');

                    // Clear query param
                    window.history.replaceState({}, document.title, window.location.pathname);
                    alert(t('settings.configurationLoaded'));
                    setLoadingConfig(false);
                    navigate('/'); // Redirect immediately after success
                }
            } catch (e) {
                console.error("Invalid config", e);
                alert(t('settings.invalidConfig'));
                setLoadingConfig(false);
            }
        } else {
            const settings = getSettings();
            setUrl(settings.url);
            setApiKey(settings.apiKey);
            setSiteKey(settings.siteKey);
            setRestPath(settings.restPath);
            setApiVersion(settings.apiVersion || '3');
            setLoadingConfig(false);
        }
    }, []);

    const handleAutoDetect = async () => {
        if (!url || !apiKey || !siteKey) {
            alert(t('settings.fillFields'));
            return;
        }

        setDetecting(true);
        const pathsToTry = [
            '/modules/contrib/civicrm/extern/rest.php',
            '/libraries/civicrm/extern/rest.php',
            '/sites/all/modules/civicrm/extern/rest.php',
            '/vendor/civicrm/civicrm-core/extern/rest.php',
            '/civicrm/extern/rest.php',
            '/wp-content/plugins/civicrm/civicrm/extern/rest.php'
        ];

        let found = false;
        for (const path of pathsToTry) {
            try {
                const success = await checkConnection(url, apiKey, siteKey, path, '3');
                if (success) {
                    setRestPath(path);
                    setRestPath(path);
                    alert(t('settings.successFound', { path }));
                    found = true;
                    break;
                }
            } catch (e) {
                // continue
            }
        }

        if (!found) {
            alert(t('settings.notFound'));
        }
        setDetecting(false);
    };

    const handleSave = (e) => {
        e.preventDefault();
        saveSettings(url, apiKey, siteKey, restPath, apiVersion);
        alert(t('settings.saved'));
        navigate('/');
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
                        <span className="label-text">{t('settings.apiVersion')}</span>
                    </label>
                    <div className="flex gap-4">
                        <label className="label cursor-pointer gap-2">
                            <input
                                type="radio"
                                name="apiVersion"
                                className="radio radio-primary"
                                checked={apiVersion === '3'}
                                onChange={() => setApiVersion('3')}
                            />
                            <span className="label-text">v3 (Legacy REST)</span>
                        </label>
                        <label className="label cursor-pointer gap-2">
                            <input
                                type="radio"
                                name="apiVersion"
                                className="radio radio-primary"
                                checked={apiVersion === '4'}
                                onChange={() => setApiVersion('4')}
                            />
                            <span className="label-text">v4 (AuthX / Ajax)</span>
                        </label>
                    </div>
                </div>

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
                            placeholder="API Key"
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
                </div>

                {apiVersion === '3' && (
                    <>
                        <div className="form-control w-full">
                            <label className="label">
                                <span className="label-text">{t('settings.siteKey')}</span>
                            </label>
                            <input
                                type="password"
                                placeholder="Site Key"
                                className="input input-bordered w-full"
                                value={siteKey}
                                onChange={(e) => setSiteKey(e.target.value)}
                                required
                            />
                        </div>

                        <div className="form-control w-full">
                            <label className="label">
                                <span className="label-text">{t('settings.restPath')}</span>
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    placeholder="/modules/contrib/civicrm/extern/rest.php"
                                    className="input input-bordered w-full"
                                    value={restPath}
                                    onChange={(e) => setRestPath(e.target.value)}
                                    required
                                />
                                <button
                                    type="button"
                                    className="btn btn-square btn-outline"
                                    onClick={handleAutoDetect}
                                    disabled={detecting}
                                    title={t('settings.autoDetect')}
                                >
                                    {detecting ? <span className="loading loading-spinner"></span> : <RefreshCw size={20} />}
                                </button>
                            </div>
                        </div>
                    </>
                )}



                <button type="submit" className="btn btn-primary w-full">{t('settings.save')}</button>

                <button
                    type="button"
                    className="btn btn-outline btn-error w-full mt-4"
                    onClick={() => {
                        if (window.confirm(t('settings.confirmLogout'))) {
                            localStorage.clear(); // Simple clear for now
                            window.location.href = '/';
                        }
                    }}
                >
                    {t('settings.logout')}
                </button>
                <button
                    type="button"
                    className="btn btn-outline btn-secondary w-full mt-4"
                    onClick={() => {
                        import('../services/feedback').then(module => {
                            const success = module.testVibration();
                            if (success) {
                                alert(t('settings.vibrationSuccess'));
                            } else {
                                alert(t('settings.vibrationFailed'));
                            }
                        });
                    }}
                >
                    {t('settings.testVibration')}
                </button>
            </form>

            <div className="divider">{t('settings.shareConfig')}</div>

            <div className="card bg-base-100 shadow-lg border border-base-200">
                <div className="card-body p-4">
                    <h2 className="card-title text-lg">{t('settings.generateLink')}</h2>
                    <p className="text-sm mb-4" dangerouslySetInnerHTML={{ __html: t('settings.shareWarning') }}></p>

                    {/* Helper function for UTF-8 safe Base64 */}
                    {(() => {
                        const json = JSON.stringify({ url, apiKey, siteKey, restPath, apiVersion });
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
                                            alert(t('settings.linkCopied'));
                                        } catch (err) {
                                            const input = document.getElementById('config-link');
                                            if (input) {
                                                input.select();
                                                try {
                                                    document.execCommand('copy');
                                                    alert(t('settings.linkCopied'));
                                                } catch (e) {
                                                    alert(t('settings.copyManually'));
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
        </div>
    );
};

export default Settings;
