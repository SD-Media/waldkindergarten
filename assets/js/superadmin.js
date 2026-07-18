/**
 * Vereinsverwaltung – Superadmin-Oberfläche
 */

import {
  apiPost
} from './api.js';

import {
  createTenantUrl
} from './config.js';

const STORAGE_KEY = 'vereinsverwaltung_superadmin_token';

const tenantViewState = {
  search: '',
  sort: 'name-asc'
};

export async function renderSuperAdminApp(elements) {
  configurePlatformShell_(elements);

  const token = getToken_();

  if (!token) {
    renderLogin_(elements);
    return;
  }

  try {
    await apiPost('superadminsession', {}, token);
    await renderDashboard_(elements, token);
  } catch (error) {
    clearToken_();
    renderLogin_(elements, error.message);
  }
}

function configurePlatformShell_(elements) {
  document.title = 'Superadmin – Vereinsplattform';
  elements.tenantName.textContent = 'Vereinsplattform';
  elements.pageTitle.textContent = 'Superadmin';
  elements.pageDescription.textContent = 'Zentrale Verwaltung aller Einrichtungen';
  elements.sidebar.hidden = true;
  elements.overlay.hidden = true;
  elements.mobileMenuButton.hidden = true;
  if (elements.tenantQrButton) elements.tenantQrButton.hidden = true;
  if (elements.tenantShareButton) elements.tenantShareButton.hidden = true;
  if (elements.topbarCenterLogo) elements.topbarCenterLogo.hidden = true;
  elements.app.classList.add('platform-app');
  elements.connection.dataset.state = 'online';
  elements.connection.lastElementChild.textContent = 'Zentrale Verwaltung';
}

function renderLogin_(elements, errorMessage = '') {
  elements.content.innerHTML = `
    <section class="superadmin-login-shell">
      <div class="superadmin-login-card">
        <div class="superadmin-login-icon" aria-hidden="true">V</div>
        <span class="eyebrow">Vereinsplattform</span>
        <h1>Superadmin-Anmeldung</h1>
        <p>Hier verwalten Sie alle Vereine und Einrichtungen der Plattform.</p>

        <form id="superadminLoginForm" class="admin-login-form">
          <label class="form-field">
            <span>Superadmin-Passwort</span>
            <input
              id="superadminPassword"
              type="password"
              autocomplete="current-password"
              required
              autofocus
            >
          </label>

          <div id="superadminLoginError" class="form-error" ${errorMessage ? '' : 'hidden'}>
            ${escapeHtml_(errorMessage)}
          </div>

          <button class="button button-primary" type="submit">
            Anmelden
          </button>
        </form>
      </div>
    </section>
  `;

  document
    .getElementById('superadminLoginForm')
    .addEventListener('submit', async event => {
      event.preventDefault();

      const form = event.currentTarget;
      const button = form.querySelector('button[type="submit"]');
      const error = document.getElementById('superadminLoginError');
      const password = document.getElementById('superadminPassword').value;

      button.disabled = true;
      button.textContent = 'Anmeldung läuft …';
      error.hidden = true;

      try {
        const result = await apiPost('superadminlogin', { password });
        setToken_(result.token);
        await renderDashboard_(elements, result.token);
      } catch (loginError) {
        error.textContent = loginError.message;
        error.hidden = false;
        button.disabled = false;
        button.textContent = 'Anmelden';
      }
    });
}

