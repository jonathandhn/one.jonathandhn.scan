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

const getClient = () => {
    const { url, apiKey } = getSettings();
    if (!url || !apiKey) return null;

    return axios.create({
        baseURL: url,
        headers: {
            'X-Civi-Auth': `Bearer ${apiKey}`,
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
        const res = await client.post('/civicrm/ajax/api4/Contact/get', body);
        return res.status === 200;
    } catch (e) {
        return false;
    }
};
