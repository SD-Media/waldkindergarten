/**
 * Vereinsverwaltung – API-Client
 */

import {
  APP_CONFIG,
  resolveTenant
} from './config.js';

const tenant = resolveTenant();

export class ApiError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = options.status || 0;
    this.action = options.action || '';
    this.cause = options.cause;
  }
}

export function getTenant() {
  return tenant;
}

export async function apiGet(
  action,
  params = {},
  requestOptions = {}
) {
  const maximumAttempts =
    Number(
      requestOptions.attempts ||
      3
    );

  const timeoutMs =
    Number(
      requestOptions.timeoutMs ||
      APP_CONFIG.requestTimeoutMs
    );

  let lastError;

  for (
    let attempt = 1;
    attempt <= maximumAttempts;
    attempt++
  ) {
    const url =
      new URL(
        APP_CONFIG.apiUrl
      );

    url.searchParams.set(
      'tenant',
      tenant
    );

    url.searchParams.set(
      'action',
      action
    );

    url.searchParams.set(
      '_',
      String(
        Date.now()
      )
    );

    Object.entries(
      params
    ).forEach(
      ([
        key,
        value
      ]) => {
        if (
          value !== undefined &&
          value !== null &&
          value !== ''
        ) {
          url.searchParams.set(
            key,
            String(value)
          );
        }
      }
    );

    try {
      return await requestJson(
        url,
        {
          method:
            'GET',
          cache:
            'no-store'
        },
        action,
        timeoutMs
      );
    } catch (error) {
      lastError =
        error;

      if (
        attempt >=
        maximumAttempts ||
        !isRetryableGetError_(
          error
        )
      ) {
        throw error;
      }

      await waitForApiRetry_(
        attempt === 1
          ? 1200
          : 2500
      );
    }
  }

  throw lastError;
}

export async function apiPost(
  action,
  payload = {},
  token = ''
) {
  const body = {
    action,
    tenant,
    ...payload
  };

  if (token) {
    body.token = token;
  }

  return requestJson(
    APP_CONFIG.apiUrl,
    {
      method: 'POST',
      headers: {
        'Content-Type':
          'text/plain;charset=utf-8'
      },
      body: JSON.stringify(body)
    },
    action,
    APP_CONFIG.requestTimeoutMs
  );
}

/**
 * Entscheidet, ob ein fehlgeschlagener GET-Aufruf wiederholt werden darf.
 *
 * POST-Aufrufe werden bewusst niemals automatisch wiederholt,
 * damit keine doppelten Datensätze entstehen.
 *
 * @param {*} error
 * @return {boolean}
 */
function isRetryableGetError_(error) {
  if (
    !(error instanceof ApiError)
  ) {
    return true;
  }

  if (
    error.status >= 500
  ) {
    return true;
  }

  return (
    error.status === 0
  );
}

/**
 * Wartet vor einem erneuten API-Aufruf.
 *
 * @param {number} milliseconds
 * @return {Promise<void>}
 */
function waitForApiRetry_(
  milliseconds
) {
  return new Promise(
    resolve =>
      window.setTimeout(
        resolve,
        milliseconds
      )
  );
}

async function requestJson(
  url,
  options,
  action,
  timeoutMs
) {
  const controller =
    new AbortController();

  const timeout =
    window.setTimeout(
      () =>
        controller.abort(),
      Number(
        timeoutMs ||
        APP_CONFIG.requestTimeoutMs
      )
    );

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });

    if (!response.ok) {
      throw new ApiError(
        'Der Server hat mit Status ' +
          response.status +
          ' geantwortet.',
        {
          status: response.status,
          action
        }
      );
    }

    let json;

    try {
      json = await response.json();
    } catch (error) {
      throw new ApiError(
        'Die Serverantwort enthält kein gültiges JSON.',
        {
          status: response.status,
          action,
          cause: error
        }
      );
    }

    if (!json || json.success !== true) {
      throw new ApiError(
        json && json.message
          ? json.message
          : 'Die Anfrage ist fehlgeschlagen.',
        {
          status: response.status,
          action
        }
      );
    }

    return json.data;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (error && error.name === 'AbortError') {
      throw new ApiError(
        'Die Anfrage hat zu lange gedauert und wurde abgebrochen.',
        {
          action,
          cause: error
        }
      );
    }

    throw new ApiError(
      'Die Verbindung zur Vereinsverwaltung konnte nicht hergestellt werden.',
      {
        action,
        cause: error
      }
    );
  } finally {
    window.clearTimeout(timeout);
  }
}
