/**
 * Vereinsverwaltung – Administration
 */

import {
  apiPost
} from './api.js';

import {
  getStoredToken,
  login,
  validateSession,
  refreshSession,
  logout
} from './auth.js';

import {
  getStoreSnapshot,
  refreshStore,
  getAllEvents
} from './store.js';

const adminState = {
  session: null,
  refreshTimer: null
};

export async function renderAdminPage(
  options
) {
  const {
    contentElement,
    setPageHeading
  } = options;

  setPageHeading(
    'Administration',
    'Veranstaltungen, Einsätze und Eintragungen verwalten'
  );

  contentElement.innerHTML =
    createAdminLoadingMarkup();

  const session =
    await validateSession();

  if (!session) {
    stopSessionRefresh();

    renderLogin(
      contentElement,
      options
    );

    return;
  }

  adminState.session =
    session;

  startSessionRefresh();

  renderAdminDashboard(
    contentElement,
    options
  );
}

function renderLogin(
  contentElement,
  options
) {
  contentElement.innerHTML = `
    <section class="admin-login-shell">
      <article class="admin-login-card">
        <div class="admin-login-icon">⚙</div>

        <span class="eyebrow">
          Geschützter Bereich
        </span>

        <h2>Administration öffnen</h2>

        <p>
          Verwende das gemeinsame Adminpasswort der Einrichtung.
        </p>

        <form
          id="adminLoginForm"
          class="admin-login-form"
        >
          <label class="form-field">
            <span>Adminpasswort</span>

            <input
              name="password"
              type="password"
              minlength="8"
              required
              autocomplete="current-password"
              placeholder="Passwort eingeben"
            >
          </label>

          <div
            id="adminLoginError"
            class="form-error"
            hidden
          ></div>

          <button
            type="submit"
            class="button button-primary"
          >
            Anmelden
          </button>
        </form>
      </article>
    </section>
  `;

  const form =
    contentElement.querySelector(
      '#adminLoginForm'
    );

  form.elements.password.focus();

  form.addEventListener(
    'submit',
    async event => {
      event.preventDefault();

      const button =
        form.querySelector(
          '[type="submit"]'
        );

      const errorBox =
        form.querySelector(
          '#adminLoginError'
        );

      button.disabled =
        true;

      button.textContent =
        'Anmeldung läuft …';

      errorBox.hidden =
        true;

      try {
        adminState.session =
          await login(
            form.elements.password.value
          );

        startSessionRefresh();

        renderAdminDashboard(
          contentElement,
          options
        );
      } catch (error) {
        errorBox.textContent =
          error &&
          error.message
            ? error.message
            : 'Die Anmeldung ist fehlgeschlagen.';

        errorBox.hidden =
          false;

        button.disabled =
          false;

        button.textContent =
          'Anmelden';
      }
    }
  );
}

function renderAdminDashboard(
  contentElement,
  options
) {
  const snapshot =
    getStoreSnapshot();

  const data =
    snapshot.frontendData;

  if (!data) {
    contentElement.innerHTML =
      createAdminLoadingMarkup();

    return;
  }

  const events =
    getAllEvents()
      .sort(compareEvents);

  const categories =
    snapshot.categories || [];

  const totals =
    calculateAdminTotals(
      events
    );

  contentElement.innerHTML = `
    <section class="admin-hero">
      <div>
        <span class="eyebrow">
          Adminbereich
        </span>

        <h2>
          ${escapeHtml(
            adminState.session &&
            adminState.session.einrichtungsname
              ? adminState.session.einrichtungsname
              : data.einrichtungsname
          )}
        </h2>

        <p>
          Lege zuerst eine Veranstaltung mit den Grunddaten an.
          Anschließend kannst du dieser Veranstaltung Helfereinsätze,
          Schichten, Kuchenlisten, Sachspenden oder weitere Listen zuordnen.
        </p>
      </div>

      <div class="admin-hero-side">
        <div class="admin-overview-box">
          ${adminOverviewItem(
            events.length,
            'Veranstaltungen'
          )}

          ${adminOverviewItem(
            totals.lists,
            'Einsätze / Listen'
          )}

          ${adminOverviewItem(
            categories.length,
            'Kategorien'
          )}
        </div>

        <button
          type="button"
          class="button admin-logout-button"
          id="adminLogoutButton"
        >
          Abmelden
        </button>
      </div>
    </section>

    <section class="admin-primary-actions">
      <button
        type="button"
        class="button button-primary"
        id="createEventButton"
      >
        + Veranstaltung anlegen
      </button>
    </section>

    <section class="admin-event-stack">
      ${events.length
        ? events
            .map(event =>
              renderAdminEventCard(
                event,
                categories,
                data.einstellungen || {}
              )
            )
            .join('')
        : `
          <div class="empty-state compact-empty-state">
            <div class="empty-icon">＋</div>
            <h2>Noch keine Veranstaltung</h2>
            <p>
              Lege zuerst eine Veranstaltung an.
            </p>
          </div>
        `}
    </section>

    <div id="adminDialogRoot"></div>
    <div id="adminToastRoot" class="toast-root"></div>
  `;

  bindAdminActions(
    contentElement,
    options
  );
}

