import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Scanner } from '@yudiel/react-qr-scanner';
import { civiApi, getSettings } from '../services/civi';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Flashlight, AlertTriangle, Check, User, ToggleLeft, ToggleRight } from 'lucide-react';
import { useToast } from '../components/Toast';

const QRScanner = () => {
    const { t } = useTranslation();
    const { addToast } = useToast();
    const { eventId } = useParams();
    const navigate = useNavigate();

    // State
    const [scanResult, setScanResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [scanning, setScanning] = useState(true);
    const [lastScanTime, setLastScanTime] = useState(0);
    const [autoValidate, setAutoValidate] = useState(false);
    const [scannedParticipant, setScannedParticipant] = useState(null);

    // Initial Read-Only Check
    useEffect(() => {
        const checkStatus = async () => {
            try {
                const eventData = await civiApi('Event', 'get', {
                    select: ["end_date"],
                    where: [["id", "=", eventId]]
                });
                const event = eventData.values ? (Array.isArray(eventData.values) ? eventData.values[0] : Object.values(eventData.values)[0]) : null;

                if (event && event.end_date) {
                    const endDate = new Date(event.end_date);
                    const now = new Date();
                    const { gracePeriod } = getSettings();

                    if (now > new Date(endDate.getTime() + gracePeriod * 60000)) {
                        addToast(t('settings.accessReadOnly'), 'warning');
                        navigate(`/event/${eventId}`);
                    }
                }
            } catch (e) {
                console.error(e);
            }
        };
        checkStatus();
    }, [eventId, navigate, t, addToast]);

    const playFeedback = (type) => {
        if (!window.navigator || !window.navigator.vibrate) return;

        switch (type) {
            case 'success':
                window.navigator.vibrate([100, 50, 100]);
                break;
            case 'error':
                window.navigator.vibrate([200, 100, 200]);
                break;
            case 'scan':
                window.navigator.vibrate(50);
                break;
        }
    };

    const handleCheckIn = async (participant) => {
        try {
            // Check-in (APIv4)
            await civiApi('Participant', 'update', {
                values: { status_id: 2 },
                where: [["id", "=", participant.id]]
            });

            playFeedback('success');
            addToast(t('scanner.success', { name: participant['contact_id.display_name'] }), 'success');

            // Auto-reset
            setTimeout(() => {
                resetScanner();
            }, 1000);

        } catch (err) {
            console.error(err);
            playFeedback('error');
            addToast(t('scanner.error'), 'error');
            resetScanner();
        }
    };

    const handleScan = async (result) => {
        if (!result) return;

        // Prevent duplicate scans for 3 seconds if we are just scanning
        const now = Date.now();
        if (now - lastScanTime < 3000) return;
        setLastScanTime(now);

        setScanResult(result);
        setScanning(false); // Pause scanning
        setLoading(true);

        try {
            const code = result[0]?.rawValue;
            if (!code) throw new Error("Invalid code");

            playFeedback('scan');

            // Extract participant ID from QR Code
            let participantId = code;

            // Search for participant (APIv4)
            const params = {
                select: ["id", "status_id", "contact_id.display_name"],
                where: [["id", "=", participantId], ["event_id", "=", eventId]]
            };

            const data = await civiApi('Participant', 'get', params);
            const values = data.values || [];

            if (values.length === 0) {
                playFeedback('error');
                addToast(t('scanner.notFound'), 'error');
                setScanning(true); // Resume
                setLoading(false);
                return;
            }

            const participant = values[0];

            if (participant.status_id === 2) {
                // Already checked in
                playFeedback('error');
                // Show modal for "Already Checked In" with option to scan next
                // But user wants NO POPUP for flow? 
                // Let's use Toast for this too if Autovalidate is ON?
                // Actually, duplicate check-in IS an error/warning that might need attention.
                // Let's show the modal for duplicates always, to be safe?
                // Or just a Toast? "Already Checked In!"
                // If auto-validate is ON, we should probably just notify and continue.

                if (autoValidate) {
                    addToast(t('scanner.alreadyCheckedIn'), 'warning');
                    // Optionally show a quick overlay?
                    // Let's stick to Toast for speed.
                    setTimeout(resetScanner, 1500);
                } else {
                    setScannedParticipant(participant); // Show modal
                }
            } else {
                // Determine next step based on AutoValidate
                if (autoValidate) {
                    await handleCheckIn(participant);
                } else {
                    setScannedParticipant(participant); // Show detailed Confirmation Modal
                }
            }

        } catch (err) {
            console.error(err);
            playFeedback('error');
            addToast(t('scanner.error'), 'error');
            setScanning(true); // Resume
        } finally {
            setLoading(false);
        }
    };

    const confirmCheckIn = async () => {
        if (!scannedParticipant) return;
        setLoading(true);
        await handleCheckIn(scannedParticipant);
    };

    const resetScanner = () => {
        setScannedParticipant(null);
        setScanResult(null);
        setScanning(true);
        setLoading(false);
        setError(null);
    };

    const handleError = (error) => {
        // Suppress common starting errors or permission toggles
        if (error?.name === 'NotAllowedError') {
            setError(t('scanner.cameraPermissionError'));
        }
        console.warn(error);
    };

    return (
        <div className="h-[100dvh] w-full bg-black relative flex flex-col">
            {/* Header Overlay */}
            <div className="absolute top-0 left-0 right-0 p-4 z-10 flex items-center justify-between text-white bg-gradient-to-b from-black/70 to-transparent">
                <button
                    onClick={() => navigate(`/event/${eventId}`)}
                    className="btn btn-circle btn-ghost text-white"
                >
                    <ArrowLeft size={32} />
                </button>
                <div className="font-bold text-lg drop-shadow-md">
                    {t('scanner.title')}
                </div>
                <div className="w-8"></div> {/* Spacer */}
            </div>

            {/* Scanner Viewport */}
            <div className="flex-1 relative overflow-hidden">
                {scanning && !scannedParticipant && (
                    <Scanner
                        onScan={handleScan}
                        onError={handleError}
                        components={{
                            audio: false,
                            onOff: true,
                            torch: true,
                            zoom: true,
                            finder: true
                        }}
                        styles={{
                            container: { height: '100%', width: '100%' },
                            video: { objectFit: 'cover', height: '100%' },
                            finderBorder: 2
                        }}
                    />
                )}

                {/* Loading / Processing Overlay */}
                {loading && (
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center z-20 text-white animate-in fade-in">
                        <span className="loading loading-spinner loading-lg mb-4 text-primary"></span>
                        <p className="font-medium">{t('scanner.processing')}</p>
                    </div>
                )}

                {/* Confirmation Modal / Result Overlay */}
                {scannedParticipant && (
                    <div className="absolute inset-0 bg-base-100 z-30 flex flex-col p-6 animate-in fade-in slide-in-from-bottom-10">
                        <div className="flex-1 flex flex-col items-center justify-center text-center">
                            <div className={`w-24 h-24 rounded-full flex items-center justify-center mb-6 ${scannedParticipant.status_id === 2 ? 'bg-warning/20 text-warning' : 'bg-primary/20 text-primary'}`}>
                                {scannedParticipant.status_id === 2 ? <AlertTriangle size={48} /> : <Check size={48} />}
                            </div>

                            <h2 className="text-2xl font-bold mb-2">{scannedParticipant['contact_id.display_name']}</h2>

                            {scannedParticipant.status_id === 2 ? (
                                <div className="alert alert-warning mb-6">
                                    <AlertTriangle size={20} />
                                    <span>{t('scanner.alreadyCheckedIn')}</span>
                                </div>
                            ) : (
                                <p className="text-base-content/70 mb-8">{t('scanner.confirmCheckIn')}</p>
                            )}
                        </div>

                        <div className="flex flex-col gap-3">
                            {scannedParticipant.status_id !== 2 && (
                                <button
                                    className="btn btn-primary btn-lg w-full"
                                    onClick={confirmCheckIn}
                                    disabled={loading}
                                >
                                    {t('common.confirm')}
                                </button>
                            )}

                            <button
                                className="btn btn-outline w-full"
                                onClick={resetScanner}
                            >
                                {scannedParticipant.status_id === 2 ? t('scanner.scanNext') : t('common.cancel')}
                            </button>
                        </div>
                    </div>
                )}

                {/* Error State */}
                {error && (
                    <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-20 text-white p-8 text-center">
                        <AlertTriangle size={48} className="text-error mb-4" />
                        <p className="text-lg">{error}</p>
                        <button
                            className="btn btn-outline btn-white mt-8"
                            onClick={() => window.location.reload()}
                        >
                            {t('scanner.tryAgain')}
                        </button>
                    </div>
                )}
            </div>

            {/* Bottom Controls / Auto Validate Toggle */}
            <div className="absolute bottom-8 left-0 right-0 flex justify-center z-10">
                <div className="bg-black/60 backdrop-blur-md px-6 py-3 rounded-full flex items-center gap-3 text-white border border-white/10 shadow-lg">
                    <label className="swap swap-rotate text-primary">
                        <input
                            type="checkbox"
                            checked={autoValidate}
                            onChange={(e) => setAutoValidate(e.target.checked)}
                        />
                        {/* sun icon */}
                        <ToggleRight className="swap-on w-8 h-8" />
                        {/* moon icon */}
                        <ToggleLeft className="swap-off w-8 h-8 text-white/50" />
                    </label>
                    <span className="text-sm font-medium select-none" onClick={() => setAutoValidate(!autoValidate)}>
                        {t('scanner.autoValidate')}
                    </span>
                </div>
            </div>
        </div>
    );
};

export default QRScanner;
