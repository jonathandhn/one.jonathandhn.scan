import { useState, useEffect } from 'react';
import { useSafeAuth } from '../auth/AuthProvider';
import {
    getSettings,
    saveSettings,
    savePreferences,
    checkConnection,
    logout,
    getCurrentContact
} from '../services/civi';
import { useToast } from '../components/Toast';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { isSessionMode } from '../runtime';
import {
    ShieldCheck,
    Sliders,
    Volume2,
    LogOut,
    CheckCircle2
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

    // Preferences
    const [soundEnabled, setSoundEnabled] = useState(true);
    const [autoValidate, setAutoValidate] = useState(false);

    const [loadingConfig, setLoadingConfig] = useState(() => {
        const params = new URLSearchParams(window.location.search);
        return !!params.get('config');
    });

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
            setAutoValidate(settings.autoValidate);
            setLoadingConfig(false);
        }
    }, [t, navigate, addToast]);

    const handleSaveAuth = async (e) => {
        e.preventDefault();
        const success = await checkConnection(url, apiKey);
        if (success) {
            localStorage.removeItem('civi_magic_token');
            saveSettings(url, apiKey, gracePeriod, showPastEvents, sortOrder);
            addToast(t('settings.saved'), 'success');
            navigate('/');
        } else {
            addToast("Échec de connexion ! Veuillez vérifier l'URL et la clé API.", 'error');
        }
    };

    const handleToggleSound = (checked) => {
        setSoundEnabled(checked);
        savePreferences({ soundEnabled: checked });
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
            <div className={`tabs tabs-boxed bg-base-300 p-1 rounded-xl grid ${isSessionMode ? 'grid-cols-1' : 'grid-cols-2'} text-xs sm:text-sm`}>
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
                </div>
            )}

            {/* TAB 2 : PRÉFÉRENCES & POINTAGE */}
            {activeTab === 'preferences' && (
                <div className="space-y-4">
                    {/* Audio Settings */}
                    <div className="card bg-base-100 p-4 shadow-sm border border-base-300 space-y-3">
                        <h2 className="card-title text-sm flex items-center gap-2">
                            <Volume2 size={18} className="text-primary" />
                            {t('settings.feedbackSettings')}
                        </h2>

                        <div className="form-control">
                            <label className="label cursor-pointer py-1.5">
                                <span className="label-text text-xs font-medium">{t('settings.soundFeedback')}</span>
                                <input
                                    type="checkbox"
                                    className="toggle toggle-primary toggle-sm"
                                    checked={soundEnabled}
                                    onChange={(e) => handleToggleSound(e.target.checked)}
                                />
                            </label>
                        </div>
                    </div>

                    {/* Check-in Behavior */}
                    <div className="card bg-base-100 p-4 shadow-sm border border-base-300 space-y-3">
                        <h2 className="card-title text-sm">{t('settings.checkinBehavior')}</h2>

                        <div className="form-control">
                            <label className="label cursor-pointer py-1.5">
                                <div>
                                    <span className="label-text text-xs font-medium block">{t('settings.autoValidate')}</span>
                                    <span className="label-text-alt text-[11px] text-base-content/60">{t('settings.autoValidateHint')}</span>
                                </div>
                                <input
                                    type="checkbox"
                                    className="toggle toggle-primary toggle-sm"
                                    checked={autoValidate}
                                    onChange={(e) => handleToggleAutoValidate(e.target.checked)}
                                />
                            </label>
                        </div>

                        <div className="form-control w-full pt-2 border-t border-base-200">
                            <label className="label py-1">
                                <span className="label-text text-xs font-medium">{t('settings.participantSort')}</span>
                            </label>
                            <select
                                className="select select-bordered select-sm w-full text-xs"
                                value={sortOrder}
                                onChange={(e) => handleSortChange(e.target.value)}
                            >
                                <option value="name_asc">{t('settings.sortNameAsc')}</option>
                                <option value="name_desc">{t('settings.sortNameDesc')}</option>
                                <option value="date_desc">{t('settings.sortDateDesc')}</option>
                            </select>
                        </div>
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
