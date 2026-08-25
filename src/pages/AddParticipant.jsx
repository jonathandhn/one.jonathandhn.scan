import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { civiApi } from '../services/civi';
import { ArrowLeft, Search, UserPlus, Check, BadgeCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useToast } from '../components/Toast';
import { playSuccessSound } from '../services/feedback';
import { runtime, hasCapability } from '../runtime';

const AddParticipant = () => {
    const { t } = useTranslation();
    const { addToast } = useToast();
    const { eventId } = useParams();
    const navigate = useNavigate();
    const statusIds = runtime.participantUi?.statusIds || { registered: 1, attended: 2 };

    const [eventCanSearch, setEventCanSearch] = useState(true);
    const [eventCanCreate, setEventCanCreate] = useState(true);
    const [activeTab, setActiveTab] = useState('search');
    const [query, setQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [actionKey, setActionKey] = useState(null);

    // Chargement de la configuration de l'événement
    useEffect(() => {
        const checkEventPermissions = async () => {
            try {
                const eventData = await civiApi('Event', 'get', {
                    select: [
                        'is_online_registration',
                        'civiscan_can_search_registration',
                        'civiscan_can_create_registration',
                        'civiscan_is_closed',
                        'civiscan_access_state'
                    ],
                    where: [['id', '=', eventId]]
                });
                const event = eventData.values ? (Array.isArray(eventData.values) ? eventData.values[0] : Object.values(eventData.values)[0]) : null;
                const canSearch = (event?.civiscan_can_search_registration === true || (event?.civiscan_can_search_registration !== false && event?.is_online_registration)) && hasCapability('searchContacts');
                const canCreate = (event?.civiscan_can_create_registration === true || (event?.civiscan_can_create_registration !== false && event?.is_online_registration)) && hasCapability('createContact');

                setEventCanSearch(Boolean(canSearch));
                setEventCanCreate(Boolean(canCreate));

                if (!canSearch && canCreate) {
                    setActiveTab('create');
                } else if (canSearch) {
                    setActiveTab('search');
                }
            } catch {
                // Fallback
            }
        };
        if (eventId) {
            checkEventPermissions();
        }
    }, [eventId]);

    const [newContact, setNewContact] = useState({
        first_name: '',
        last_name: '',
        email: '',
        phone: ''
    });

    const trimmedQuery = query.trim();
    const canSearch = trimmedQuery.length >= 3;

    const handleSearch = async (e) => {
        if (e) e.preventDefault();
        if (!canSearch) return;

        setLoading(true);
        try {
            const data = await civiApi('Contact', 'get', {
                select: [
                    'id',
                    'display_name',
                    'first_name',
                    'last_name',
                    'email_primary.email',
                    'phone_primary.phone'
                ],
                where: [
                    ['is_deleted', '=', false],
                    ['contact_type', '=', 'Individual'],
                    ['OR', [
                        ['display_name', 'CONTAINS', trimmedQuery],
                        ['email_primary.email', 'CONTAINS', trimmedQuery]
                    ]]
                ],
                limit: 25
            });

            const contacts = Array.isArray(data.values) ? data.values : Object.values(data.values || {});

            // Vérifier s'ils sont déjà inscrits à cet événement
            const contactIds = contacts.map(c => c.id);
            let participantMap = {};
            if (contactIds.length > 0) {
                try {
                    const pData = await civiApi('Participant', 'get', {
                        select: ['id', 'contact_id', 'status_id'],
                        where: [
                            ['event_id', '=', Number(eventId)],
                            ['contact_id', 'IN', contactIds],
                            ['is_test', '=', false]
                        ]
                    });
                    const pList = Array.isArray(pData.values) ? pData.values : Object.values(pData.values || {});
                    pList.forEach(p => {
                        participantMap[p.contact_id] = p;
                    });
                } catch {
                    // Ignore participant lookup errors
                }
            }

            const enriched = contacts.map(c => ({
                ...c,
                email: c['email_primary.email'] || '',
                phone: c['phone_primary.phone'] || '',
                existingParticipant: participantMap[c.id] || null
            }));

            setSearchResults(enriched);
        } catch (err) {
            console.error(err);
            addToast(t('addParticipant.errorSearch'), 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleExistingContactAction = async (contact, mode) => {
        const targetStatusId = mode === 'checkin' ? statusIds.attended : statusIds.registered;
        const isBusy = `${contact.id}:${mode}`;
        setActionKey(isBusy);

        try {
            if (contact.existingParticipant) {
                // Mise à jour du statut
                await civiApi('Participant', 'update', {
                    values: { status_id: targetStatusId },
                    where: [['id', '=', contact.existingParticipant.id]]
                });
            } else {
                // Nouvelle inscription
                await civiApi('Participant', 'create', {
                    values: {
                        event_id: Number(eventId),
                        contact_id: Number(contact.id),
                        status_id: targetStatusId,
                        role_id: 1
                    }
                });
            }

            playSuccessSound();
            addToast(mode === 'checkin' ? t('addParticipant.addedCheckedIn') : t('addParticipant.added'), 'success');
            navigate(`/event/${eventId}`);
        } catch (err) {
            console.error(err);
            addToast(t(mode === 'checkin' ? 'addParticipant.errorCheckIn' : 'addParticipant.errorRegister'), 'error');
        } finally {
            setActionKey(null);
        }
    };

    const handleCreate = async (mode) => {
        if (!newContact.first_name.trim() || !newContact.last_name.trim()) {
            return;
        }

        const targetStatusId = mode === 'checkin' ? statusIds.attended : statusIds.registered;
        setLoading(true);
        setActionKey(`create:${mode}`);

        try {
            // 1. Créer le contact
            const contactData = await civiApi('Contact', 'create', {
                values: {
                    contact_type: 'Individual',
                    first_name: newContact.first_name.trim(),
                    last_name: newContact.last_name.trim()
                }
            });
            const resValues = contactData.values || [];
            const contactId = resValues[0]?.id;
            if (!contactId) throw new Error('Échec création contact');

            // 2. Email optionnel
            if (newContact.email.trim()) {
                await civiApi('Email', 'create', {
                    values: {
                        contact_id: contactId,
                        email: newContact.email.trim(),
                        is_primary: 1
                    }
                }).catch(() => {});
            }

            // 3. Téléphone optionnel
            if (newContact.phone.trim()) {
                await civiApi('Phone', 'create', {
                    values: {
                        contact_id: contactId,
                        phone: newContact.phone.trim(),
                        phone_type_id: 'Mobile',
                        is_primary: 1
                    }
                }).catch(() => {});
            }

            // 4. Inscription à l'événement
            await civiApi('Participant', 'create', {
                values: {
                    event_id: Number(eventId),
                    contact_id: contactId,
                    status_id: targetStatusId,
                    role_id: 1
                }
            });

            playSuccessSound();
            addToast(mode === 'checkin' ? t('addParticipant.createdCheckedIn') : t('addParticipant.createdRegistered'), 'success');
            navigate(`/event/${eventId}`);
        } catch (err) {
            console.error(err);
            addToast(t('addParticipant.errorCreate', { error: err.message }), 'error');
        } finally {
            setLoading(false);
            setActionKey(null);
        }
    };

    return (
        <div className="flex flex-col gap-4 max-w-2xl mx-auto p-2 sm:p-4">
            <div className="flex items-center gap-2">
                <button onClick={() => navigate(`/event/${eventId}`)} className="btn btn-circle btn-ghost btn-sm">
                    <ArrowLeft size={24} />
                </button>
                <h2 className="text-xl font-bold text-base-content">{t('addParticipant.title')}</h2>
            </div>

            {eventCanSearch && eventCanCreate && (
                <div role="tablist" className="tabs tabs-boxed bg-base-300">
                    <a
                        role="tab"
                        className={`tab ${activeTab === 'search' ? 'tab-active font-bold' : ''}`}
                        onClick={() => setActiveTab('search')}
                    >
                        <Search size={16} className="mr-2" /> {t('addParticipant.search')}
                    </a>
                    <a
                        role="tab"
                        className={`tab ${activeTab === 'create' ? 'tab-active font-bold' : ''}`}
                        onClick={() => setActiveTab('create')}
                    >
                        <UserPlus size={16} className="mr-2" /> {t('addParticipant.create')}
                    </a>
                </div>
            )}

            {/* TAB 1 : RECHERCHE CONTACT EXISTANT */}
            {activeTab === 'search' && (
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
                        <button
                            type="submit"
                            className="btn btn-primary join-item"
                            disabled={!canSearch || loading}
                        >
                            {loading ? <span className="loading loading-spinner loading-sm"></span> : <Search size={20} />}
                        </button>
                    </form>

                    <div className="flex flex-col gap-2">
                        {searchResults.map(contact => {
                            const isAttended = contact.existingParticipant?.status_id === 2;

                            return (
                                <div key={contact.id} className="card bg-base-100 shadow-sm border border-base-200">
                                    <div className="card-body p-4 flex flex-row items-center justify-between gap-4">
                                        <div className="min-w-0 flex-1">
                                            <h3 className="font-bold truncate">{contact.display_name}</h3>
                                            {contact.email && <p className="text-xs text-base-content/60 truncate">{contact.email}</p>}
                                            {contact.phone && <p className="text-xs text-base-content/60">{contact.phone}</p>}
                                            {contact.existingParticipant && (
                                                <div className="mt-1">
                                                    <span className={`badge badge-xs ${isAttended ? 'badge-success' : 'badge-warning'}`}>
                                                        {isAttended ? t('status.attended') : t('status.registered')}
                                                    </span>
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex flex-col sm:flex-row gap-2">
                                            {!isAttended && (
                                                <button
                                                    className="btn btn-sm btn-secondary gap-1"
                                                    onClick={() => handleExistingContactAction(contact, 'checkin')}
                                                    disabled={loading || actionKey === `${contact.id}:checkin`}
                                                >
                                                    {actionKey === `${contact.id}:checkin` ? <span className="loading loading-spinner loading-xs"></span> : <BadgeCheck size={16} />}
                                                    <span>{t('addParticipant.checkIn')}</span>
                                                </button>
                                            )}
                                            {!contact.existingParticipant && (
                                                <button
                                                    className="btn btn-sm btn-outline gap-1"
                                                    onClick={() => handleExistingContactAction(contact, 'register')}
                                                    disabled={loading || actionKey === `${contact.id}:register`}
                                                >
                                                    {actionKey === `${contact.id}:register` ? <span className="loading loading-spinner loading-xs"></span> : <Check size={16} />}
                                                    <span>{t('addParticipant.register')}</span>
                                                </button>
                                            )}
                                            {isAttended && (
                                                <span className="badge badge-success badge-sm p-2">
                                                    {t('addParticipant.alreadyCheckedIn')}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* TAB 2 : CRÉATION NOUVEAU CONTACT */}
            {activeTab === 'create' && (
                <div className="card bg-base-100 shadow-sm border border-base-200">
                    <div className="card-body p-4 sm:p-6 space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="form-control">
                                <label className="label py-1">
                                    <span className="label-text text-xs font-semibold">{t('addParticipant.firstName')} *</span>
                                </label>
                                <input
                                    type="text"
                                    className="input input-bordered input-sm w-full"
                                    value={newContact.first_name}
                                    onChange={e => setNewContact({ ...newContact, first_name: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="form-control">
                                <label className="label py-1">
                                    <span className="label-text text-xs font-semibold">{t('addParticipant.lastName')} *</span>
                                </label>
                                <input
                                    type="text"
                                    className="input input-bordered input-sm w-full"
                                    value={newContact.last_name}
                                    onChange={e => setNewContact({ ...newContact, last_name: e.target.value })}
                                    required
                                />
                            </div>
                        </div>

                        <div className="form-control">
                            <label className="label py-1">
                                <span className="label-text text-xs font-semibold">{t('addParticipant.email')}</span>
                            </label>
                            <input
                                type="email"
                                className="input input-bordered input-sm w-full"
                                value={newContact.email}
                                onChange={e => setNewContact({ ...newContact, email: e.target.value })}
                            />
                        </div>

                        <div className="form-control">
                            <label className="label py-1">
                                <span className="label-text text-xs font-semibold">{t('addParticipant.phone')}</span>
                            </label>
                            <input
                                type="tel"
                                className="input input-bordered input-sm w-full"
                                value={newContact.phone}
                                onChange={e => setNewContact({ ...newContact, phone: e.target.value })}
                            />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                            <button
                                type="button"
                                className="btn btn-secondary btn-sm gap-2"
                                onClick={() => handleCreate('checkin')}
                                disabled={!newContact.first_name.trim() || !newContact.last_name.trim() || loading}
                            >
                                {actionKey === 'create:checkin' ? <span className="loading loading-spinner loading-xs"></span> : <BadgeCheck size={16} />}
                                <span>{t('addParticipant.createAndCheckIn')}</span>
                            </button>
                            <button
                                type="button"
                                className="btn btn-primary btn-sm gap-2"
                                onClick={() => handleCreate('register')}
                                disabled={!newContact.first_name.trim() || !newContact.last_name.trim() || loading}
                            >
                                {actionKey === 'create:register' ? <span className="loading loading-spinner loading-xs"></span> : <Check size={16} />}
                                <span>{t('addParticipant.createAndRegister')}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AddParticipant;
