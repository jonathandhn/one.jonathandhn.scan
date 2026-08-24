import { civiApi } from './civi';
import { logger } from './logger';

/**
 * CiviScan Native Bridge
 * Permet la communication bidirectionnelle entre l'application Web CiviScan
 * et le conteneur mobile React Native (NFC Stripe Tap to Pay, Caméra QR, Haptique).
 */

class NativeBridge {
  constructor() {
    this.isAvailable = typeof window !== 'undefined' && Boolean(window.ReactNativeWebView);
    this.pendingRequests = new Map();
    this.requestIdCounter = 1;
    this.listeners = new Map();

    if (typeof window !== 'undefined') {
      window.addEventListener('message', this._handleNativeMessage.bind(this));
      document.addEventListener('message', this._handleNativeMessage.bind(this));
    }
  }

  /**
   * Indique si l'application tourne dans le conteneur natif React Native
   */
  isNative() {
    return typeof window !== 'undefined' && Boolean(window.ReactNativeWebView);
  }

  /**
   * Envoie une commande RPC au conteneur natif
   */
  async _call(action, payload = {}) {
    if (!this.isNative()) {
      logger.warn('NATIVE_BRIDGE', `Action ${action} ignorée (navigateur standard web).`);
      return { supported: false, error: 'NOT_NATIVE' };
    }

    const id = this.requestIdCounter++;
    const message = { id, action, payload };
    logger.log('NATIVE_BRIDGE_REQ', `[#${id}] ${action}`, payload);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        const err = new Error(`Timeout de réponse pour l'action native : ${action}`);
        logger.error('NATIVE_BRIDGE_TIMEOUT', `[#${id}] ${action}`, err.message);
        reject(err);
      }, 45000); // 45s max pour laisser le temps de poser la carte sans contact

      this.pendingRequests.set(id, { resolve, reject, timeout, action });
      window.ReactNativeWebView.postMessage(JSON.stringify(message));
    });
  }

  /**
   * Réception des réponses et demandes du conteneur natif
   */
  async _handleNativeMessage(event) {
    try {
      const rawData = typeof event.data === 'string' ? event.data : JSON.stringify(event.data);
      const data = JSON.parse(rawData);

      // Réponse à une promesse RPC en attente
      if (data.id && this.pendingRequests.has(data.id)) {
        const { resolve, reject, timeout, action } = this.pendingRequests.get(data.id);
        clearTimeout(timeout);
        this.pendingRequests.delete(data.id);

        if (data.error) {
          logger.error('NATIVE_BRIDGE_RES_ERR', `[#${data.id}] ${action}`, data.error);
          reject(new Error(data.error.message || data.error));
        } else {
          logger.log('NATIVE_BRIDGE_RES_OK', `[#${data.id}] ${action}`, data.result);
          resolve(data.result);
        }
        return;
      }

      // Demande de jeton Stripe émise par le SDK natif
      if (data.event === 'REQUEST_STRIPE_TOKEN') {
        try {
          const res = await civiApi('CiviScanStripeTerminal', 'getConnectionToken');
          const secret = res?.values?.secret || res?.secret;
          if (secret) {
            this._call('PROVIDE_STRIPE_TOKEN', { token: secret });
          }
        } catch (err) {
          console.warn('[NativeBridge] Erreur récupération token CiviCRM:', err);
        }
        return;
      }

      // Événement poussé par le natif
      if (data.event && this.listeners.has(data.event)) {
        this.listeners.get(data.event).forEach((cb) => cb(data.payload));
      }
    } catch {
      // Message non-bridge ignoré
    }
  }

  // --- API Matérielle ---

  /**
   * Récupère les capacités de l'appareil (NFC, Caméra, Haptique)
   */
  async getDeviceInfo() {
    return this._call('GET_DEVICE_INFO');
  }

  /**
   * Déclenche un retour haptique physique sur le téléphone
   * @param {'success' | 'warning' | 'error' | 'light'} type
   */
  async vibrate(type = 'light') {
    return this._call('HAPTIC_FEEDBACK', { type });
  }

  /**
   * Initialise et connecte le lecteur Stripe Tap to Pay
   */
  async initTapToPay(params = {}) {
    return this._call('INIT_TAP_TO_PAY', params);
  }

  /**
   * Déclenche l'encaissement sans contact Tap to Pay
   * @param {Object} params
   * @param {string} params.clientSecret - Secret client du PaymentIntent Stripe généré par CiviCRM PHP
   * @param {string} [params.connectionToken] - Token de connexion Stripe Terminal fourni par CiviCRM
   * @param {string} [params.locationId] - Location ID Stripe fourni par CiviCRM
   * @param {number} [params.amountInCents] - Montant pour affichage/log
   */
  async collectTapToPay({ clientSecret, connectionToken, locationId, amountInCents = 0 }) {
    return this._call('COLLECT_TAP_TO_PAY', { clientSecret, connectionToken, locationId, amountInCents });
  }

  /**
   * Ouvre la caméra native pour un scan QR ultra-rapide 60 FPS
   */
  async scanQrCode() {
    return this._call('SCAN_QR_CODE');
  }
}

export const nativeBridge = new NativeBridge();
