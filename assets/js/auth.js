/**
 * Vereinsverwaltung – Admin-Sitzungsverwaltung
 */

import {
  apiPost,
  getTenant
} from './api.js';

const STORAGE_KEY_PREFIX =
  'vereinsverwaltung_admin_token_';

export function getStoredToken() {
  return String(
    sessionStorage.getItem(
      getStorageKey()
    ) || ''
  ).trim();
}

export function storeToken(token) {
  const normalized =
    String(token || '').trim();

  if (!normalized) {
    throw new Error(
      'Das Sitzungstoken fehlt.'
    );
  }

  sessionStorage.setItem(
    getStorageKey(),
    normalized
  );
}

export function clearStoredToken() {
  sessionStorage.removeItem(
    getStorageKey()
  );
}

export async function login(password) {
  const result =
    await apiPost(
      'login',
      {
        password:
          String(password || '')
      }
    );

  const token =
    String(
      result && result.token
        ? result.token
        : ''
    ).trim();

  if (!token) {
    throw new Error(
      'Der Login hat kein Sitzungstoken geliefert.'
    );
  }

  storeToken(token);

  return result;
}

export async function validateSession() {
  const token =
    getStoredToken();

  if (!token) {
    return null;
  }

  try {
    return await apiPost(
      'session',
      {},
      token
    );
  } catch (error) {
    clearStoredToken();
    return null;
  }
}

export async function refreshSession() {
  const token =
    getStoredToken();

  if (!token) {
    return null;
  }

  try {
    const result =
      await apiPost(
        'refreshsession',
        {},
        token
      );

    if (
      result &&
      result.token
    ) {
      storeToken(
        result.token
      );
    }

    return result;
  } catch (error) {
    clearStoredToken();
    throw error;
  }
}

export async function logout() {
  const token =
    getStoredToken();

  clearStoredToken();

  if (!token) {
    return;
  }

  try {
    await apiPost(
      'logout',
      {},
      token
    );
  } catch (error) {
    console.warn(
      'Die Sitzung konnte serverseitig nicht beendet werden.',
      error
    );
  }
}

function getStorageKey() {
  return (
    STORAGE_KEY_PREFIX +
    getTenant()
  );
}
