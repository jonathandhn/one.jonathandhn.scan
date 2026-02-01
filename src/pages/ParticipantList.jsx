import React, { useEffect, useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { civiApi, getSettings } from '../services/civi';
import { Search, Filter, QrCode, UserPlus, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { vibrateClick } from '../services/feedback';

const ParticipantList = () => {
    const { t } = useTranslation();
    const { eventId } = useParams();
    const [participants, setParticipants] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all'); // all, attended, remaining
    const [search, setSearch] = useState('');
    const [stats, setStats] = useState({ total: 0, attended: 0, remaining: 0 });
    const [isFinished, setIsFinished] = useState(false);
    const [eventTitle, setEventTitle] = useState('');

    useEffect(() => {
        fetchEventDetails();
        fetchParticipants();

        // Auto-refresh every 30 seconds
        const interval = setInterval(() => {
            fetchParticipants(true); // Silent refresh
        }, 30000);

        return () => clearInterval(interval);
    }, [eventId]);

    const fetchEventDetails = async () => {
        try {
            const { apiVersion } = getSettings();
            let params = {};
            if (apiVersion === '4') {
                params = {
                    where: [["id", "=", eventId]],
                    select: ["title", "end_date"]
                };
            } else {
                params = { id: eventId };
            }
            const data = await civiApi('Event', 'get', params);
            const values = data.values || {};
            const event = Array.isArray(values) ? values[0] : Object.values(values)[0];

            if (event) {
                setEventTitle(event.title);
                if (event.end_date) {
                    const endDate = new Date(event.end_date);
                    if (endDate < new Date()) {
                        setIsFinished(true);
                    }
                }
            }
        } catch (err) {
            console.error("Error fetching event details", err);
        }
    };

    const fetchParticipants = async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const { apiVersion } = getSettings();
            let params = {};

            if (apiVersion === '4') {
                params = {
                    where: [["event_id", "=", eventId]],
                    select: ["id", "status_id", "contact_id.display_name", "contact_id.email"],
                    limit: 0
                };
            } else {
                params = {
                    event_id: eventId,
                    options: { limit: 0 }, // Get all
                };
            }

            const data = await civiApi('Participant', 'get', params);

            // Normalize values
            const values = data.values || {};
            let parts = Array.isArray(values) ? values : Object.values(values);

            // APIv4 Normalization: Map flattened fields to standard keys
            if (apiVersion === '4') {
                parts = parts.map(p => ({
                    ...p,
                    display_name: p['contact_id.display_name'],
                    email: p['contact_id.email'],
                    participant_status_id: String(p.status_id) // APIv4 uses status_id, APIv3 often uses participant_status_id. And ensure string for comparison.
                }));
            }

            setParticipants(parts);
            calculateStats(parts);
        } catch (err) {
            console.error(err);
            alert('Error fetching participants');
        } finally {
            setLoading(false);
        }
    };

    const calculateStats = (parts) => {
        const total = parts.length;
        // Assuming status_id 2 is Attended. This might vary!
        const attended = parts.filter(p => p.participant_status_id === "2").length;
        setStats({
            total,
            attended,
            remaining: total - attended
        });
    };

    const handleCheckIn = async (participantId, currentStatus) => {
        if (isFinished) return; // Prevent changes if finished
        vibrateClick();

        // Toggle check-in. If 2 (Attended), set to 1 (Registered). If not 2, set to 2.
        const newStatus = currentStatus === "2" ? "1" : "2";
        const { apiVersion } = getSettings();

        try {
            if (apiVersion === '4') {
                await civiApi('Participant', 'update', {
                    where: [["id", "=", participantId]],
                    values: { status_id: newStatus }
                });
            } else {
                await civiApi('Participant', 'create', {
                    id: participantId,
                    status_id: newStatus
                });
            }

            // Optimistic update
            const updated = participants.map(p =>
                p.id === participantId ? { ...p, participant_status_id: newStatus } : p
            );
            setParticipants(updated);
            calculateStats(updated);
        } catch (err) {
            alert('Error updating status');
        }
    };

    const filteredParticipants = useMemo(() => {
        return participants.filter(p => {
            const searchLower = search.toLowerCase();
            const matchesSearch =
                p.display_name?.toLowerCase().includes(searchLower) ||
                String(p.id).includes(searchLower); // Search by ID (Ticket Number)

            const isAttended = p.participant_status_id === "2";

            if (filter === 'attended') return matchesSearch && isAttended;
            if (filter === 'remaining') return matchesSearch && !isAttended;
            return matchesSearch;
        });
    }, [participants, filter, search]);

    return (
        <div className="flex flex-col h-full space-y-4">
            {/* Header Actions */}
            <div className="flex justify-between items-center">
                <div className="flex flex-col">
                    <h2 className="text-xl font-bold text-base-content">{eventTitle || t('participants.title')}</h2>
                    {eventTitle && <span className="text-xs text-base-content/60">{t('participants.title')}</span>}
                </div>
                <div className="flex gap-2">
                    <button onClick={() => fetchParticipants()} className="btn btn-circle btn-ghost btn-sm" disabled={loading}>
                        <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
                    </button>
                    {!isFinished && (
                        <>
                            <Link to={`/event/${eventId}/add`} className="btn btn-circle btn-primary btn-sm text-white shadow-md">
                                <UserPlus size={18} />
                            </Link>
                            <Link to={`/event/${eventId}/scan`} className="btn btn-circle btn-secondary btn-sm text-white shadow-md">
                                <QrCode size={18} />
                            </Link>
                        </>
                    )}
                </div>
            </div>

            {isFinished && (
                <div className="alert alert-warning shadow-sm py-2">
                    <span className="text-sm font-medium">{t('events.eventFinished')}</span>
                </div>
            )}

            {/* Stats Bar */}
            <div className="stats shadow-md w-full bg-base-100 rounded-box border border-base-200">
                <div
                    className={`stat place-items-center py-2 cursor-pointer hover:bg-base-200 transition-colors ${filter === 'all' ? 'bg-base-200' : ''}`}
                    onClick={() => setFilter('all')}
                >
                    <div className="stat-title text-xs uppercase tracking-wider">{t('participants.total')}</div>
                    <div className="stat-value text-2xl">{stats.total}</div>
                </div>
                <div
                    className={`stat place-items-center py-2 cursor-pointer hover:bg-base-200 transition-colors text-success ${filter === 'attended' ? 'bg-success/10' : ''}`}
                    onClick={() => setFilter('attended')}
                >
                    <div className="stat-title text-xs uppercase tracking-wider">{t('participants.attended')}</div>
                    <div className="stat-value text-2xl">{stats.attended}</div>
                </div>
                <div
                    className={`stat place-items-center py-2 cursor-pointer hover:bg-base-200 transition-colors text-warning ${filter === 'remaining' ? 'bg-warning/10' : ''}`}
                    onClick={() => setFilter('remaining')}
                >
                    <div className="stat-title text-xs uppercase tracking-wider">{t('participants.remaining')}</div>
                    <div className="stat-value text-2xl">{stats.remaining}</div>
                </div>
            </div>

            {/* Search & Filter */}
            <div className="flex gap-2">
                <div className="relative flex-grow">
                    <input
                        type="text"
                        placeholder={t('participants.searchPlaceholder')}
                        className="input input-bordered w-full pl-10 bg-base-100 shadow-sm"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                    <Search className="absolute left-3 top-3 text-base-content/40" size={20} />
                </div>
                <select
                    className="select select-bordered bg-base-100 shadow-sm"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                >
                    <option value="all">{t('participants.filterAll')}</option>
                    <option value="attended">{t('participants.filterAttended')}</option>
                    <option value="remaining">{t('participants.filterRemaining')}</option>
                </select>
            </div>

            {/* List */}
            <div className="flex-grow space-y-2 pb-20">
                {loading && participants.length === 0 ? (
                    <div className="text-center p-8"><span className="loading loading-spinner loading-lg text-primary"></span></div>
                ) : (
                    filteredParticipants.map(p => {
                        const isAttended = p.participant_status_id === "2"; // Assuming 2 is Attended
                        return (
                            <div key={p.id} className={`card card-compact shadow-sm transition-all duration-200 ${isAttended ? 'bg-base-100 border-l-4 border-success opacity-75' : 'bg-base-100 border-l-4 border-base-300'}`}>
                                <div className="card-body flex-row items-center justify-between py-3 px-4">
                                    <div className="overflow-hidden">
                                        <h3 className={`font-bold truncate ${isAttended ? 'text-base-content/70' : 'text-base-content'}`}>{p.display_name}</h3>
                                        <p className="text-xs text-base-content/50 truncate">{p.email}</p>
                                    </div>
                                    <button
                                        onClick={() => handleCheckIn(p.id, p.participant_status_id)}
                                        disabled={isFinished}
                                        className={`btn btn-circle btn-sm border-none shadow-none ${isAttended ? 'btn-success text-white' : 'btn-ghost text-base-content/20 hover:text-success'} ${isFinished ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    >
                                        {isAttended ? <CheckCircle size={20} /> : <CheckCircle size={20} />}
                                    </button>
                                </div>
                            </div>
                        );
                    })
                )}
                {!loading && filteredParticipants.length === 0 && (
                    <div className="text-center p-8 text-base-content/50 bg-base-100 rounded-box shadow-sm">
                        {t('participants.empty')}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ParticipantList;
