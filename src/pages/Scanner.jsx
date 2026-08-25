import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Scanner } from '@yudiel/react-qr-scanner';
import { civiApi, getSettings, savePreferences } from '../services/civi';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, AlertTriangle, Check, ToggleLeft, ToggleRight, Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { useToast } from '../components/Toast';
import {
    findParticipantInCache,
    updateParticipantInCache,
    enqueueOfflineScan,
} from '../services/offlineStorage';
import { syncEngine } from '../services/syncEngine';

const QRScanner = () => {
    const { t } = useTranslation();
    const { addToast } = useToast();
    const { eventId } = useParams();
    const navigate = useNavigate();

    // State
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [scanning, setScanning] = useState(true);
    const scanCooldownRef = useRef(false);
    const scanCooldownTimerRef = useRef(null);
    const [autoValidate, setAutoValidate] = useState(() => getSettings().autoValidate);
    const [scannedParticipant, setScannedParticipant] = useState(null);
    const [paymentsActive, setPaymentsActive] = useState(false);
    const [checkoutEnabled, setCheckoutEnabled] = useState(false);
    const [syncState, setSyncState] = useState({ isOnline: true, isSyncing: false, pendingCount: 0 });

    const openCheckoutForParticipant = (participant) => {
        if (!participant?.contact_id || !participant?.id) {
            return;
        }
        navigate(`/event/${eventId}/add/${participant.contact_id}/checkout?participantId=${participant.id}`);
    };

    useEffect(() => {
        // 1. Abonnement à l'état de synchronisation
        const unsubscribe = syncEngine.subscribe(setSyncState);

        // 2. Préchargement en tâche de fond des participants de l'événement dans IndexedDB
        syncEngine.preloadEventSnapshot(eventId);

        const checkStatus = async () => {
            try {
                const eventData = await civiApi('Event', 'get', {
                    select: ["end_date"],
                    where: [["id", "=", eventId]]
                });
                const event = eventData.values ? (Array.isArray(eventData.values) ? eventData.values[0] : Object.values(eventData.values)[0]) : null;

                if (event?.civiscan_is_closed) {
                    addToast(t('participantList.eventClosed'), 'warning');
                    navigate(`/event/${eventId}`);
                    return;
                }

                if ((event?.civiscan_access_state || 'open') !== 'open') {
                    addToast(t('settings.accessReadOnly'), 'warning');
                    navigate(`/event/${eventId}`);
                }
            } catch (e) {
                console.error(e);
            }
        };
        checkStatus();

        civiApi('CiviScanCheckout', 'getEventPricing', { eventId })
            .then((response) => {
                const pricing = response.values || response;
                const nextPaymentsActive = pricing?.event?.isMonetary === true && pricing?.event?.paymentsEnabled === true;
                setPaymentsActive(nextPaymentsActive);
                setCheckoutEnabled(nextPaymentsActive || (pricing?.priceSet?.fields?.length || 0) > 0);
            })
            .catch((fetchError) => {
                console.error(fetchError);
                setPaymentsActive(false);
                setCheckoutEnabled(false);
            });

        return () => {
            unsubscribe();
            if (scanCooldownTimerRef.current) {
                clearTimeout(scanCooldownTimerRef.current);
            }
        };
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
        setLoading(true);
        try {
            if (participant.unregistered && participant.contact_id) {
                // Register & check in donor pass on the fly
                await civiApi('Participant', 'create', {
                    values: {
                        contact_id: participant.contact_id,
                        event_id: Number(eventId),
                        status_id: 2
                    }
                });
            } else {
                // Standard check-in update (APIv4)
                await civiApi('Participant', 'update', {
                    values: { status_id: 2 },
                    where: [["id", "=", participant.id]]
                });
            }

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
        } finally {
            setLoading(false);
        }
    };

    const handleScan = async (result) => {
        if (!result) return;

        // Prevent duplicate scans for 3 seconds if we are just scanning
        if (scanCooldownRef.current) return;
        scanCooldownRef.current = true;
        if (scanCooldownTimerRef.current) {
            clearTimeout(scanCooldownTimerRef.current);
        }
        scanCooldownTimerRef.current = setTimeout(() => {
            scanCooldownRef.current = false;
            scanCooldownTimerRef.current = null;
        }, 3000);

        setScanning(false); // Pause scanning
        setLoading(true);

        try {
            const rawCode = result[0]?.rawValue;
            if (!rawCode) throw new Error("Invalid code");

            playFeedback('scan');
            const code = String(rawCode).trim();

            let participant = null;

            // 1. Tentative en ligne vers CiviCRM API
            try {
                const data = await civiApi('CiviScanTicket', 'verify', {
                    eventId: Number(eventId),
                    code,
                });
                if (Array.isArray(data?.values)) {
                    participant = data.values[0] || null;
                } else if (data?.values && typeof data.values === 'object' && data.values.id) {
                    participant = data.values;
                }
            } catch (networkErr) {
                console.warn('Scan en ligne échoué, tentative via le cache local...', networkErr);
            }

            // 2. Fallback Hors-Ligne via IndexedDB si pas de réponse réseau
            if (!participant) {
                const cached = await findParticipantInCache(eventId, code);
                if (cached) {
                    participant = {
                        id: cached.participantId,
                        contact_id: cached.contactId,
                        'contact_id.display_name': cached.displayName,
                        status_id: cached.statusId,
                        is_offline: true,
                    };
                }
            }

            if (!participant) {
                playFeedback('error');
                addToast(t('scanner.notFound'), 'error');
                setScanning(true);
                setLoading(false);
                return;
            }

            // Si en ligne, enrichir le récapitulatif des options
            if (!participant.is_offline && participant?.id && participant?.contact_id) {
                try {
                    const checkoutContact = await civiApi('CiviScanCheckout', 'getContact', {
                        eventId,
                        contactId: Number(participant.contact_id),
                        participantId: Number(participant.id),
                    });
                    const foundContact = checkoutContact.values || checkoutContact;
                    participant.civiscan_option_summary =
                        foundContact?.civiscan_checkout_draft?.lineItemSummary
                        || foundContact?.civiscan_checkout_participant?.civiscan_option_summary
                        || participant.civiscan_option_summary
                        || [];
                    participant.civiscan_checkout = {
                        canResume: Boolean(foundContact?.civiscan_checkout_draft?.contribution),
                        requiresCheckout: Boolean(
                            foundContact?.civiscan_checkout_draft?.contribution?.paymentProcessorId
                            && foundContact?.civiscan_checkout_draft?.contribution?.statusId !== 1
                        ),
                    };
                } catch (summaryError) {
                    console.warn('Unable to load participant option summary', summaryError);
                }
            }

            setLoading(false);

            if (participant.status_id === 2) {
                // Already checked in
                playFeedback('error');
                if (autoValidate) {
                    addToast(t('scanner.alreadyCheckedIn'), 'warning');
                    setTimeout(resetScanner, 1500);
                } else {
                    setScannedParticipant(participant);
                }
            } else if (participant.is_offline) {
                // Pointage instantané hors-ligne (0 ms)
                await updateParticipantInCache(eventId, participant.id, 2);
                await enqueueOfflineScan({
                    eventId: Number(eventId),
                    participantId: Number(participant.id),
                    contactId: Number(participant.contact_id),
                    scannedAt: new Date().toISOString(),
                    action: 'checkin',
                });
                playFeedback('success');
                addToast(`✅ ${participant['contact_id.display_name']} validé hors-ligne`, 'success');
                if (autoValidate) {
                    setTimeout(resetScanner, 1200);
                } else {
                    participant.status_id = 2;
                    setScannedParticipant(participant);
                }
            } else {
                // En ligne
                if (autoValidate && !participant.unregistered && !participant?.civiscan_checkout?.requiresCheckout) {
                    await handleCheckIn(participant);
                } else {
                    setScannedParticipant(participant);
                }
            }

        } catch (err) {
            console.error(err);
            playFeedback('error');
            addToast(err?.message ? t(err.message, err.message) : t('scanner.error'), 'error');
            resetScanner();
        } finally {
            setLoading(false);
        }
    };

    const confirmCheckIn = async () => {
        if (!scannedParticipant) return;
        await handleCheckIn(scannedParticipant);
    };

    const resetScanner = () => {
        setScannedParticipant(null);
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
                <div className="flex items-center gap-2 font-bold text-lg drop-shadow-md">
                    <span>{t('scanner.title')}</span>
                    {syncState.pendingCount > 0 ? (
                        <span className="badge badge-warning badge-sm gap-1 text-[11px] font-semibold">
                            <WifiOff size={12} />
                            {syncState.pendingCount} en attente
                        </span>
                    ) : syncState.isSyncing ? (
                        <span className="badge badge-info badge-sm gap-1 text-[11px] font-semibold animate-pulse">
                            <RefreshCw size={12} className="animate-spin" />
                            Synchro...
                        </span>
                    ) : (
                        <span className="badge badge-success badge-sm gap-1 text-[11px] font-semibold text-white">
                            <Wifi size={12} />
                            En ligne
                        </span>
                    )}
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

                            {(scannedParticipant.civiscan_option_summary || []).length > 0 && (
                                <div className="mb-6 flex flex-wrap justify-center gap-2">
                                    {scannedParticipant.civiscan_option_summary.map((option) => (
                                        <span key={option} className="badge badge-outline badge-sm">
                                            {option}
                                        </span>
                                    ))}
                                </div>
                            )}

                            {scannedParticipant.status_id === 2 ? (
                                <div className="alert alert-warning mb-6">
                                    <AlertTriangle size={20} />
                                    <span>{t('scanner.alreadyCheckedIn')}</span>
                                </div>
                            ) : scannedParticipant.unregistered ? (
                                <div className="alert alert-info mb-6">
                                    <Check size={20} />
                                    <span>{t('scanner.donorPassDetected')}</span>
                                </div>
                            ) : scannedParticipant?.civiscan_checkout?.requiresCheckout ? (
                                <div className="alert alert-warning mb-6">
                                    <AlertTriangle size={20} />
                                    <span>{t('scanner.paymentRequired')}</span>
                                </div>
                            ) : (
                                <p className="text-base-content/70 mb-8">{t('scanner.confirmCheckIn')}</p>
                            )}
                        </div>

                        <div className="flex flex-col gap-3">
                            {/* Primary check-in or register action */}
                            {scannedParticipant.status_id !== 2 && (
                                <button
                                    className="btn btn-primary btn-lg w-full"
                                    onClick={() => {
                                        if (scannedParticipant.unregistered && paymentsActive) {
                                            openCheckoutForParticipant({
                                                id: null,
                                                contact_id: scannedParticipant.contact_id,
                                                'contact_id.display_name': scannedParticipant['contact_id.display_name']
                                            });
                                        } else {
                                            confirmCheckIn();
                                        }
                                    }}
                                    disabled={loading}
                                >
                                    {scannedParticipant.unregistered
                                        ? (paymentsActive ? t('participantList.openCheckout') : t('scanner.registerAndCheckIn'))
                                        : t('common.confirm')}
                                </button>
                            )}

                            {/* Secondary optional checkout action */}
                            {checkoutEnabled && scannedParticipant.id > 0 && scannedParticipant.status_id !== 2 && scannedParticipant?.civiscan_checkout?.canResume && (
                                <button
                                    className="btn btn-outline btn-secondary w-full"
                                    onClick={() => openCheckoutForParticipant(scannedParticipant)}
                                    disabled={loading}
                                >
                                    {t('participantList.openCheckout')}
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
                            onChange={(e) => {
                                const checked = e.target.checked;
                                setAutoValidate(checked);
                                savePreferences({ autoValidate: checked });
                            }}
                        />
                        {/* sun icon */}
                        <ToggleRight className="swap-on w-8 h-8" />
                        {/* moon icon */}
                        <ToggleLeft className="swap-off w-8 h-8 text-white/50" />
                    </label>
                    <span
                        className="text-sm font-medium select-none cursor-pointer"
                        onClick={() => {
                            const next = !autoValidate;
                            setAutoValidate(next);
                            savePreferences({ autoValidate: next });
                        }}
                    >
                        {t('scanner.autoValidate')}
                    </span>
                </div>
            </div>
        </div>
    );
};

export default QRScanner;
