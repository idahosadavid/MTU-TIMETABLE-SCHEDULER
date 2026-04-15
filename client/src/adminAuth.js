const STORAGE_KEY = 'mtu_admin_key';

export const getAdminKey = () => localStorage.getItem(STORAGE_KEY) || '';

export const setAdminKey = (key) => localStorage.setItem(STORAGE_KEY, key);

export const clearAdminKey = () => localStorage.removeItem(STORAGE_KEY);

export const isAdminAuthenticated = () => Boolean(getAdminKey());

/** Returns headers object to attach to every protected admin API call. */
export const adminHeaders = () => ({
    'x-admin-key': getAdminKey()
});
