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
  navigate
} from './router.js';

const state = {
  frontendData: null,
  categories: [],
  loading: false,
  error: null
};

const elements = {
  app: document.getElementById('app'),
  content: document.getElementById('pageContent'),
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
  await loadInitialData();
}

function bindNavigation() {
  document
    .querySelectorAll('[data-route-link]')
    .forEach(link => {
      link.addEventListener('click', event => {
        event.preventDefault();
        navigate(link.dataset.routeLink);
        closeMobileNavigation();
      });
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
    'events',
    () => renderPlaceholder(
      'Einsätze',
      'Veranstaltungen, Aufgaben und offene Plätze werden hier dargestellt.'
    )
  );

  registerRoute(
    'mine',
    () => renderPlaceholder(
      'Meine Einsätze',
      'Die persönliche Übersicht wird in einem späteren Schritt angebunden.'
    )
  );

  registerRoute(
    'points',
    () => renderPlaceholder(
      'Punkte',
      'Dieser Bereich erscheint später nur bei aktiviertem Punktesystem.'
    )
  );

  registerRoute(
    'archive',
    () => renderPlaceholder(
      'Archiv',
      'Archivierte Veranstaltungen werden hier später durchsucht und angezeigt.'
    )
  );

  registerRoute(
    'admin',
    () => renderPlaceholder(
      'Administration',
      'Der gemeinsame passwortgeschützte Adminbereich wird hier integriert.'
    )
  );
}

async function loadInitialData() {
  setLoading(true);
  setConnection(
    'checking',
    'Verbindung wird geprüft'
  );

  try {
    const [
      frontendData,
      categories
    ] = await Promise.all([
      apiGet('frontenddata'),
      apiGet('categories')
    ]);

    state.frontendData = frontendData;
    state.categories = Array.isArray(categories)
      ? categories
      : [];
    state.error = null;

    applyTenantConfiguration();
    setConnection('online', 'Verbunden');
    renderDashboard();
  } catch (error) {
    state.error = error;
    setConnection(
      'offline',
      'Keine Verbindung'
    );
    renderError(error);
  } finally {
    setLoading(false);
  }
}

function applyTenantConfiguration() {
  const data = state.frontendData || {};
  const settings = data.einstellungen || {};

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

  updatePointsNavigation(settings);
}

function updatePointsNavigation(settings) {
  const pointsEnabled =
    settings.punkteAktiv === true;

  document
    .querySelectorAll('[data-points-only]')
    .forEach(element => {
      element.hidden = !pointsEnabled;
    });
}

function renderDashboard() {
  setPageHeading(
    'Dashboard',
    'Alles Wichtige auf einen Blick'
  );

  if (!state.frontendData) {
    renderLoadingCard();
    return;
  }

  const data = state.frontendData;
  const counters = data.anzahl || {};
  const period = data.vereinsjahr || {};

  elements.content.innerHTML = `
    <section class="hero-card">
      <div>
        <span class="eyebrow">Aktuelles Vereinsjahr</span>
        <h2>${escapeHtml(
          period.bezeichnung ||
          period.startText ||
          'Aktueller Zeitraum'
        )}</h2>
        <p>
          Die neue Vereinsplattform ist erfolgreich mit dem Backend verbunden.
        </p>
      </div>
      <div class="hero-status">
        <span class="status-dot"></span>
        System bereit
      </div>
    </section>

    <section class="metric-grid" aria-label="Kennzahlen">
      ${metricCard(
        'Veranstaltungen',
        counters.veranstaltungen ?? 0,
        'Kalender'
      )}
      ${metricCard(
        'Listen und Einsätze',
        counters.listen ?? 0,
        'Aufgaben'
      )}
      ${metricCard(
        'Eintragungen',
        counters.eintragungen ?? 0,
        'Teilnahmen'
      )}
      ${metricCard(
        'Kategorien',
        state.categories.length,
        'Individuell verwaltbar'
      )}
    </section>

    <section class="content-grid">
      <article class="panel-card">
        <div class="panel-heading">
          <div>
            <span class="eyebrow">Nächster Schritt</span>
            <h3>Frontend-Grundlage steht</h3>
          </div>
          <span class="badge badge-success">Aktiv</span>
        </div>
        <p>
          Navigation, API-Anbindung, dynamische Mandantenerkennung,
          Fehlerbehandlung und das responsive Grundlayout sind eingerichtet.
        </p>
      </article>

      <article class="panel-card">
        <div class="panel-heading">
          <div>
            <span class="eyebrow">Mandant</span>
            <h3>${escapeHtml(getTenant())}</h3>
          </div>
        </div>
        <p>
          Der Mandant wird über die URL bestimmt und ist nicht mehr fest
          im Anwendungscode verdrahtet.
        </p>
      </article>
    </section>
  `;
}

function renderPlaceholder(title, description) {
  setPageHeading(title, description);

  elements.content.innerHTML = `
    <section class="empty-state">
      <div class="empty-icon" aria-hidden="true">◌</div>
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(description)}</p>
      <span class="badge">Modul wird aufgebaut</span>
    </section>
  `;
}

function renderLoadingCard() {
  elements.content.innerHTML = `
    <section class="panel-card">
      <div class="skeleton skeleton-title"></div>
      <div class="skeleton"></div>
      <div class="skeleton skeleton-short"></div>
    </section>
  `;
}

function renderError(error) {
  setPageHeading(
    'Verbindungsproblem',
    'Das Backend konnte nicht geladen werden'
  );

  elements.content.innerHTML = `
    <section class="error-card" role="alert">
      <span class="eyebrow">Technischer Hinweis</span>
      <h2>Die Daten konnten nicht geladen werden</h2>
      <p>${escapeHtml(
        error && error.message
          ? error.message
          : 'Unbekannter Fehler'
      )}</p>
      <button class="button button-primary" id="retryButton">
        Erneut versuchen
      </button>
    </section>
  `;

  document
    .getElementById('retryButton')
    .addEventListener(
      'click',
      loadInitialData
    );
}

function metricCard(label, value, detail) {
  return `
    <article class="metric-card">
      <span class="metric-label">${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <span class="metric-detail">${escapeHtml(detail)}</span>
    </article>
  `;
}

function setPageHeading(title, description) {
  elements.pageTitle.textContent = title;
  elements.pageDescription.textContent =
    description;
}

function setLoading(loading) {
  state.loading = loading;
  elements.app.classList.toggle(
    'is-loading',
    loading
  );
}

function setConnection(stateName, text) {
  elements.connection.dataset.state =
    stateName;
  elements.connection
    .querySelector('span:last-child')
    .textContent = text;
}

function toggleMobileNavigation() {
  const isOpen =
    elements.sidebar.classList.toggle(
      'is-open'
    );

  elements.overlay.hidden = !isOpen;
  elements.mobileMenuButton.setAttribute(
    'aria-expanded',
    String(isOpen)
  );
}

function closeMobileNavigation() {
  elements.sidebar.classList.remove(
    'is-open'
  );
  elements.overlay.hidden = true;
  elements.mobileMenuButton.setAttribute(
    'aria-expanded',
    'false'
  );
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