async function renderDashboard_(elements, token) {
  const dashboard = await apiPost('superadmintenants', {}, token);
  const tenants = Array.isArray(dashboard) ? dashboard : (dashboard.tenants || []);
  const totals = Array.isArray(dashboard) ? calculateDashboardTotals_(tenants) : (dashboard.totals || calculateDashboardTotals_(tenants));

  elements.content.innerHTML = `
    <section class="superadmin-header-card">
      <div>
        <span class="eyebrow">Zentrale Verwaltung</span>
        <h1>Vereinsplattform</h1>
        <p>${tenants.length} ${tenants.length === 1 ? 'Einrichtung' : 'Einrichtungen'} registriert</p>
      </div>
      <div class="superadmin-header-actions">
        <button id="createMessageButton" class="button button-secondary" type="button">
          Mitteilung verfassen
        </button>
        <button id="createTenantButton" class="button button-primary" type="button">
          Neue Einrichtung
        </button>
        <button id="superadminLogoutButton" class="button button-secondary" type="button">
          Abmelden
        </button>
      </div>
    </section>

    <section class="superadmin-metrics" aria-label="Kennzahlen">
      ${renderMetricCard_(totals.tenants, 'Vereine')}
      ${renderMetricCard_(totals.activeEvents, 'Aktive Veranstaltungen')}
      ${renderMetricCard_(totals.openLists, 'Offene Listen')}
      ${renderMetricCard_(totals.entries, 'Eintragungen')}
    </section>

    <section class="panel-card superadmin-tenant-panel">
      <div class="panel-heading">
        <div>
          <span class="eyebrow">Mandanten</span>
          <h2>Vereine und Einrichtungen</h2>
        </div>
      </div>

      <div class="superadmin-toolbar">
        <label class="superadmin-search-field">
          <span class="sr-only">Vereine durchsuchen</span>
          <input
            id="superadminTenantSearch"
            class="search-input"
            type="search"
            value="${escapeHtml_(tenantViewState.search)}"
            placeholder="Nach Name oder Kennung suchen …"
            autocomplete="off"
          >
        </label>

        <label class="filter-field superadmin-sort-field">
          <span>Sortierung</span>
          <select id="superadminTenantSort">
            ${renderSortOption_('name-asc', 'A–Z')}
            ${renderSortOption_('name-desc', 'Z–A')}
            ${renderSortOption_('newest', 'Neueste zuerst')}
            ${renderSortOption_('oldest', 'Älteste zuerst')}
          </select>
        </label>
      </div>

      <div class="superadmin-result-summary" id="superadminResultSummary"></div>
      <div class="superadmin-tenant-list" id="superadminTenantList"></div>
    </section>

    <section class="panel-card superadmin-message-panel">
      <div class="panel-heading">
        <div><span class="eyebrow">Kommunikation</span><h2>Gesendete Mitteilungen</h2></div>
      </div>
      <div id="superadminMessageList" class="message-history-list">
        <p class="muted">Mitteilungen werden geladen …</p>
      </div>
    </section>

    <div id="superadminDialogRoot"></div>
  `;

  const searchInput = document.getElementById('superadminTenantSearch');
  const sortSelect = document.getElementById('superadminTenantSort');

  const renderTenantList = () => {
    const visibleTenants = filterAndSortTenants_(tenants);
    const list = document.getElementById('superadminTenantList');
    const summary = document.getElementById('superadminResultSummary');

    summary.textContent = tenantViewState.search
      ? `${visibleTenants.length} von ${tenants.length} Einrichtungen gefunden`
      : `${visibleTenants.length} ${visibleTenants.length === 1 ? 'Einrichtung' : 'Einrichtungen'}`;

    list.innerHTML = visibleTenants.length
      ? visibleTenants.map(renderTenantCard_).join('')
      : `<div class="admin-empty-note">Keine passende Einrichtung gefunden.</div>`;

    bindTenantCardActions_(elements, token, tenants);
  };

  searchInput.addEventListener('input', event => {
    tenantViewState.search = event.target.value;
    renderTenantList();
  });

  sortSelect.addEventListener('change', event => {
    tenantViewState.sort = event.target.value;
    renderTenantList();
  });

  renderTenantList();

  document
    .getElementById('createTenantButton')
    .addEventListener('click', () => openCreateDialog_(elements, token));

  document
    .getElementById('createMessageButton')
    .addEventListener('click', () => openMessageDialog_(elements, token, tenants));

  loadSuperadminMessages_(token);

  document
    .getElementById('superadminLogoutButton')
    .addEventListener('click', async () => {
      try {
        await apiPost('superadminlogout', {}, token);
      } finally {
        clearToken_();
        renderLogin_(elements);
      }
    });

}

function bindTenantCardActions_(elements, token, tenants) {
  elements.content.querySelectorAll('[data-open-tenant]').forEach(button => {
    button.addEventListener('click', () => {
      window.location.href = createTenantUrl(button.dataset.openTenant);
    });
  });

  elements.content.querySelectorAll('[data-edit-tenant]').forEach(button => {
    button.addEventListener('click', () => {
      const tenant = tenants.find(item => item.tenant === button.dataset.editTenant);
      openEditDialog_(elements, token, tenant);
    });
  });

  elements.content.querySelectorAll('[data-delete-tenant]').forEach(button => {
    button.addEventListener('click', () => {
      openDeleteDialog_(elements, token, button.dataset.deleteTenant);
    });
  });
}

