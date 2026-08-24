import { nativeBridge } from './nativeBridge';
import { getSettings } from './civi';

// Simple Audio Context wrapper for beeps
let audioCtx = null;
const getAudioContext = () => {
    if (!audioCtx && typeof window !== 'undefined') {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
            audioCtx = new AudioContextClass();
        }
    }
    return audioCtx;
};

export const playSuccessSound = () => {
    if (!getSettings().soundEnabled) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
        ctx.resume();
    }
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.1);

    gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);

    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.1);
};

export const playErrorSound = () => {
    if (!getSettings().soundEnabled) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
        ctx.resume();
    }
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(150, ctx.currentTime);
    oscillator.frequency.linearRampToValueAtTime(100, ctx.currentTime + 0.3);

    gainNode.gain.setValueAtTime(0.2, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.3);

    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.3);
};

export const vibrateSuccess = () => {
    if (!getSettings().hapticEnabled) return;
    if (nativeBridge.isNative()) {
        nativeBridge.vibrate('success');
        return;
    }
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
            navigator.vibrate(200);
        } catch (e) {
            console.error("Vibration failed", e);
        }
    }
};

export const vibrateError = () => {
    if (!getSettings().hapticEnabled) return;
    if (nativeBridge.isNative()) {
        nativeBridge.vibrate('error');
        return;
    }
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
            navigator.vibrate([100, 50, 100]);
        } catch (e) {
            console.error("Vibration failed", e);
        }
    }
};

export const playWarningSound = () => {
    if (!getSettings().soundEnabled) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
        ctx.resume();
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(400, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(300, ctx.currentTime + 0.3);

    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.3);
};

export const vibrateWarning = () => {
    if (!getSettings().hapticEnabled) return;
    if (nativeBridge.isNative()) {
        nativeBridge.vibrate('warning');
        return;
    }
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
            navigator.vibrate([200, 100, 200]);
        } catch (e) {
            console.error("Vibration failed", e);
        }
    }
};

export const vibrateClick = () => {
    if (!getSettings().hapticEnabled) return;
    if (nativeBridge.isNative()) {
        nativeBridge.vibrate('light');
        return;
    }
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
            navigator.vibrate(50);
        } catch (e) {
            console.error("Vibration failed", e);
        }
    }
};

export const testVibration = async () => {
    if (nativeBridge.isNative()) {
        try {
            await nativeBridge.vibrate('success');
            return true;
        } catch {
            return false;
        }
    }
    if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
        try {
            const success = window.navigator.vibrate(200);
            return !!success;
        } catch (e) {
            console.error("Vibration failed", e);
            return false;
        }
    }
    return false;
};