function renderAdminEventCard(
  event,
  categories,
  settings
) {
  const lists =
    (event.listen || [])
      .slice()
      .sort(compareLists);

  const totals =
    calculateListTotals(
      lists
    );

  return `
    <article class="admin-event-card">
      <header
        class="admin-event-card-header"
        data-admin-edit-event="${escapeHtml(event.id)}"
        tabindex="0"
        role="button"
      >
        <div class="admin-event-date">
          ${escapeHtml(
            event.startdatum ||
            'Ohne Datum'
          )}
        </div>

        <div class="admin-event-main">
          <div class="admin-event-title-row">
            <div>
              <span class="event-kicker">
                Veranstaltung
              </span>

              <h3>
                ${escapeHtml(event.titel)}
              </h3>
            </div>

            ${statusBadge(event.status)}
          </div>

          ${event.beschreibung
            ? `
              <p>
                ${escapeHtml(event.beschreibung)}
              </p>
            `
            : ''}

          <div class="admin-event-meta">
            ${event.verantwortlich
              ? adminMeta(
                  'Verantwortlich',
                  event.verantwortlich
                )
              : ''}

            ${adminMeta(
              'Einsätze / Listen',
              lists.length
            )}

            ${adminMeta(
              'Plätze',
              totals.places
            )}

            ${adminMeta(
              'Belegt',
              totals.occupied
            )}

            ${settings.punkteAktiv === true
              ? adminMeta(
                  settings.punkteBezeichnung ||
                    'Punkte',
                  totals.points
                )
              : ''}
          </div>
        </div>

        <div
          class="admin-card-actions"
          onclick="event.stopPropagation()"
        >
          <button
            type="button"
            class="icon-action"
            title="Veranstaltung kopieren"
            data-admin-copy-event="${escapeHtml(event.id)}"
          >
            ⧉
          </button>

          <button
            type="button"
            class="icon-action danger"
            title="Veranstaltung löschen"
            data-admin-delete-event="${escapeHtml(event.id)}"
          >
            ×
          </button>
        </div>
      </header>

      <div class="admin-event-children">
        <div class="admin-child-toolbar">
          <strong>
            Zugeordnete Einsätze und Listen
          </strong>

          <button
            type="button"
            class="button button-secondary"
            data-admin-create-list="${escapeHtml(event.id)}"
          >
            + Einsatz oder Liste
          </button>
        </div>

        ${lists.length
          ? `
            <div class="admin-child-list">
              ${lists
                .map(list =>
                  renderAdminListRow(
                    list,
                    categories,
                    settings
                  )
                )
                .join('')}
            </div>
          `
          : `
            <div class="admin-empty-child">
              Noch kein Einsatz und keine Liste angelegt.
            </div>
          `}
      </div>
    </article>
  `;
}

function renderAdminListRow(
  list,
  categories,
  settings
) {
  const category =
    categories.find(item =>
      item.bezeichnung ===
      list.kategorie
    ) || {
      farbe:
        '#546E7A'
    };

  const entries =
    Array.isArray(
      list.eintragungen
    )
      ? list.eintragungen
      : [];

  return `
    <article class="admin-list-row">
      <div
        class="admin-list-click-area"
        data-admin-edit-list="${escapeHtml(list.id)}"
        tabindex="0"
        role="button"
      >
        <span
          class="admin-list-color"
          style="background:${escapeHtml(category.farbe)}"
        ></span>

        <div class="admin-list-copy">
          <div class="admin-list-title-line">
            <strong>
              ${escapeHtml(list.titel)}
            </strong>

            <span>
              ${escapeHtml(
                list.kategorie ||
                list.typ ||
                'Einsatz'
              )}
            </span>
          </div>

          <div class="admin-list-details">
            ${list.datum
              ? detailText(
                  list.datum
                )
              : ''}

            ${list.uhrzeit
              ? detailText(
                  list.uhrzeit +
                  ' Uhr'
                )
              : ''}

            ${detailText(
              entries.length +
              ' / ' +
              (
                Number(list.anzahl || 0) >
                0
                  ? Number(list.anzahl)
                  : '∞'
              ) +
              ' belegt'
            )}

            ${settings.punkteAktiv === true
              ? detailText(
                  String(
                    list.punkte ?? 0
                  ) +
                  ' ' +
                  (
                    settings.punkteBezeichnung ||
                    'Punkte'
                  )
                )
              : ''}

            ${list.verantwortlich
              ? detailText(
                  'Verantwortlich: ' +
                  list.verantwortlich
                )
              : ''}
          </div>
        </div>
      </div>

      <div class="admin-list-actions">
        <button
          type="button"
          class="icon-action"
          title="Einsatz kopieren"
          data-admin-copy-list="${escapeHtml(list.id)}"
        >
          ⧉
        </button>

        <button
          type="button"
          class="icon-action danger"
          title="Einsatz löschen"
          data-admin-delete-list="${escapeHtml(list.id)}"
        >
          ×
        </button>
      </div>

      ${entries.length
        ? `
          <details class="admin-entry-management">
            <summary>
              Eintragungen verwalten
              <span>
                ${entries.length}
              </span>
            </summary>

            <div class="admin-entry-management-list">
              ${entries
                .map(entry =>
                  renderAdminEntry(entry)
                )
                .join('')}
            </div>
          </details>
        `
        : ''}
    </article>
  `;
}