function filterAndSortTenants_(tenants) {
  const query = String(tenantViewState.search || '').trim().toLocaleLowerCase('de');
  const result = tenants.filter(tenant => {
    if (!query) return true;
    return `${tenant.name || ''} ${tenant.tenant || ''} ${tenant.status || ''}`
      .toLocaleLowerCase('de')
      .includes(query);
  });

  return result.sort((a, b) => {
    if (tenantViewState.sort === 'name-desc') {
      return String(b.name || b.tenant || '').localeCompare(String(a.name || a.tenant || ''), 'de');
    }
    if (tenantViewState.sort === 'newest') {
      return tenantDateValue_(b.createdAt) - tenantDateValue_(a.createdAt);
    }
    if (tenantViewState.sort === 'oldest') {
      return tenantDateValue_(a.createdAt) - tenantDateValue_(b.createdAt);
    }
    return String(a.name || a.tenant || '').localeCompare(String(b.name || b.tenant || ''), 'de');
  });
}

function tenantDateValue_(value) {
  const text = String(value || '').trim();
  const german = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (german) {
    return new Date(Number(german[3]), Number(german[2]) - 1, Number(german[1]), Number(german[4] || 0), Number(german[5] || 0), Number(german[6] || 0)).getTime();
  }
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function renderSortOption_(value, label) {
  return `<option value="${value}" ${tenantViewState.sort === value ? 'selected' : ''}>${label}</option>`;
}

function renderTenantCard_(tenant) {
  const status = String(tenant.status || '').toLowerCase();

  return `
    <article class="superadmin-tenant-card">
      <div class="superadmin-tenant-main">
        <div class="superadmin-tenant-mark" aria-hidden="true">
          ${escapeHtml_(String(tenant.name || tenant.tenant).slice(0, 1).toUpperCase())}
        </div>
        <div>
          <div class="superadmin-tenant-title-row">
            <h3>${escapeHtml_(tenant.name)}</h3>
            <span class="status-badge ${status === 'aktiv' ? 'is-open' : 'is-closed'}">
              ${escapeHtml_(tenant.status)}
            </span>
          </div>
          <p>/${escapeHtml_(tenant.tenant)}/</p>
        </div>
      </div>
      <div class="superadmin-tenant-actions">
        <button class="button button-primary" type="button" data-open-tenant="${escapeHtml_(tenant.tenant)}">
          Öffnen
        </button>
        <button class="button button-secondary" type="button" data-edit-tenant="${escapeHtml_(tenant.tenant)}">
          Bearbeiten
        </button>
        <button class="button button-danger" type="button" data-delete-tenant="${escapeHtml_(tenant.tenant)}">
          Entfernen
        </button>
      </div>
    </article>
  `;
}

function openCreateDialog_(elements, token) {
  renderDialog_(`
    <div class="dialog-header">
      <div><span class="eyebrow">Neue Einrichtung</span><h2>Verein anlegen</h2></div>
      <button class="icon-button" type="button" data-close-dialog>×</button>
    </div>
    <form id="createTenantForm" class="dialog-form">
      <label class="form-field"><span>Einrichtungskennung</span><input name="tenant" placeholder="sportverein-musterstadt" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*"></label>
      <label class="form-field"><span>Name</span><input name="name" required></label>
      <label class="form-field"><span>Adminpasswort</span><input name="password" type="password" minlength="8" required></label>
      <label class="form-field"><span>Logo-URL <small>optional</small></span><input name="logoUrl" type="url" placeholder="https://…/logo.png"></label>
      <div class="form-grid-two">
        <label class="form-field"><span>Starttag Vereinsjahr</span><input name="startTag" type="number" min="1" max="31" value="1" required></label>
        <label class="form-field"><span>Startmonat Vereinsjahr</span><input name="startMonat" type="number" min="1" max="12" value="8" required></label>
      </div>
      <label class="checkbox-field"><input name="punkteAktiv" type="checkbox"><span>Punktesystem aktivieren</span></label>
      <div id="superadminFormError" class="form-error" hidden></div>
      <div class="dialog-actions"><button class="button button-secondary" type="button" data-close-dialog>Abbrechen</button><button class="button button-primary" type="submit">Einrichtung anlegen</button></div>
    </form>
  `);

  document.getElementById('createTenantForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    data.startTag = Number(data.startTag);
    data.startMonat = Number(data.startMonat);
    data.punkteAktiv = form.elements.punkteAktiv.checked;
    await submitDialogAction_(form, async () => {
      await apiPost('superadmincreatetenant', { data }, token);
      closeDialog_();
      await renderDashboard_(elements, token);
    });
  });
}

