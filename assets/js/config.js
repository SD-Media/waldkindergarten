/**
 * Vereinsverwaltung – Laufzeitkonfiguration
 */

export const APP_CONFIG = Object.freeze({
  appName: 'Vereinsplattform',
  version: '2.4.0',
  basePath: '/vereinsverwaltung/',
  apiUrl:
    'https://script.google.com/macros/s/AKfycbx0a5cuj_fOSzA4HyLlilb1u7C4xZWdUj_KKL3liKgXIXrObYDKeNRak4pz1l7HC_eS/exec',
  requestTimeoutMs: 20000
});

export function resolveAppContext() {
  const params = new URLSearchParams(window.location.search);
  const parameterTenant = normalizeTenantValue_(params.get('tenant'));

  if (parameterTenant) {
    return {
      mode: 'tenant',
      tenant: parameterTenant,
      source: 'query'
    };
  }

  const pathname = decodeURIComponent(window.location.pathname || '/');
  const normalizedBasePath = normalizeBasePath_(APP_CONFIG.basePath);
  const normalizedPath = pathname.replace(/\/+$/, '/') || '/';

  if (
    normalizedPath === normalizedBasePath ||
    normalizedPath === normalizedBasePath.replace(/\/$/, '')
  ) {
    return {
      mode: 'platform',
      tenant: '',
      source: 'path'
    };
  }

  if (normalizedPath.startsWith(normalizedBasePath)) {
    const remainder = normalizedPath
      .slice(normalizedBasePath.length)
      .replace(/^\/+|\/+$/g, '');

    if (remainder && !remainder.includes('/')) {
      const pathTenant = normalizeTenantValue_(remainder);

      if (!pathTenant) {
        throw new Error(
          'Die Einrichtungskennung in der Adresse ist ungültig.'
        );
      }

      return {
        mode: 'tenant',
        tenant: pathTenant,
        source: 'path'
      };
    }
  }

  return {
    mode: 'platform',
    tenant: '',
    source: 'path'
  };
}

export function resolveTenant() {
  return resolveAppContext().tenant;
}

export function createTenantUrl(tenant) {
  const normalizedTenant = normalizeTenantValue_(tenant);

  if (!normalizedTenant) {
    throw new Error('Ungültige Einrichtungskennung.');
  }

  return (
    window.location.origin +
    normalizeBasePath_(APP_CONFIG.basePath) +
    encodeURIComponent(normalizedTenant) +
    '/'
  );
}

function normalizeTenantValue_(value) {
  const tenant = String(value || '').trim().toLowerCase();

  if (!tenant) {
    return '';
  }

  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tenant)
    ? tenant
    : '';
}

function normalizeBasePath_(value) {
  const path = '/' + String(value || '').replace(/^\/+|\/+$/g, '') + '/';
  return path === '//' ? '/' : path;
}
