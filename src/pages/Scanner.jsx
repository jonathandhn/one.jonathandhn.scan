import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { civiApi, getSettings } from '../services/civi';
import { ArrowLeft, CheckCircle, XCircle, ScanLine, RefreshCw, Camera, AlertTriangle, CheckSquare, Square } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { playSuccessSound, playErrorSound, playWarningSound, vibrateSuccess, vibrateError, vibrateWarning } from '../services/feedback';

const Scanner = () => {
    const { t } = useTranslation();
    const { eventId } = useParams();
    const navigate = useNavigate();

    // States
    const [scanResult, setScanResult] = useState(null); // For Success screen
    const [scannedParticipant, setScannedParticipant] = useState(null); // For Confirmation screen
    const [warning, setWarning] = useState(null); // For Warning screen
    const [error, setError] = useState(null); // For Error screen
    const [loading, setLoading] = useState(false);
    const [permissionError, setPermissionError] = useState(null);
    const [autoValidate, setAutoValidate] = useState(localStorage.getItem('civiScan_autoValidate') === 'true');

    const scannerRef = useRef(null);
    const html5QrCodeRef = useRef(null);

    useEffect(() => {
        const html5QrCode = new Html5Qrcode("reader");
        html5QrCodeRef.current = html5QrCode;

        const startScanning = async () => {
            try {
                await html5QrCode.start(
                    { facingMode: "environment" },
                    {
                        fps: 10,
                        qrbox: { width: 250, height: 250 },
                        aspectRatio: 1.0
                    },
                    (decodedText) => {
                        html5QrCode.pause();
                        handleScan(decodedText);
                    },
                    () => { } // Ignore frame errors
                );
            } catch (err) {
                console.error("Error starting scanner", err);
                setPermissionError(t('scanner.cameraPermissionError') || "Camera access denied.");
            }
        };

        setTimeout(startScanning, 100);

        return () => {
            if (html5QrCode.isScanning) {
                html5QrCode.stop().then(() => html5QrCode.clear()).catch(console.error);
            } else {
                html5QrCode.clear().catch(console.error);
            }
        };
    }, []);

    const handleScan = async (participantId) => {
        setLoading(true);
        setError(null);
        setWarning(null);
        setScannedParticipant(null);

        try {
            const { apiVersion } = getSettings();
            let getParams = {};

            // 1. Fetch Participant
            if (apiVersion === '4') {
                getParams = {
                    where: [["id", "=", participantId], ["event_id", "=", eventId]],
                    select: ["id", "status_id", "contact_id.display_name", "contact_id.email"],
                    limit: 1
                };
            } else {
                getParams = { id: participantId, event_id: eventId };
            }

            const data = await civiApi('Participant', 'get', getParams);
            const values = data.values || {};
            let parts = Array.isArray(values) ? values : Object.values(values);

            if (parts.length === 0) {
                throw new Error(t('scanner.notFound'));
            }

            let participant = parts[0];
            if (apiVersion === '4') {
                participant = {
                    ...participant,
                    display_name: participant['contact_id.display_name'],
                    email: participant['contact_id.email']
                };
            }

            // 2. Check Status
            // Status 2 usually means "Attended" in CiviCRM standard configuration
            if (String(participant.status_id) === '2') {
                setWarning(participant);
                playWarningSound();
                vibrateWarning();
                setLoading(false);
                return;
            }

            // 3. Handle Validation
            if (autoValidate) {
                await processCheckIn(participant);
            } else {
                setScannedParticipant(participant);
                setLoading(false);
            }

        } catch (err) {
            const msg = err.message || t('scanner.error');
            setError(msg);
            playErrorSound();
            vibrateError();
            setLoading(false);
        }
    };

    const processCheckIn = async (participant) => {
        setLoading(true);
        try {
            const { apiVersion } = getSettings();

            if (apiVersion === '4') {
                await civiApi('Participant', 'update', {
                    where: [["id", "=", participant.id]],
                    values: { status_id: 2 }
                });
            } else {
                await civiApi('Participant', 'create', {
                    id: participant.id,
                    status_id: 2
                });
            }

            setScanResult(participant);
            setScannedParticipant(null); // Clear confirmation screen
            playSuccessSound();
            vibrateSuccess();
        } catch (err) {
            setError(err.message);
            playErrorSound();
            vibrateError();
        } finally {
            setLoading(false);
        }
    };

    const toggleAutoValidate = () => {
        const newValue = !autoValidate;
        setAutoValidate(newValue);
        localStorage.setItem('civiScan_autoValidate', newValue);
    };

    const resetScanner = () => {
        setScanResult(null);
        setError(null);
        setWarning(null);
        setScannedParticipant(null);
        setLoading(false);
        if (html5QrCodeRef.current) {
            html5QrCodeRef.current.resume();
        }
    };

    return (
        <div className="flex flex-col h-[100dvh] bg-black relative overflow-hidden">
            {/* Header Overlay */}
            <div className="absolute top-0 left-0 right-0 z-20 p-4 flex items-center bg-gradient-to-b from-black/70 to-transparent text-white">
                <button onClick={() => navigate(-1)} className="btn btn-circle btn-ghost text-white">
                    <ArrowLeft />
                </button>
                <h1 className="text-xl font-bold ml-2">{t('scanner.title')}</h1>
            </div>

            {/* Scanner Viewport */}
            <div className="flex-grow relative bg-black">
                <div id="reader" className="w-full h-full"></div>

                {/* Scanning Overlay Guide - Only show when scanning and no result/error */}
                {!scanResult && !error && !permissionError && !scannedParticipant && !warning && (
                    <>
                        <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
                            <div className="w-64 h-64 border-2 border-white/50 rounded-lg relative">
                                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary -mt-1 -ml-1"></div>
                                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-primary -mt-1 -mr-1"></div>
                                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-primary -mb-1 -ml-1"></div>
                                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary -mb-1 -mr-1"></div>
                                <ScanLine className="text-white/20 w-full h-full p-12 animate-pulse" />
                            </div>
                        </div>
                        <div className="absolute bottom-24 left-0 right-0 flex flex-col items-center gap-4 z-10 px-4">
                            <p className="bg-black/50 inline-block px-4 py-2 rounded-full backdrop-blur-sm text-white/80 text-sm">
                                Point camera at QR Code
                            </p>

                            <button
                                onClick={toggleAutoValidate}
                                className={`btn btn-sm gap-2 ${autoValidate ? 'btn-primary' : 'btn-neutral bg-black/50 border-white/30'}`}
                            >
                                {autoValidate ? <CheckSquare size={16} /> : <Square size={16} />}
                                {t('scanner.autoValidate')}
                            </button>
                        </div>
                    </>
                )}

                {/* Permission Error */}
                {permissionError && (
                    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center p-8 text-center">
                        <Camera size={64} className="text-white/50 mb-4" />
                        <h3 className="text-xl font-bold text-white mb-2">Camera Access Required</h3>
                        <p className="text-white/70 mb-6">{permissionError}</p>
                        <button onClick={() => window.location.reload()} className="btn btn-primary">
                            Retry
                        </button>
                    </div>
                )}

                {/* Confirmation Overlay */}
                {scannedParticipant && (
                    <div className="absolute inset-0 z-30 bg-base-100/95 text-base-content flex flex-col items-center justify-center p-8 animate-in fade-in zoom-in duration-300">
                        <h2 className="text-2xl font-bold mb-6">{t('scanner.confirmCheckIn')}</h2>

                        <div className="text-center mb-8 p-6 bg-base-200 rounded-box w-full max-w-xs">
                            <p className="text-xl font-bold mb-1">{scannedParticipant.display_name}</p>
                            <p className="text-sm opacity-70">{scannedParticipant.email}</p>
                        </div>

                        <div className="form-control mb-8">
                            <label className="label cursor-pointer justify-start gap-3">
                                <input
                                    type="checkbox"
                                    className="checkbox checkbox-primary"
                                    checked={autoValidate}
                                    onChange={toggleAutoValidate}
                                />
                                <span className="label-text font-medium">{t('scanner.autoValidate')}</span>
                            </label>
                        </div>

                        <div className="flex gap-4 w-full max-w-xs">
                            <button
                                onClick={resetScanner}
                                className="btn btn-outline flex-1"
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                onClick={() => processCheckIn(scannedParticipant)}
                                className="btn btn-primary flex-1"
                            >
                                {t('common.confirm')}
                            </button>
                        </div>
                    </div>
                )}

                {/* Warning Overlay (Already Checked In) */}
                {warning && (
                    <div className="absolute inset-0 z-30 bg-warning/95 text-warning-content flex flex-col items-center justify-center p-8 animate-in fade-in zoom-in duration-300">
                        <div className="bg-white/20 p-6 rounded-full mb-6">
                            <AlertTriangle size={80} className="text-white" />
                        </div>
                        <h2 className="text-3xl font-bold mb-2 text-white">{t('scanner.alreadyCheckedIn')}</h2>
                        <div className="text-center mb-8">
                            <p className="text-2xl font-bold text-white mb-1">{warning.display_name}</p>
                            <p className="text-lg text-white/80">{warning.email}</p>
                        </div>
                        <button
                            onClick={resetScanner}
                            className="btn btn-lg btn-white text-warning border-none shadow-lg w-full max-w-xs gap-2"
                        >
                            <RefreshCw size={20} />
                            {t('scanner.scanNext')}
                        </button>
                    </div>
                )}

                {/* Success Overlay */}
                {scanResult && (
                    <div className="absolute inset-0 z-30 bg-success/95 text-success-content flex flex-col items-center justify-center p-8 animate-in fade-in zoom-in duration-300">
                        <div className="bg-white/20 p-6 rounded-full mb-6">
                            <CheckCircle size={80} className="text-white" />
                        </div>
                        <h2 className="text-3xl font-bold mb-2 text-white">{t('scanner.checkedIn')}</h2>
                        <div className="text-center mb-8">
                            <p className="text-2xl font-bold text-white mb-1">{scanResult.display_name}</p>
                            <p className="text-lg text-white/80">{scanResult.email}</p>
                        </div>
                        <button
                            onClick={resetScanner}
                            className="btn btn-lg btn-white text-success border-none shadow-lg w-full max-w-xs gap-2"
                        >
                            <RefreshCw size={20} />
                            {t('scanner.scanNext')}
                        </button>
                    </div>
                )}

                {/* Error Overlay */}
                {error && (
                    <div className="absolute inset-0 z-30 bg-error/95 text-error-content flex flex-col items-center justify-center p-8 animate-in fade-in zoom-in duration-300">
                        <div className="bg-white/20 p-6 rounded-full mb-6">
                            <XCircle size={80} className="text-white" />
                        </div>
                        <h2 className="text-3xl font-bold mb-2 text-white">{t('scanner.error')}</h2>
                        <p className="text-xl text-white/90 text-center mb-8 max-w-xs break-words">{error}</p>
                        <button
                            onClick={resetScanner}
                            className="btn btn-lg btn-white text-error border-none shadow-lg w-full max-w-xs gap-2"
                        >
                            <RefreshCw size={20} />
                            {t('scanner.tryAgain')}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Scanner;
