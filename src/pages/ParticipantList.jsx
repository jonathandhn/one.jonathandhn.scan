import React, { useEffect, useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { civiApi, getSettings } from '../services/civi';
import { Search, Filter, QrCode, UserPlus, CheckCircle, XCircle, RefreshCw, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { vibrateClick } from '../services/feedback';

const ParticipantList = () => {
    const { t } = useTranslation();
    const { eventId } = useParams();
    const [participants, setParticipants] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('all');
    const [isReadOnly, setIsReadOnly] = useState(false);

    useEffect(() => {
        const fetchEventAndParticipants = async () => {
            try {
                // 1. Fetch Event Details for Grace Period Logic
                const eventData = await civiApi('Event', 'get', {
                    select: ["end_date"],
                    where: [["id", "=", eventId]]
                });
                const event = eventData.values ? (Array.isArray(eventData.values) ? eventData.values[0] : Object.values(eventData.values)[0]) : null;

                if (event && event.end_date) {
                    const endDate = new Date(event.end_date);
                    const now = new Date();
                    const { gracePeriod } = getSettings(); // Default 30 mins

                    const lockedTime = new Date(endDate.getTime() + gracePeriod * 60000);

                    if (now > lockedTime) {
                        setIsReadOnly(true);
                    }
                }

                // 2. Fetch Participants
                const params = {
                    select: [
                        "id", "contact_id", "status_id", "register_date",
                        "participant_role_id", "event_id",
                        "contact_id.display_name", "contact_id.email_primary.email"
                    ],
                    where: [
                        ["event_id", "=", eventId],
                        ["is_test", "=", 0],
                    ],
                    limit: 0
                };

                const data = await civiApi('Participant', 'get', params);
                const values = data.values || [];

                // Normalize for display
                const formatted = values.map(p => ({
                    id: p.id,
                    contact_id: p.contact_id,
                    display_name: p['contact_id.display_name'],
                    email: p['contact_id.email_primary.email'],
                    status_id: p.status_id,
                    role_id: p.participant_role_id,
                    register_date: p.register_date
                }));

                const { sortOrder } = getSettings();

                // Sort
                let sorted = [...formatted];
                if (sortOrder === 'name_asc') {
                    sorted.sort((a, b) => a.display_name.localeCompare(b.display_name));
                } else if (sortOrder === 'id_desc') {
                    sorted.sort((a, b) => b.id - a.id);
                } else {
                    // Default id_asc (already sorted by API usually, but safe to enforce)
                    sorted.sort((a, b) => a.id - b.id);
                }

                setParticipants(sorted);

            } catch (err) {
                console.error(err);
                setError(t('participantList.errorFetch'));
            } finally {
                setLoading(false);
            }
        };

        if (eventId) {
            fetchEventAndParticipants();
        }
    }, [eventId, t]);

    const handleCheckIn = async (participantId, currentStatus) => {
        if (isReadOnly) return; // Guard

        const newStatus = currentStatus === 2 ? 1 : 2; // Toggle

        const originalParticipants = [...participants];
        setParticipants(participants.map(p =>
            p.id === participantId ? { ...p, status_id: newStatus } : p
        ));

        vibrateClick();

        try {
            await civiApi('Participant', 'update', {
                values: { status_id: newStatus },
                where: [["id", "=", participantId]]
            });
        } catch (err) {
            setParticipants(originalParticipants);
            alert(t('common.error'));
        }
    };

    const normalizeString = (str) => {
        return str
            ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
            : "";
    };

    const filteredParticipants = useMemo(() => {
        return participants.filter(p => {
            const searchNormalized = normalizeString(search);
            const nameNormalized = normalizeString(p.display_name);
            const emailNormalized = normalizeString(p.email);

            const matchesSearch =
                nameNormalized.includes(searchNormalized) ||
                emailNormalized.includes(searchNormalized);

            if (!matchesSearch) return false;

            if (filter === 'checked-in') return p.status_id === 2;
            if (filter === 'pending') return p.status_id !== 2;

            return true;
        });
    }, [participants, search, filter]);

    const stats = {
        total: participants.length,
        checkedIn: participants.filter(p => p.status_id === 2).length,
    };

    return (
        <div className="h-full flex flex-col">
            {/* Header / Stats */}
            <div className="bg-base-100 shadow-sm p-4 z-10 sticky top-0">
                <div className="flex justify-between items-center mb-4">
                    <div>
                        <h1 className="text-2xl font-bold">{t('participantList.title')}</h1>
                        <p className="text-sm text-base-content/70">
                            {stats.checkedIn} / {stats.total} {t('participantList.checkedIn')}
                        </p>
                    </div>
                    {/* Action Buttons: Hide if ReadOnly */}
                    <div className="flex gap-2">
                        {!isReadOnly && (
                            <>
                                <Link to={`/event/${eventId}/scan`} className="btn btn-primary btn-circle">
                                    <QrCode size={24} />
                                </Link>
                                <Link to={`/event/${eventId}/add`} className="btn btn-secondary btn-circle">
                                    <UserPlus size={24} />
                                </Link>
                            </>
                        )}
                        {isReadOnly && (
                            <div className="flex items-center gap-2 px-3 py-1 bg-warning/20 text-warning rounded-full border border-warning/50">
                                <Lock size={16} />
                                <span className="text-xs font-bold whitespace-nowrap">{t('settings.accessReadOnly')}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Search & Filter */}
                <div className="flex flex-col gap-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-base-content/50" size={18} />
                        <input
                            type="text"
                            placeholder={t('participantList.searchPlaceholder')}
                            className="input input-bordered w-full pl-10"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>

                    <div className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
                        <button
                            className={`btn btn-sm ${filter === 'all' ? 'btn-neutral' : 'btn-ghost'}`}
                            onClick={() => setFilter('all')}
                        >
                            {t('common.all')}
                        </button>
                        <button
                            className={`btn btn-sm gap-1 ${filter === 'checked-in' ? 'btn-success' : 'btn-ghost text-success'}`}
                            onClick={() => setFilter('checked-in')}
                        >
                            <CheckCircle size={14} /> {t('participantList.filterCheckedIn')}
                        </button>
                        <button
                            className={`btn btn-sm gap-1 ${filter === 'pending' ? 'btn-warning' : 'btn-ghost text-warning'}`}
                            onClick={() => setFilter('pending')}
                        >
                            <RefreshCw size={14} /> {t('participantList.filterPending')}
                        </button>
                    </div>
                </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-24">
                {loading ? (
                    <div className="flex justify-center py-8">
                        <span className="loading loading-spinner loading-lg text-primary"></span>
                    </div>
                ) : error ? (
                    <div className="alert alert-error">
                        <span>{error}</span>
                    </div>
                ) : filteredParticipants.length === 0 ? (
                    <div className="text-center py-10 opacity-50">
                        {t('participantList.noParticipants')}
                    </div>
                ) : (
                    filteredParticipants.map(participant => (
                        <div key={participant.id} className="card bg-base-100 shadow-sm border border-base-200">
                            <div className="card-body p-4 flex flex-row items-center justify-between gap-4">
                                <div className="min-w-0 flex-1">
                                    <h3 className="font-bold truncate">{participant.display_name}</h3>
                                    {participant.email && (
                                        <p className="text-xs text-base-content/60 truncate">{participant.email}</p>
                                    )}
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className={`badge badge-xs ${participant.status_id === 2 ? 'badge-success' : 'badge-warning'}`}>
                                            {participant.status_id === 2 ? t('status.attended') : t('status.registered')}
                                        </span>
                                        <span className="text-[10px] opacity-50">ID: {participant.id}</span>
                                    </div>
                                </div>

                                {/* Check-in Button logic: Hide if ReadOnly */}
                                {!isReadOnly && (
                                    <button
                                        onClick={() => handleCheckIn(participant.id, participant.status_id)}
                                        className={`btn btn-circle btn-sm ${participant.status_id === 2 ? 'btn-ghost text-success hover:btn-error hover:text-white' : 'btn-primary'}`}
                                        title={participant.status_id === 2 ? t('participantList.uncheck') : t('participantList.checkIn')}
                                    >
                                        {participant.status_id === 2 ? <CheckCircle size={24} /> : <CheckCircle size={20} />}
                                    </button>
                                )}
                                {isReadOnly && (
                                    <div className="opacity-50">
                                        {participant.status_id === 2 ? <CheckCircle size={24} className="text-success" /> : <RefreshCw size={20} className="text-gray-400" />}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default ParticipantList;
