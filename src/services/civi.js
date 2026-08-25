import axios from 'axios';
import { isSessionMode, runtime } from '../runtime';

const STORAGE_KEYS = {
    URL: 'civi_url',
    API_KEY: 'civi_api_key',
    GRACE_PERIOD: 'civi_grace_period',
    SHOW_PAST_EVENTS: 'civi_show_past_events',
    SORT_ORDER: 'civi_sort_order',
    SOUND_ENABLED: 'civi_sound_enabled',
    HAPTIC_ENABLED: 'civi_haptic_enabled',
    AUTO_VALIDATE: 'civi_auto_validate',
};

const extractApiErrorMessage = (error) => {
    const responseData = error?.response?.data;
    if (typeof responseData === 'string' && responseData.trim()) {
        return responseData.trim();
    }

    const candidates = [
        responseData?.message,
        responseData?.error_message,
        responseData?.error,
        responseData?.values?.message,
        responseData?.values?.error_message,
        responseData?.values?.error,
        error?.message,
    ];

    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim()) {
            return candidate.trim();
        }
    }

    return 'common.error';
};

export const hasValidConfig = () => {
    if (isSessionMode) return true;
    const magicToken = localStorage.getItem('civi_magic_token');
    if (magicToken) return true;
    const url = localStorage.getItem(STORAGE_KEYS.URL);
    const apiKey = localStorage.getItem(STORAGE_KEYS.API_KEY);
    return Boolean(url && apiKey);
};

export const getSettings = () => ({
    url: localStorage.getItem(STORAGE_KEYS.URL) || '',
    apiKey: localStorage.getItem(STORAGE_KEYS.API_KEY) || '',
    gracePeriod: parseInt(import.meta.env.VITE_GRACE_PERIOD || '30', 10),
    showPastEvents: import.meta.env.VITE_SHOW_PAST_EVENTS === 'true',
    sortOrder: localStorage.getItem(STORAGE_KEYS.SORT_ORDER) || 'name_asc',
    soundEnabled: localStorage.getItem(STORAGE_KEYS.SOUND_ENABLED) !== 'false',
    hapticEnabled: localStorage.getItem(STORAGE_KEYS.HAPTIC_ENABLED) !== 'false',
    autoValidate: localStorage.getItem(STORAGE_KEYS.AUTO_VALIDATE) === 'true',
    isConfigLocked: isSessionMode || localStorage.getItem('civi_config_locked') === 'true',
    authMode: runtime.authMode,
});

export const saveSettings = (url, apiKey, gracePeriod = 30, showPastEvents = false, sortOrder = 'name_asc') => {
    if (!isSessionMode) {
        localStorage.setItem(STORAGE_KEYS.URL, url);
        localStorage.setItem(STORAGE_KEYS.API_KEY, apiKey);
    }
    localStorage.setItem(STORAGE_KEYS.GRACE_PERIOD, gracePeriod);
    localStorage.setItem(STORAGE_KEYS.SHOW_PAST_EVENTS, showPastEvents);
    localStorage.setItem(STORAGE_KEYS.SORT_ORDER, sortOrder);
};

export const savePreferences = ({ soundEnabled, hapticEnabled, autoValidate, sortOrder }) => {
    if (soundEnabled !== undefined) localStorage.setItem(STORAGE_KEYS.SOUND_ENABLED, String(soundEnabled));
    if (hapticEnabled !== undefined) localStorage.setItem(STORAGE_KEYS.HAPTIC_ENABLED, String(hapticEnabled));
    if (autoValidate !== undefined) localStorage.setItem(STORAGE_KEYS.AUTO_VALIDATE, String(autoValidate));
    if (sortOrder !== undefined) localStorage.setItem(STORAGE_KEYS.SORT_ORDER, sortOrder);
};

export const clearSettings = () => {
    localStorage.removeItem(STORAGE_KEYS.URL);
    localStorage.removeItem(STORAGE_KEYS.API_KEY);
    localStorage.removeItem('civi_config_locked');
};

export const logout = () => {
    localStorage.removeItem(STORAGE_KEYS.URL);
    localStorage.removeItem(STORAGE_KEYS.API_KEY);
    localStorage.removeItem(STORAGE_KEYS.GRACE_PERIOD);
    localStorage.removeItem(STORAGE_KEYS.SHOW_PAST_EVENTS);
    localStorage.removeItem(STORAGE_KEYS.SORT_ORDER);
    localStorage.removeItem('civi_config_locked');
};

import { jwtDecode } from "jwt-decode";