function renderAdminEntry(entry) {
  return `
    <div class="admin-entry-row">
      <div>
        <strong>
          ${escapeHtml(entry.name)}
        </strong>

        ${entry.beitrag
          ? `
            <span>
              ${escapeHtml(entry.beitrag)}
              ${entry.menge !== '' &&
                entry.menge !== null &&
                entry.menge !== undefined
                ? ' · Menge: ' +
                  escapeHtml(entry.menge)
                : ''}
            </span>
          `
          : ''}

        ${entry.bemerkung
          ? `
            <span class="entry-remark">
              ${escapeHtml(entry.bemerkung)}
            </span>
          `
          : ''}
      </div>

      <button
        type="button"
        class="icon-action danger"
        title="Eintragung löschen"
        data-admin-delete-entry="${escapeHtml(entry.id)}"
      >
        ×
      </button>
    </div>
  `;
}

function bindAdminActions(
  contentElement,
  options
) {
  contentElement
    .querySelector(
      '#adminLogoutButton'
    )
    .addEventListener(
      'click',
      async () => {
        stopSessionRefresh();
        await logout();
        renderLogin(
          contentElement,
          options
        );
      }
    );

  contentElement
    .querySelector(
      '#createEventButton'
    )
    .addEventListener(
      'click',
      () =>
        openEventForm(
          contentElement,
          options,
          null
        )
    );

  bindClickable(
    contentElement,
    '[data-admin-edit-event]',
    element => {
      const event =
        findEvent(
          element.dataset.adminEditEvent
        );

      if (event) {
        openEventForm(
          contentElement,
          options,
          event
        );
      }
    }
  );

  bindClickable(
    contentElement,
    '[data-admin-edit-list]',
    element => {
      const result =
        findList(
          element.dataset.adminEditList
        );

      if (result) {
        openListForm(
          contentElement,
          options,
          result.event,
          result.list
        );
      }
    }
  );

  contentElement
    .querySelectorAll(
      '[data-admin-create-list]'
    )
    .forEach(button => {
      button.addEventListener(
        'click',
        () => {
          const event =
            findEvent(
              button.dataset.adminCreateList
            );

          openListForm(
            contentElement,
            options,
            event,
            null
          );
        }
      );
    });

  contentElement
    .querySelectorAll(
      '[data-admin-delete-entry]'
    )
    .forEach(button => {
      button.addEventListener(
        'click',
        () =>
          deleteEntry(
            contentElement,
            options,
            button.dataset.adminDeleteEntry
          )
      );
    });

  contentElement
    .querySelectorAll(
      '[data-admin-delete-list]'
    )
    .forEach(button => {
      button.addEventListener(
        'click',
        () =>
          deleteList(
            contentElement,
            options,
            button.dataset.adminDeleteList
          )
      );
    });

  contentElement
    .querySelectorAll(
      '[data-admin-delete-event]'
    )
    .forEach(button => {
      button.addEventListener(
        'click',
        () =>
          deleteEvent(
            contentElement,
            options,
            button.dataset.adminDeleteEvent
          )
      );
    });

  contentElement
    .querySelectorAll(
      '[data-admin-copy-list]'
    )
    .forEach(button => {
      button.addEventListener(
        'click',
        () =>
          copyList(
            contentElement,
            options,
            button.dataset.adminCopyList
          )
      );
    });

  contentElement
    .querySelectorAll(
      '[data-admin-copy-event]'
    )
    .forEach(button => {
      button.addEventListener(
        'click',
        () =>
          copyWholeEvent(
            contentElement,
            options,
            button.dataset.adminCopyEvent
          )
      );
    });
}

