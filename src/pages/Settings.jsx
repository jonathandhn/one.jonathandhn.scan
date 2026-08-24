import { useState, useEffect } from 'react';
import { useSafeAuth } from '../auth/AuthProvider';
import {
    getSettings,
    saveSettings,
    savePreferences,
    checkConnection,
    logout,
    getCurrentContact,
    civiApi
} from '../services/civi';
import { useToast } from '../components/Toast';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { nativeBridge } from '../services/nativeBridge';
import { isStandaloneDisplay } from '../services/pwa';
import { testVibration } from '../services/feedback';
import { logger } from '../services/logger';
import { isSessionMode } from '../runtime';
import {
    ShieldCheck,
    Smartphone,
    Sliders,
    Volume2,
    Vibrate,
    Zap,
    Globe,
    CreditCard,
    Camera,
    Sparkles,
    LogOut,
    CheckCircle2,
    FileText,
    Download,
    Copy,
    Trash2,
    RefreshCw,
    Terminal
} from 'lucide-react';

const Settings = () => {
    const auth = useSafeAuth();
    const { t } = useTranslation();
    const { addToast } = useToast();
    const navigate = useNavigate();

    const [activeTab, setActiveTab] = useState(() => (isSessionMode ? 'preferences' : 'general'));

    // General & Auth State
    const [url, setUrl] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [showApiKey, setShowApiKey] = useState(false);
    const [userName, setUserName] = useState(null);
    const [sortOrder, setSortOrder] = useState('name_asc');
    const [gracePeriod, setGracePeriod] = useState(30);
    const [showPastEvents, setShowPastEvents] = useState(false);

    // Preferences & Mobile
    const [soundEnabled, setSoundEnabled] = useState(true);
    const [hapticEnabled, setHapticEnabled] = useState(true);
    const [autoValidate, setAutoValidate] = useState(false);

    // Tap to Pay & Diagnostics
    const [deviceInfo, setDeviceInfo] = useState(null);
    const [enrollingTapToPay, setEnrollingTapToPay] = useState(false);
    const [logs, setLogs] = useState(() => logger.getLogs());
    const [showLogViewer, setShowLogViewer] = useState(false);

    const [loadingConfig, setLoadingConfig] = useState(() => {
        const params = new URLSearchParams(window.location.search);
        return !!params.get('config');
    });

    const isNative = nativeBridge.isNative();
    const isPwa = isStandaloneDisplay();
    const [magicToken] = useState(() => localStorage.getItem('civi_magic_token'));

    // Fetch user name on mount
    useEffect(() => {
        const fetchUser = async () => {
            if (getSettings().apiKey || localStorage.getItem('civi_magic_token')) {
                try {
                    const contact = await getCurrentContact();
                    if (contact?.display_name) {
                        setUserName(contact.display_name);
                    }
                } catch {
                    // Ignore user lookup failure
                }
            }
        };
        fetchUser();
    }, []);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const config = params.get('config');
        if (config) {
            try {
                const decoded = decodeURIComponent(escape(atob(config)));
                const settings = JSON.parse(decoded);
                if (settings.url && settings.apiKey) {
                    saveSettings(settings.url, settings.apiKey);
                    localStorage.setItem('civi_config_locked', 'true');

                    setUrl(settings.url);
                    setApiKey(settings.apiKey);

                    window.history.replaceState({}, document.title, window.location.pathname);
                    addToast(t('settings.configurationLoaded'), 'success');
                    setLoadingConfig(false);
                    navigate('/');
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
            setSoundEnabled(settings.soundEnabled);
            setHapticEnabled(settings.hapticEnabled);
            setAutoValidate(settings.autoValidate);
            setLoadingConfig(false);
        }
    }, [t, navigate, addToast]);

    const handleSaveAuth = async (e) => {
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

    const handleToggleSound = (checked) => {
        setSoundEnabled(checked);
        savePreferences({ soundEnabled: checked });
        addToast(t('settings.saved'), 'success');
    };

    const handleToggleHaptic = (checked) => {
        setHapticEnabled(checked);
        savePreferences({ hapticEnabled: checked });
        if (checked) {
            testVibration();
        }
        addToast(t('settings.saved'), 'success');
    };

    const handleToggleAutoValidate = (checked) => {
        setAutoValidate(checked);
        savePreferences({ autoValidate: checked });
        addToast(t('settings.saved'), 'success');
    };

    const handleSortChange = (value) => {
        setSortOrder(value);
        savePreferences({ sortOrder: value });
        addToast(t('settings.saved'), 'success');
    };

    const fetchDeviceInfo = async () => {
        if (!nativeBridge.isNative()) return;
        try {
            const info = await nativeBridge.getDeviceInfo();
            setDeviceInfo(info);
        } catch (e) {
            logger.warn('SETTINGS_DEVICE_INFO', 'Impossible de récupérer les infos de l\'appareil', e.message);
        }
    };

    useEffect(() => {
        if (activeTab === 'mobile') {
            fetchDeviceInfo();
            setLogs(logger.getLogs());
        }
    }, [activeTab]);

    const handleEnrollTapToPay = async () => {
        if (!nativeBridge.isNative()) {
            addToast('Tap to Pay nécessite l\'application mobile CiviScan.', 'warning');
            return;
        }

        setEnrollingTapToPay(true);
        addToast('Initialisation et enrôlement Stripe Tap to Pay...', 'info');
        logger.log('SETTINGS_ENROLL', 'Début de l\'enrôlement Tap to Pay demandé par l\'utilisateur');

        try {
            const [tokenRes, locRes] = await Promise.all([
                civiApi('CiviScanStripeTerminal', 'getConnectionToken'),
                civiApi('CiviScanStripeTerminal', 'getLocation'),
            ]);

            const tokenData = tokenRes?.values || tokenRes;
            const locData = locRes?.values || locRes;

            const res = await nativeBridge.initTapToPay({
                connectionToken: tokenData?.secret || '',
                locationId: locData?.locationId || '',
            });

            logger.log('SETTINGS_ENROLL_SUCCESS', 'Enrôlement Tap to Pay terminé avec succès', res);
            addToast('🎉 Lecteur Tap to Pay prêt & enrôlé avec succès !', 'success');
            await nativeBridge.vibrate('success');
            await fetchDeviceInfo();
        } catch (error) {
            logger.error('SETTINGS_ENROLL_ERROR', 'Échec de l\'enrôlement Tap to Pay', error.message);
            addToast(`Erreur enrôlement Tap to Pay : ${error.message}`, 'error');
            await nativeBridge.vibrate('error');
        } finally {
            setEnrollingTapToPay(false);
            setLogs(logger.getLogs());
        }
    };

    const handleCopyLogs = async () => {
        try {
            const text = logger.exportLogsText();
            await navigator.clipboard.writeText(text);
            addToast('📋 Logs copiés dans le presse-papiers !', 'success');
        } catch {
            addToast('Impossible de copier automatiquement les logs', 'warning');
        }
    };

    const handleDownloadLogs = () => {
        logger.downloadLogsFile();
        addToast('💾 Fichier journal civiscan-debug.log téléchargé !', 'success');
    };

    const handleClearLogs = () => {
        if (window.confirm('Vider tout l\'historique des logs ?')) {
            logger.clearLogs();
            setLogs([]);
            addToast('Historique des logs vidé.', 'info');
        }
    };

    const handleTestVibration = async () => {
        try {
            const res = await testVibration();
            if (res) {
                addToast(t('settings.vibrationSuccess'), 'success');
            } else {
                addToast(t('settings.vibrationFailed'), 'warning');
            }
        } catch {
            addToast(t('settings.vibrationFailed'), 'warning');
        }
    };

    const handleLogout = () => {
        if (window.confirm(t('settings.confirmLogout'))) {
            logout();
            localStorage.removeItem('civi_magic_token');
            auth.removeUser().catch(() => {});
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
        <div className="p-2 sm:p-4 max-w-md mx-auto space-y-4">
            <h1 className="text-2xl font-bold">{t('settings.title')}</h1>

            {/* Navigation Tabs */}
            <div className={`tabs tabs-boxed bg-base-300 p-1 rounded-xl grid ${isSessionMode ? 'grid-cols-2' : 'grid-cols-3'} text-xs sm:text-sm`}>
                {!isSessionMode && (
                    <button
                        type="button"
                        className={`tab flex items-center gap-1 sm:gap-2 ${activeTab === 'general' ? 'tab-active font-bold' : ''}`}
                        onClick={() => setActiveTab('general')}
                    >
                        <ShieldCheck size={16} />
                        <span>{t('settings.tabGeneral')}</span>
                    </button>
                )}
                <button
                    type="button"
                    className={`tab flex items-center gap-1 sm:gap-2 ${activeTab === 'preferences' ? 'tab-active font-bold' : ''}`}
                    onClick={() => setActiveTab('preferences')}
                >
                    <Sliders size={16} />
                    <span>{t('settings.tabPreferences')}</span>
                </button>
                <button
                    type="button"
                    className={`tab flex items-center gap-1 sm:gap-2 ${activeTab === 'mobile' ? 'tab-active font-bold' : ''}`}
                    onClick={() => setActiveTab('mobile')}
                >
                    <Smartphone size={16} />
                    <span>{t('settings.tabMobile')}</span>
                </button>
            </div>

            {/* TAB 1 : ACCÈS (Headless uniquement) */}
            {!isSessionMode && activeTab === 'general' && (
                <div className="space-y-4">
                    {/* Magic Link Status */}
                    {magicToken && (
                        <div className="card bg-base-100 shadow-sm border border-success/40">
                            <div className="card-body p-4">
                                <h3 className="font-bold text-success flex items-center gap-2">
                                    <CheckCircle2 className="h-5 w-5" />
                                    {t('settings.connectedViaMagicLink')}
                                </h3>
                                {userName && <p className="font-semibold text-base">{userName}</p>}
                                <p className="text-xs opacity-70">{t('settings.magicLinkHint')}</p>
                                <button onClick={handleLogout} className="btn btn-sm btn-outline btn-error w-full mt-2">
                                    <LogOut size={16} />
                                    {t('settings.logout')}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* OAuth Connection */}
                    {(window.CIVI_CONFIG?.featureOauth || import.meta.env.VITE_FEATURE_OAUTH) === 'true' && import.meta.env.VITE_OAUTH_CLIENT_ID && (
                        <div className="card bg-base-100 p-4 shadow-sm border border-base-300">
                            <button
                                type="button"
                                onClick={() => void auth.signinRedirect()}
                                className="btn btn-primary w-full gap-2"
                            >
                                Login with CiviCRM
                            </button>
                            {auth.isAuthenticated && (
                                <div className="mt-2 alert alert-success text-xs py-2">
                                    <span>Connected as {auth.user?.profile.email || auth.user?.profile.sub}</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Manual Config */}
                    {!magicToken && (
                        <div className="card bg-base-100 p-4 shadow-sm border border-base-300">
                            {!showApiKey && apiKey && userName && (
                                <div className="mb-4 alert alert-info text-xs py-2">
                                    <span>{t('settings.connectedAs')}: <strong>{userName}</strong></span>
                                </div>
                            )}

                            <form onSubmit={handleSaveAuth} className="space-y-3">
                                <div className="form-control w-full">
                                    <label className="label py-1">
                                        <span className="label-text text-xs font-semibold">{t('settings.siteUrl')}</span>
                                    </label>
                                    <input
                                        type="url"
                                        placeholder="https://example.org"
                                        className="input input-bordered input-sm w-full"
                                        value={url}
                                        onChange={(e) => setUrl(e.target.value)}
                                        required
                                    />
                                </div>

                                <div className="form-control w-full">
                                    <label className="label py-1">
                                        <span className="label-text text-xs font-semibold">{t('settings.apiKey')}</span>
                                    </label>
                                    <div className="join w-full">
                                        <input
                                            type={showApiKey ? "text" : "password"}
                                            placeholder={t('settings.apiKey')}
                                            className="input input-bordered input-sm w-full join-item"
                                            value={apiKey}
                                            onChange={(e) => setApiKey(e.target.value)}
                                            required
                                        />
                                        <button
                                            type="button"
                                            className="btn btn-sm join-item"
                                            onClick={() => setShowApiKey(!showApiKey)}
                                        >
                                            {showApiKey ? t('common.hide') : t('common.show')}
                                        </button>
                                    </div>
                                    <label className="label py-0.5">
                                        <span className="label-text-alt text-base-content/60 text-[11px]">{t('settings.apiKeyHint')}</span>
                                    </label>
                                </div>

                                <button type="submit" className="btn btn-primary btn-sm w-full mt-2">
                                    {t('settings.save')}
                                </button>

                                <button
                                    type="button"
                                    className="btn btn-outline btn-error btn-sm w-full mt-2"
                                    onClick={handleLogout}
                                >
                                    <LogOut size={16} />
                                    {t('settings.logout')}
                                </button>
                            </form>
                        </div>
                    )}

                    {/* Share Config Link */}
                    {import.meta.env.VITE_ENABLE_SHARE_LINK === 'true' && (
                        <div className="card bg-base-100 p-4 shadow-sm border border-base-300">
                            <h2 className="card-title text-sm">{t('settings.generateLink')}</h2>
                            <p className="text-xs mb-2 opacity-70" dangerouslySetInnerHTML={{ __html: t('settings.shareWarning') }}></p>
                            {(() => {
                                const json = JSON.stringify({ url, apiKey, sortOrder });
                                const b64 = btoa(unescape(encodeURIComponent(json)));
                                const link = `${window.location.origin}${window.location.pathname}?config=${b64}`;

                                return (
                                    <button
                                        className="btn btn-neutral btn-sm w-full"
                                        onClick={async () => {
                                            try {
                                                await navigator.clipboard.writeText(link);
                                                addToast(t('settings.linkCopied'), 'success');
                                            } catch {
                                                addToast(t('settings.copyManually'), 'warning');
                                            }
                                        }}
                                    >
                                        {t('settings.copyLink')}
                                    </button>
                                );
                            })()}
                        </div>
                    )}
                </div>
            )}

            {/* TAB 2 : PRÉFÉRENCES & POINTAGE */}
            {activeTab === 'preferences' && (
                <div className="space-y-4">
                    <div className="card bg-base-100 p-4 shadow-sm border border-base-300 space-y-4">
                        {/* Sort Order */}
                        <div className="form-control w-full">
                            <label className="label py-1">
                                <span className="label-text text-xs font-semibold">{t('settings.defaultSort')}</span>
                            </label>
                            <select
                                className="select select-bordered select-sm w-full"
                                value={sortOrder}
                                onChange={(e) => handleSortChange(e.target.value)}
                            >
                                <option value="name_asc">{t('settings.sortNameAsc')}</option>
                                <option value="id_desc">{t('settings.sortIdDesc')}</option>
                                <option value="id_asc">{t('settings.sortIdAsc')}</option>
                            </select>
                        </div>

                        <div className="divider my-1"></div>

                        {/* Instant Auto Validate Toggle */}
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5 pr-2">
                                <label className="text-sm font-semibold flex items-center gap-1.5 cursor-pointer" htmlFor="toggle-autovalidate">
                                    <Zap size={16} className="text-warning" />
                                    <span>{t('settings.autoValidate')}</span>
                                </label>
                                <p className="text-xs opacity-60 leading-tight">{t('settings.autoValidateHint')}</p>
                            </div>
                            <input
                                id="toggle-autovalidate"
                                type="checkbox"
                                className="toggle toggle-primary"
                                checked={autoValidate}
                                onChange={(e) => handleToggleAutoValidate(e.target.checked)}
                            />
                        </div>

                        <div className="divider my-1"></div>

                        {/* Sound Toggle */}
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5 pr-2">
                                <label className="text-sm font-semibold flex items-center gap-1.5 cursor-pointer" htmlFor="toggle-sound">
                                    <Volume2 size={16} className="text-info" />
                                    <span>{t('settings.soundEnabled')}</span>
                                </label>
                                <p className="text-xs opacity-60 leading-tight">{t('settings.soundEnabledHint')}</p>
                            </div>
                            <input
                                id="toggle-sound"
                                type="checkbox"
                                className="toggle toggle-primary"
                                checked={soundEnabled}
                                onChange={(e) => handleToggleSound(e.target.checked)}
                            />
                        </div>

                        <div className="divider my-1"></div>

                        {/* Haptic Toggle */}
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5 pr-2">
                                <label className="text-sm font-semibold flex items-center gap-1.5 cursor-pointer" htmlFor="toggle-haptic">
                                    <Vibrate size={16} className="text-secondary" />
                                    <span>{t('settings.hapticEnabled')}</span>
                                </label>
                                <p className="text-xs opacity-60 leading-tight">{t('settings.hapticEnabledHint')}</p>
                            </div>
                            <input
                                id="toggle-haptic"
                                type="checkbox"
                                className="toggle toggle-primary"
                                checked={hapticEnabled}
                                onChange={(e) => handleToggleHaptic(e.target.checked)}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 3 : MATÉRIEL & MOBILE */}
            {activeTab === 'mobile' && (
                <div className="space-y-4">
                    {/* Runtime Environment Card */}
                    <div className="card bg-base-100 p-4 shadow-sm border border-base-300 space-y-3">
                        <h2 className="card-title text-sm flex items-center gap-2">
                            <Globe size={18} className="text-primary" />
                            {t('settings.runtimeEnvironment')}
                        </h2>

                        <div className="p-3 rounded-lg bg-base-200 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                {isNative ? (
                                    <Smartphone className="text-success h-6 w-6" />
                                ) : isPwa ? (
                                    <Sparkles className="text-info h-6 w-6" />
                                ) : (
                                    <Globe className="text-base-content/60 h-6 w-6" />
                                )}
                                <div>
                                    <p className="font-bold text-xs sm:text-sm">
                                        {isNative ? t('settings.modeNative') : isPwa ? t('settings.modePwa') : t('settings.modeWeb')}
                                    </p>
                                    <p className="text-[11px] opacity-60">
                                        {isNative ? 'React Native Bridge Connecté' : isPwa ? 'Mode autonome plein écran' : 'Navigateur'}
                                    </p>
                                </div>
                            </div>
                            <span className={`badge badge-sm ${isNative ? 'badge-success' : isPwa ? 'badge-info' : 'badge-ghost'}`}>
                                {isNative ? 'Natif' : isPwa ? 'PWA' : 'Web'}
                            </span>
                        </div>
                    </div>

                    {/* Tap to Pay Enrollment Card */}
                    <div className="card bg-base-100 p-4 shadow-sm border border-base-300 space-y-3">
                        <div className="flex items-center justify-between">
                            <h2 className="card-title text-sm flex items-center gap-2">
                                <CreditCard size={18} className="text-primary" />
                                <span>Stripe Tap to Pay (Sans contact NFC)</span>
                            </h2>
                            <button
                                type="button"
                                onClick={fetchDeviceInfo}
                                className="btn btn-ghost btn-xs btn-circle"
                                title="Actualiser le statut"
                            >
                                <RefreshCw size={14} />
                            </button>
                        </div>

                        <div className="p-3 rounded-lg bg-base-200 space-y-2 text-xs">
                            <div className="flex items-center justify-between">
                                <span className="font-semibold">Statut du terminal :</span>
                                <span className={`badge badge-sm font-bold ${
                                    deviceInfo?.isReaderConnected
                                        ? 'badge-success gap-1 text-white'
                                        : deviceInfo?.hasTapToPay
                                            ? 'badge-warning gap-1'
                                            : 'badge-ghost'
                                }`}>
                                    {deviceInfo?.isReaderConnected ? '🟢 Prêt & Enrôlé' : deviceInfo?.hasTapToPay ? '🟡 Initialisation requise' : '⚪ Indisponible'}
                                </span>
                            </div>

                            {deviceInfo?.connectedReader && (
                                <div className="flex items-center justify-between text-base-content/70">
                                    <span>Identifiant lecteur :</span>
                                    <code className="bg-base-300 px-1.5 py-0.5 rounded text-[11px] font-mono">
                                        {deviceInfo.connectedReader}
                                    </code>
                                </div>
                            )}

                            {deviceInfo?.statusLog && (
                                <div className="text-[11px] text-base-content/60 italic pt-1 border-t border-base-300">
                                    Dernier statut : {deviceInfo.statusLog}
                                </div>
                            )}
                        </div>

                        {isNative && (
                            <button
                                type="button"
                                onClick={handleEnrollTapToPay}
                                disabled={enrollingTapToPay}
                                className="btn btn-primary btn-sm w-full gap-2"
                            >
                                {enrollingTapToPay ? (
                                    <span className="loading loading-spinner loading-xs"></span>
                                ) : (
                                    <Zap size={16} />
                                )}
                                <span>{deviceInfo?.isReaderConnected ? 'Tester / Ré-enrôler Tap to Pay' : 'Enrôler & Activer Tap to Pay'}</span>
                            </button>
                        )}
                    </div>

                    {/* Hardware Capabilities & Vibration */}
                    <div className="card bg-base-100 p-4 shadow-sm border border-base-300 space-y-3">
                        <h2 className="card-title text-sm flex items-center gap-2">
                            <Sparkles size={18} className="text-warning" />
                            {t('settings.hardwareFeatures')}
                        </h2>

                        {/* Fast Camera */}
                        <div className="flex items-center justify-between p-2.5 rounded-lg bg-base-200 text-xs">
                            <div className="flex items-center gap-2">
                                <Camera size={18} className={isNative ? "text-success" : "text-base-content/40"} />
                                <div>
                                    <p className="font-semibold">{t('settings.cameraFps')}</p>
                                    <p className="text-[11px] opacity-60">
                                        {isNative ? 'Optimisation matérielle active' : 'Flux vidéo standard'}
                                    </p>
                                </div>
                            </div>
                            <span className={`badge badge-xs ${isNative ? 'badge-success' : 'badge-ghost'}`}>
                                {isNative ? '60 FPS' : '30 FPS'}
                            </span>
                        </div>

                        {/* Vibration Test */}
                        <button
                            type="button"
                            onClick={handleTestVibration}
                            className="btn btn-outline btn-secondary btn-sm w-full gap-2"
                        >
                            <Vibrate size={16} />
                            {t('settings.testVibration')}
                        </button>
                    </div>

                    {/* Diagnostic & Crash Log Manager */}
                    <div className="card bg-base-100 p-4 shadow-sm border border-base-300 space-y-3">
                        <div className="flex items-center justify-between">
                            <h2 className="card-title text-sm flex items-center gap-2">
                                <Terminal size={18} className="text-info" />
                                <span>Journal de Diagnostic & Crash</span>
                            </h2>
                            <span className="badge badge-sm badge-ghost text-xs">
                                {logs.length} entrée(s)
                            </span>
                        </div>

                        <p className="text-xs opacity-70">
                            Enregistre tous les événements système, les réponses du pont mobile, les erreurs Stripe et les exceptions pour diagnostic après incident.
                        </p>

                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={handleCopyLogs}
                                className="btn btn-outline btn-sm gap-1.5"
                                disabled={logs.length === 0}
                            >
                                <Copy size={14} />
                                <span>Copier les logs</span>
                            </button>
                            <button
                                type="button"
                                onClick={handleDownloadLogs}
                                className="btn btn-info btn-sm text-white gap-1.5"
                                disabled={logs.length === 0}
                            >
                                <Download size={14} />
                                <span>Télécharger .log</span>
                            </button>
                        </div>

                        <div className="flex items-center justify-between pt-1">
                            <button
                                type="button"
                                onClick={() => setShowLogViewer(!showLogViewer)}
                                className="btn btn-link btn-xs p-0 text-primary"
                            >
                                <FileText size={14} className="mr-1 inline" />
                                {showLogViewer ? 'Masquer les lignes de log' : 'Afficher les dernières lignes de log'}
                            </button>
                            {logs.length > 0 && (
                                <button
                                    type="button"
                                    onClick={handleClearLogs}
                                    className="btn btn-ghost btn-xs text-error gap-1"
                                >
                                    <Trash2 size={13} />
                                    <span>Vider</span>
                                </button>
                            )}
                        </div>

                        {showLogViewer && (
                            <div className="bg-slate-950 text-slate-200 p-3 rounded-lg text-[10px] font-mono max-h-56 overflow-y-auto space-y-1">
                                {logs.length === 0 ? (
                                    <div className="text-slate-500 italic">Aucun log enregistré pour le moment.</div>
                                ) : (
                                    logs.slice(-25).map((l, i) => (
                                        <div key={i} className="leading-tight">
                                            <span className="text-slate-500">{l.timestamp.split('T')[1].split('.')[0]}</span>{' '}
                                            <span className={l.level === 'ERROR' ? 'text-rose-400 font-bold' : l.level === 'WARN' ? 'text-amber-400' : 'text-emerald-400'}>
                                                [{l.level}]
                                            </span>{' '}
                                            <span className="text-sky-300 font-semibold">{l.category}:</span> {l.message}
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Version & Footer */}
            <div className="mt-6 text-center opacity-40 text-xs space-y-0.5">
                {import.meta.env.VITE_HIDE_POWERED_BY !== 'true' && (
                    <p className="font-medium">{t('settings.poweredBy')}</p>
                )}
                <p>v{__APP_VERSION__} • {__BUILD_DATE__}</p>
            </div>
        </div>
    );
};

export default Settings;

