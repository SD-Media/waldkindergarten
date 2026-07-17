/**
 * Vereinsverwaltung – App-Einstieg
 */

import {
  APP_CONFIG,
  resolveAppContext
} from './config.js';

import {
  renderSuperAdminApp
} from './superadmin.js';

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
  hydrateStoreFromCache,
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

import {
  renderArchivePage
} from './archive.js';

import {
  validateSession
} from './auth.js';

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
    document.getElementById('sidebarOverlay'),
  brandMark:
    document.getElementById('brandMark'),
  topbarCenterLogo:
    document.getElementById('topbarCenterLogo'),
  themeToggleButton:
    document.getElementById('themeToggleButton'),
  tenantQrButton:
    document.getElementById('tenantQrButton'),
  tenantShareButton:
    document.getElementById('tenantShareButton')
};

document.addEventListener(
  'DOMContentLoaded',
  initialize
);

async function initialize() {
  initializeTheme_();
  bindGlobalUtilityButtons_();

  const appContext = resolveAppContext();

  if (appContext.mode === 'platform') {
    await renderSuperAdminApp(elements);
    return;
  }

  bindNavigation();
  bindAdminSessionNavigation();
  hideArchiveNavigation();
  registerRoutes();

  const hasCachedData =
    hydrateStoreFromCache();

  startRouter();

  setConnection(
    hasCachedData
      ? 'online'
      : 'checking',
    hasCachedData
      ? 'Letzter Stand'
      : 'Verbindung wird geprüft'
  );

  if (hasCachedData) {
    applyTenantConfiguration();
    await renderCurrentPage();
  } else {
    renderInitialLoadingNotice();
  }

  try {
    await loadStore({
      force:
        true
    });

    applyTenantConfiguration();

    setConnection(
      'online',
      'Verbunden'
    );

    await renderCurrentPage();

    /*
     * Punkte und weitere vollständige Daten werden erst geladen,
     * nachdem die sichtbare Oberfläche bereits bereitsteht.
     */
    refreshInBackground();
  } catch (error) {
    if (hasCachedData) {
      setConnection(
        'online',
        'Letzter Stand'
      );

      console.warn(
        'Aktualisierung fehlgeschlagen; Cache bleibt sichtbar.',
        error
      );

      return;
    }

    setConnection(
      'offline',
      'Keine Verbindung'
    );

    renderError(error);
  }
}

function bindAdminSessionNavigation() {
  window.addEventListener(
    'admin-session-changed',
    event => {
      setArchiveNavigationVisibility(
        event &&
        event.detail &&
        event.detail.loggedIn ===
          true
      );
    }
  );

  validateSession()
    .then(session =>
      setArchiveNavigationVisibility(
        Boolean(
          session
        )
      )
    )
    .catch(() =>
      hideArchiveNavigation()
    );
}

function hideArchiveNavigation() {
  setArchiveNavigationVisibility(
    false
  );
}

function setArchiveNavigationVisibility(
  visible
) {
  const archiveLink =
    document.querySelector(
      '[data-route-link="archive"]'
    );

  const adminLink =
    document.querySelector(
      '[data-route-link="admin"]'
    );

  if (!archiveLink) {
    return;
  }

  archiveLink.hidden =
    !visible;

  archiveLink.classList.toggle(
    'admin-sub-navigation',
    visible
  );

  if (
    visible &&
    adminLink &&
    adminLink.parentElement
  ) {
    adminLink.insertAdjacentElement(
      'afterend',
      archiveLink
    );
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
      renderArchivePage({
        contentElement:
          elements.content,
        setPageHeading
      })
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
    return renderArchivePage({
      contentElement:
        elements.content,
      setPageHeading
    });
  }

  return renderDashboard();
}