function openEventForm(
  contentElement,
  options,
  event
) {
  const editing =
    Boolean(event);

  const root =
    contentElement.querySelector(
      '#adminDialogRoot'
    );

  root.innerHTML = `
    <div class="dialog-backdrop">
      <section class="dialog-card">
        <header class="dialog-header">
          <div>
            <span class="eyebrow">
              ${editing
                ? 'Veranstaltung bearbeiten'
                : 'Neue Veranstaltung'}
            </span>

            <h2>
              ${editing
                ? escapeHtml(event.titel)
                : 'Veranstaltung anlegen'}
            </h2>
          </div>

          <button
            type="button"
            class="icon-button"
            data-admin-dialog-close
          >
            ×
          </button>
        </header>

        <form
          id="adminEventForm"
          class="dialog-form"
        >
          <label class="form-field">
            <span>Titel</span>

            <input
              name="titel"
              type="text"
              required
              maxlength="160"
              value="${editing
                ? escapeHtml(event.titel)
                : ''}"
            >
          </label>

          <label class="form-field">
            <span>Beschreibung <small>optional</small></span>

            <textarea
              name="beschreibung"
              rows="3"
              maxlength="1000"
            >${editing
              ? escapeHtml(event.beschreibung)
              : ''}</textarea>
          </label>

          <div class="form-grid-two">
            <label class="form-field">
              <span>Startdatum</span>

              <input
                name="startdatum"
                type="date"
                required
                value="${editing
                  ? germanToIsoDate(
                      event.startdatum
                    )
                  : ''}"
              >
            </label>

            <label class="form-field">
              <span>Enddatum <small>optional</small></span>

              <input
                name="enddatum"
                type="date"
                value="${editing
                  ? germanToIsoDate(
                      event.enddatum
                    )
                  : ''}"
              >
            </label>
          </div>

          <label class="form-field">
            <span>Verantwortliche <small>optional</small></span>

            <input
              name="verantwortlich"
              type="text"
              maxlength="500"
              value="${editing
                ? escapeHtml(event.verantwortlich)
                : ''}"
              placeholder="Zum Beispiel Sabrina Dannenberger, Armin Müller"
            >
          </label>

          <label class="form-field">
            <span>Status</span>

            <select name="status">
              <option
                value="offen"
                ${!editing ||
                  event.status === 'offen'
                  ? 'selected'
                  : ''}
              >
                Offen
              </option>

              <option
                value="geschlossen"
                ${editing &&
                  event.status === 'geschlossen'
                  ? 'selected'
                  : ''}
              >
                Geschlossen
              </option>
            </select>
          </label>

          <div
            id="adminEventError"
            class="form-error"
            hidden
          ></div>

          <div class="dialog-actions">
            <button
              type="button"
              class="button button-secondary"
              data-admin-dialog-close
            >
              Abbrechen
            </button>

            <button
              type="submit"
              class="button button-primary"
            >
              ${editing
                ? 'Änderungen speichern'
                : 'Veranstaltung speichern'}
            </button>
          </div>
        </form>
      </section>
    </div>
  `;

  const form =
    root.querySelector(
      '#adminEventForm'
    );

  let dirty =
    false;

  form.addEventListener(
    'input',
    () => {
      dirty =
        true;
    }
  );

  bindAdminSafeClose(
    root,
    () => dirty
  );

  form.elements.titel.focus();

  form.addEventListener(
    'submit',
    async submitEvent => {
      submitEvent.preventDefault();

      const button =
        form.querySelector(
          '[type="submit"]'
        );

      const errorBox =
        form.querySelector(
          '#adminEventError'
        );

      button.disabled =
        true;

      button.textContent =
        'Wird gespeichert …';

      errorBox.hidden =
        true;

      try {
        const payload = {
          titel:
            form.elements.titel.value.trim(),
          beschreibung:
            form.elements.beschreibung.value.trim(),
          startdatum:
            isoToGermanDate(
              form.elements.startdatum.value
            ),
          enddatum:
            form.elements.enddatum.value
              ? isoToGermanDate(
                  form.elements.enddatum.value
                )
              : '',
          verantwortlich:
            form.elements.verantwortlich.value.trim(),
          status:
            form.elements.status.value,
          sortierung:
            Number(
              event &&
              event.sortierung
                ? event.sortierung
                : 0
            )
        };

        const saved =
          await apiPost(
            editing
              ? 'updateevent'
              : 'createevent',
            editing
              ? {
                  id:
                    event.id,
                  data:
                    payload
                }
              : {
                  data:
                    payload
                },
            getStoredToken()
          );

        dirty =
          false;

        root.innerHTML =
          '';

        await refreshStore();

        if (!editing) {
          const addNow =
            window.confirm(
              'Veranstaltung wurde angelegt. Jetzt direkt den ersten Einsatz oder eine Liste hinzufügen?'
            );

          renderAdminDashboard(
            contentElement,
            options
          );

          if (addNow) {
            const newEvent =
              findEvent(
                saved.id
              );

            if (newEvent) {
              openListForm(
                contentElement,
                options,
                newEvent,
                null
              );
            }
          }
        } else {
          showAdminToast(
            contentElement,
            'Veranstaltung aktualisiert.'
          );

          renderAdminDashboard(
            contentElement,
            options
          );
        }
      } catch (error) {
        errorBox.textContent =
          error &&
          error.message
            ? error.message
            : 'Die Veranstaltung konnte nicht gespeichert werden.';

        errorBox.hidden =
          false;

        button.disabled =
          false;

        button.textContent =
          editing
            ? 'Änderungen speichern'
            : 'Veranstaltung speichern';
      }
    }
  );
}

