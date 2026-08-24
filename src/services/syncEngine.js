/**
 * CiviScan Sync & Reconciliation Engine
 * Gère la détection réseau, la synchronisation en tâche de fond et le snapshotting.
 */

import { civiApi } from './civi';
import {
    saveParticipantsSnapshot,
    getSyncQueue,
    removeSyncQueueItem,
    getPendingSyncCount,
} from './offlineStorage';
import { logger } from './logger';

class SyncEngine {
    constructor() {
        this.isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
        this.isSyncing = false;
        this.listeners = new Set();
        this.syncInterval = null;

        if (typeof window !== 'undefined') {
            window.addEventListener('online', () => this.handleOnlineStatus(true));
            window.addEventListener('offline', () => this.handleOnlineStatus(false));
            // Polling de synchronisation automatique toutes les 15 secondes
            this.syncInterval = setInterval(() => this.processSyncQueue(), 15000);
        }
    }

    subscribe(callback) {
        this.listeners.add(callback);
        this.notify();
        return () => this.listeners.delete(callback);
    }

    async notify() {
        const pendingCount = await getPendingSyncCount();
        const state = {
            isOnline: this.isOnline,
            isSyncing: this.isSyncing,
            pendingCount,
        };
        for (const cb of this.listeners) {
            try {
                cb(state);
            } catch (e) {
                console.warn('Sync listener error:', e);
            }
        }
    }

    handleOnlineStatus(online) {
        this.isOnline = online;
        logger.log('NETWORK_STATUS_CHANGE', `Connectivité réseau : ${online ? 'EN LIGNE 🟢' : 'HORS LIGNE 🟡'}`);
        this.notify();
        if (online) {
            this.processSyncQueue();
        }
    }

    /**
     * Pré-charge en tâche de fond l'instantané des participants d'un événement dans IndexedDB
     */
    async preloadEventSnapshot(eventId) {
        if (!this.isOnline || !eventId) return;

        try {
            const data = await civiApi('CiviScanParticipant', 'search', {
                eventId: Number(eventId),
                limit: 5000,
            });
            const list = data?.values || data || [];
            if (Array.isArray(list) && list.length > 0) {
                await saveParticipantsSnapshot(eventId, list);
                logger.log('OFFLINE_SNAPSHOT_SAVED', `Instantané hors-ligne sauvegardé : ${list.length} participants (Event #${eventId})`);
            }
        } catch (e) {
            logger.warn('OFFLINE_SNAPSHOT_FAIL', `Échec du pré-chargement hors-ligne : ${e.message}`);
        }
    }

    /**
     * Dépile la file d'attente de synchronisation vers CiviCRM
     */
    async processSyncQueue() {
        if (!this.isOnline || this.isSyncing) return;

        const queue = await getSyncQueue();
        if (queue.length === 0) return;

        this.isSyncing = true;
        this.notify();
        logger.log('SYNC_START', `Début de la synchronisation de ${queue.length} scan(s) en attente`);

        for (const item of queue) {
            try {
                if (item.action === 'checkin' && item.participantId > 0) {
                    await civiApi('Participant', 'update', {
                        values: {
                            status_id: 2, // Attended
                        },
                        where: [
                            ['id', '=', item.participantId],
                        ],
                    });
                }
                // Suppression de la queue locale une fois réconcilié
                await removeSyncQueueItem(item.queue_id);
                logger.log('SYNC_ITEM_SUCCESS', `Scan réconcilié avec succès pour le participant #${item.participantId}`);
            } catch (err) {
                logger.error('SYNC_ITEM_ERROR', `Échec de synchro pour #${item.participantId}: ${err.message}`);
                // Si l'erreur est réseau, on arrête la boucle pour réessayer plus tard
                if (!navigator.onLine || err.message?.includes('Network') || err.message?.includes('timeout')) {
                    this.isOnline = false;
                    break;
                }
            }
        }

        this.isSyncing = false;
        this.notify();
    }
}

export const syncEngine = new SyncEngine();
