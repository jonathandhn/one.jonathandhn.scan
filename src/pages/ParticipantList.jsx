import { useEffect, useRef, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { civiApi, getSettings } from '../services/civi';
import { Search, QrCode, UserPlus, CheckCircle, RefreshCw, Lock, LockOpen, ChevronLeft, ChevronRight, Calendar, Clock3, MapPin } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useToast } from '../components/Toast';
import { vibrateClick } from '../services/feedback';
import { hasCapability, runtime } from '../runtime';
import { saveParticipantsSnapshot } from '../services/offlineStorage';

const PAGE_SIZE = Math.min(500, Math.max(10, Number(runtime.pagination.participantsPageSize || 50)));
const OVERSCROLL_THRESHOLD = 40;

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
    const timeFormatter = new Intl.DateTimeFormat(undefined, {
        hour: '2-digit',
        minute: '2-digit'
    });
    const startTime = timeFormatter.format(new Date(startValue));
    if (!endValue) return startTime;
    return `${startTime} - ${timeFormatter.format(new Date(endValue))}`;
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

const ParticipantList = () => {
    const { t } = useTranslation();
    const { addToast } = useToast();
    const { eventId } = useParams();
    const navigate = useNavigate();
    const [participants, setParticipants] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchInput, setSearchInput] = useState('');
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('all');
    const [alphabetGroup, setAlphabetGroup] = useState('');
    const [availableAlphabetGroups, setAvailableAlphabetGroups] = useState([]);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [loadingMore, setLoadingMore] = useState(false);
    const [stats, setStats] = useState({ total: 0, checkedIn: 0 });
    const [eventDetails, setEventDetails] = useState(null);
    const [eventAccessState, setEventAccessState] = useState('open');
    const [eventCanSearchRegister, setEventCanSearchRegister] = useState(false);
    const [eventCanCreateRegister, setEventCanCreateRegister] = useState(false);
    const [paymentsActive, setPaymentsActive] = useState(false);
    const [checkoutEnabled, setCheckoutEnabled] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);
    const [isClosed, setIsClosed] = useState(false);
    const [participantReferenceField, setParticipantReferenceField] = useState(runtime.participantUi.referenceField || 'participant_id');
    const [changingClosure, setChangingClosure] = useState(false);
    const [closurePrompt, setClosurePrompt] = useState({
        open: false,
        nextClosed: false,
        markRegisteredAsNoShow: false
    });
    const [isControlsCollapsed, setIsControlsCollapsed] = useState(false);
    const [overscrollGesture, setOverscrollGesture] = useState({ direction: null, distance: 0 });
    const activeRequests = useRef(0);
    const backgroundRefresh = useRef(false);
    const pollingFailures = useRef(0);
    const alphabetRef = useRef(null);
    const headerRef = useRef(null);
    const listRef = useRef(null);
    const touchGesture = useRef({
        startY: 0,
        direction: null,
        distance: 0,
        canPrevious: false,
        canNext: false
    });
    const pendingScroll = useRef(null);
    const lastScrollY = useRef(0);
    const lastCollapseScrollY = useRef(0);
    const toggleCooldownUntil = useRef(0);
    const scrollIntent = useRef({ up: 0, down: 0 });
    const isReadOnly = !hasCapability('checkIn') || isClosed || eventAccessState !== 'open';
    const canAddParticipant = (eventCanSearchRegister || eventCanCreateRegister) && !isReadOnly;

    useEffect(() => {
        const fetchEvent = async () => {
            try {
                const eventData = await civiApi('Event', 'get', {
                    select: [
                        "title",
                        "start_date",
                        "end_date",
                        "is_online_registration",
                        "civiscan_is_closed",
                        "civiscan_access_state",
                        "civiscan_can_search_registration",
                        "civiscan_can_create_registration",
                        "loc_block_id.address_id.street_address",
                        "loc_block_id.address_id.supplemental_address_1",
                        "loc_block_id.address_id.supplemental_address_2",
                        "loc_block_id.address_id.postal_code",
                        "loc_block_id.address_id.city",
                        "loc_block_id.address_id.country_id:label"
                    ],
                    where: [["id", "=", eventId]]
                });
                const event = eventData.values ? (Array.isArray(eventData.values) ? eventData.values[0] : Object.values(eventData.values)[0]) : null;
                setEventDetails(event);
                const closed = event?.civiscan_is_closed === true;
                setIsClosed(closed);
                setEventAccessState(event?.civiscan_access_state || 'open');

                // Autorisations selon la configuration de l'événement et les permissions utilisateur
                const canSearch = (event?.civiscan_can_search_registration === true || (event?.civiscan_can_search_registration !== false && event?.is_online_registration)) && hasCapability('searchContacts');
                const canCreate = (event?.civiscan_can_create_registration === true || (event?.civiscan_can_create_registration !== false && event?.is_online_registration)) && hasCapability('createContact');

                setEventCanSearchRegister(Boolean(canSearch));
                setEventCanCreateRegister(Boolean(canCreate));

            } catch (fetchError) {
                console.error(fetchError);
                setError(t('participantList.errorFetch'));
            }
        };

        if (eventId) {
            fetchEvent();
        }
    }, [eventId, t]);

    useEffect(() => {
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
    }, [eventId]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            setSearch(searchInput.trim());
            if (searchInput.trim()) {
                setAlphabetGroup('');
            }
            setPage(1);
        }, 350);
        return () => window.clearTimeout(timer);
    }, [searchInput]);

    useEffect(() => {
        const fetchParticipants = async () => {
            const isBackground = backgroundRefresh.current;
            backgroundRefresh.current = false;
            activeRequests.current += 1;
            if (!isBackground) {
                if (page === 1) {
                    setLoading(true);
                } else {
                    setLoadingMore(true);
                }
                setError(null);
            }
            try {
                const { sortOrder } = getSettings();
                const data = await civiApi('CiviScanParticipant', 'search', {
                    eventId: Number(eventId),
                    page,
                    pageSize: PAGE_SIZE,
                    filter,
                    search,
                    alphabetGroup,
                    sort: sortOrder
                });
                const result = data.values || {};
                const newItems = (result.items || []).map(p => ({
                    id: p.id,
                    contact_id: p.contact_id,
                    display_name: p['contact_id.display_name']
                        || [p['contact_id.first_name'], p['contact_id.last_name']].filter(Boolean).join(' ')
                        || p['contact_id.sort_name'],
                    email: p['contact_id.email_primary.email'],
                    external_identifier: p['contact_id.external_identifier'],
                    status_id: p.status_id,
                    status_label: p['status_id:label'],
                    role_id: p.participant_role_id,
                    register_date: p.register_date,
                    civiscan_checkout: p.civiscan_checkout || { canResume: false },
                    civiscan_option_summary: p.civiscan_option_summary || []
                }));

                setParticipants(current => {
                    if (page === 1) {
                        saveParticipantsSnapshot(eventId, newItems).catch(() => {});
                        return newItems;
                    }
                    const existingIds = new Set(current.map(item => item.id));
                    const filtered = newItems.filter(item => !existingIds.has(item.id));
                    const combined = [...current, ...filtered];
                    saveParticipantsSnapshot(eventId, combined).catch(() => {});
                    return combined;
                });

                setParticipantReferenceField(result.referenceField || runtime.participantUi.referenceField || 'participant_id');
                setStats(result.stats || { total: 0, checkedIn: 0 });
                setAvailableAlphabetGroups(result.availableAlphabetGroups || []);
                setTotalPages(Math.max(1, Number(result.totalPages || 1)));
                if (alphabetGroup && !(result.availableAlphabetGroups || []).includes(alphabetGroup)) {
                    setAlphabetGroup('');
                    setPage(1);
                }
                if (page > Number(result.totalPages || 1)) {
                    setPage(Math.max(1, Number(result.totalPages || 1)));
                }
                pollingFailures.current = 0;
            } catch (fetchError) {
                console.error(fetchError);
                if (isBackground) {
                    pollingFailures.current += 1;
                }
                if (!isBackground) {
                    setError(t('participantList.errorFetch'));
                }
            } finally {
                activeRequests.current = Math.max(0, activeRequests.current - 1);
                if (!isBackground) {
                    setLoading(false);
                    setLoadingMore(false);
                }
            }
        };
        if (eventId) fetchParticipants();
    }, [eventId, filter, alphabetGroup, page, refreshKey, search, t]);

    useEffect(() => {
        const handleScrollPagination = () => {
            if (loading || loadingMore || activeRequests.current > 0) return;
            if (page >= totalPages) return;

            const scrollHeight = document.documentElement.scrollHeight;
            const scrollTop = window.scrollY || document.documentElement.scrollTop;
            const clientHeight = window.innerHeight;

            if (scrollTop + clientHeight >= scrollHeight - 350) {
                setPage(current => current + 1);
            }
        };

        window.addEventListener('scroll', handleScrollPagination, { passive: true });
        return () => window.removeEventListener('scroll', handleScrollPagination);
    }, [loading, loadingMore, page, totalPages]);

    useEffect(() => {
        let timeoutId;
        let stopped = false;

        const getDelay = () => {
            const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
            let baseDelay = 15000;
            if (connection?.saveData || connection?.effectiveType === 'slow-2g' || connection?.effectiveType === '2g') {
                baseDelay = 60000;
            } else if (connection?.effectiveType === '3g') {
                baseDelay = 30000;
            }
            return Math.min(120000, baseDelay * (2 ** Math.min(pollingFailures.current, 3)));
        };

        const schedule = () => {
            if (stopped) return;
            timeoutId = window.setTimeout(() => {
                if (
                    navigator.onLine
                    && document.visibilityState === 'visible'
                    && activeRequests.current === 0
                ) {
                    backgroundRefresh.current = true;
                    setRefreshKey(current => current + 1);
                }
                schedule();
            }, getDelay());
        };

        const refreshWhenAvailable = () => {
            if (
                navigator.onLine
                && document.visibilityState === 'visible'
                && activeRequests.current === 0
            ) {
                backgroundRefresh.current = true;
                setRefreshKey(current => current + 1);
            }
        };

        window.addEventListener('online', refreshWhenAvailable);
        document.addEventListener('visibilitychange', refreshWhenAvailable);
        schedule();
        return () => {
            stopped = true;
            window.clearTimeout(timeoutId);
            window.removeEventListener('online', refreshWhenAvailable);
            document.removeEventListener('visibilitychange', refreshWhenAvailable);
        };
    }, []);

    const openClosurePrompt = () => {
        setClosurePrompt({
            open: true,
            nextClosed: !isClosed,
            markRegisteredAsNoShow: false
        });
    };

    const closeClosurePrompt = () => {
        setClosurePrompt(current => ({ ...current, open: false }));
    };

    const confirmClosureChange = async () => {
        const { nextClosed, markRegisteredAsNoShow } = closurePrompt;
        setChangingClosure(true);
        try {
            const result = await civiApi('CiviScanEvent', nextClosed ? 'close' : 'reopen', {
                eventId: Number(eventId),
                markRegisteredAsNoShow
            });
            setIsClosed(nextClosed);
            setClosurePrompt({
                open: false,
                nextClosed: false,
                markRegisteredAsNoShow: false
            });
            addToast(
                nextClosed ? t('participantList.closeSuccess') : t('participantList.reopenSuccess'),
                'success'
            );
            if (nextClosed && markRegisteredAsNoShow) {
                const response = Array.isArray(result.values) ? result.values : result.values || {};
                const count = Number(response.noShowCount || 0);
                addToast(t('participantList.noShowApplied', { count }), 'info', 5000);
            }
            setRefreshKey(current => current + 1);
        } catch {
            addToast(t('common.error'), 'error');
        } finally {
            setChangingClosure(false);
        }
    };

    const handleCheckIn = async (participantId, currentStatus) => {
        if (isReadOnly) return; // Guard

        if (currentStatus === 2 && !hasCapability('uncheck')) return;
        if (currentStatus !== 2 && !hasCapability('checkIn')) return;

        const newStatus = currentStatus === 2 ? 1 : 2; // Toggle
        vibrateClick();

        try {
            await civiApi('Participant', 'update', {
                values: { status_id: newStatus },
                where: [["id", "=", participantId]]
            });
            setRefreshKey(current => current + 1);
        } catch {
            addToast(t('common.error'), 'error');
        }
    };

    const selectAlphabetGroup = value => {
        setAlphabetGroup(value);
        setSearchInput('');
        setSearch('');
        setPage(1);
        window.requestAnimationFrame(() => {
            alphabetRef.current
                ?.querySelector(`[data-alphabet-group="${value || 'all'}"]`)
                ?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        });
    };

    const alphabetGroupIndex = availableAlphabetGroups.indexOf(alphabetGroup);
    const showAlphabetFilter = availableAlphabetGroups.length > 0 && (totalPages > 1 || alphabetGroup !== '');
    const hasPreviousPage = page > 1 || (alphabetGroup !== '' && alphabetGroupIndex > 0);
    const hasNextPage = page < totalPages
        || (
            alphabetGroup !== ''
            && alphabetGroupIndex >= 0
            && alphabetGroupIndex < availableAlphabetGroups.length - 1
        );

    const navigatePrevious = () => {
        if (page > 1) {
            pendingScroll.current = 'bottom';
            setPage(current => Math.max(1, current - 1));
            return;
        }
        if (alphabetGroup !== '' && alphabetGroupIndex > 0) {
            pendingScroll.current = 'bottom';
            selectAlphabetGroup(availableAlphabetGroups[alphabetGroupIndex - 1]);
        }
    };

    const navigateNext = () => {
        if (page < totalPages) {
            pendingScroll.current = 'top';
            setPage(current => current + 1);
            return;
        }
        if (
            alphabetGroup !== ''
            && alphabetGroupIndex >= 0
            && alphabetGroupIndex < availableAlphabetGroups.length - 1
        ) {
            pendingScroll.current = 'top';
            selectAlphabetGroup(availableAlphabetGroups[alphabetGroupIndex + 1]);
        }
    };

    useEffect(() => {
        if (loading || !pendingScroll.current) return;
        const direction = pendingScroll.current;
        pendingScroll.current = null;
        window.requestAnimationFrame(() => {
            if (direction === 'bottom') {
                window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
                return;
            }
            const headerHeight = headerRef.current?.getBoundingClientRect().height || 0;
            const listTop = listRef.current
                ? window.scrollY + listRef.current.getBoundingClientRect().top - headerHeight
                : window.scrollY;
            window.scrollTo({ top: Math.max(0, listTop), behavior: 'smooth' });
        });
    }, [loading, participants]);

    useEffect(() => {
        const handleScroll = () => {
            const now = Date.now();
            const currentScrollY = window.scrollY;
            const delta = currentScrollY - lastScrollY.current;

            lastScrollY.current = currentScrollY;

            if (currentScrollY <= 24) {
                setIsControlsCollapsed(false);
                lastCollapseScrollY.current = 0;
                scrollIntent.current = { up: 0, down: 0 };
                return;
            }

            if (Math.abs(delta) < 8) {
                return;
            }

            if (now < toggleCooldownUntil.current) {
                return;
            }

            if (delta > 0) {
                scrollIntent.current.down += delta;
                scrollIntent.current.up = 0;
            } else {
                scrollIntent.current.up += Math.abs(delta);
                scrollIntent.current.down = 0;
            }

            if (!isControlsCollapsed && scrollIntent.current.down > 56 && currentScrollY > 180) {
                setIsControlsCollapsed(true);
                lastCollapseScrollY.current = currentScrollY;
                toggleCooldownUntil.current = now + 250;
                scrollIntent.current = { up: 0, down: 0 };
                return;
            }

            if (
                isControlsCollapsed
                && (
                    currentScrollY <= 96
                    || (
                        scrollIntent.current.up > 88
                        && currentScrollY < lastCollapseScrollY.current - 64
                    )
                )
            ) {
                setIsControlsCollapsed(false);
                toggleCooldownUntil.current = now + 250;
                scrollIntent.current = { up: 0, down: 0 };
            }
        };

        lastScrollY.current = window.scrollY;
        window.addEventListener('scroll', handleScroll, { passive: true });

        return () => window.removeEventListener('scroll', handleScroll);
    }, [isControlsCollapsed]);

    const resetOverscrollGesture = () => {
        touchGesture.current = {
            startY: 0,
            direction: null,
            distance: 0,
            canPrevious: false,
            canNext: false
        };
        setOverscrollGesture({ direction: null, distance: 0 });
    };

    const handleTouchStart = event => {
        if (
            loading
            || error
            || activeRequests.current > 0
            || event.touches.length !== 1
        ) {
            resetOverscrollGesture();
            return;
        }

        const headerHeight = headerRef.current?.getBoundingClientRect().height || 0;
        const listTop = listRef.current?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY;
        const atTop = listTop >= headerHeight - 4;
        const atBottom = window.innerHeight + window.scrollY
            >= document.documentElement.scrollHeight - 4;
        touchGesture.current = {
            startY: event.touches[0].clientY,
            direction: null,
            distance: 0,
            canPrevious: atTop && hasPreviousPage,
            canNext: atBottom && hasNextPage
        };
    };

    const handleTouchMove = event => {
        const gesture = touchGesture.current;
        if (event.touches.length !== 1) return;

        const delta = event.touches[0].clientY - gesture.startY;
        if (!gesture.direction) {
            if (delta > 0 && gesture.canPrevious) gesture.direction = 'previous';
            if (delta < 0 && gesture.canNext) gesture.direction = 'next';
        }
        if (!gesture.direction) return;

        const distance = gesture.direction === 'previous' ? delta : -delta;
        if (distance <= 0) {
            gesture.distance = 0;
            setOverscrollGesture({ direction: gesture.direction, distance: 0 });
            return;
        }

        event.preventDefault();
        gesture.distance = Math.min(OVERSCROLL_THRESHOLD * 1.5, distance);
        setOverscrollGesture({ direction: gesture.direction, distance: gesture.distance });
    };

    const handleTouchEnd = () => {
        const { direction, distance } = touchGesture.current;
        resetOverscrollGesture();
        if (distance < OVERSCROLL_THRESHOLD || activeRequests.current > 0) return;
        vibrateClick();
        if (direction === 'previous') navigatePrevious();
        if (direction === 'next') navigateNext();
    };

    const overscrollReady = overscrollGesture.distance >= OVERSCROLL_THRESHOLD;
    const overscrollProgress = Math.min(1, overscrollGesture.distance / OVERSCROLL_THRESHOLD);
    const displayFields = runtime.participantUi.displayFields || ['status'];
    const showParticipantStatus = displayFields.includes('status');
    const showParticipantEmail = displayFields.includes('email');
    const showParticipantReference = displayFields.includes('reference');
    const showParticipantOptions = displayFields.includes('options');
    const referenceLabel = participantReferenceField === 'external_identifier' ? 'Ref' : 'ID';
    const [detailParticipant, setDetailParticipant] = useState(null);

    const openCheckoutForParticipant = participant => {
        if (!participant?.contact_id || !participant?.id) {
            return;
        }
        navigate(`/event/${eventId}/add/${participant.contact_id}/checkout?participantId=${participant.id}`);
    };

    return (
        <div className="h-full flex flex-col">
            {/* Header / Stats */}
            <div ref={headerRef} className="sticky top-0 z-10 bg-base-100 p-3 shadow-sm sm:p-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <h1 className="text-xl font-bold sm:text-2xl">{t('participantList.title')}</h1>
                        <p className="text-sm text-base-content/70 sm:text-base">
                            {stats.checkedIn} / {stats.total} {t('participantList.checkedIn')}
                        </p>
                    </div>
                    {/* Action Buttons: Hide if ReadOnly */}
                    <div className="flex shrink-0 justify-end gap-2 self-start">
                        {((!isClosed && hasCapability('closeEvent')) || (isClosed && hasCapability('reopenEvent'))) && (
                            <button
                                type="button"
                                onClick={openClosurePrompt}
                                disabled={changingClosure}
                                className={`btn btn-circle btn-sm sm:btn-md ${isClosed ? 'btn-success' : 'btn-error'}`}
                                title={isClosed ? t('participantList.reopenEvent') : t('participantList.closeEvent')}
                            >
                                {changingClosure
                                    ? <span className="loading loading-spinner loading-sm"></span>
                                    : isClosed ? <LockOpen size={22} /> : <Lock size={22} />}
                            </button>
                        )}
                        {!isReadOnly && (
                            <>
                                {canAddParticipant && <Link to={`/event/${eventId}/add`} className="btn btn-secondary btn-circle btn-sm sm:btn-md">
                                    <UserPlus size={20} />
                                </Link>}
                                {hasCapability('scan') && <Link to={`/event/${eventId}/scan`} className="btn btn-primary btn-circle btn-sm sm:btn-md">
                                    <QrCode size={20} />
                                </Link>}
                            </>
                        )}
                        {isReadOnly && (
                            <div className="flex items-center gap-2 px-3 py-1 bg-warning/20 text-warning rounded-full border border-warning/50">
                                <Lock size={16} />
                                <span className="text-xs font-bold whitespace-nowrap">
                                    {isClosed ? t('participantList.eventClosed') : t('settings.accessReadOnly')}
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {closurePrompt.open && (
                    <div className="mb-3 rounded-2xl border border-base-300 bg-base-200/70 p-3 shadow-sm">
                        <p className="text-sm font-semibold text-base-content">
                            {closurePrompt.nextClosed ? t('participantList.closeEvent') : t('participantList.reopenEvent')}
                        </p>
                        <p className="mt-1 text-sm text-base-content/70">
                            {closurePrompt.nextClosed ? t('participantList.confirmClose') : t('participantList.confirmReopen')}
                        </p>
                        {closurePrompt.nextClosed && (
                            <label className="mt-3 flex items-start gap-3 rounded-xl border border-base-300 bg-base-100 px-3 py-2">
                                <input
                                    type="checkbox"
                                    className="checkbox checkbox-sm checkbox-warning mt-0.5"
                                    checked={closurePrompt.markRegisteredAsNoShow}
                                    onChange={event => setClosurePrompt(current => ({
                                        ...current,
                                        markRegisteredAsNoShow: event.target.checked
                                    }))}
                                />
                                <span className="text-sm text-base-content/80">
                                    {t('participantList.noShowOption')}
                                </span>
                            </label>
                        )}
                        <div className="mt-3 flex justify-end gap-2">
                            <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={closeClosurePrompt}
                                disabled={changingClosure}
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                type="button"
                                className={`btn btn-sm ${closurePrompt.nextClosed ? 'btn-error' : 'btn-success'}`}
                                onClick={confirmClosureChange}
                                disabled={changingClosure}
                            >
                                {changingClosure
                                    ? <span className="loading loading-spinner loading-sm"></span>
                                    : t('common.confirm')}
                            </button>
                        </div>
                    </div>
                )}

                {/* Search & Filter */}
                <div
                    className={`overflow-hidden transition-all duration-200 ease-out ${
                        isControlsCollapsed ? 'max-h-0 opacity-0 -mt-1 pointer-events-none' : 'max-h-[32rem] opacity-100 mt-0'
                    }`}
                    aria-hidden={isControlsCollapsed}
                >
                    <div className="flex flex-col gap-2.5 pt-0.5">
                        {eventDetails && (
                            <div className="space-y-1 text-xs text-base-content/60">
                                {eventDetails.title && (
                                    <p className="text-sm font-semibold leading-tight text-base-content break-words">{eventDetails.title}</p>
                                )}
                                <div className="flex flex-wrap gap-x-3 gap-y-1">
                                    {formatEventDate(eventDetails.start_date) && (
                                        <span className="inline-flex items-center gap-1">
                                            <Calendar size={12} />
                                            {formatEventDate(eventDetails.start_date)}
                                        </span>
                                    )}
                                    {formatEventTimeRange(eventDetails.start_date, eventDetails.end_date) && (
                                        <span className="inline-flex items-center gap-1">
                                            <Clock3 size={12} />
                                            {formatEventTimeRange(eventDetails.start_date, eventDetails.end_date)}
                                        </span>
                                    )}
                                </div>
                                {buildEventLocation(eventDetails) && (
                                    <p className="inline-flex items-start gap-1 leading-snug">
                                        <MapPin size={12} className="mt-0.5 shrink-0" />
                                        <span className="break-words">{buildEventLocation(eventDetails)}</span>
                                    </p>
                                )}
                            </div>
                        )}

                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-base-content/50" size={18} />
                            <input
                                type="text"
                                placeholder={t('participantList.searchPlaceholder')}
                                className="input input-bordered input-sm h-11 w-full pl-10 sm:input-md sm:h-12"
                                value={searchInput}
                                onChange={(e) => setSearchInput(e.target.value)}
                            />
                        </div>

                        <div className="grid grid-cols-3 gap-2 w-full">
                            <button
                                className={`btn btn-sm h-10 w-full text-xs sm:text-sm ${filter === 'all' ? 'btn-neutral' : 'btn-ghost'}`}
                                onClick={() => { setFilter('all'); setPage(1); }}
                            >
                                {t('common.all')}
                            </button>
                            <button
                                className={`btn btn-sm h-10 w-full gap-1 text-xs sm:text-sm ${filter === 'checked-in' ? 'btn-success' : 'btn-ghost text-success'}`}
                                onClick={() => { setFilter('checked-in'); setPage(1); }}
                            >
                                <CheckCircle size={14} /> {t('participantList.filterCheckedIn')}
                            </button>
                            <button
                                className={`btn btn-sm h-10 w-full gap-1 text-xs sm:text-sm ${filter === 'pending' ? 'btn-warning' : 'btn-ghost text-warning'}`}
                                onClick={() => { setFilter('pending'); setPage(1); }}
                            >
                                <RefreshCw size={14} /> {t('participantList.filterPending')}
                            </button>
                        </div>

                        {showAlphabetFilter && (
                            <div
                                ref={alphabetRef}
                                className="civiscan-alphabet-carousel"
                                aria-label={t('participantList.alphabeticalIndex')}
                            >
                                <button
                                    type="button"
                                    data-alphabet-group="all"
                                    className={`btn btn-sm snap-center shrink-0 ${alphabetGroup === '' ? 'btn-primary' : 'btn-ghost'}`}
                                    onClick={() => selectAlphabetGroup('')}
                                >
                                    {t('participantList.allLetters')}
                                </button>
                                {availableAlphabetGroups.map(value => (
                                    <button
                                        type="button"
                                        key={value}
                                        data-alphabet-group={value}
                                        className={`btn btn-sm snap-center shrink-0 ${alphabetGroup === value ? 'btn-primary' : 'btn-ghost'}`}
                                        onClick={() => selectAlphabetGroup(value)}
                                    >
                                        {value}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* List */}
            <div
                ref={listRef}
                className="flex-1 w-full box-border space-y-3 px-1 pb-20 pt-3 sm:p-4 sm:pb-24"
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onTouchCancel={resetOverscrollGesture}
            >
                {overscrollGesture.direction && overscrollGesture.distance > 0 && (
                    <div
                        className={`fixed left-1/2 -translate-x-1/2 z-50 pointer-events-none transition-colors ${
                            overscrollGesture.direction === 'previous' ? 'top-20' : 'bottom-20'
                        }`}
                    >
                        <div
                            className={`flex max-w-[min(20rem,calc(100vw-2rem))] items-center gap-2 rounded-2xl px-3 py-2 text-center text-xs font-medium leading-tight shadow-lg sm:text-sm ${
                                overscrollReady
                                    ? 'bg-primary text-primary-content'
                                    : 'bg-neutral text-neutral-content'
                            }`}
                            style={{ opacity: 0.65 + (overscrollProgress * 0.35) }}
                        >
                            {overscrollGesture.direction === 'previous'
                                ? <ChevronLeft size={18} className="shrink-0 rotate-90" />
                                : <ChevronRight size={18} className="shrink-0 rotate-90" />}
                            <span className="min-w-0 break-words">
                                {overscrollReady
                                    ? t('participantList.releaseToNavigate')
                                    : t(
                                        overscrollGesture.direction === 'previous'
                                            ? 'participantList.pullPrevious'
                                            : 'participantList.pullNext'
                                    )}
                            </span>
                        </div>
                    </div>
                )}
                {loading ? (
                    <div className="flex justify-center py-8">
                        <span className="loading loading-spinner loading-lg text-primary"></span>
                    </div>
                ) : error ? (
                    <div className="alert alert-error">
                        <span>{error}</span>
                    </div>
                ) : participants.length === 0 ? (
                    <div className="text-center py-10 opacity-50">
                        {t('participantList.noParticipants')}
                    </div>
                ) : (
                    participants.map(participant => (
                        <div
                            key={participant.id}
                            className="card bg-base-100 shadow-sm border border-base-200 cursor-pointer transition-all hover:border-primary/40 hover:shadow-md active:scale-[0.99]"
                            onClick={() => setDetailParticipant(participant)}
                        >
                            <div className="card-body p-4 flex flex-row items-center justify-between gap-4">
                                <div className="min-w-0 flex-1 text-left">
                                    <h3 className="font-bold truncate text-base-content">{participant.display_name}</h3>
                                    {showParticipantEmail && participant.email && (
                                        <p className="text-xs text-base-content/60 truncate">{participant.email}</p>
                                    )}
                                    <div className="flex items-center gap-2 mt-1">
                                        {showParticipantStatus && (
                                            <span className={`badge badge-xs ${participant.status_id === 2 ? 'badge-success' : 'badge-warning'}`}>
                                                {participant.status_label || (participant.status_id === 2 ? t('status.attended') : t('status.registered'))}
                                            </span>
                                        )}
                                        {showParticipantReference && (
                                            <span className="text-[10px] opacity-50">
                                                {referenceLabel}: {participantReferenceField === 'external_identifier'
                                                    ? participant.external_identifier || '-'
                                                    : participant.id}
                                            </span>
                                        )}
                                        {participant.civiscan_checkout?.canResume && (
                                            <span className="badge badge-xs badge-info">
                                                {t('participantList.resumePayment')}
                                            </span>
                                        )}
                                    </div>
                                    {showParticipantOptions && (participant.civiscan_option_summary || []).length > 0 && (
                                        <div className="mt-2 flex flex-wrap gap-1">
                                            {participant.civiscan_option_summary.map((option) => (
                                                <span key={option} className="badge badge-outline badge-sm">
                                                    {option}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div className="flex shrink-0 flex-col gap-2 items-end" onClick={(event) => event.stopPropagation()}>
                                    {checkoutEnabled && participant.civiscan_checkout?.canResume && canAddParticipant && !isReadOnly && (
                                        <button
                                            type="button"
                                            className="btn btn-info btn-xs sm:btn-sm"
                                            onClick={() => openCheckoutForParticipant(participant)}
                                        >
                                            {t('participantList.resumePayment')}
                                        </button>
                                    )}
                                    {!isReadOnly && (participant.status_id !== 2 || hasCapability('uncheck')) && (
                                        <button
                                            onClick={() => handleCheckIn(participant.id, participant.status_id)}
                                            className={`btn btn-circle btn-sm ${participant.status_id === 2 ? 'btn-ghost text-success hover:btn-error hover:text-white' : 'btn-primary'}`}
                                            title={participant.status_id === 2 ? t('participantList.uncheck') : t('participantList.checkIn')}
                                        >
                                            {participant.status_id === 2 ? <CheckCircle size={24} /> : <CheckCircle size={20} />}
                                        </button>
                                    )}
                                    {isReadOnly && (
                                        <div className="opacity-50 self-end">
                                            {participant.status_id === 2 ? <CheckCircle size={24} className="text-success" /> : <RefreshCw size={20} className="text-gray-400" />}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))
                )}
                {loadingMore && (
                    <div className="flex justify-center py-4">
                        <span className="loading loading-spinner loading-md text-primary"></span>
                    </div>
                )}
                {/* Participant Detail Modal */}
                {detailParticipant && (
                    <div className="modal modal-open">
                        <div className="modal-box max-w-md p-6">
                            <h3 className="font-bold text-xl mb-1 text-base-content">{detailParticipant.display_name}</h3>
                            {detailParticipant.email && (
                                <p className="text-sm text-base-content/60 mb-3">{detailParticipant.email}</p>
                            )}

                            <div className="divider my-2"></div>

                            <div className="space-y-3 text-left">
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-base-content/70">Statut</span>
                                    <span className={`badge ${detailParticipant.status_id === 2 ? 'badge-success' : 'badge-warning'}`}>
                                        {detailParticipant.status_label || (detailParticipant.status_id === 2 ? t('status.attended') : t('status.registered'))}
                                    </span>
                                </div>

                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-base-content/70">{referenceLabel}</span>
                                    <span className="font-mono text-xs">
                                        {participantReferenceField === 'external_identifier'
                                            ? detailParticipant.external_identifier || '-'
                                            : `#${detailParticipant.id}`}
                                    </span>
                                </div>

                                <div className="mt-4">
                                    <p className="text-xs font-semibold uppercase tracking-wider text-base-content/50 mb-2">
                                        Options & Formules
                                    </p>
                                    {(detailParticipant.civiscan_option_summary || []).length > 0 ? (
                                        <div className="flex flex-wrap gap-1.5">
                                            {detailParticipant.civiscan_option_summary.map((option) => (
                                                <span key={option} className="badge badge-outline badge-md">
                                                    {option}
                                                </span>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-xs text-base-content/50 italic">Aucune option spécifique</p>
                                    )}
                                </div>
                            </div>

                            <div className="modal-action flex-col gap-2 mt-6">
                                {checkoutEnabled && canAddParticipant && !isReadOnly && (detailParticipant.civiscan_checkout?.canResume || detailParticipant.civiscan_checkout?.requiresCheckout || (paymentsActive && detailParticipant.status_id !== 2)) && (
                                    <button
                                        type="button"
                                        className="btn btn-primary w-full"
                                        onClick={() => {
                                            const p = detailParticipant;
                                            setDetailParticipant(null);
                                            openCheckoutForParticipant(p);
                                        }}
                                    >
                                        {detailParticipant.civiscan_checkout?.canResume ? t('participantList.resumePayment') : t('participantList.openCheckout')}
                                    </button>
                                )}
                                {checkoutEnabled && canAddParticipant && !isReadOnly && !detailParticipant.civiscan_checkout?.canResume && !detailParticipant.civiscan_checkout?.requiresCheckout && detailParticipant.status_id === 2 && (
                                    <button
                                        type="button"
                                        className="btn btn-outline btn-sm w-full opacity-70 hover:opacity-100"
                                        onClick={() => {
                                            const p = detailParticipant;
                                            setDetailParticipant(null);
                                            openCheckoutForParticipant(p);
                                        }}
                                    >
                                        {t('participantList.viewOptions')}
                                    </button>
                                )}
                                {!isReadOnly && (
                                    <button
                                        type="button"
                                        className={`btn w-full ${detailParticipant.status_id === 2 ? 'btn-outline btn-warning' : 'btn-primary'}`}
                                        onClick={async () => {
                                            const p = detailParticipant;
                                            await handleCheckIn(p.id, p.status_id);
                                            setDetailParticipant(null);
                                        }}
                                    >
                                        {detailParticipant.status_id === 2 ? t('participantList.uncheck') : t('participantList.checkIn')}
                                    </button>
                                )}
                                <button
                                    type="button"
                                    className="btn btn-ghost w-full"
                                    onClick={() => setDetailParticipant(null)}
                                >
                                    Fermer
                                </button>
                            </div>
                        </div>
                        <div className="modal-backdrop" onClick={() => setDetailParticipant(null)}></div>
                    </div>
                )}
                {!loading && !error && totalPages > 1 && (
                    <div className="flex items-center justify-between pt-3">
                        <button
                            type="button"
                            className="btn btn-sm btn-outline"
                            disabled={!hasPreviousPage}
                            onClick={navigatePrevious}
                        >
                            <ChevronLeft size={18} /> {t('participantList.previous')}
                        </button>
                        <span className="text-sm opacity-70">{alphabetGroup || t('participantList.allLetters')}</span>
                        <button
                            type="button"
                            className="btn btn-sm btn-outline"
                            disabled={!hasNextPage}
                            onClick={navigateNext}
                        >
                            {t('participantList.next')} <ChevronRight size={18} />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ParticipantList;
