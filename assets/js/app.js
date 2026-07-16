/**
 * Vereinsverwaltung – App-Einstieg
 */

import {
  APP_CONFIG
} from './config.js';

import {
  apiGet,
  getTenant
} from './api.js';

import {
  registerRoute,
  startRouter,
  navigate,
  getCurrentRoute
} from './router.js';

import {
  loadStore,
  refreshStore,
  getStoreSnapshot,
  getAllEvents,
  getAllLists,
  getAllEntries
} from './store.js';

import {
  renderOverviewPage
} from './events.js';

import {
  renderAdminPage
} from './admin.js';

import {
  renderPointsPage
} from './points.js';

const elements = {
  app:
    document.getElementById('app'),
  content:
    document.getElementById('pageContent'),
  pageTitle:
    document.getElementById('pageTitle'),
  pageDescription:
    document.getElementById('pageDescription'),
  tenantName:
    document.getElementById('tenantName'),
  connection:
    document.getElementById('connectionStatus'),
  mobileMenuButton:
    document.getElementById('mobileMenuButton'),
  sidebar:
    document.getElementById('sidebar'),
  overlay:
    document.getElementById('sidebarOverlay')
};

document.addEventListener(
  'DOMContentLoaded',
  initialize
);

async function initialize() {
  bindNavigation();
  registerRoutes();
  startRouter();

  setConnection(
    'checking',
    'Verbindung wird geprüft'
  );

  renderInitialLoadingNotice();

  try {
    await loadStore();

    applyTenantConfiguration();

    setConnection(
      'online',
      'Verbunden'
    );

    await renderCurrentPage();

    refreshInBackground();
  } catch (error) {
    setConnection(
      'offline',
      'Keine Verbindung'
    );

    renderError(error);
  }
}

function bindNavigation() {
  document
    .querySelectorAll(
      '[data-route-link]'
    )
    .forEach(link => {
      link.addEventListener(
        'click',
        event => {
          event.preventDefault();

          navigate(
            link.dataset.routeLink
          );

          closeMobileNavigation();
        }
      );
    });

  elements.mobileMenuButton
    .addEventListener(
      'click',
      toggleMobileNavigation
    );

  elements.overlay
    .addEventListener(
      'click',
      closeMobileNavigation
    );
}

function registerRoutes() {
  registerRoute(
    'dashboard',
    renderDashboard
  );

  registerRoute(
    'overview',
    () =>
      renderOverviewPage({
        contentElement:
          elements.content,
        setPageHeading
      })
  );

  registerRoute(
    'mine',
    () =>
      renderPointsPage({
        contentElement: elements.content,
        setPageHeading
      })
  );

  registerRoute(
    'points',
    () =>
      renderPointsPage({
        contentElement:
          elements.content,
        setPageHeading
      })
  );

  registerRoute(
    'archive',
    () =>
      renderPlaceholder(
        'Archiv',
        'Archivierte Veranstaltungen werden hier angezeigt.'
      )
  );

  registerRoute(
    'admin',
    () =>
      renderAdminPage({
        contentElement:
          elements.content,
        setPageHeading
      })
  );

}

async function renderCurrentPage() {
  const route =
    getCurrentRoute();

  if (
    route === 'overview'
  ) {
    return renderOverviewPage({
      contentElement:
        elements.content,
      setPageHeading
    });
  }

  if (
    route === 'admin'
  ) {
    return renderAdminPage({
      contentElement:
        elements.content,
      setPageHeading
    });
  }

  if (
    route === 'mine'
  ) {
    return renderPointsPage({
      contentElement: elements.content,
      setPageHeading
    });
  }

  if (
    route === 'points'
  ) {
    return renderPointsPage({
      contentElement:
        elements.content,
      setPageHeading
    });
  }

  if (
    route === 'archive'
  ) {
    return renderPlaceholder(
      'Archiv',
      'Archivierte Veranstaltungen werden hier angezeigt.'
    );
  }

  return renderDashboard();
}

async function refreshInBackground() {
  try {
    await refreshStore();

    applyTenantConfiguration();

    if (
      getCurrentRoute() ===
      'dashboard'
    ) {
      renderDashboard();
    }
  } catch (error) {
    console.warn(
      'Hintergrundaktualisierung fehlgeschlagen.',
      error
    );
  }
}

function applyTenantConfiguration() {
  const snapshot =
    getStoreSnapshot();

  const data =
    snapshot.frontendData || {};

  const settings =
    data.einstellungen || {};

  const tenantName =
    data.einrichtungsname ||
    settings.seitentitel ||
    getTenant();

  elements.tenantName.textContent =
    tenantName;

  document.title =
    tenantName +
    ' – ' +
    APP_CONFIG.appName;

  const primaryColor =
    String(
      settings.hauptfarbe || ''
    ).trim();

  if (
    /^#[0-9a-fA-F]{6}$/.test(
      primaryColor
    )
  ) {
    document.documentElement
      .style
      .setProperty(
        '--color-primary',
        primaryColor
      );
  }

  const mineLink = document.querySelector('[data-route-link="mine"]');
  if (mineLink) mineLink.hidden = settings.punkteAktiv !== true;
  const separatePointsLink = document.querySelector('[data-route-link="points"]');
  if (separatePointsLink) separatePointsLink.hidden = true;
  document.querySelectorAll('[data-points-only]').forEach(element => {
    if (element !== separatePointsLink) element.hidden = settings.punkteAktiv !== true;
  });
}