function openListForm(
  contentElement,
  options,
  event,
  list
) {
  if (!event) {
    return;
  }

  const editing =
    Boolean(list);

  const snapshot =
    getStoreSnapshot();

  const categories =
    snapshot.categories || [];

  const settings =
    snapshot.frontendData
      .einstellungen || {};

  const root =
    contentElement.querySelector(
      '#adminDialogRoot'
    );

  root.innerHTML = `
    <div class="dialog-backdrop">
      <section class="dialog-card">
        <header class="dialog-header">
          <div>
            <span class="eyebrow">
              ${escapeHtml(event.titel)}
            </span>

            <h2>
              ${editing
                ? 'Einsatz oder Liste bearbeiten'
                : 'Einsatz oder Liste anlegen'}
            </h2>
          </div>

          <button
            type="button"
            class="icon-button"
            data-admin-dialog-close
          >
            ×
          </button>
        </header>

        <form
          id="adminListForm"
          class="dialog-form"
        >
          <div class="form-grid-two">
            <label class="form-field">
              <span>Typ</span>

              <select name="typ">
                ${[
                  'Helfereinsatz',
                  'Schicht',
                  'Beitragsliste',
                  'Kuchenliste',
                  'Sachspendenliste'
                ].map(type => `
                  <option
                    value="${type}"
                    ${editing &&
                      list.typ === type
                      ? 'selected'
                      : ''}
                  >
                    ${type}
                  </option>
                `).join('')}
              </select>
            </label>

            <label class="form-field">
              <span>Kategorie</span>

              <select
                name="kategorie"
                required
              >
                ${categories
                  .map(category => `
                    <option
                      value="${escapeHtml(category.bezeichnung)}"
                      ${editing &&
                        list.kategorie ===
                          category.bezeichnung
                        ? 'selected'
                        : ''}
                    >
                      ${escapeHtml(category.bezeichnung)}
                    </option>
                  `)
                  .join('')}
              </select>
            </label>
          </div>

          <label class="form-field">
            <span>Titel</span>

            <input
              name="titel"
              type="text"
              maxlength="160"
              required
              value="${editing
                ? escapeHtml(list.titel)
                : ''}"
            >
          </label>

          <label class="form-field">
            <span>Beschreibung <small>optional</small></span>

            <textarea
              name="beschreibung"
              rows="3"
              maxlength="1000"
            >${editing
              ? escapeHtml(list.beschreibung)
              : ''}</textarea>
          </label>

          <div class="form-grid-three">
            <label class="form-field">
              <span>Datum</span>

              <input
                name="datum"
                type="date"
                value="${editing
                  ? germanToIsoDate(list.datum)
                  : germanToIsoDate(
                      event.startdatum
                    )}"
              >
            </label>

            <label class="form-field">
              <span>Beginn</span>

              <input
                name="beginn"
                type="time"
                value="${editing
                  ? escapeHtml(list.beginn)
                  : ''}"
              >
            </label>

            <label class="form-field">
              <span>Ende</span>

              <input
                name="ende"
                type="time"
                value="${editing
                  ? escapeHtml(list.ende)
                  : ''}"
              >
            </label>
          </div>

          <label class="form-field">
            <span>Verantwortliche</span>

            <input
              name="verantwortlich"
              type="text"
              maxlength="500"
              value="${editing
                ? escapeHtml(list.verantwortlich)
                : escapeHtml(event.verantwortlich)}"
              placeholder="Wird von der Veranstaltung übernommen"
            >
          </label>

          <div class="${
            settings.punkteAktiv === true
              ? 'form-grid-three'
              : 'form-grid-two'
          }">
            <label class="form-field">
              <span>Plätze / benötigte Anzahl</span>

              <input
                name="anzahl"
                type="number"
                min="0"
                step="1"
                value="${editing
                  ? escapeHtml(list.anzahl)
                  : '1'}"
              >
            </label>

            ${settings.punkteAktiv === true
              ? `
                <label class="form-field">
                  <span>
                    ${escapeHtml(
                      settings.punkteBezeichnung ||
                      'Punkte'
                    )}
                  </span>

                  <input
                    name="punkte"
                    type="number"
                    min="0"
                    step="0.5"
                    value="${editing
                      ? escapeHtml(list.punkte)
                      : '0'}"
                  >
                </label>
              `
              : ''}

            <label class="form-field">
              <span>Status</span>

              <select name="status">
                <option
                  value="offen"
                  ${!editing ||
                    list.status === 'offen'
                    ? 'selected'
                    : ''}
                >
                  Offen
                </option>

                <option
                  value="geschlossen"
                  ${editing &&
                    list.status === 'geschlossen'
                    ? 'selected'
                    : ''}
                >
                  Geschlossen
                </option>
              </select>
            </label>
          </div>

          <div
            id="adminListError"
            class="form-error"
            hidden
          ></div>

          <div class="dialog-actions">
            <button
              type="button"
              class="button button-secondary"
              data-admin-dialog-close
            >
              Abbrechen
            </button>

            <button
              type="submit"
              class="button button-primary"
            >
              ${editing
                ? 'Änderungen speichern'
                : 'Einsatz speichern'}
            </button>
          </div>
        </form>
      </section>
    </div>
  `;

  const form =
    root.querySelector(
      '#adminListForm'
    );

  let dirty =
    false;

  form.addEventListener(
    'input',
    () => {
      dirty =
        true;
    }
  );

  bindAdminSafeClose(
    root,
    () => dirty
  );

  form.elements.titel.focus();

  form.addEventListener(
    'submit',
    async submitEvent => {
      submitEvent.preventDefault();

      const button =
        form.querySelector(
          '[type="submit"]'
        );

      const errorBox =
        form.querySelector(
          '#adminListError'
        );

      button.disabled =
        true;

      button.textContent =
        'Wird gespeichert …';

      errorBox.hidden =
        true;

      try {
        const payload = {
          veranstaltungId:
            event.id,
          typ:
            form.elements.typ.value,
          titel:
            form.elements.titel.value.trim(),
          beschreibung:
            form.elements.beschreibung.value.trim(),
          datum:
            form.elements.datum.value
              ? isoToGermanDate(
                  form.elements.datum.value
                )
              : '',
          beginn:
            form.elements.beginn.value,
          ende:
            form.elements.ende.value,
          verantwortlich:
            form.elements.verantwortlich.value.trim(),
          kategorie:
            form.elements.kategorie.value,
          anzahl:
            Number(
              form.elements.anzahl.value ||
              0
            ),
          punkte:
            settings.punkteAktiv === true
              ? Number(
                  form.elements.punkte.value ||
                  0
                )
              : 0,
          status:
            form.elements.status.value,
          sortierung:
            Number(
              editing &&
              list.sortierung
                ? list.sortierung
                : 0
            )
        };

        await apiPost(
          editing
            ? 'updatelist'
            : 'createlist',
          editing
            ? {
                id:
                  list.id,
                data:
                  payload
              }
            : {
                data:
                  payload
              },
          getStoredToken()
        );

        dirty =
          false;

        root.innerHTML =
          '';

        await refreshStore();

        showAdminToast(
          contentElement,
          editing
            ? 'Einsatz aktualisiert.'
            : 'Einsatz erfolgreich angelegt.'
        );

        renderAdminDashboard(
          contentElement,
          options
        );
      } catch (error) {
        errorBox.textContent =
          error &&
          error.message
            ? error.message
            : 'Der Einsatz konnte nicht gespeichert werden.';

        errorBox.hidden =
          false;

        button.disabled =
          false;

        button.textContent =
          editing
            ? 'Änderungen speichern'
            : 'Einsatz speichern';
      }
    }
  );
}