async function refreshInBackground() {
  try {
    await refreshStore();

    applyTenantConfiguration();

    /*
     * Auf der Adminroute darf ein automatisch nachlaufender
     * Hintergrund-Refresh niemals die aktuelle Arbeitsoberfläche
     * vollständig neu aufbauen. Geöffnete Dialoge und Formulare
     * bleiben dadurch unangetastet.
     */
    if (getCurrentRoute() !== 'admin') {
      await renderCurrentPage();
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

  applyTenantLogo_(
    String(settings.logoUrl || settings.logourl || '').trim(),
    tenantName
  );

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
        'Listen',
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

  let loadingNote =
    document.getElementById(
      'headerLoadingNote'
    );

  if (!loadingNote) {
    loadingNote =
      document.createElement(
        'span'
      );

    loadingNote.id =
      'headerLoadingNote';

    loadingNote.className =
      'header-loading-note';

    const heading =
      elements.pageTitle
        .closest(
          '.page-heading'
        );

    if (heading) {
      heading.appendChild(
        loadingNote
      );
    }
  }

  loadingNote.textContent =
    'Das Laden der Daten kann einen Moment dauern.';
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


function initializeTheme_() {
  const stored = String(localStorage.getItem('vereinsverwaltung_theme') || 'light');
  document.documentElement.dataset.theme = stored === 'dark' ? 'dark' : 'light';
  updateThemeButton_();
}

function bindGlobalUtilityButtons_() {
  if (elements.themeToggleButton) {
    elements.themeToggleButton.addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      localStorage.setItem('vereinsverwaltung_theme', next);
      updateThemeButton_();
    });
  }

  if (elements.tenantShareButton) {
    elements.tenantShareButton.addEventListener('click', shareTenantPage_);
  }

  if (elements.tenantQrButton) {
    elements.tenantQrButton.addEventListener('click', showTenantQrCode_);
  }
}

function updateThemeButton_() {
  if (!elements.themeToggleButton) return;
  const dark = document.documentElement.dataset.theme === 'dark';
  elements.themeToggleButton.textContent = dark ? '☀' : '◐';
  elements.themeToggleButton.title = dark ? 'Hellen Modus aktivieren' : 'Dunklen Modus aktivieren';
}

function getTenantPublicUrl_() {
  return window.location.origin + window.location.pathname.replace(/\/$/, '') + '/#events';
}

async function shareTenantPage_() {
  const url = getTenantPublicUrl_();
  const data = getStoreSnapshot().frontendData || {};
  const title = data.einrichtungsname || 'Veranstaltungen & Listen';
  try {
    if (navigator.share) {
      await navigator.share({ title, text: 'Veranstaltungen & Listen', url });
      return;
    }
    await navigator.clipboard.writeText(url);
    window.alert('Der Link wurde in die Zwischenablage kopiert.');
  } catch (error) {
    if (error && error.name === 'AbortError') return;
    window.prompt('Link kopieren:', url);
  }
}

function showTenantQrCode_() {
  const url = getTenantPublicUrl_();
  const root = document.createElement('div');
  root.className = 'dialog-backdrop global-qr-dialog';
  const qrUrl = 'https://quickchart.io/qr?size=320&margin=2&text=' + encodeURIComponent(url);
  root.innerHTML = `
    <section class="dialog-card qr-dialog-card" role="dialog" aria-modal="true" aria-labelledby="qrDialogTitle">
      <header class="dialog-header">
        <div><span class="eyebrow">Direktlink</span><h2 id="qrDialogTitle">QR-Code zur Einrichtung</h2></div>
        <button class="icon-button" type="button" data-close-qr>×</button>
      </header>
      <div class="qr-code-wrap"><img src="${qrUrl}" alt="QR-Code zur öffentlichen Seite der Einrichtung"></div>
      <p class="qr-url">${escapeGlobalHtml_(url)}</p>
      <div class="dialog-actions">
        <button class="button button-secondary" type="button" data-copy-qr-link>Link kopieren</button>
        <button class="button button-primary" type="button" data-close-qr>Schließen</button>
      </div>
    </section>`;
  document.body.appendChild(root);
  const close = () => root.remove();
  root.querySelectorAll('[data-close-qr]').forEach(button => button.addEventListener('click', close));
  root.querySelector('[data-copy-qr-link]').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(url); window.alert('Link kopiert.'); }
    catch (_) { window.prompt('Link kopieren:', url); }
  });
}

function applyTenantLogo_(logoUrl, tenantName) {
  if (elements.topbarCenterLogo) {
    elements.topbarCenterLogo.hidden = !logoUrl;
    elements.topbarCenterLogo.innerHTML = logoUrl
      ? `<img src="${escapeGlobalHtml_(logoUrl)}" alt="Logo ${escapeGlobalHtml_(tenantName)}">`
      : '';
  }
  if (elements.brandMark) {
    elements.brandMark.innerHTML = logoUrl
      ? `<img src="${escapeGlobalHtml_(logoUrl)}" alt="">`
      : escapeGlobalHtml_(String(tenantName || 'V').slice(0, 1).toUpperCase());
  }
}

function escapeGlobalHtml_(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
