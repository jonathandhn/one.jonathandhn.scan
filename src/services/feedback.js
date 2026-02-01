// Simple Audio Context wrapper for beeps
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

export const playSuccessSound = () => {
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // High pitch A5
    oscillator.frequency.exponentialRampToValueAtTime(1760, audioCtx.currentTime + 0.1); // Slide up

    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);

    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.1);
};

export const playErrorSound = () => {
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.type = 'sawtooth'; // Buzzier sound
    oscillator.frequency.setValueAtTime(150, audioCtx.currentTime); // Low pitch
    oscillator.frequency.linearRampToValueAtTime(100, audioCtx.currentTime + 0.3); // Slide down

    gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);

    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.3);
};

export const vibrateSuccess = () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
            navigator.vibrate(200);
        } catch (e) {
            console.error("Vibration failed", e);
        }
    }
};

export const vibrateError = () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
            navigator.vibrate([100, 50, 100]); // Double pulse
        } catch (e) {
            console.error("Vibration failed", e);
        }
    }
};

export const playWarningSound = () => {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
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
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
            navigator.vibrate([200, 100, 200]);
        } catch (e) {
            console.error("Vibration failed", e);
        }
    }
};
export const vibrateClick = () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
            navigator.vibrate(50); // Short tick
        } catch (e) {
            console.error("Vibration failed", e);
        }
    }
};

export const testVibration = () => {
    if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
        try {
            const success = window.navigator.vibrate(200);
            return !!success; // Ensure boolean
        } catch (e) {
            console.error("Vibration failed", e);
            return false;
        }
    }
    return false;
};