function openEditDialog_(elements, token, tenant) {
  if (!tenant) return;

  renderDialog_(`
    <div class="dialog-header"><div><span class="eyebrow">Einrichtung</span><h2>Bearbeiten</h2></div><button class="icon-button" type="button" data-close-dialog>×</button></div>
    <form id="editTenantForm" class="dialog-form">
      <input name="originalTenant" type="hidden" value="${escapeHtml_(tenant.tenant)}">
      <label class="form-field"><span>Einrichtungskennung</span><input name="tenant" value="${escapeHtml_(tenant.tenant)}" required></label>
      <label class="form-field"><span>Name</span><input name="name" value="${escapeHtml_(tenant.name)}" required></label>
      <label class="form-field"><span>Google-Sheet-ID</span><input name="sheetId" value="${escapeHtml_(tenant.sheetId)}" required></label>
      <label class="form-field"><span>Logo-URL <small>optional</small></span><input name="logoUrl" type="url" value="${escapeHtml_(tenant.logoUrl || '')}" placeholder="https://…/logo.png"></label>
      <label class="form-field"><span>Neues Adminpasswort <small>optional</small></span><input name="newPassword" type="password" minlength="8" autocomplete="new-password" placeholder="Nur ausfüllen, wenn es geändert werden soll"></label>
      <label class="form-field"><span>Status</span><select name="status">${['aktiv','testbetrieb','gesperrt','archiviert'].map(status => `<option value="${status}" ${tenant.status === status ? 'selected' : ''}>${status}</option>`).join('')}</select></label>
      <div id="superadminFormError" class="form-error" hidden></div>
      <div class="dialog-actions"><button class="button button-secondary" type="button" data-close-dialog>Abbrechen</button><button class="button button-primary" type="submit">Speichern</button></div>
    </form>
  `);

  document.getElementById('editTenantForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    await submitDialogAction_(form, async () => {
      await apiPost('superadminupdatetenant', { data }, token);
      closeDialog_();
      await renderDashboard_(elements, token);
    });
  });
}

function openDeleteDialog_(elements, token, tenant) {
  renderDialog_(`
    <div class="dialog-header"><div><span class="eyebrow">Sicherheitsabfrage</span><h2>Einrichtung entfernen</h2></div><button class="icon-button" type="button" data-close-dialog>×</button></div>
    <form id="deleteTenantForm" class="dialog-form">
      <p>Die zentrale Registrierung wird entfernt. Die zugehörige Google-Tabelle bleibt bestehen.</p>
      <label class="form-field"><span>Zur Bestätigung „${escapeHtml_(tenant)}“ eingeben</span><input name="confirmation" required autocomplete="off"></label>
      <div id="superadminFormError" class="form-error" hidden></div>
      <div class="dialog-actions"><button class="button button-secondary" type="button" data-close-dialog>Abbrechen</button><button class="button button-danger" type="submit">Einrichtung entfernen</button></div>
    </form>
  `);

  document.getElementById('deleteTenantForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    await submitDialogAction_(form, async () => {
      await apiPost('superadmindeletetenant', {
        targetTenant: tenant,
        confirmation: form.elements.confirmation.value
      }, token);
      closeDialog_();
      await renderDashboard_(elements, token);
    });
  });
}