// Helper to get OAuth token from localStorage (managed by oidc-client-ts)
const getOAuthToken = () => {
    // Runtime Config Priority
    const authority = window.CIVI_CONFIG?.oauthAuthority || import.meta.env.VITE_OAUTH_AUTHORITY;
    const clientId = window.CIVI_CONFIG?.oauthClientId || import.meta.env.VITE_OAUTH_CLIENT_ID;

    if (authority && clientId) {
        const key = `oidc.user:${authority}:${clientId}`;
        const stored = localStorage.getItem(key);
        if (stored) {
            try {
                const user = JSON.parse(stored);
                if (user?.access_token && !user.expired) {
                    return user.access_token;
                }
            } catch {
                // Ignore
            }
        }
    }

    // 2. Magic Link Token (Injected via URL)
    const magicToken = localStorage.getItem('civi_magic_token');
    if (magicToken) {
        try {
            const payload = jwtDecode(magicToken);

            // Check Expiry (exp is in seconds)
            if (payload.exp && Date.now() >= payload.exp * 1000) {
                console.warn("Magic Token Expired");
                localStorage.removeItem('civi_magic_token');
                return null;
            }

            return magicToken;
        } catch (e) {
            console.error("Invalid Magic Token", e);
            // If it's invalid, maybe we shouldn't remove it immediately to allow retry?
            // But usually invalid JWT means it's garbage.
            return null;
        }
    }

    return null;
};

