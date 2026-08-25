/**
 * CiviScan Offline Storage Engine
 * Utilise l'API native IndexedDB du navigateur (sans dépendance externe).
 */

const DB_NAME = 'civiscan_offline_db';
const DB_VERSION = 2;

const STORES = {
    PARTICIPANTS: 'cached_participants',
    EVENTS: 'cached_events',
    SYNC_QUEUE: 'sync_queue',
};

let dbPromise = null;

const openDatabase = () => {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
        if (typeof window === 'undefined' || !window.indexedDB) {
            reject(new Error('IndexedDB non disponible sur cet appareil.'));
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;

            // 1. Store des participants mis en cache
            if (!db.objectStoreNames.contains(STORES.PARTICIPANTS)) {
                const participantStore = db.createObjectStore(STORES.PARTICIPANTS, { keyPath: 'cache_key' });
                participantStore.createIndex('eventId', 'eventId', { unique: false });
                participantStore.createIndex('barcode', 'barcode', { unique: false });
                participantStore.createIndex('participantId', 'participantId', { unique: false });
            }

            // 2. Store des événements
            if (!db.objectStoreNames.contains(STORES.EVENTS)) {
                db.createObjectStore(STORES.EVENTS, { keyPath: 'id' });
            }

            // 3. File d'attente de synchronisation (Sync Queue)
            if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
                const queueStore = db.createObjectStore(STORES.SYNC_QUEUE, { keyPath: 'queue_id' });
                queueStore.createIndex('eventId', 'eventId', { unique: false });
                queueStore.createIndex('createdAt', 'createdAt', { unique: false });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });

    return dbPromise;
};

/**
 * Sauvegarde la liste des événements dans IndexedDB pour le mode avion
 */
export const saveEventsSnapshot = async (eventsList) => {
    if (!Array.isArray(eventsList)) return;
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORES.EVENTS], 'readwrite');
        const store = tx.objectStore(STORES.EVENTS);

        for (const ev of eventsList) {
            if (ev?.id) {
                store.put({
                    id: Number(ev.id),
                    ...ev,
                    cachedAt: Date.now(),
                });
            }
        }

        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
    });
};

/**
 * Récupère les événements mis en cache hors-ligne
 */
export const getCachedEvents = async () => {
    try {
        const db = await openDatabase();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([STORES.EVENTS], 'readonly');
            const store = tx.objectStore(STORES.EVENTS);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    } catch {
        return [];
    }
};

/**
 * Sauvegarde la liste complète des participants d'un événement dans IndexedDB
 */
export const saveParticipantsSnapshot = async (eventId, participantsList) => {
    if (!Array.isArray(participantsList)) return;
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORES.PARTICIPANTS], 'readwrite');
        const store = tx.objectStore(STORES.PARTICIPANTS);

        for (const item of participantsList) {
            const pId = Number(item.id || 0);
            const cId = Number(item.contact_id || 0);
            const barcode = String(item.ticket_code || item.civiscan_ticket_code || item.barcode || '').trim();
            const key = `${eventId}_${pId}_${cId}`;

            store.put({
                cache_key: key,
                eventId: Number(eventId),
                participantId: pId,
                contactId: cId,
                displayName: item['contact_id.display_name'] || item.display_name || 'Participant',
                statusId: Number(item.status_id || 1),
                barcode: barcode,
                raw: item,
                cachedAt: Date.now(),
            });
        }

        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
    });
};

/**
 * Recherche stricte d'un participant dans le cache local (par code billet ou ID participant de l'événement)
 */
export const findParticipantInCache = async (eventId, queryCode) => {
    const db = await openDatabase();
    const cleanCode = String(queryCode || '').trim();
    if (!cleanCode) return null;

    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORES.PARTICIPANTS], 'readonly');
        const store = tx.objectStore(STORES.PARTICIPANTS);
        const index = store.index('eventId');
        const request = index.getAll(Number(eventId));

        request.onsuccess = () => {
            const list = request.result || [];
            const match = list.find((p) => {
                // Match exact par code-barres / billet
                if (p.barcode && p.barcode.toLowerCase() === cleanCode.toLowerCase()) return true;
                // Match par participant_id numérique
                if (String(p.participantId) === cleanCode) return true;
                // Match par champ raw de billet
                if (p.raw?.civiscan_ticket_code && p.raw.civiscan_ticket_code === cleanCode) return true;
                return false;
            });
            resolve(match || null);
        };

        request.onerror = () => reject(request.error);
    });
};

/**
 * Met à jour le statut d'un participant dans le cache local
 */
export const updateParticipantInCache = async (eventId, participantId, statusId) => {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORES.PARTICIPANTS], 'readwrite');
        const store = tx.objectStore(STORES.PARTICIPANTS);
        const index = store.index('eventId');
        const request = index.getAll(Number(eventId));

        request.onsuccess = () => {
            const list = request.result || [];
            const target = list.find((p) => Number(p.participantId) === Number(participantId));
            if (target) {
                target.statusId = Number(statusId);
                target.updatedLocallyAt = Date.now();
                store.put(target);
            }
            resolve(target || null);
        };

        request.onerror = () => reject(request.error);
    });
};

/**
 * Ajoute une action de scan dans la file d'attente de synchronisation
 */
export const enqueueOfflineScan = async ({ eventId, participantId, contactId, scannedAt, action = 'checkin', payload = {} }) => {
    const db = await openDatabase();
    const queueItem = {
        queue_id: `scan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        eventId: Number(eventId),
        participantId: Number(participantId),
        contactId: Number(contactId),
        scannedAt: scannedAt || new Date().toISOString(),
        action,
        payload,
        createdAt: Date.now(),
        attempts: 0,
    };

    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORES.SYNC_QUEUE], 'readwrite');
        const store = tx.objectStore(STORES.SYNC_QUEUE);
        const request = store.add(queueItem);

        request.onsuccess = () => resolve(queueItem);
        request.onerror = () => reject(request.error);
    });
};

/**
 * Récupère tous les éléments en attente dans la file de synchro
 */
export const getPendingSyncQueue = async () => {
    try {
        const db = await openDatabase();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([STORES.SYNC_QUEUE], 'readonly');
            const store = tx.objectStore(STORES.SYNC_QUEUE);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    } catch {
        return [];
    }
};

/**
 * Supprime un élément synchronisé de la file d'attente
 */
export const removePendingSyncItem = async (queueId) => {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORES.SYNC_QUEUE], 'readwrite');
        const store = tx.objectStore(STORES.SYNC_QUEUE);
        const request = store.delete(queueId);

        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
    });
};

/**
 * Compte le nombre d'éléments en attente de synchronisation
 */
export const countPendingSyncItems = async () => {
    try {
        const db = await openDatabase();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([STORES.SYNC_QUEUE], 'readonly');
            const store = tx.objectStore(STORES.SYNC_QUEUE);
            const request = store.count();

            request.onsuccess = () => resolve(request.result || 0);
            request.onerror = () => reject(request.error);
        });
    } catch {
        return 0;
    }
};

// Aliases pour compatibilité syncEngine
export const getSyncQueue = getPendingSyncQueue;
export const removeSyncQueueItem = removePendingSyncItem;
export const getPendingSyncCount = countPendingSyncItems;