function renderDashboard() {
  const snapshot =
    getStoreSnapshot();

  const data =
    snapshot.frontendData;

  setPageHeading(
    'Dashboard',
    'Alles Wichtige auf einen Blick'
  );

  if (!data) {
    renderInitialLoadingNotice();
    return;
  }

  const events =
    getAllEvents();

  const lists =
    getAllLists();

  const entries =
    getAllEntries();

  const nextEvent =
    events
      .filter(event =>
        event.startdatum
      )
      .sort(
        (a, b) =>
          parseDate(
            a.startdatum
          ) -
          parseDate(
            b.startdatum
          )
      )[0];

  elements.content.innerHTML = `
    <section class="info-banner">
      <span class="info-banner-icon">i</span>
      <div>
        <strong>Daten werden geladen und aktualisiert.</strong>
        <span>
          Dies kann beim ersten Öffnen einen kleinen Moment dauern.
        </span>
      </div>
    </section>

    <section class="hero-card">
      <div>
        <span class="eyebrow">
          Aktuelles Vereinsjahr
        </span>

        <h2>
          ${escapeHtml(
            data.vereinsjahr &&
            (
              data.vereinsjahr.bezeichnung ||
              data.vereinsjahr.startText
            )
              ? (
                  data.vereinsjahr.bezeichnung ||
                  data.vereinsjahr.startText
                )
              : 'Aktueller Zeitraum'
          )}
        </h2>

        <p>
          ${nextEvent
            ? 'Nächste Veranstaltung: ' +
              escapeHtml(nextEvent.titel) +
              ' am ' +
              escapeHtml(nextEvent.startdatum)
            : 'Aktuell ist keine kommende Veranstaltung hinterlegt.'}
        </p>
      </div>

      <div class="hero-status">
        <span class="status-dot"></span>
        System bereit
      </div>
    </section>

    <section class="metric-grid">
      ${metricCard(
        'Veranstaltungen',
        events.length,
        'Aktuell hinterlegt'
      )}

      ${metricCard(
        'Einsätze und Listen',
        lists.length,
        'Zugeordnete Aufgaben'
      )}

      ${metricCard(
        'Eintragungen',
        entries.length,
        'Aktuelle Teilnahmen'
      )}

      ${metricCard(
        'Kategorien',
        snapshot.categories.length,
        'Individuell verwaltbar'
      )}
    </section>
  `;
}

function renderInitialLoadingNotice() {
  setPageHeading(
    'Dashboard',
    'Alles Wichtige auf einen Blick'
  );

  elements.content.innerHTML = `
    <section class="info-banner">
      <span class="info-banner-icon">i</span>
      <div>
        <strong>Daten werden geladen.</strong>
        <span>
          Dies kann einen kleinen Moment dauern.
        </span>
      </div>
    </section>

    <section class="panel-card">
      <div class="skeleton skeleton-title"></div>
      <div class="skeleton"></div>
      <div class="skeleton skeleton-short"></div>
    </section>
  `;
}

function renderPlaceholder(
  title,
  description
) {
  setPageHeading(
    title,
    description
  );

  elements.content.innerHTML = `
    <section class="empty-state">
      <div class="empty-icon">◌</div>
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(description)}</p>
      <span class="badge">
        Modul wird aufgebaut
      </span>
    </section>
  `;
}

function renderError(error) {
  setPageHeading(
    'Verbindungsproblem',
    'Das Backend konnte nicht geladen werden'
  );

  elements.content.innerHTML = `
    <section class="error-card">
      <span class="eyebrow">
        Technischer Hinweis
      </span>

      <h2>
        Die Daten konnten nicht geladen werden
      </h2>

      <p>
        ${escapeHtml(
          error &&
          error.message
            ? error.message
            : 'Unbekannter Fehler'
        )}
      </p>

      <button
        class="button button-primary"
        id="retryButton"
      >
        Erneut versuchen
      </button>
    </section>
  `;

  document
    .getElementById(
      'retryButton'
    )
    .addEventListener(
      'click',
      () =>
        window.location.reload()
    );
}

function metricCard(
  label,
  value,
  detail
) {
  return `
    <article class="metric-card">
      <span class="metric-label">
        ${escapeHtml(label)}
      </span>

      <strong>
        ${escapeHtml(value)}
      </strong>

      <span class="metric-detail">
        ${escapeHtml(detail)}
      </span>
    </article>
  `;
}

function setPageHeading(
  title,
  description
) {
  elements.pageTitle.textContent =
    title;

  elements.pageDescription.textContent =
    description;
}

function setConnection(
  stateName,
  text
) {
  elements.connection.dataset.state =
    stateName;

  elements.connection
    .querySelector(
      'span:last-child'
    )
    .textContent =
    text;
}

function toggleMobileNavigation() {
  const isOpen =
    elements.sidebar
      .classList
      .toggle(
        'is-open'
      );

  elements.overlay.hidden =
    !isOpen;

  elements.mobileMenuButton
    .setAttribute(
      'aria-expanded',
      String(isOpen)
    );
}

function closeMobileNavigation() {
  elements.sidebar
    .classList
    .remove(
      'is-open'
    );

  elements.overlay.hidden =
    true;

  elements.mobileMenuButton
    .setAttribute(
      'aria-expanded',
      'false'
    );
}

function parseDate(value) {
  const match =
    /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(
      String(value || '')
    );

  return match
    ? new Date(
        Number(match[3]),
        Number(match[2]) - 1,
        Number(match[1])
      ).getTime()
    : Number.MAX_SAFE_INTEGER;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
