import { useEffect, useState } from 'react';
import { civiApi, hasValidConfig } from '../services/civi';
import { Link, useNavigate } from 'react-router-dom';
import { Calendar, ChevronLeft, ChevronRight, AlertCircle, Search, Clock3, MapPin } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { isSessionMode, runtime } from '../runtime';
import { saveEventsSnapshot, getCachedEvents } from '../services/offlineStorage';

const PAGE_SIZE = Math.min(500, Math.max(10, Number(runtime.pagination.eventsPageSize || 50)));

const formatEventDate = value => {
    if (!value) return null;
    return new Intl.DateTimeFormat(undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    }).format(new Date(value));
};

const formatEventTimeRange = (startValue, endValue) => {
    if (!startValue) return null;
    const formatter = new Intl.DateTimeFormat(undefined, {
        hour: '2-digit',
        minute: '2-digit'
    });
    const start = formatter.format(new Date(startValue));
    if (!endValue) {
        return start;
    }
    return `${start} - ${formatter.format(new Date(endValue))}`;
};

const buildEventLocation = event => {
    const parts = [
        event?.['loc_block_id.address_id.street_address'],
        event?.['loc_block_id.address_id.supplemental_address_1'],
        event?.['loc_block_id.address_id.supplemental_address_2'],
        [
            event?.['loc_block_id.address_id.postal_code'],
            event?.['loc_block_id.address_id.city']
        ].filter(Boolean).join(' '),
        event?.['loc_block_id.address_id.country_id:label']
    ].filter(Boolean);

    return parts.length ? parts.join(', ') : null;
};

