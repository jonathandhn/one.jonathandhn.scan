let deferredInstallPrompt = null;
const listeners = new Set();
const standaloneListeners = new Set();

const notify = () => listeners.forEach(listener => listener(deferredInstallPrompt));
const notifyStandalone = () => standaloneListeners.forEach(listener => listener(isStandaloneDisplay()));

export const isStandaloneDisplay = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    notify();
});

window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    notify();
    notifyStandalone();
});

const standaloneMediaQuery = window.matchMedia('(display-mode: standalone)');
const handleStandaloneChange = () => notifyStandalone();
if (typeof standaloneMediaQuery.addEventListener === 'function') {
    standaloneMediaQuery.addEventListener('change', handleStandaloneChange);
} else if (typeof standaloneMediaQuery.addListener === 'function') {
    standaloneMediaQuery.addListener(handleStandaloneChange);
}

export const subscribeInstallPrompt = listener => {
    listeners.add(listener);
    listener(deferredInstallPrompt);
    return () => listeners.delete(listener);
};

export const subscribeStandaloneMode = listener => {
    standaloneListeners.add(listener);
    listener(isStandaloneDisplay());
    return () => standaloneListeners.delete(listener);
};

export const requestPwaInstall = async () => {
    if (!deferredInstallPrompt) return false;
    await deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    notify();
    return choice.outcome === 'accepted';
};
