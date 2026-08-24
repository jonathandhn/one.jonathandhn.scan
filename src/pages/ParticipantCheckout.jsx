import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CreditCard } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { civiApi } from '../services/civi';
import { useToast } from '../components/Toast';
import { nativeBridge } from '../services/nativeBridge';

const buildInitialPriceSelections = (priceSet) => {
    if (!priceSet?.fields) {
        return {};
    }

    const selections = {};
    for (const field of priceSet.fields) {
        const fieldKey = `price_${field.id}`;
        const defaultOption = (field.options || []).find((option) => option.isDefault);

        if (field.htmlType === 'CheckBox' || field.htmlType === 'Multi-Select') {
            const values = {};
            if (defaultOption) {
                values[defaultOption.id] = 1;
            }
            selections[fieldKey] = values;
            continue;
        }

        if (defaultOption) {
            selections[fieldKey] = defaultOption.id;
            continue;
        }

        if (field.isRequired && field.options?.length) {
            selections[fieldKey] = field.options[0].id;
        }
    }

    return selections;
};

const formatCurrency = (amount, currency) => {
    try {
        return new Intl.NumberFormat('fr-FR', {
            style: 'currency',
            currency: currency || 'EUR',
        }).format(Number(amount || 0));
    } catch {
        return `${Number(amount || 0).toFixed(2)} ${currency || 'EUR'}`;
    }
};

const isReaderReady = (reader) => (
    String(reader?.deviceStatus || '').toUpperCase() === 'ONLINE'
    && String(reader?.deviceState || '').toUpperCase() === 'IDLE'
);