async function deleteEntry(
  contentElement,
  options,
  entryId
) {
  if (
    !window.confirm(
      'Diese Eintragung wirklich löschen?'
    )
  ) {
    return;
  }

  await runAdminMutation(
    contentElement,
    options,
    () =>
      apiPost(
        'deleteentry',
        {
          id:
            entryId
        },
        getStoredToken()
      ),
    'Eintragung gelöscht.'
  );
}

async function deleteList(
  contentElement,
  options,
  listId
) {
  if (
    !window.confirm(
      'Diesen Einsatz beziehungsweise diese Liste wirklich löschen? Vorhandene Eintragungen müssen vorher entfernt werden.'
    )
  ) {
    return;
  }

  await runAdminMutation(
    contentElement,
    options,
    () =>
      apiPost(
        'deletelist',
        {
          id:
            listId
        },
        getStoredToken()
      ),
    'Einsatz gelöscht.'
  );
}

async function deleteEvent(
  contentElement,
  options,
  eventId
) {
  if (
    !window.confirm(
      'Diese Veranstaltung wirklich löschen? Zugeordnete Einsätze und Eintragungen müssen vorher entfernt werden.'
    )
  ) {
    return;
  }

  await runAdminMutation(
    contentElement,
    options,
    () =>
      apiPost(
        'deleteevent',
        {
          id:
            eventId
        },
        getStoredToken()
      ),
    'Veranstaltung gelöscht.'
  );
}