const getClient = () => {
    if (isSessionMode) {
        return axios.create({
            withCredentials: true,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-Requested-With': 'XMLHttpRequest'
            }
        });
    }

    // 1. Try OAuth Token first
    const oauthToken = getOAuthToken();
    if (oauthToken) {
        // If it's a Magic Token, we might need a default Base URL if not configured
        // But usually, if they use Magic Token, they assume the same domain or configured OAuth Authority
        const storedUrl = localStorage.getItem('civi_url');
        const baseURL = storedUrl || window.CIVI_CONFIG?.oauthAuthority || import.meta.env.VITE_OAUTH_AUTHORITY || (typeof window !== 'undefined' && window.location.origin.startsWith('http') ? window.location.origin : 'https://civicrm.cou.re');

        return axios.create({
            baseURL,
            headers: {
                'Authorization': `Bearer ${oauthToken}`, // Standard OAuth header
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-Requested-With': 'XMLHttpRequest'
            }
        });
    }

    // 2. Fallback to API Key
    const { url, apiKey } = getSettings();
    if (!url || !apiKey) return null;
    const cleanUrl = url.replace(/\/+$/, '');

    return axios.create({
        baseURL: cleanUrl,
        headers: {
            'Authorization': `Bearer ${apiKey.trim()}`,
            'X-Civi-Auth': `Bearer ${apiKey.trim()}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Requested-With': 'XMLHttpRequest'
        }
    });
};

const createParamsBody = (params) => {
    const body = new URLSearchParams();
    body.append('params', JSON.stringify(params));
    return body;
};

const executeDirectApi4 = async (client, entity, action, params) => {
    // 1. Simulation transparente des entités custom CiviScan pour les CiviCRM sans extension
    if (entity === 'CiviScanParticipant' && action === 'search') {
        const { eventId, filter, search, page = 1, pageSize = 50, sort = 'name_asc' } = params;
        const where = [
            ['event_id', '=', Number(eventId)],
            ['is_test', '=', false],
        ];
        if (filter === 'checked_in') {
            where.push(['status_id', '=', 2]);
        } else if (filter === 'registered') {
            where.push(['status_id', '=', 1]);
        }
        if (search && String(search).trim()) {
            where.push(['OR', [
                ['contact_id.display_name', 'CONTAINS', String(search).trim()],
                ['contact_id.email_primary.email', 'CONTAINS', String(search).trim()],
            ]]);
        }
        const orderBy = {};
        if (sort === 'name_desc') orderBy['contact_id.sort_name'] = 'DESC';
        else if (sort === 'date_desc') orderBy['register_date'] = 'DESC';
        else orderBy['contact_id.sort_name'] = 'ASC';

        const apiParams = {
            select: [
                'id',
                'contact_id',
                'contact_id.display_name',
                'contact_id.first_name',
                'contact_id.last_name',
                'contact_id.sort_name',
                'contact_id.email_primary.email',
                'contact_id.external_identifier',
                'status_id',
                'status_id:label',
                'role_id',
                'register_date',
            ],
            where,
            orderBy,
            limit: pageSize,
            offset: (page - 1) * pageSize,
        };
        const res = await client.post('/civicrm/ajax/api4/Participant/get', createParamsBody(apiParams));
        const items = Array.isArray(res.data) ? res.data : (res.data?.values || []);
        return {
            values: {
                items,
                total: items.length,
                totalPages: 1,
            }
        };
    }

    if (entity === 'CiviScanTicket' && action === 'verify') {
        const { code, eventId } = params;
        const cleanCode = String(code || '').trim();
        const where = [
            ['event_id', '=', Number(eventId)],
            ['is_test', '=', false],
        ];
        if (/^\d+$/.test(cleanCode)) {
            where.push(['id', '=', Number(cleanCode)]);
        } else {
            where.push(['OR', [
                ['contact_id.external_identifier', '=', cleanCode]
            ]]);
        }
        const res = await client.post('/civicrm/ajax/api4/Participant/get', createParamsBody({
            select: [
                'id',
                'contact_id',
                'contact_id.display_name',
                'status_id',
            ],
            where,
            limit: 1,
        }));
        const rawValues = Array.isArray(res.data) ? res.data : (res.data?.values || []);
        return { values: rawValues };
    }

    if (entity === 'CiviScanCheckout') {
        return { values: { event: { isMonetary: false, paymentsEnabled: false } } };
    }

    // 2. Appel standard APIv4 CiviCRM : /civicrm/ajax/api4/[Entity]/[Action]
    const endpoint = `/civicrm/ajax/api4/${entity}/${action}`;
    const response = await client.post(endpoint, createParamsBody(params));
    if (Array.isArray(response.data)) {
        return { values: response.data };
    }
    if (response.data?.values) {
        return { values: response.data.values };
    }
    return response.data;
};

export const civiApi = async (entity, action, params = {}) => {
    const client = getClient();
    if (!client) throw new Error("settings.missing");

    try {
        let response;
        const isCiviScanCustomEntity = entity.startsWith('CiviScan');
        const shouldUseProxy = isSessionMode || runtime.apiUrlTemplate || (isCiviScanCustomEntity && !localStorage.getItem('civi_force_direct_api4'));

        if (shouldUseProxy) {
            try {
                const endpoint = runtime.apiUrlTemplate || '/civicrm/civiscan/api';
                const bodyParams = new URLSearchParams();
                bodyParams.append('apiEntity', entity);
                bodyParams.append('apiAction', action);
                bodyParams.append('params', JSON.stringify(params));
                response = await client.post(endpoint, bodyParams);
            } catch (proxyError) {
                // Fallback direct APIv4 si l'extension CiviScan n'est pas installée sur le serveur distant
                if (!isSessionMode && (proxyError.response?.status === 404 || proxyError.response?.status === 500)) {
                    return await executeDirectApi4(client, entity, action, params);
                }
                throw proxyError;
            }
        } else {
            return await executeDirectApi4(client, entity, action, params);
        }

        // Normalize response
        if (Array.isArray(response.data)) {
            return { values: response.data };
        }
        if (response.data?.values) {
            return { values: response.data.values };
        }

        return response.data;

    } catch (error) {
        console.error("CiviCRM API Error:", error);

        // Dispatch global event for 401 Unauthorized (Token Expired)
        if (error.response && error.response.status === 401) {
            window.dispatchEvent(new CustomEvent('civi:unauthorized'));
        }

        const normalizedError = new Error(extractApiErrorMessage(error));
        normalizedError.response = error.response;
        normalizedError.cause = error;
        throw normalizedError;
    }
};

export const checkConnection = async (url, apiKey) => {
    if (!url || !apiKey) return false;
    const cleanUrl = url.trim().replace(/\/+$/, '');
    const cleanKey = apiKey.trim();

    try {
        const client = axios.create({
            baseURL: cleanUrl,
            headers: {
                'Authorization': `Bearer ${cleanKey}`,
                'X-Civi-Auth': `Bearer ${cleanKey}`,
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-Requested-With': 'XMLHttpRequest'
            }
        });
        const body = new URLSearchParams();
        body.append('params', JSON.stringify({ select: ["id"], limit: 1 }));
        await client.post('/civicrm/ajax/api4/Contact/get', body);
        return true;
    } catch (e) {
        console.error("CheckConnection error:", e?.response?.data || e?.message);
        return false;
    }
};

export const getCurrentContact = async () => {
    try {
        const result = await civiApi('Contact', 'get', {
            select: ["display_name", "email_primary.email"],
            where: [["id", "=", "user_contact_id"]],
            limit: 1
        });
        return result.values ? result.values[0] : (result[0] || null);
    } catch {
        return null;
    }
};

/**
 * Validates a magic token by making a test API call.
 * Uses a temporary client instance to avoid messing with global state.
 */
export const validateToken = async (token, baseURL) => {
    if (!baseURL) baseURL = window.CIVI_CONFIG?.oauthAuthority || import.meta.env.VITE_OAUTH_AUTHORITY || window.location.origin;

    try {
        const client = axios.create({
            baseURL,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-Requested-With': 'XMLHttpRequest'
            }
        });

        const body = new URLSearchParams();
        // Use Contact.get with limit 1 as a simple "ping"
        // This confirms the user exists and has API access
        body.append('params', JSON.stringify({ select: ["id"], limit: 1 }));

        await client.post('/civicrm/ajax/api4/Contact/get', body);
        return true;
    } catch (e) {
        console.error("Token Validation Failed", e);
        if (e.response) {
            console.error("Error Details:", e.response.data); // Log the CiviCRM error message

            // Check for Cloudflare Ray ID or WAF rules
            if (e.response.headers) {
                const rayId = e.response.headers['cf-ray'];
                if (rayId) {
                    console.warn(`🛑 Cloudflare Ray ID: ${rayId} - Check your WAF logs!`);
                }
            }

            if (e.response.status === 403) return "permission_denied";
            if (e.response.status === 401) return "unauthorized";
        }
        return "connection_error";
    }
};
