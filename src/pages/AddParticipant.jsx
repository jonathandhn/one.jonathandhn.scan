import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { civiApi } from '../services/civi';
import { ArrowLeft, Search, UserPlus, Check, BadgeCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useToast } from '../components/Toast';
import { hasCapability, runtime } from '../runtime';

const AddParticipant = () => {
    const { t } = useTranslation();
    const { addToast } = useToast();
    const { eventId } = useParams();
    const navigate = useNavigate();
    const statusIds = runtime.participantUi.statusIds || { registered: 1, attended: 2 };

    const [activeTab, setActiveTab] = useState(() => hasCapability('searchContacts') ? 'search' : 'create');
    const [query, setQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [actionKey, setActionKey] = useState(null);
    const [canSearchInEvent, setCanSearchInEvent] = useState(() => hasCapability('searchContacts'));
    const [canCreateInEvent, setCanCreateInEvent] = useState(() => hasCapability('createContact'));
    const [checkoutConfig, setCheckoutConfig] = useState(null);

    const [newContact, setNewContact] = useState({
        first_name: '',
        last_name: '',
        email: '',
        phone: ''
    });

    const trimmedQuery = query.trim();
    const canSearch = trimmedQuery.length >= 3;
    const paymentsActive = checkoutConfig?.event?.isMonetary === true && checkoutConfig?.event?.paymentsEnabled === true;
    const requireCheckout = paymentsActive;

    useEffect(() => {
        const checkStatus = async () => {
            try {
                const eventData = await civiApi('Event', 'get', {
                    select: ['end_date'],
                    where: [['id', '=', eventId]]
                });
                const event = eventData.values ? (Array.isArray(eventData.values) ? eventData.values[0] : Object.values(eventData.values)[0]) : null;
                const searchAllowed = hasCapability('searchContacts') && event?.civiscan_can_search_registration !== false;
                const createAllowed = hasCapability('createContact') && event?.civiscan_can_create_registration !== false;
                setCanSearchInEvent(searchAllowed);
                setCanCreateInEvent(createAllowed);
                if (!searchAllowed && !createAllowed) {
                    addToast(t('settings.accessReadOnly'), 'warning');
                    navigate(`/event/${eventId}`);
                    return;
                }

                if (event?.civiscan_is_closed) {
                    addToast(t('participantList.eventClosed'), 'warning');
                    navigate(`/event/${eventId}`);
                    return;
                }

                if ((event?.civiscan_access_state || 'open') !== 'open') {
                    addToast(t('settings.accessReadOnly'), 'warning');
                    navigate(`/event/${eventId}`);
                }
            } catch (error) {
                console.error(error);
            }
        };
        checkStatus();
    }, [eventId, navigate, t, addToast]);

    useEffect(() => {
        if (canSearchInEvent) {
            setActiveTab('search');
            return;
        }
        if (canCreateInEvent) {
            setActiveTab('create');
        }
    }, [canSearchInEvent, canCreateInEvent]);

    useEffect(() => {
        civiApi('CiviScanCheckout', 'getEventPricing', { eventId })
            .then((response) => setCheckoutConfig(response.values || response))
            .catch((error) => console.error(error));
    }, [eventId]);

    const vibrateSuccess = () => {
        if (window.navigator && window.navigator.vibrate) {
            window.navigator.vibrate(200);
        }
    };

    const goToCheckout = (contactId, participantId = null) => {
        const suffix = participantId ? `?participantId=${participantId}` : '';
        navigate(`/event/${eventId}/add/${contactId}/checkout${suffix}`);
    };

    const canOpenParticipantDetails = (contact) => {
        return Boolean(requireCheckout || contact?.civiscan_existing_participant?.civiscan_checkout?.canResume);
    };

    const handleSearch = async (e) => {
        e.preventDefault();
        if (trimmedQuery.length < 3) {
            setSearchResults([]);
            addToast(t('addParticipant.minSearchLength'), 'warning');
            return;
        }
        setLoading(true);
        try {
            const params = {
                select: [
                    'id',
                    'display_name',
                    'email_primary.email',
                    'address_primary.postal_code',
                    'address_primary.city',
                    'phone_primary.phone'
                ],
                eventId,
                where: [['display_name', 'CONTAINS', trimmedQuery]],
                limit: 10
            };
            const data = await civiApi('Contact', 'get', params);
            setSearchResults(data.values || []);
        } catch {
            addToast(t('addParticipant.errorSearch'), 'error');
        } finally {
            setLoading(false);
        }
    };

    const createParticipant = async (contactId, participantStatusId, successMessage) => {
        await civiApi('Participant', 'create', {
            values: {
                contact_id: contactId,
                event_id: eventId,
                status_id: participantStatusId
            }
        });
        vibrateSuccess();
        addToast(successMessage, 'success');
        navigate(`/event/${eventId}`);
    };

    const updateParticipantStatus = async (participantId, participantStatusId, successMessage) => {
        await civiApi('Participant', 'update', {
            where: [['id', '=', participantId]],
            values: {
                status_id: participantStatusId
            }
        });
        vibrateSuccess();
        addToast(successMessage, 'success');
        navigate(`/event/${eventId}`);
    };

    const handleExistingContactAction = async (contact, mode) => {
        const existing = contact.civiscan_existing_participant || null;
        const registeredId = contact.civiscan_registered_status_id || statusIds.registered;
        const attendedId = contact.civiscan_attended_status_id || statusIds.attended;
        const targetStatusId = mode === 'checkin' ? attendedId : registeredId;
        const key = `${contact.id}:${mode}`;

        setActionKey(key);
        try {
            if (requireCheckout) {
                goToCheckout(contact.id, existing?.id || null);
                return;
            }

            if (!existing) {
                await createParticipant(
                    contact.id,
                    targetStatusId,
                    mode === 'checkin' ? t('addParticipant.addedCheckedIn') : t('addParticipant.added')
                );
                return;
            }

            await updateParticipantStatus(
                existing.id,
                targetStatusId,
                mode === 'checkin' ? t('addParticipant.recoveredCheckedIn') : t('addParticipant.recovered')
            );
        } catch (err) {
            addToast(
                t(mode === 'checkin' ? 'addParticipant.errorCheckIn' : 'addParticipant.errorRegister', {
                    error: t(err.message)
                }),
                'error'
            );
        } finally {
            setActionKey(null);
        }
    };

    const handleCreate = async (mode) => {
        if (!newContact.first_name.trim() || !newContact.last_name.trim()) {
            return;
        }

        setLoading(true);
        setActionKey(`create:${mode}`);
        try {
            let contactId;

            const contactData = await civiApi('Contact', 'create', {
                values: {
                    contact_type: 'Individual',
                    first_name: newContact.first_name,
                    last_name: newContact.last_name
                },
                eventId
            });
            const resValues = contactData.values || [];
            if (resValues.length > 0) {
                contactId = resValues[0].id;
            } else {
                throw new Error('Failed to create contact');
            }

            if (newContact.email) {
                await civiApi('Email', 'create', {
                    values: {
                        contact_id: contactId,
                        email: newContact.email,
                        is_primary: 1
                    },
                    eventId
                });
            }

            if (newContact.phone) {
                await civiApi('Phone', 'create', {
                    values: {
                        contact_id: contactId,
                        phone: newContact.phone,
                        phone_type_id: 'Mobile',
                        is_primary: 1
                    },
                    eventId
                });
            }

            if (requireCheckout) {
                goToCheckout(contactId);
                return;
            }

            await createParticipant(
                contactId,
                mode === 'checkin' ? statusIds.attended : statusIds.registered,
                mode === 'checkin' ? t('addParticipant.createdCheckedIn') : t('addParticipant.createdRegistered')
            );
        } catch (err) {
            addToast(t('addParticipant.errorCreate', { error: t(err.message) }), 'error');
        } finally {
            setLoading(false);
            setActionKey(null);
        }
    };

    const renderActionButtons = (contact) => {
        const action = contact.civiscan_existing_participant_action || 'add';
        const existing = contact.civiscan_existing_participant || null;
        const isBusy = (mode) => actionKey === `${contact.id}:${mode}`;
        const hasPendingCheckout = Boolean(existing?.civiscan_checkout?.canResume);

        if (action === 'attended') {
            return (
                <button className="btn btn-sm btn-ghost" disabled>
                    <BadgeCheck size={16} />
                    <span>{t('addParticipant.alreadyCheckedIn')}</span>
                </button>
            );
        }

        return (
            <div className="flex flex-col gap-2 items-stretch min-w-[8.5rem]">
                {canOpenParticipantDetails(contact) && (
                    <button
                        className="btn btn-sm btn-outline"
                        onClick={() => goToCheckout(contact.id, existing?.id || null)}
                        disabled={loading}
                    >
                        <span>{hasPendingCheckout ? t('participantList.resumePayment') : t('participantList.viewOptions')}</span>
                    </button>
                )}
                <button
                    className={`btn btn-sm ${action === 'registered' ? 'btn-outline' : 'btn-primary'}`}
                    onClick={() => handleExistingContactAction(contact, 'register')}
                    disabled={loading || isBusy('register')}
                >
                    {isBusy('register') ? <span className="loading loading-spinner loading-xs"></span> : <Check size={16} />}
                    <span>
                        {existing && action === 'registered'
                            ? t('addParticipant.alreadyRegistered')
                            : t('addParticipant.register')}
                    </span>
                </button>
                <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => handleExistingContactAction(contact, 'checkin')}
                    disabled={loading || isBusy('checkin')}
                >
                    {isBusy('checkin') ? <span className="loading loading-spinner loading-xs"></span> : <BadgeCheck size={16} />}
                    <span>{t('addParticipant.checkIn')}</span>
                </button>
            </div>
        );
    };

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
                <button onClick={() => navigate(`/event/${eventId}`)} className="btn btn-circle btn-ghost btn-sm">
                    <ArrowLeft size={24} />
                </button>
                <h2 className="text-xl font-bold text-base-content">{t('addParticipant.title')}</h2>
            </div>

            <div role="tablist" className="tabs tabs-boxed">
                {canSearchInEvent && <a
                    role="tab"
                    className={`tab ${activeTab === 'search' ? 'tab-active' : ''}`}
                    onClick={() => setActiveTab('search')}
                >
                    <Search size={16} className="mr-2" /> {t('addParticipant.search')}
                </a>}
                {canCreateInEvent && <a
                    role="tab"
                    className={`tab ${activeTab === 'create' ? 'tab-active' : ''}`}
                    onClick={() => setActiveTab('create')}
                >
                    <UserPlus size={16} className="mr-2" /> {t('addParticipant.create')}
                </a>}
            </div>

            {activeTab === 'search' && canSearchInEvent && (
                <div className="flex flex-col gap-4">
                    <form onSubmit={handleSearch} className="join w-full">
                        <input
                            type="text"
                            placeholder={t('addParticipant.searchPlaceholder')}
                            className="input input-bordered join-item w-full"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            minLength={3}
                        />
                        <button type="submit" className="btn btn-primary join-item" disabled={!canSearch || loading}>
                            {loading ? <span className="loading loading-spinner"></span> : <Search />}
                        </button>
                    </form>

                    {!canSearch && query.length > 0 && (
                        <div className="text-xs opacity-60 px-1">{t('addParticipant.minSearchLength')}</div>
                    )}

                    <div className="flex flex-col gap-2">
                        {searchResults.map(c => (
                            <div
                                key={c.id}
                                className={`card bg-base-100 shadow-sm border border-base-200 ${canOpenParticipantDetails(c) ? 'cursor-pointer' : ''}`}
                                onClick={() => {
                                    if (canOpenParticipantDetails(c)) {
                                        goToCheckout(c.id, c.civiscan_existing_participant?.id || null);
                                    }
                                }}
                            >
                                <div className="card-body p-4 flex flex-row justify-between items-center gap-4">
                                    <div className="min-w-0 flex-1 text-left">
                                        <h3 className="font-bold">{c.display_name}</h3>
                                        {c['email_primary.email'] && <p className="text-xs opacity-70 break-all">{c['email_primary.email']}</p>}
                                        {c.civiscan_existing_participant && (
                                            <div className="mt-2">
                                                <span className={`badge badge-sm ${
                                                    c.civiscan_existing_participant_action === 'recover'
                                                        ? 'badge-warning'
                                                        : c.civiscan_existing_participant_action === 'attended'
                                                            ? 'badge-success'
                                                            : 'badge-neutral'
                                                }`}>
                                                    {t('addParticipant.eventStatusShort', {
                                                        status: c.civiscan_existing_participant.status_label || t('status.registered')
                                                    })}
                                                </span>
                                                {(c.civiscan_existing_participant.civiscan_option_summary || []).length > 0 && (
                                                    <div className="mt-2 flex flex-wrap gap-1">
                                                        {c.civiscan_existing_participant.civiscan_option_summary.map((option) => (
                                                            <span key={option} className="badge badge-outline badge-sm">
                                                                {option}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        <div className="flex flex-wrap gap-2 mt-1">
                                            {c['phone_primary.phone'] && (
                                                <span className="badge badge-xs badge-neutral text-[10px]">{c['phone_primary.phone']}</span>
                                            )}
                                            {c['address_primary.postal_code'] && (
                                                <span className="badge badge-xs badge-outline text-[10px]">
                                                    {c['address_primary.postal_code']} {c['address_primary.city']}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div onClick={(event) => event.stopPropagation()}>
                                        {renderActionButtons(c)}
                                    </div>
                                </div>
                            </div>
                        ))}
                        {searchResults.length === 0 && !loading && query && (
                            <div className="text-center opacity-50 p-4">{t('common.noResults')}</div>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'create' && canCreateInEvent && (
                <form
                    onSubmit={(e) => e.preventDefault()}
                    className="flex flex-col gap-3"
                >
                    <div className="form-control w-full">
                        <label className="label">
                            <span className="label-text">{t('addParticipant.firstName')}</span>
                        </label>
                        <input
                            type="text"
                            className="input input-bordered w-full"
                            value={newContact.first_name}
                            onChange={e => setNewContact({ ...newContact, first_name: e.target.value })}
                            required
                        />
                    </div>
                    <div className="form-control w-full">
                        <label className="label">
                            <span className="label-text">{t('addParticipant.lastName')}</span>
                        </label>
                        <input
                            type="text"
                            className="input input-bordered w-full"
                            value={newContact.last_name}
                            onChange={e => setNewContact({ ...newContact, last_name: e.target.value })}
                            required
                        />
                    </div>
                    <div className="form-control w-full">
                        <label className="label">
                            <span className="label-text">{t('addParticipant.email')}</span>
                        </label>
                        <input
                            type="email"
                            className="input input-bordered w-full"
                            value={newContact.email}
                            onChange={e => setNewContact({ ...newContact, email: e.target.value })}
                        />
                    </div>
                    <div className="form-control w-full">
                        <label className="label">
                            <span className="label-text">{t('addParticipant.phone')}</span>
                        </label>
                        <input
                            type="tel"
                            className="input input-bordered w-full"
                            value={newContact.phone}
                            onChange={e => setNewContact({ ...newContact, phone: e.target.value })}
                        />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                        <button
                            type="button"
                            className="btn btn-primary w-full"
                            disabled={loading}
                            onClick={() => handleCreate('register')}
                        >
                            {actionKey === 'create:register' && <span className="loading loading-spinner mr-2"></span>}
                            {t('addParticipant.createRegister')}
                        </button>
                        <button
                            type="button"
                            className="btn btn-secondary w-full"
                            disabled={loading}
                            onClick={() => handleCreate('checkin')}
                        >
                            {actionKey === 'create:checkin' && <span className="loading loading-spinner mr-2"></span>}
                            {t('addParticipant.createCheckIn')}
                        </button>
                    </div>
                </form>
            )}
        </div>
    );
};

export default AddParticipant;
