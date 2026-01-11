// API helpers: base URL + authorized fetch, preserving original behavior
const guessApiBaseUrl = () => {
  if (typeof window === 'undefined') {
    return 'http://127.0.0.1:8000';
  }
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:8000`;
};

const cleanBaseUrl = (url) => url.replace(/\/$/, '');

const envApiUrl = import.meta.env.VITE_API_URL?.trim();
export const API_BASE_URL = cleanBaseUrl(envApiUrl || guessApiBaseUrl());

export const makeAuthorizedFetch = (idToken) => {
  return (path, options = {}) => {
    if (!idToken) {
      throw new Error('Missing auth token.');
    }
    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${idToken}`);
    return fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  };
};

export { guessApiBaseUrl, cleanBaseUrl };
