const STORAGE_KEY = 'mtu_admin_key';

let listeners = [];

const notifyListeners = () => {
  listeners.forEach(cb => cb());
};

export const subscribeToAuthChanges = (callback) => {
  listeners.push(callback);
  return () => {
    listeners = listeners.filter(cb => cb !== callback);
  };
};

export const getAdminKey = () => localStorage.getItem(STORAGE_KEY) || '';

export const setAdminKey = (key) => {
  localStorage.setItem(STORAGE_KEY, key);
  notifyListeners();
};

export const clearAdminKey = () => {
  localStorage.removeItem(STORAGE_KEY);
  notifyListeners();
};

export const isAdminAuthenticated = () => Boolean(getAdminKey());

/** Returns headers object to attach to every protected admin API call. */
export const adminHeaders = () => ({
    'x-admin-key': getAdminKey()
});