async function copyList(
  contentElement,
  options,
  listId
) {
  await runAdminMutation(
    contentElement,
    options,
    () =>
      apiPost(
        'duplicatelist',
        {
          id:
            listId
        },
        getStoredToken()
      ),
    'Einsatz kopiert.'
  );
}

async function copyWholeEvent(
  contentElement,
  options,
  eventId
) {
  const event =
    findEvent(
      eventId
    );

  if (!event) {
    return;
  }

  const newTitle =
    window.prompt(
      'Titel der Kopie:',
      event.titel +
      ' – Kopie'
    );

  if (!newTitle) {
    return;
  }

  const newDate =
    window.prompt(
      'Neues Startdatum im Format TT.MM.JJJJ:',
      event.startdatum || ''
    );

  if (
    newDate === null
  ) {
    return;
  }

  try {
    const copiedEvent =
      await apiPost(
        'createevent',
        {
          data: {
            titel:
              newTitle.trim(),
            beschreibung:
              event.beschreibung || '',
            startdatum:
              newDate.trim(),
            enddatum:
              newDate.trim(),
            verantwortlich:
              event.verantwortlich || '',
            status:
              'offen',
            sortierung:
              0
          }
        },
        getStoredToken()
      );

    for (
      const list of
      (
        event.listen || []
      )
    ) {
      await apiPost(
        'createlist',
        {
          data: {
            veranstaltungId:
              copiedEvent.id,
            typ:
              list.typ,
            titel:
              list.titel,
            beschreibung:
              list.beschreibung || '',
            datum:
              shiftListDateForCopy(
                list.datum,
                event.startdatum,
                newDate.trim()
              ),
            beginn:
              list.beginn || '',
            ende:
              list.ende || '',
            verantwortlich:
              list.verantwortlich ||
              event.verantwortlich ||
              '',
            kategorie:
              list.kategorie || '',
            anzahl:
              Number(
                list.anzahl || 0
              ),
            punkte:
              Number(
                list.punkte || 0
              ),
            status:
              'offen',
            sortierung:
              Number(
                list.sortierung || 0
              )
          }
        },
        getStoredToken()
      );
    }

    await refreshStore();

    showAdminToast(
      contentElement,
      'Veranstaltung einschließlich Einsätzen kopiert.'
    );

    renderAdminDashboard(
      contentElement,
      options
    );
  } catch (error) {
    window.alert(
      error &&
      error.message
        ? error.message
        : 'Die Veranstaltung konnte nicht kopiert werden.'
    );
  }
}

function shiftListDateForCopy(
  listDate,
  oldEventDate,
  newEventDate
) {
  if (
    !listDate ||
    !oldEventDate ||
    !newEventDate
  ) {
    return (
      listDate ||
      newEventDate ||
      ''
    );
  }

  const list =
    parseDateParts(
      listDate
    );

  const oldEvent =
    parseDateParts(
      oldEventDate
    );

  const newEvent =
    parseDateParts(
      newEventDate
    );

  if (
    !list ||
    !oldEvent ||
    !newEvent
  ) {
    return newEventDate;
  }

  const difference =
    list.getTime() -
    oldEvent.getTime();

  const shifted =
    new Date(
      newEvent.getTime() +
      difference
    );

  return [
    String(
      shifted.getDate()
    ).padStart(2, '0'),
    String(
      shifted.getMonth() + 1
    ).padStart(2, '0'),
    shifted.getFullYear()
  ].join('.');
}

async function runAdminMutation(
  contentElement,
  options,
  mutation,
  successMessage
) {
  try {
    await mutation();

    await refreshStore();

    showAdminToast(
      contentElement,
      successMessage
    );

    renderAdminDashboard(
      contentElement,
      options
    );
  } catch (error) {
    window.alert(
      error &&
      error.message
        ? error.message
        : 'Die Änderung konnte nicht gespeichert werden.'
    );
  }
}

function bindAdminSafeClose(
  root,
  isDirty
) {
  root
    .querySelectorAll(
      '[data-admin-dialog-close]'
    )
    .forEach(button => {
      button.addEventListener(
        'click',
        () => {
          if (
            isDirty() &&
            !window.confirm(
              'Ungespeicherte Eingaben verwerfen?'
            )
          ) {
            return;
          }

          root.innerHTML =
            '';
        }
      );
    });
}

