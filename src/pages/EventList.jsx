import React, { useEffect, useState } from 'react';
import { civiApi, getSettings } from '../services/civi';
import { Link } from 'react-router-dom';
import { Calendar, ChevronRight, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const EventList = () => {
    const { t } = useTranslation();
    const [events, setEvents] = useState([]);
    const [showPastEvents, setShowPastEvents] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        // Initialize showPastEvents from settings (which now respects VITE_SHOW_PAST_EVENTS)
        const { showPastEvents: showDefault } = getSettings();
        setShowPastEvents(showDefault);
    }, []);

    useEffect(() => {
        const fetchEvents = async () => {
            try {
                // APIv4 only
                const params = {
                    select: ["id", "title", "start_date", "end_date"],
                    where: [["is_active", "=", true]],
                    orderBy: { start_date: "DESC" },
                    limit: 20
                };

                const data = await civiApi('Event', 'get', params);
                // civi.js now always normalizes APIv4 array to { values: [...] }
                const values = data.values || {};
                setEvents(Array.isArray(values) ? values : Object.values(values));
            } catch (err) {
                setError(t(err.message));
            } finally {
                setLoading(false);
            }
        };

        fetchEvents();
    }, []);

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-base-content">{t('events.title')}</h2>
            </div>

            {loading && <div className="text-center"><span className="loading loading-spinner loading-lg text-primary"></span></div>}

            {error && (
                <div className="alert alert-error shadow-lg">
                    <AlertCircle />
                    <span>{error}</span>
                </div>
            )}

            <div className="flex flex-col gap-3">
                {/* Upcoming Events */}
                {events
                    .filter(e => !e.end_date || new Date(e.end_date) >= new Date())
                    .map(event => (
                        <Link to={`/event/${event.id}`} key={event.id} className="card bg-base-100 shadow-md hover:shadow-xl transition-all duration-200 border-l-4 border-primary">
                            <div className="card-body p-4 flex flex-row items-center justify-between">
                                <div>
                                    <h2 className="card-title text-lg font-bold">{event.title}</h2>
                                    <div className="flex items-center text-sm text-base-content/70 mt-1">
                                        <Calendar size={14} className="mr-1" />
                                        <span>{new Date(event.start_date).toLocaleDateString()}</span>
                                    </div>
                                </div>
                                <ChevronRight className="text-base-content/30" />
                            </div>
                        </Link>
                    ))}

                {/* Past Events Toggle */}
                {showPastEvents && events.some(e => e.end_date && new Date(e.end_date) < new Date()) && (
                    <div className="mt-4">
                        <div className="flex flex-col gap-3 mt-2 animate-in fade-in slide-in-from-top-2">
                            <div className="divider text-xs text-base-content/50 uppercase">{t('events.pastEvents')}</div>
                            {events.filter(e => e.end_date && new Date(e.end_date) < new Date()).map(event => (
                                <Link to={`/event/${event.id}`} key={event.id} className="card bg-base-100 shadow-sm hover:shadow-md transition-all duration-200 border-l-4 border-base-300 opacity-75">
                                    <div className="card-body p-4 flex flex-row items-center justify-between">
                                        <div>
                                            <h2 className="card-title text-lg font-bold text-base-content/70">{event.title}</h2>
                                            <div className="flex items-center text-sm text-base-content/50 mt-1">
                                                <Calendar size={14} className="mr-1" />
                                                <span>{new Date(event.start_date).toLocaleDateString()}</span>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-1">
                                            <span className="badge badge-ghost text-xs">
                                                {t('events.eventFinished')}
                                            </span>
                                            <ChevronRight className="text-base-content/20" />
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </div>
                )}

                {!loading && events.length === 0 && (
                    <div className="card bg-base-100 shadow-sm p-8 text-center">
                        <p className="text-base-content/50">{t('events.noEvents')}</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default EventList;