function openMessageDialog_(elements, token, tenants) {
  renderDialog_(`
    <div class="dialog-header">
      <div><span class="eyebrow">Postfach</span><h2>Mitteilung verfassen</h2></div>
      <button class="icon-button" type="button" data-close-dialog>×</button>
    </div>
    <form id="createMessageForm" class="dialog-form">
      <label class="form-field"><span>Empfänger</span><select name="targetTenant">
        <option value="all">Alle Einrichtungen</option>
        ${tenants.map(item => `<option value="${escapeHtml_(item.tenant)}">${escapeHtml_(item.name || item.tenant)}</option>`).join('')}
      </select></label>
      <label class="form-field"><span>Titel</span><input name="title" maxlength="120" required></label>
      <label class="form-field"><span>Nachricht</span><textarea name="message" rows="8" maxlength="5000" required placeholder="Neuigkeiten, Hinweise oder Änderungen …"></textarea></label>
      <div id="superadminFormError" class="form-error" hidden></div>
      <div class="dialog-actions"><button class="button button-secondary" type="button" data-close-dialog>Abbrechen</button><button class="button button-primary" type="submit">Mitteilung veröffentlichen</button></div>
    </form>
  `);

  document.getElementById('createMessageForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    await submitDialogAction_(form, async () => {
      await apiPost('superadmincreatemessage', { data }, token);
      closeDialog_();
      await loadSuperadminMessages_(token);
    });
  });
}

async function loadSuperadminMessages_(token) {
  const root = document.getElementById('superadminMessageList');
  if (!root) return;
  try {
    const messages = await apiPost('superadminmessages', {}, token);
    root.innerHTML = Array.isArray(messages) && messages.length
      ? messages.map(item => `
          <article class="message-history-item">
            <div class="message-history-header">
              <div>
                <strong>${escapeHtml_(item.title)}</strong>
                <span>${escapeHtml_(item.createdAtText || item.createdAt || '')}</span>
              </div>
              <button class="icon-action danger" type="button" title="Mitteilung löschen" aria-label="Mitteilung löschen" data-delete-message="${escapeHtml_(item.id)}">×</button>
            </div>
            <p>${escapeHtml_(item.message).replace(/
/g, '<br>')}</p>
            <small>Empfänger: ${item.targetTenant === 'all' ? 'Alle Einrichtungen' : escapeHtml_(item.targetTenant)}</small>
          </article>`).join('')
      : '<p class="muted">Noch keine Mitteilungen vorhanden.</p>';

    root.querySelectorAll('[data-delete-message]').forEach(button => {
      button.addEventListener('click', async () => {
        const id = String(button.dataset.deleteMessage || '').trim();
        if (!id) return;
        if (!window.confirm('Soll diese Mitteilung wirklich gelöscht werden? Sie verschwindet dann auch aus den Postfächern der Einrichtungen.')) return;
        button.disabled = true;
        try {
          await apiPost('superadmindeletemessage', { id }, token);
          await loadSuperadminMessages_(token);
        } catch (error) {
          window.alert(error.message || 'Die Mitteilung konnte nicht gelöscht werden.');
          button.disabled = false;
        }
      });
    });
  } catch (error) {
    root.innerHTML = `<p class="form-error">${escapeHtml_(error.message || 'Mitteilungen konnten nicht geladen werden.')}</p>`;
  }
}

function renderDialog_(content) {
  const root = document.getElementById('superadminDialogRoot');
  root.innerHTML = `<div class="dialog-backdrop"><section class="dialog-card" role="dialog" aria-modal="true">${content}</section></div>`;
  root.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', closeDialog_));
}

function closeDialog_() {
  const root = document.getElementById('superadminDialogRoot');
  if (root) root.innerHTML = '';
}

async function submitDialogAction_(form, action) {
  const button = form.querySelector('button[type="submit"]');
  const error = form.querySelector('#superadminFormError');
  button.disabled = true;
  error.hidden = true;
  try {
    await action();
  } catch (submitError) {
    error.textContent = submitError.message;
    error.hidden = false;
    button.disabled = false;
  }
}

function calculateDashboardTotals_(tenants) {
  return tenants.reduce((totals, tenant) => {
    totals.tenants += 1;
    totals.activeEvents += Number(tenant.activeEvents || 0);
    totals.openLists += Number(tenant.openLists || 0);
    totals.entries += Number(tenant.entries || 0);
    return totals;
  }, { tenants: 0, activeEvents: 0, openLists: 0, entries: 0 });
}

function renderMetricCard_(value, label) {
  return `<article class="superadmin-metric-card"><strong>${escapeHtml_(value)}</strong><span>${escapeHtml_(label)}</span></article>`;
}

function getToken_() {
  return String(sessionStorage.getItem(STORAGE_KEY) || '').trim();
}

function setToken_(token) {
  sessionStorage.setItem(STORAGE_KEY, String(token || '').trim());
}

function clearToken_() {
  sessionStorage.removeItem(STORAGE_KEY);
}

function escapeHtml_(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