function bindClickable(
  root,
  selector,
  callback
) {
  root
    .querySelectorAll(
      selector
    )
    .forEach(element => {
      element.addEventListener(
        'click',
        () =>
          callback(element)
      );

      element.addEventListener(
        'keydown',
        event => {
          if (
            event.key ===
              'Enter' ||
            event.key ===
              ' '
          ) {
            event.preventDefault();
            callback(element);
          }
        }
      );
    });
}

function findEvent(eventId) {
  return getAllEvents()
    .find(event =>
      event.id ===
      eventId
    );
}

function findList(listId) {
  for (
    const event of
    getAllEvents()
  ) {
    const list =
      (
        event.listen || []
      ).find(item =>
        item.id ===
        listId
      );

    if (list) {
      return {
        event,
        list
      };
    }
  }

  return null;
}

function calculateAdminTotals(events) {
  return {
    lists:
      events.reduce(
        (sum, event) =>
          sum +
          (
            event.listen || []
          ).length,
        0
      )
  };
}

function calculateListTotals(lists) {
  return {
    places:
      lists.reduce(
        (sum, list) =>
          sum +
          Number(
            list.anzahl || 0
          ),
        0
      ),
    occupied:
      lists.reduce(
        (sum, list) =>
          sum +
          (
            list.eintragungen || []
          ).length,
        0
      ),
    points:
      lists.reduce(
        (sum, list) =>
          sum +
          Number(
            list.punkte || 0
          ),
        0
      )
  };
}

function adminOverviewItem(
  value,
  label
) {
  return `
    <div>
      <strong>
        ${escapeHtml(value)}
      </strong>

      <span>
        ${escapeHtml(label)}
      </span>
    </div>
  `;
}

function adminMeta(
  label,
  value
) {
  return `
    <div>
      <span>
        ${escapeHtml(label)}
      </span>

      <strong>
        ${escapeHtml(value)}
      </strong>
    </div>
  `;
}

function detailText(value) {
  return `
    <span>
      ${escapeHtml(value)}
    </span>
  `;
}

function statusBadge(status) {
  const open =
    String(status)
      .toLowerCase() ===
    'offen';

  return `
    <span class="status-badge ${
      open
        ? 'is-open'
        : 'is-closed'
    }">
      ${escapeHtml(
        status ||
        'offen'
      )}
    </span>
  `;
}

function compareEvents(a, b) {
  return (
    dateSortValue(
      a.startdatum
    ) -
    dateSortValue(
      b.startdatum
    )
  );
}

function compareLists(a, b) {
  const dateDifference =
    dateSortValue(
      a.datum
    ) -
    dateSortValue(
      b.datum
    );

  if (dateDifference) {
    return dateDifference;
  }

  return (
    timeSortValue(
      a.beginn
    ) -
    timeSortValue(
      b.beginn
    )
  );
}

function dateSortValue(value) {
  const date =
    parseDateParts(value);

  return date
    ? date.getTime()
    : Number.MAX_SAFE_INTEGER;
}

function timeSortValue(value) {
  const match =
    /^(\d{2}):(\d{2})$/.exec(
      String(value || '')
    );

  return match
    ? Number(match[1]) *
        60 +
        Number(match[2])
    : Number.MAX_SAFE_INTEGER;
}

function parseDateParts(value) {
  const match =
    /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(
      String(value || '')
    );

  return match
    ? new Date(
        Number(match[3]),
        Number(match[2]) - 1,
        Number(match[1])
      )
    : null;
}

function isoToGermanDate(value) {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})$/.exec(
      String(value || '')
    );

  return match
    ? [
        match[3],
        match[2],
        match[1]
      ].join('.')
    : '';
}

function germanToIsoDate(value) {
  const match =
    /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(
      String(value || '')
    );

  return match
    ? [
        match[3],
        String(match[2]).padStart(2, '0'),
        String(match[1]).padStart(2, '0')
      ].join('-')
    : '';
}

function showAdminToast(
  contentElement,
  message
) {
  const root =
    contentElement.querySelector(
      '#adminToastRoot'
    );

  if (!root) {
    return;
  }

  const toast =
    document.createElement('div');

  toast.className =
    'toast toast-success';

  toast.textContent =
    message;

  root.appendChild(
    toast
  );

  setTimeout(
    () => toast.remove(),
    3500
  );
}

function startSessionRefresh() {
  stopSessionRefresh();

  adminState.refreshTimer =
    window.setInterval(
      async () => {
        try {
          await refreshSession();
        } catch (error) {
          stopSessionRefresh();
        }
      },
      10 * 60 * 1000
    );
}

function stopSessionRefresh() {
  if (
    adminState.refreshTimer
  ) {
    clearInterval(
      adminState.refreshTimer
    );

    adminState.refreshTimer =
      null;
  }
}

function createAdminLoadingMarkup() {
  return `
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

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
