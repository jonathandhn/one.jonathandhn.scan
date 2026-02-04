import axios from 'axios';

const STORAGE_KEYS = {
    URL: 'civi_url',
    API_KEY: 'civi_api_key',
    GRACE_PERIOD: 'civi_grace_period',
    SHOW_PAST_EVENTS: 'civi_show_past_events',
    SORT_ORDER: 'civi_sort_order',
    // Reserved for future OAuth
    // ACCESS_TOKEN: 'civi_access_token',
};

export const getSettings = () => ({
    url: localStorage.getItem(STORAGE_KEYS.URL) || '',
    apiKey: localStorage.getItem(STORAGE_KEYS.API_KEY) || '',
    gracePeriod: parseInt(import.meta.env.VITE_GRACE_PERIOD || '30', 10),
    showPastEvents: import.meta.env.VITE_SHOW_PAST_EVENTS === 'true',
    sortOrder: localStorage.getItem(STORAGE_KEYS.SORT_ORDER) || 'name_asc',
    isConfigLocked: localStorage.getItem('civi_config_locked') === 'true',
});

export const saveSettings = (url, apiKey, gracePeriod = 30, showPastEvents = false, sortOrder = 'name_asc') => {
    localStorage.setItem(STORAGE_KEYS.URL, url);
    localStorage.setItem(STORAGE_KEYS.API_KEY, apiKey);
    localStorage.setItem(STORAGE_KEYS.GRACE_PERIOD, gracePeriod);
    localStorage.setItem(STORAGE_KEYS.SHOW_PAST_EVENTS, showPastEvents);
    localStorage.setItem(STORAGE_KEYS.SORT_ORDER, sortOrder);
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

// Helper to get OAuth token from localStorage (managed by oidc-client-ts)
const getOAuthToken = () => {
    // Runtime Config Priority
    const authority = window.CIVI_CONFIG?.oauthAuthority || import.meta.env.VITE_OAUTH_AUTHORITY;
    const clientId = window.CIVI_CONFIG?.oauthClientId || import.meta.env.VITE_OAUTH_CLIENT_ID;

    if (!authority || !clientId) return null;

    const key = `oidc.user:${authority}:${clientId}`;
    const stored = localStorage.getItem(key);
    if (stored) {
        try {
            const user = JSON.parse(stored);
            if (user?.access_token && !user.expired) {
                return user.access_token;
            }
        } catch (e) {
            // Ignore
        }
    }

    // 2. Magic Link Token (Injected via URL)
    const magicToken = localStorage.getItem('civi_magic_token');
    if (magicToken) {
        try {
            // Simple generic JWT decode (Base64Url decode)
            const base64Url = magicToken.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function (c) {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));

            const payload = JSON.parse(jsonPayload);

            // Check Expiry (exp is in seconds)
            if (payload.exp && Date.now() >= payload.exp * 1000) {
                console.warn("Magic Token Expired");
                localStorage.removeItem('civi_magic_token');
                return null;
            }

            return magicToken;
        } catch (e) {
            console.error("Invalid Magic Token", e);
            return null; // Invalid token
        }
    }

    return null;
};

const getClient = () => {
    // 1. Try OAuth Token first
    const oauthToken = getOAuthToken();
    if (oauthToken) {
        // If it's a Magic Token, we might need a default Base URL if not configured
        // But usually, if they use Magic Token, they assume the same domain or configured OAuth Authority
        const baseURL = window.CIVI_CONFIG?.oauthAuthority || import.meta.env.VITE_OAUTH_AUTHORITY || window.location.origin;

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

    return axios.create({
        baseURL: url,
        headers: {
            'X-Civi-Auth': `Bearer ${apiKey}`, // CiviCRM proprietary header
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Requested-With': 'XMLHttpRequest'
        }
    });
};

export const civiApi = async (entity, action, params = {}) => {
    const client = getClient();
    if (!client) throw new Error("settings.missing");

    try {
        // APIv4: /civicrm/ajax/api4/[Entity]/[Action]
        const endpoint = `/civicrm/ajax/api4/${entity}/${action}`;

        const bodyParams = new URLSearchParams();
        bodyParams.append('params', JSON.stringify(params));

        const response = await client.post(endpoint, bodyParams);

        // Normalize response
        if (Array.isArray(response.data)) {
            return { values: response.data };
        }
        if (response.data.values) {
            return { values: response.data.values };
        }

        return response.data;

    } catch (error) {
        console.error("CiviCRM API Error:", error);
        throw error;
    }
};

export const checkConnection = async (url, apiKey) => {
    try {
        const client = axios.create({
            baseURL: url,
            headers: {
                'X-Civi-Auth': `Bearer ${apiKey}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        const body = new URLSearchParams();
        body.append('params', JSON.stringify({ select: ["id"], limit: 1 }));
        await client.post('/civicrm/ajax/api4/Contact/get', body);
        return true;
    } catch (e) {
        return false;
    }
};

export const getCurrentContact = async () => {
    try {
        // Use civiApi wrapper which handles both OAuth and API Key
        const result = await civiApi('Contact', 'get', {
            select: ["display_name", "email_primary.email"],
            where: [["id", "=", "user_contact_id"]],
            limit: 1
        });
        return result.values ? result.values[0] : (result[0] || null);
    } catch (e) {
        console.error("Failed to fetch current user", e);
        return null;
    }
};