const ParticipantCheckout = () => {
    const { t } = useTranslation();
    const { addToast } = useToast();
    const { eventId, contactId } = useParams();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [checkoutConfig, setCheckoutConfig] = useState(null);
    const [contact, setContact] = useState(null);
    const [priceSelections, setPriceSelections] = useState({});
    const [selectedPaymentMode, setSelectedPaymentMode] = useState('cash');
    const [selectedReaderId, setSelectedReaderId] = useState('');
    const [donationAmount, setDonationAmount] = useState('');
    const [cashReceivedAmount, setCashReceivedAmount] = useState('');
    const [donationFromChangeEnabled, setDonationFromChangeEnabled] = useState(false);
    const [donationFromChangeAmount, setDonationFromChangeAmount] = useState('');
    const [cartPreview, setCartPreview] = useState(null);

    const participantId = searchParams.get('participantId');
    const paymentsActive = checkoutConfig?.event?.isMonetary === true && checkoutConfig?.event?.paymentsEnabled === true;
    const isMobileApp = nativeBridge.isNative();
    const paymentModes = useMemo(() => {
        const modes = { ...(checkoutConfig?.paymentModes || {}) };
        if (isMobileApp) {
            modes.stripe_tap_to_pay = {
                enabled: true,
                label: '📱 Tap to Pay (Sans contact mobile)',
                kind: 'stripe_tap_to_pay',
            };
        } else {
            delete modes.stripe_tap_to_pay;
        }
        return Object.entries(modes);
    }, [checkoutConfig, isMobileApp]);
    const selectedPaymentModeConfig = (checkoutConfig?.paymentModes?.[selectedPaymentMode]) || (selectedPaymentMode === 'stripe_tap_to_pay' ? { enabled: true, label: '📱 Tap to Pay (Sans contact mobile)', kind: 'stripe_tap_to_pay' } : null);
    const readers = useMemo(
        () => checkoutConfig?.sumup?.readers || [],
        [checkoutConfig]
    );
    const selectedReader = useMemo(
        () => readers.find((reader) => String(reader.id) === String(selectedReaderId)) || null,
        [readers, selectedReaderId]
    );
    const selectedReaderReady = selectedPaymentModeConfig?.kind !== 'sumup_solo' || isReaderReady(selectedReader);
    const selectedModeSupportsCashChange = Boolean(selectedPaymentModeConfig?.supportsCashChange);
    const cartDueAmount = Number(cartPreview?.amount || 0);
    const cashReceived = Number(cashReceivedAmount || 0);
    const availableChange = Math.max(0, cashReceived - cartDueAmount);
    const donationFromChangeValue = donationFromChangeEnabled
        ? Math.min(availableChange, Math.max(0, Number(donationFromChangeAmount || 0)))
        : 0;
    const changeToReturn = Math.max(0, availableChange - donationFromChangeValue);

    // Warm-up silencieux de Stripe Tap to Pay dès l'arrivée sur l'écran d'encaissement
    useEffect(() => {
        if (!isMobileApp) return;
        Promise.all([
            civiApi('CiviScanStripeTerminal', 'getConnectionToken').catch(() => null),
            civiApi('CiviScanStripeTerminal', 'getLocation').catch(() => null),
        ]).then(([tokenRes, locRes]) => {
            const token = tokenRes?.values?.secret || tokenRes?.secret;
            const loc = locRes?.values?.locationId || locRes?.locationId;
            if (token) {
                nativeBridge.initTapToPay({ connectionToken: token, locationId: loc }).catch(() => {});
            }
        }).catch(() => {});
    }, [isMobileApp]);
    const finalTotalDonation = Number(donationAmount || 0) + donationFromChangeValue;

    useEffect(() => {
        let cancelled = false;

        const loadData = async () => {
            setLoading(true);
            try {
                const [pricingResponse, contactResponse] = await Promise.all([
                    civiApi('CiviScanCheckout', 'getEventPricing', { eventId }),
                    civiApi('CiviScanCheckout', 'getContact', {
                        eventId,
                        contactId: Number(contactId),
                        participantId: participantId ? Number(participantId) : null,
                    }),
                ]);

                if (cancelled) {
                    return;
                }

                const pricing = pricingResponse.values || pricingResponse;
                const foundContact = contactResponse.values || contactResponse;
                if (!foundContact) {
                    throw new Error('Contact not found');
                }

                setCheckoutConfig(pricing);
                setContact(foundContact);

                // Pré-initialisation en arrière-plan du lecteur Tap to Pay NFC
                if (nativeBridge.isNative()) {
                    Promise.all([
                        civiApi('CiviScanStripeTerminal', 'getConnectionToken'),
                        civiApi('CiviScanStripeTerminal', 'getLocation'),
                    ]).then(([tokenRes, locRes]) => {
                        const tokenData = tokenRes?.values || tokenRes;
                        const locData = locRes?.values || locRes;
                        if (tokenData?.secret) {
                            nativeBridge.initTapToPay({
                                connectionToken: tokenData.secret,
                                locationId: locData?.locationId,
                            });
                        }
                    }).catch((e) => console.warn('Pré-init Tap to Pay :', e));
                }

                setPriceSelections(
                    foundContact?.civiscan_checkout_draft?.priceSelections
                    || buildInitialPriceSelections(pricing?.priceSet)
                );
                setDonationAmount(
                    foundContact?.civiscan_checkout_draft?.donationAmount
                        ? String(foundContact.civiscan_checkout_draft.donationAmount)
                        : ''
                );

                const pricingReaders = pricing?.sumup?.readers || [];
                const allModes = Object.entries(pricing?.paymentModes || {});
                const preferredMode = (allModes.find(([mode, config]) => mode === 'sumup_solo' && config?.enabled)?.[0])
                    || (allModes.find(([, config]) => config?.enabled)?.[0])
                    || allModes[0]?.[0]
                    || '';
                setSelectedPaymentMode(preferredMode);

                const defaultReader = pricingReaders.find((reader) => isReaderReady(reader)) || pricingReaders[0] || null;
                setSelectedReaderId(defaultReader?.id ? String(defaultReader.id) : '');
            } catch (error) {
                console.error(error);
                addToast(t('addParticipant.checkoutLoadError'), 'error');
                navigate(`/event/${eventId}/add`);
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        loadData();

        return () => {
            cancelled = true;
        };
    }, [eventId, contactId, participantId, navigate, addToast, t]);

    useEffect(() => {
        if (!checkoutConfig) {
            return;
        }

        let cancelled = false;
        const loadPreview = async () => {
            try {
                const response = await civiApi('CiviScanCheckout', 'previewCart', {
                    eventId,
                    cart: {
                        priceSelections,
                        donationAmount: Number(donationAmount || 0),
                        currency: checkoutConfig?.event?.currency || 'EUR',
                    },
                });
                if (!cancelled) {
                    setCartPreview(response.values || response);
                }
            } catch (error) {
                if (!cancelled) {
                    console.error(error);
                    setCartPreview(null);
                }
            }
        };

        loadPreview();

        return () => {
            cancelled = true;
        };
    }, [checkoutConfig, eventId, priceSelections, donationAmount]);

    const updateSingleSelection = (fieldId, optionId) => {
        setPriceSelections((current) => ({
            ...current,
            [`price_${fieldId}`]: Number(optionId),
        }));
    };

    const toggleMultiSelection = (fieldId, optionId, checked) => {
        setPriceSelections((current) => {
            const key = `price_${fieldId}`;
            const nextValues = { ...(current[key] || {}) };
            if (checked) {
                nextValues[optionId] = 1;
            } else {
                delete nextValues[optionId];
            }
            return {
                ...current,
                [key]: nextValues,
            };
        });
    };

    const handleRegister = async () => {
        setSaving(true);
        try {
            let tapToPayResult = null;
            if (selectedPaymentMode === 'stripe_tap_to_pay') {
                if (!nativeBridge.isNative()) {
                    throw new Error('Tap to Pay est disponible uniquement sur l\'application mobile CiviScan.');
                }
                const totalCents = Math.round((cartDueAmount + finalTotalDonation) * 100);
                addToast('Préparation du paiement sans contact via CiviCRM...', 'info');

                const [piResponse, tokenResponse, locResponse] = await Promise.all([
                    civiApi('CiviScanStripeTerminal', 'createPaymentIntent', {
                        amount: totalCents,
                        currency: checkoutConfig?.event?.currency || 'EUR',
                        eventId: Number(eventId),
                        contactId: Number(contactId),
                        participantId: participantId ? Number(participantId) : 0,
                    }),
                    civiApi('CiviScanStripeTerminal', 'getConnectionToken'),
                    civiApi('CiviScanStripeTerminal', 'getLocation'),
                ]);

                const piData = piResponse?.values || piResponse;
                const tokenData = tokenResponse?.values || tokenResponse;
                const locData = locResponse?.values || locResponse;

                if (!piData?.clientSecret) {
                    throw new Error('Impossible d\'initialiser le paiement Stripe auprès de CiviCRM.');
                }

                addToast('Approchez la carte bancaire au dos du smartphone...', 'info');
                tapToPayResult = await nativeBridge.collectTapToPay({
                    clientSecret: piData.clientSecret,
                    connectionToken: tokenData?.secret || '',
                    locationId: locData?.locationId || '',
                    amountInCents: totalCents,
                });

                if (!tapToPayResult?.success) {
                    throw new Error('Paiement sans contact Tap to Pay annulé ou refusé.');
                }
                await nativeBridge.vibrate('success');
            }

            if (selectedPaymentModeConfig?.kind === 'sumup_solo' && !selectedReaderReady) {
                throw new Error('Le lecteur SumUp sélectionné n’est pas prêt. Choisis un lecteur ONLINE / IDLE.');
            }

            await civiApi('CiviScanCheckout', 'registerWithCart', {
                eventId: Number(eventId),
                participantId: participantId ? Number(participantId) : null,
                contact: {
                    mode: 'existing',
                    contactId: Number(contactId),
                },
                cart: {
                    priceSelections,
                    donationAmount: finalTotalDonation,
                    currency: checkoutConfig?.event?.currency || 'EUR',
                },
                payment: {
                    mode: paymentsActive ? selectedPaymentMode : '',
                    stripeContext: tapToPayResult ? { paymentIntentId: tapToPayResult.id } : null,
                    readerContext: selectedPaymentModeConfig?.kind === 'sumup_solo' && selectedReaderId
                        ? { readerId: Number(selectedReaderId) }
                        : null,
                    cashContext: selectedModeSupportsCashChange
                        ? {
                            receivedAmount: cashReceived,
                            donationFromChange: donationFromChangeValue,
                        }
                        : null,
                },
            });

            addToast(t('addParticipant.added'), 'success');
            navigate(`/event/${eventId}`);
        } catch (error) {
            console.error(error);
            addToast(t('addParticipant.errorRegister', { error: t(error.message, error.message) }), 'error');
        } finally {
            setSaving(false);
        }
    };

    const toggleDonationFromChange = (enabled) => {
        setDonationFromChangeEnabled(enabled);
        if (enabled) {
            setDonationFromChangeAmount(availableChange > 0 ? String(availableChange) : '');
        } else {
            setDonationFromChangeAmount('');
        }
    };

    useEffect(() => {
        if (selectedModeSupportsCashChange) {
            return;
        }
        setCashReceivedAmount('');
        setDonationFromChangeEnabled(false);
        setDonationFromChangeAmount('');
    }, [selectedModeSupportsCashChange]);

    const renderPriceField = (field) => {
        const fieldKey = `price_${field.id}`;
        const currentValue = priceSelections[fieldKey];

        if (field.htmlType === 'CheckBox' || field.htmlType === 'Multi-Select') {
            return (
                <div className="flex flex-col gap-2">
                    {field.options.map((option) => (
                        <label key={option.id} className="label cursor-pointer justify-start gap-3 rounded-lg border border-base-200 px-3 py-2">
                            <input
                                type="checkbox"
                                className="checkbox checkbox-sm"
                                checked={Boolean(currentValue?.[option.id])}
                                onChange={(e) => toggleMultiSelection(field.id, option.id, e.target.checked)}
                            />
                            <span className="flex-1">
                                <span className="block font-medium">{option.label}</span>
                                <span className="block text-xs opacity-70">{formatCurrency(option.amount, checkoutConfig?.event?.currency)}</span>
                            </span>
                        </label>
                    ))}
                </div>
            );
        }

        return (
            <div className="flex flex-col gap-2">
                {field.options.map((option) => (
                    <label key={option.id} className="label cursor-pointer justify-start gap-3 rounded-lg border border-base-200 px-3 py-2">
                        <input
                            type="radio"
                            className="radio radio-sm"
                            checked={Number(currentValue) === Number(option.id)}
                            name={`price-field-${field.id}`}
                            onChange={() => updateSingleSelection(field.id, option.id)}
                        />
                        <span className="flex-1">
                            <span className="block font-medium">{option.label}</span>
                            <span className="block text-xs opacity-70">{formatCurrency(option.amount, checkoutConfig?.event?.currency)}</span>
                        </span>
                    </label>
                ))}
            </div>
        );
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-10">
                <span className="loading loading-spinner loading-lg text-primary"></span>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={() => {
                        if (participantId) {
                            navigate(`/event/${eventId}`);
                        } else {
                            navigate(`/event/${eventId}/add`);
                        }
                    }}
                    className="btn btn-circle btn-ghost btn-sm"
                >
                    <ArrowLeft size={24} />
                </button>
                <div>
                    <h2 className="text-xl font-bold text-base-content">{t('addParticipant.checkoutTitle')}</h2>
                    <p className="text-sm opacity-70">{contact?.display_name || ''}</p>
                </div>
            </div>

            <div className="card bg-base-100 shadow-sm border border-base-200">
                <div className="card-body gap-4">
                    {checkoutConfig?.priceSet?.fields?.length > 0 && (
                        <div className="flex flex-col gap-4">
                            {checkoutConfig.priceSet.fields.map((field) => (
                                <div key={field.id} className="flex flex-col gap-2">
                                    <div>
                                        <div className="font-semibold">{field.label}</div>
                                        {field.helpPost && <div className="text-xs opacity-70">{field.helpPost}</div>}
                                    </div>
                                    {renderPriceField(field)}
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="form-control w-full">
                        <label className="label">
                            <span className="label-text font-medium">
                                {t('addParticipant.donationAmount')} <span className="text-xs font-normal opacity-60">({t('common.optional', 'optionnel')})</span>
                            </span>
                        </label>
                        <input
                            type="number"
                            step="0.01"
                            min="0"
                            className="input input-bordered w-full"
                            value={donationAmount}
                            onChange={(e) => setDonationAmount(e.target.value)}
                            placeholder="0.00"
                        />
                    </div>

                    {((paymentsActive && cartDueAmount > 0) || finalTotalDonation > 0) && paymentModes.length > 0 && (
                        <div className="flex flex-col gap-2">
                            <div className="font-semibold">{t('addParticipant.paymentMethod')}</div>
                            <div className="grid grid-cols-1 gap-2">
                                {paymentModes.map(([mode, config]) => {
                                    const disabled = !config?.enabled;
                                    return (
                                        <label
                                            key={mode}
                                            className={`label justify-start gap-3 rounded-lg border px-3 py-2 ${disabled ? 'cursor-not-allowed border-base-200 opacity-50' : 'cursor-pointer border-base-200'}`}
                                        >
                                            <input
                                                type="radio"
                                                className="radio radio-sm"
                                                checked={selectedPaymentMode === mode}
                                                name="payment-mode"
                                                disabled={disabled}
                                                onChange={() => setSelectedPaymentMode(mode)}
                                            />
                                            <span>{checkoutConfig?.paymentModes?.[mode]?.label || mode}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {selectedPaymentMode === 'stripe_tap_to_pay' && (
                        <div className="rounded-lg border border-emerald-500/30 bg-emerald-50/50 p-3 text-xs dark:bg-emerald-950/20">
                            <div className="flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-300">
                                <CreditCard size={16} />
                                <span>Paiement sans contact Tap to Pay</span>
                            </div>
                            <p className="mt-1 text-slate-600 dark:text-slate-300">
                                Vous pourrez approcher la carte bancaire ou le smartphone (Apple Pay / Google Pay) au dos de cet appareil dès que vous cliquerez sur le bouton ci-dessous.
                            </p>
                        </div>
                    )}

                    {selectedPaymentModeConfig?.kind === 'sumup_solo' && (checkoutConfig?.sumup?.readers?.length || 0) > 0 && (
                        <div className="form-control w-full">
                            <label className="label">
                                <span className="label-text">{t('addParticipant.sumupReader')}</span>
                            </label>
                            <select
                                className="select select-bordered w-full"
                                value={selectedReaderId}
                                onChange={(e) => setSelectedReaderId(e.target.value)}
                            >
                                {checkoutConfig.sumup.readers.map((reader) => (
                                    <option key={reader.id} value={reader.id}>
                                        {reader.siteCode} - {reader.canonicalName} ({reader.deviceStatus || '?'} / {reader.deviceState || '?'})
                                    </option>
                                ))}
                            </select>
                            {selectedReader && !selectedReaderReady && (
                                <div className="mt-2 text-sm text-warning">
                                    Lecteur non prêt: {selectedReader.deviceStatus || '?'} / {selectedReader.deviceState || '?'}
                                </div>
                            )}
                        </div>
                    )}

                    {selectedModeSupportsCashChange && (
                        <div className="flex flex-col gap-4">
                            <div className="form-control w-full">
                                <label className="label">
                                    <span className="label-text">{t('addParticipant.cashReceived')}</span>
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    className="input input-bordered w-full"
                                    value={cashReceivedAmount}
                                    onChange={(e) => setCashReceivedAmount(e.target.value)}
                                    placeholder="0.00"
                                />
                            </div>

                            {availableChange > 0 && (
                                <div className="rounded-lg border border-base-200 p-3">
                                    <label className="label cursor-pointer justify-start gap-3 p-0">
                                        <input
                                            type="checkbox"
                                            className="checkbox checkbox-sm"
                                            checked={donationFromChangeEnabled}
                                            onChange={(e) => toggleDonationFromChange(e.target.checked)}
                                        />
                                        <span className="font-medium">{t('addParticipant.donateChange')}</span>
                                    </label>
                                    {donationFromChangeEnabled && (
                                        <div className="mt-3">
                                            <label className="label px-0 pb-1 pt-0">
                                                <span className="label-text">{t('addParticipant.changeDonationAmount')}</span>
                                            </label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                max={availableChange}
                                                className="input input-bordered w-full"
                                                value={donationFromChangeAmount}
                                                onChange={(e) => setDonationFromChangeAmount(e.target.value)}
                                                placeholder="0.00"
                                            />
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    <div className="rounded-lg bg-base-200 px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                            <span className="font-medium">{t('addParticipant.amountDue')}</span>
                            <span className="text-lg font-bold">
                                {formatCurrency(cartDueAmount, checkoutConfig?.event?.currency)}
                            </span>
                        </div>
                        {donationFromChangeValue > 0 && (
                            <div className="mt-2 flex items-center justify-between gap-3 text-sm">
                                <span>{t('addParticipant.changeDonationAmount')}</span>
                                <span className="font-semibold">
                                    {formatCurrency(donationFromChangeValue, checkoutConfig?.event?.currency)}
                                </span>
                            </div>
                        )}
                        {selectedModeSupportsCashChange && cashReceived > 0 && (
                            <div className="mt-2 flex items-center justify-between gap-3 text-sm">
                                <span>{t('addParticipant.changeDue')}</span>
                                <span className="font-semibold">
                                    {formatCurrency(changeToReturn, checkoutConfig?.event?.currency)}
                                </span>
                            </div>
                        )}
                    </div>

                    {(() => {
                        const totalToPay = cartDueAmount + finalTotalDonation;
                        const requiresPayment = totalToPay > 0;
                        const isSubmitDisabled = saving
                            || (requiresPayment && !selectedPaymentMode)
                            || (selectedPaymentModeConfig?.kind === 'sumup_solo' && (!selectedReaderId || !selectedReaderReady));

                        return (
                            <button
                                type="button"
                                className="btn btn-primary w-full"
                                disabled={isSubmitDisabled}
                                onClick={handleRegister}
                            >
                                {saving && <span className="loading loading-spinner loading-sm mr-2"></span>}
                                {requiresPayment
                                    ? t('addParticipant.registerAndPay', { amount: formatCurrency(totalToPay, checkoutConfig?.event?.currency) })
                                    : t('addParticipant.register')}
                            </button>
                        );
                    })()}
                </div>
            </div>
        </div>
    );
};

export default ParticipantCheckout;