const eventMatchesSearch = (event, rawSearch) => {
    const needle = rawSearch.trim().toLowerCase();
    if (!needle) return true;

    const dateParts = [event.start_date, event.end_date]
        .filter(Boolean)
        .flatMap(value => {
            const date = new Date(value);
            return [
                value,
                date.toISOString().slice(0, 10),
                new Intl.DateTimeFormat('fr-FR').format(date),
                new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(date),
            ];
        });

    const haystack = [
        event.title,
        buildEventLocation(event),
        ...dateParts
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

    return haystack.includes(needle);
};

const EventList = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [events, setEvents] = useState([]);
    const [filter, setFilter] = useState('upcoming');
    const [searchInput, setSearchInput] = useState('');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            setSearch(searchInput.trim());
            setPage(1);
        }, 350);
        return () => window.clearTimeout(timer);
    }, [searchInput]);

    useEffect(() => {
        if (!isSessionMode && !hasValidConfig()) {
            navigate('/settings', { replace: true });
            return;
        }

        const fetchEvents = async () => {
            setLoading(true);
            setError(null);
            try {
                if (isSessionMode) {
                    const data = await civiApi('CiviScanEvent', 'search', {
                        page,
                        pageSize: PAGE_SIZE,
                        filter,
                        search
                    });
                    const result = data.values || {};
                    const items = Array.isArray(result.items) ? result.items : [];
                    setEvents(items);
                    setTotal(Number(result.total || 0));
                    setTotalPages(Math.max(1, Number(result.totalPages || 1)));
                    saveEventsSnapshot(items).catch(() => {});
                } else {
                    const where = [['is_active', '=', true]];
                    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
                    if (filter === 'upcoming') {
                        where.push(['OR', [['end_date', 'IS NULL'], ['end_date', '>=', now]]]);
                    } else if (filter === 'past') {
                        where.push(['end_date', '<', now]);
                    }
                    const data = await civiApi('Event', 'get', {
                        select: [
                            'id',
                            'title',
                            'start_date',
                            'end_date',
                            'loc_block_id.address_id.street_address',
                            'loc_block_id.address_id.supplemental_address_1',
                            'loc_block_id.address_id.supplemental_address_2',
                            'loc_block_id.address_id.postal_code',
                            'loc_block_id.address_id.city',
                            'loc_block_id.address_id.country_id:label'
                        ],
                        where,
                        orderBy: { start_date: filter === 'upcoming' ? 'ASC' : 'DESC' },
                        limit: 0
                    });
                    const values = Array.isArray(data.values) ? data.values : Object.values(data.values || {});
                    saveEventsSnapshot(values).catch(() => {});
                    const filteredValues = values.filter(event => eventMatchesSearch(event, search));
                    const pagedValues = filteredValues.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
                    setEvents(pagedValues);
                    setTotal(filteredValues.length);
                    setTotalPages(Math.max(1, Math.ceil(filteredValues.length / PAGE_SIZE)));
                }
            } catch (err) {
                // Fallback hors-ligne immédiat sur IndexedDB avec filtrage et tri rigoureux
                try {
                    const cached = await getCachedEvents();
                    if (cached.length > 0) {
                        const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');
                        const matched = cached.filter(event => {
                            if (!eventMatchesSearch(event, search)) return false;
                            const end = String(event.end_date || event.start_date || '');
                            if (filter === 'upcoming') {
                                return !end || end >= nowStr;
                            } else if (filter === 'past') {
                                return end && end < nowStr;
                            }
                            return true;
                        });

                        matched.sort((a, b) => {
                            const timeA = new Date(a.start_date || 0).getTime();
                            const timeB = new Date(b.start_date || 0).getTime();
                            return filter === 'upcoming' ? timeA - timeB : timeB - timeA;
                        });

                        const pagedValues = matched.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
                        setEvents(pagedValues);
                        setTotal(matched.length);
                        setTotalPages(Math.max(1, Math.ceil(matched.length / PAGE_SIZE)));
                        return;
                    }
                } catch {
                    // Ignore cache error
                }
                setError(t(err.message));
            } finally {
                setLoading(false);
            }
        };
        fetchEvents();
    }, [filter, page, search, t, navigate]);

    const changeFilter = nextFilter => {
        setFilter(nextFilter);
        setPage(1);
    };

    const renderEvent = event => {
        const accessState = event.civiscan_access_state || 'open';
        const isOpen = accessState === 'open';
        const isClosed = event.civiscan_is_closed === true;
        const canScanNow = runtime.capabilities.checkIn === true && isOpen && !isClosed;
        const isReadOnly = isClosed || !canScanNow;
        const toneClasses = isClosed
            ? 'border-error bg-error/10'
            : canScanNow
                ? 'border-success bg-success/10 hover:shadow-xl'
                : 'border-warning bg-warning/10';
        const canOpenCard = true;
        const card = (
            <div className={`card shadow-md transition-all duration-200 border-l-4 ${toneClasses} ${isReadOnly ? '' : 'bg-base-100'}`}>
                <div className="card-body p-4 flex flex-row items-center justify-between">
                    <div className="min-w-0">
                        <h2 className="card-title text-lg font-bold break-words">{event.title}</h2>
                        <div className="flex items-center text-sm text-base-content/70 mt-1">
                            <Calendar size={14} className="mr-1 shrink-0" />
                            <span>{formatEventDate(event.start_date)}</span>
                        </div>
                        {formatEventTimeRange(event.start_date, event.end_date) && (
                            <div className="flex items-center text-sm text-base-content/70 mt-1">
                                <Clock3 size={14} className="mr-1 shrink-0" />
                                <span>{formatEventTimeRange(event.start_date, event.end_date)}</span>
                            </div>
                        )}
                        {buildEventLocation(event) && (
                            <div className="flex items-start text-sm text-base-content/70 mt-1">
                                <MapPin size={14} className="mr-1 mt-0.5 shrink-0" />
                                <span className="line-clamp-2">{buildEventLocation(event)}</span>
                            </div>
                        )}
                        <div className="mt-2 flex flex-wrap gap-2">
                            {canScanNow && (
                                <span className="badge badge-success badge-sm">
                                    {t('participantList.checkIn')}
                                </span>
                            )}
                            {isReadOnly && (
                                <span className={`badge badge-sm ${isClosed ? 'badge-error' : 'badge-warning'}`}>
                                    {t('settings.accessReadOnly')}
                                </span>
                            )}
                            {isClosed ? (
                                <span className="badge badge-error badge-sm">{t('events.closed')}</span>
                            ) : !isOpen && (
                                <span className="badge badge-warning badge-sm">
                                    {accessState === 'upcoming' ? t('events.accessUpcoming') : t('events.accessClosed')}
                                </span>
                            )}
                        </div>
                    </div>
                    {canOpenCard && <ChevronRight className="text-base-content/30 shrink-0" />}
                </div>
            </div>
        );
        return canOpenCard
            ? <Link to={`/event/${event.id}`} key={event.id}>{card}</Link>
            : <div key={event.id}>{card}</div>;
    };

    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-xl font-bold text-base-content">{t('events.title')}</h2>
                <p className="text-xs text-base-content/60 mt-1">
                    {t('events.resultCount', { count: total })}
                </p>
            </div>

            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/50" size={18} />
                <input
                    type="search"
                    className="input input-bordered w-full pl-10"
                    value={searchInput}
                    onChange={event => setSearchInput(event.target.value)}
                    placeholder={t('events.searchPlaceholder')}
                />
            </div>

            <div className="join w-full">
                {['upcoming', 'past', 'all'].map(value => (
                    <button
                        key={value}
                        type="button"
                        className={`btn btn-sm join-item flex-1 ${filter === value ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => changeFilter(value)}
                    >
                        {t(`events.filter.${value}`)}
                    </button>
                ))}
            </div>

            {loading && <div className="text-center py-8"><span className="loading loading-spinner loading-lg text-primary"></span></div>}

            {error && (
                <div className="alert alert-error shadow-lg">
                    <AlertCircle />
                    <span>{error}</span>
                </div>
            )}

            {!loading && !error && (
                <div className="flex flex-col gap-3">
                    {events.map(renderEvent)}
                    {events.length === 0 && (
                        <div className="card bg-base-100 shadow-sm p-8 text-center">
                            <p className="text-base-content/50">{t('events.noEvents')}</p>
                        </div>
                    )}
                </div>
            )}

            {!loading && !error && totalPages > 1 && (
                <div className="flex items-center justify-between pt-2">
                    <button
                        type="button"
                        className="btn btn-sm btn-outline"
                        disabled={page <= 1}
                        onClick={() => setPage(current => Math.max(1, current - 1))}
                    >
                        <ChevronLeft size={18} /> {t('events.previous')}
                    </button>
                    <span className="text-sm text-base-content/70">
                        {t('events.page', { page, totalPages })}
                    </span>
                    <button
                        type="button"
                        className="btn btn-sm btn-outline"
                        disabled={page >= totalPages}
                        onClick={() => setPage(current => current + 1)}
                    >
                        {t('events.next')} <ChevronRight size={18} />
                    </button>
                </div>
            )}
        </div>
    );
};

export default EventList;
