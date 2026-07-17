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
  getAllEvents,
  createStoreBackup,
  restoreStoreBackup,
  addEventOptimistic,
  updateEventOptimistic,
  removeEventOptimistic,
  addListOptimistic,
  updateListOptimistic,
  removeListOptimistic,
  removeEntryOptimistic,
  updatePointsConfigOptimistic,
  updateCategories
} from './store.js';

const adminState = {
  session: null,
  refreshTimer: null,
  pointsVisible: false,
  pointsSort:
    'name-asc'
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

  window.dispatchEvent(
    new CustomEvent(
      'admin-session-changed',
      {
        detail: {
          loggedIn:
            true
        }
      }
    )
  );

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

        window.dispatchEvent(
          new CustomEvent(
            'admin-session-changed',
            {
              detail: {
                loggedIn:
                  true
              }
            }
          )
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
          Anschließend kannst du dieser Veranstaltung Helfereinsätze, Kuchenlisten, Sachspenden oder freie Mitbringlisten zuordnen.
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
        class="button button-primary admin-points-action-button"
        id="adminCategoryManagementButton"
      >
        Kategorien verwalten
      </button>

      <button
        type="button"
        class="button button-primary admin-points-action-button"
        id="adminPointsConfigButton"
      >
        Punktesystem einrichten
      </button>

      ${data.punkte &&
        data.punkte.konfiguration &&
        data.punkte.konfiguration.punkteAktiv === true
          ? `
            <button
              type="button"
              class="button button-primary admin-points-action-button"
              id="adminPointsOverviewButton"
            >
              Punkteübersicht
            </button>
          `
          : ''}

      <button
        type="button"
        class="button button-primary"
        id="createEventButton"
      >
        + Veranstaltung anlegen
      </button>
    </section>

    ${renderAdminPointsOverview(
      data.punkte
    )}

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
            class="icon-action archive-action"
            title="Veranstaltung archivieren"
            data-admin-archive-event="${escapeHtml(event.id)}"
          >
            ◰
          </button>

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
              Number(
                list.belegt || 0
              ) +
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

        window.dispatchEvent(
          new CustomEvent(
            'admin-session-changed',
            {
              detail: {
                loggedIn:
                  false
              }
            }
          )
        );

        renderLogin(
          contentElement,
          options
        );
      }
    );

  const categoryManagementButton =
    contentElement.querySelector(
      '#adminCategoryManagementButton'
    );

  if (categoryManagementButton) {
    categoryManagementButton.addEventListener(
      'click',
      () =>
        openCategoryManagementDialog(
          contentElement,
          options
        )
    );
  }

  const pointsConfigButton =
    contentElement.querySelector(
      '#adminPointsConfigButton'
    );

  if (pointsConfigButton) {
    pointsConfigButton.addEventListener(
      'click',
      () =>
        openPointsConfigDialog(
          contentElement,
          options
        )
    );
  }

  const pointsButton =
    contentElement.querySelector(
      '#adminPointsOverviewButton'
    );

  if (pointsButton) {
    pointsButton.addEventListener(
      'click',
      () => {
        adminState.pointsVisible =
          !adminState.pointsVisible;

        renderAdminDashboard(
          contentElement,
          options
        );
      }
    );
  }

  const pointsSort =
    contentElement.querySelector(
      '#adminPointsSort'
    );

  if (pointsSort) {
    pointsSort.addEventListener(
      'change',
      event => {
        adminState.pointsSort =
          event.target.value;

        renderAdminDashboard(
          contentElement,
          options
        );
      }
    );
  }

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
      '[data-admin-archive-event]'
    )
    .forEach(button => {
      button.addEventListener(
        'click',
        () =>
          archiveEvent(
            contentElement,
            options,
            button.dataset.adminArchiveEvent
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

async function openCategoryManagementDialog(
  contentElement,
  options
) {
  const root =
    contentElement.querySelector(
      '#adminDialogRoot'
    );

  root.innerHTML = `
    <div class="dialog-backdrop">
      <section
        class="dialog-card category-management-dialog"
        role="dialog"
        aria-modal="true"
      >
        <header class="dialog-header">
          <div>
            <span class="eyebrow">
              Einrichtungseinstellungen
            </span>

            <h2>Kategorien verwalten</h2>
          </div>

          <button
            type="button"
            class="icon-button"
            data-admin-dialog-close
          >
            ×
          </button>
        </header>

        <div class="category-management-loading">
          Kategorien werden geladen …
        </div>
      </section>
    </div>
  `;

  bindAdminSafeClose(
    root,
    () => false
  );

  try {
    const categories =
      await apiPost(
        'allcategories',
        {},
        getStoredToken()
      );

    renderCategoryManagementContent(
      root,
      contentElement,
      options,
      categories
    );
  } catch (error) {
    root.querySelector(
      '.category-management-loading'
    ).textContent =
      error &&
      error.message
        ? error.message
        : 'Die Kategorien konnten nicht geladen werden.';
  }
}

function renderCategoryManagementContent(
  root,
  contentElement,
  options,
  categories
) {
  const sorted =
    (
      Array.isArray(
        categories
      )
        ? categories
        : []
    )
      .sort(
        (a, b) =>
          String(
            a.bezeichnung || ''
          ).localeCompare(
            String(
              b.bezeichnung || ''
            ),
            'de',
            {
              sensitivity:
                'base'
            }
          )
      );

  const card =
    root.querySelector(
      '.category-management-dialog'
    );

  card.innerHTML = `
    <header class="dialog-header">
      <div>
        <span class="eyebrow">
          Einrichtungseinstellungen
        </span>

        <h2>Kategorien verwalten</h2>
      </div>

      <button
        type="button"
        class="icon-button"
        data-admin-dialog-close
      >
        ×
      </button>
    </header>

    <div class="category-management-layout">
      <section class="category-list-panel">
        <div class="category-list-heading">
          <strong>Kategorien</strong>
          <span>${sorted.length}</span>
        </div>

        <div class="category-management-list">
          ${sorted.length
            ? sorted.map(category => `
                <button
                  type="button"
                  class="category-management-row"
                  data-category-edit="${escapeHtml(category.id)}"
                >
                  <span
                    class="category-color-dot"
                    style="background:${escapeHtml(category.farbe)}"
                  ></span>

                  <span>
                    <strong>${escapeHtml(category.bezeichnung)}</strong>
                    <small>
                      ${category.aktiv
                        ? 'Aktiv'
                        : 'Inaktiv'}
                    </small>
                  </span>
                </button>
              `).join('')
            : `
              <div class="admin-empty-child">
                Noch keine Kategorien vorhanden.
              </div>
            `}
        </div>
      </section>

      <form
        id="categoryManagementForm"
        class="category-editor-panel"
      >
        <input
          name="id"
          type="hidden"
        >

        <span class="eyebrow">
          Kategorie
        </span>

        <h3 id="categoryEditorTitle">
          Neue Kategorie
        </h3>

        <label class="form-field">
          <span>Bezeichnung</span>

          <input
            name="bezeichnung"
            type="text"
            maxlength="80"
            required
            placeholder="Zum Beispiel Getränkestand"
          >
        </label>

        <label class="form-field category-color-field">
          <span>Farbe</span>

          <div class="category-color-picker">
            <input
              name="farbe"
              type="color"
              value="#546E7A"
            >

            <span>
              Diese Farbe kennzeichnet die Kategorie in der Übersicht.
            </span>
          </div>
        </label>

        <label class="form-field">
          <span>Status</span>

          <select name="status">
            <option value="aktiv">Aktiv</option>
            <option value="inaktiv">Inaktiv</option>
          </select>
        </label>

        <div
          id="categoryManagementError"
          class="form-error"
          hidden
        ></div>

        <div class="category-editor-actions">
          <button
            type="button"
            class="button button-secondary"
            id="newCategoryButton"
          >
            Neue Kategorie
          </button>

          <button
            type="button"
            class="button button-danger"
            id="deleteCategoryButton"
            hidden
          >
            Löschen
          </button>

          <button
            type="submit"
            class="button button-primary"
          >
            Speichern
          </button>
        </div>
      </form>
    </div>
  `;

  const form =
    card.querySelector(
      '#categoryManagementForm'
    );

  const errorBox =
    card.querySelector(
      '#categoryManagementError'
    );

  const deleteButton =
    card.querySelector(
      '#deleteCategoryButton'
    );

  const title =
    card.querySelector(
      '#categoryEditorTitle'
    );

  const resetForm =
    () => {
      form.reset();
      form.elements.id.value =
        '';
      form.elements.farbe.value =
        '#546E7A';
      form.elements.icon.value =
        'circle';
      form.elements.status.value =
        'aktiv';
      title.textContent =
        'Neue Kategorie';
      deleteButton.hidden =
        true;
      errorBox.hidden =
        true;
    };

  card
    .querySelectorAll(
      '[data-category-edit]'
    )
    .forEach(button => {
      button.addEventListener(
        'click',
        () => {
          const category =
            sorted.find(item =>
              item.id ===
              button.dataset.categoryEdit
            );

          if (!category) {
            return;
          }

          form.elements.id.value =
            category.id;
          form.elements.bezeichnung.value =
            category.bezeichnung;
          form.elements.farbe.value =
            category.farbe;
          form.elements.icon.value =
            category.icon || 'circle';
          form.elements.status.value =
            category.status || 'aktiv';

          title.textContent =
            'Kategorie bearbeiten';

          deleteButton.hidden =
            false;

          errorBox.hidden =
            true;
        }
      );
    });

  card
    .querySelector(
      '#newCategoryButton'
    )
    .addEventListener(
      'click',
      resetForm
    );

  deleteButton.addEventListener(
    'click',
    () => {
      const id =
        form.elements.id.value;

      if (!id) {
        return;
      }

      if (
        !window.confirm(
          'Soll diese Kategorie endgültig gelöscht werden? Das ist nur möglich, wenn sie nicht verwendet wird.'
        )
      ) {
        return;
      }

      const previousCategories =
        getStoreSnapshot()
          .categories
          .slice();

      const optimisticCategories =
        previousCategories.filter(
          category =>
            category.id !==
            id
        );

      updateCategories(
        optimisticCategories
      );

      root.innerHTML =
        '';

      renderAdminDashboard(
        contentElement,
        options
      );

      apiPost(
        'deletecategory',
        {
          id:
            id
        },
        getStoredToken()
      )
        .then(() => {
          window.setTimeout(
            () =>
              refreshStore()
                .catch(error =>
                  console.warn(
                    'Kategorien konnten nicht sofort aktualisiert werden.',
                    error
                  )
                ),
            12000
          );
        })
        .catch(error => {
          updateCategories(
            previousCategories
          );

          renderAdminDashboard(
            contentElement,
            options
          );

          window.alert(
            error &&
            error.message
              ? error.message
              : 'Die Kategorie konnte nicht gelöscht werden.'
          );
        });
    }
  );

  form.addEventListener(
    'submit',
    event => {
      event.preventDefault();

      const id =
        form.elements.id.value;

      const payload = {
        bezeichnung:
          form.elements.bezeichnung.value.trim(),
        farbe:
          form.elements.farbe.value,
        icon:
          form.elements.icon.value ||
          'circle',
        status:
          form.elements.status.value,
        sortierung:
          0
      };

      const previousCategories =
        getStoreSnapshot()
          .categories
          .slice();

      const temporaryId =
        id ||
        (
          'TEMP_CATEGORY_' +
          Date.now()
        );

      const optimisticCategory = {
        id:
          temporaryId,
        bezeichnung:
          payload.bezeichnung,
        farbe:
          payload.farbe,
        status:
          payload.status,
        aktiv:
          payload.status ===
          'aktiv',
        sortierung:
          0
      };

      const optimisticCategories =
        id
          ? previousCategories.map(
              category =>
                category.id ===
                id
                  ? optimisticCategory
                  : category
            )
          : [
              ...previousCategories,
              optimisticCategory
            ];

      updateCategories(
        optimisticCategories
      );

      root.innerHTML =
        '';

      renderAdminDashboard(
        contentElement,
        options
      );

      apiPost(
        id
          ? 'updatecategory'
          : 'createcategory',
        id
          ? {
              id:
                id,
              data:
                payload
            }
          : {
              data:
                payload
            },
        getStoredToken()
      )
        .then(() => {
          window.setTimeout(
            () =>
              refreshStore()
                .then(() =>
                  renderAdminDashboard(
                    contentElement,
                    options
                  )
                )
                .catch(error =>
                  console.warn(
                    'Kategorien konnten nicht sofort aktualisiert werden.',
                    error
                  )
                ),
            12000
          );
        })
        .catch(error => {
          updateCategories(
            previousCategories
          );

          renderAdminDashboard(
            contentElement,
            options
          );

          window.alert(
            error &&
            error.message
              ? error.message
              : 'Die Kategorie konnte nicht gespeichert werden.'
          );
        });
    }
  );

  bindAdminSafeClose(
    root,
    () => false
  );
}

function openPointsConfigDialog(

  contentElement,
  options
) {
  const snapshot =
    getStoreSnapshot();

  const current =
    snapshot.frontendData &&
    snapshot.frontendData.punkte &&
    snapshot.frontendData.punkte
      .konfiguration
      ? snapshot.frontendData
          .punkte
          .konfiguration
      : {
          punkteAktiv:
            false,
          punkteBezeichnung:
            'Punkte',
          sollwertAktiv:
            false,
          sollwert:
            0
        };

  const root =
    contentElement.querySelector(
      '#adminDialogRoot'
    );

  root.innerHTML = `
    <div class="dialog-backdrop">
      <section
        class="dialog-card points-config-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pointsConfigTitle"
      >
        <header class="dialog-header">
          <div>
            <span class="eyebrow">
              Einrichtungseinstellungen
            </span>

            <h2 id="pointsConfigTitle">
              Punktesystem einrichten
            </h2>
          </div>

          <button
            type="button"
            class="icon-button"
            data-admin-dialog-close
            aria-label="Dialog schließen"
          >
            ×
          </button>
        </header>

        <form
          id="pointsConfigForm"
          class="dialog-form"
        >
          <section class="settings-switch-card">
            <div>
              <strong>
                Punktesystem verwenden
              </strong>

              <span>
                Bei deaktiviertem Punktesystem verschwinden
                Punktefelder, Hinweise und der Menüpunkt „Punkte“.
              </span>
            </div>

            <label class="switch-control">
              <input
                name="punkteAktiv"
                type="checkbox"
                ${current.punkteAktiv
                  ? 'checked'
                  : ''}
              >

              <span></span>
            </label>
          </section>

          <div id="pointsConfigDetails">
            <label class="form-field">
              <span>Bezeichnung</span>

              <input
                name="punkteBezeichnung"
                type="text"
                maxlength="60"
                required
                value="${escapeHtml(
                  current.punkteBezeichnung ||
                  'Punkte'
                )}"
                placeholder="Zum Beispiel Punkte oder Arbeitsstunden"
              >
            </label>

            <section class="settings-switch-card compact">
              <div>
                <strong>
                  Sollwert verwenden
                </strong>

                <span>
                  Legt fest, wie viele Punkte jeder verwendete Name
                  im Vereinsjahr erreichen soll.
                </span>
              </div>

              <label class="switch-control">
                <input
                  name="sollwertAktiv"
                  type="checkbox"
                  ${current.sollwertAktiv
                    ? 'checked'
                    : ''}
                >

                <span></span>
              </label>
            </section>

            <label class="form-field">
              <span>Sollwert je Name</span>

              <input
                name="sollwert"
                type="number"
                min="0"
                step="0.5"
                value="${escapeHtml(
                  current.sollwert || 0
                )}"
              >
            </label>
          </div>

          <div
            id="pointsConfigError"
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
              Einstellungen speichern
            </button>
          </div>
        </form>
      </section>
    </div>
  `;

  const form =
    root.querySelector(
      '#pointsConfigForm'
    );

  const pointsEnabled =
    form.elements.punkteAktiv;

  const targetEnabled =
    form.elements.sollwertAktiv;

  const labelInput =
    form.elements.punkteBezeichnung;

  const targetInput =
    form.elements.sollwert;

  let dirty =
    false;

  const updateState =
    () => {
      const enabled =
        pointsEnabled.checked;

      labelInput.disabled =
        !enabled;

      targetEnabled.disabled =
        !enabled;

      targetInput.disabled =
        !enabled ||
        !targetEnabled.checked;

      if (
        enabled &&
        !labelInput.value.trim()
      ) {
        labelInput.value =
          'Punkte';
      }
    };

  form.addEventListener(
    'input',
    () => {
      dirty =
        true;
    }
  );

  pointsEnabled.addEventListener(
    'change',
    updateState
  );

  targetEnabled.addEventListener(
    'change',
    updateState
  );

  updateState();

  bindAdminSafeClose(
    root,
    () => dirty
  );

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
          '#pointsConfigError'
        );

      button.disabled =
        true;

      errorBox.hidden =
        true;

      const payload = {
        punkteAktiv: pointsEnabled.checked,
        punkteBezeichnung: labelInput.value.trim() || 'Punkte',
        sollwertAktiv: targetEnabled.checked,
        sollwert: Number(targetInput.value || 0)
      };
      const backup = createStoreBackup();
      updatePointsConfigOptimistic(payload);
      dirty = false;
      root.innerHTML = '';
      const mineLink = document.querySelector('[data-route-link="mine"]');
      if (mineLink) mineLink.hidden = payload.punkteAktiv !== true;
      renderAdminDashboard(contentElement, options);
      try {
        await apiPost('updatepointsconfig', { data: payload }, getStoredToken());
        window.setTimeout(() => {
          refreshStore().then(() => renderAdminDashboard(contentElement, options)).catch(error => console.warn('Spätere Punkteaktualisierung fehlgeschlagen.', error));
        }, 15000);
      } catch (error) {
        restoreStoreBackup(backup);
        renderAdminDashboard(contentElement, options);
        window.alert(error && error.message ? error.message : 'Die Einstellungen konnten nicht gespeichert werden.');
      }
    }
  );
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

      const backup =
        createStoreBackup();

      const temporaryId =
        editing
          ? event.id
          : 'TEMP_EVENT_' +
            Date.now();

      if (editing) {
        updateEventOptimistic(
          event.id,
          payload
        );
      } else {
        addEventOptimistic({
          id:
            temporaryId,
          ...payload,
          erstelltAm:
            '',
          anzeigeStatus:
            'anstehend',
          vereinsjahr:
            '',
          listen:
            []
        });
      }

      dirty =
        false;

      root.innerHTML =
        '';

      renderAdminDashboard(
        contentElement,
        options
      );

      try {
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

        refreshStore()
          .then(() => {
            renderAdminDashboard(
              contentElement,
              options
            );

            if (!editing) {
              const addNow =
                window.confirm(
                  'Veranstaltung wurde angelegt. Jetzt direkt den ersten Einsatz oder eine Liste hinzufügen?'
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
            }
          })
          .catch(
            error =>
              console.warn(
                'Hintergrundaktualisierung fehlgeschlagen.',
                error
              )
          );
      } catch (error) {
        restoreStoreBackup(
          backup
        );

        renderAdminDashboard(
          contentElement,
          options
        );

        window.alert(
          error &&
          error.message
            ? error.message
            : 'Die Veranstaltung konnte nicht gespeichert werden.'
        );
      }
    }
  );
}

function normalizeAdminListType_(
  value
) {
  const normalized =
    String(
      value || ''
    )
      .trim()
      .toLowerCase()
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss')
      .replace(/[_\s]+/g, '-');

  if (
    normalized ===
    'sachspende'
  ) {
    return 'sachspendenliste';
  }

  return normalized;
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

  const currentListType =
    editing
      ? normalizeAdminListType_(
          list.typ
        )
      : 'helfereinsatz';

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
                  {
                    value:
                      'Helfereinsatz',
                    normalized:
                      'helfereinsatz'
                  },
                  {
                    value:
                      'Kuchenliste',
                    normalized:
                      'kuchenliste'
                  },
                  {
                    value:
                      'Sachspendenliste',
                    normalized:
                      'sachspendenliste'
                  },
                  {
                    value:
                      'Freie Mitbringliste',
                    normalized:
                      'freie-mitbringliste'
                  }
                ].map(type => `
                  <option
                    value="${type.value}"
                    ${currentListType ===
                      type.normalized
                      ? 'selected'
                      : ''}
                  >
                    ${type.value}
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
            <div class="quantity-field-group">
              <label class="form-field">
                <span>Plätze / benötigte Anzahl</span>

                <input
                  name="anzahl"
                  type="number"
                  min="1"
                  step="1"
                  value="${editing &&
                    Number(list.anzahl || 0) > 0
                      ? escapeHtml(list.anzahl)
                      : '1'}"
                  ${editing &&
                    Number(list.anzahl || 0) === 0
                      ? 'disabled'
                      : ''}
                >
              </label>

              <label class="checkbox-field">
                <input
                  name="unbegrenzt"
                  type="checkbox"
                  ${editing &&
                    Number(list.anzahl || 0) === 0
                      ? 'checked'
                      : ''}
                >
                <span>Unbegrenzt</span>
              </label>
            </div>

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

  const unlimitedCheckbox =
    form.elements.unbegrenzt;

  const quantityInput =
    form.elements.anzahl;

  const updateQuantityState =
    () => {
      quantityInput.disabled =
        unlimitedCheckbox.checked;

      if (
        !unlimitedCheckbox.checked &&
        Number(
          quantityInput.value || 0
        ) < 1
      ) {
        quantityInput.value =
          '1';
      }
    };

  unlimitedCheckbox.addEventListener(
    'change',
    updateQuantityState
  );

  updateQuantityState();

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
          form.elements.unbegrenzt.checked
            ? 0
            : Math.max(
                1,
                Number(
                  form.elements.anzahl.value ||
                  1
                )
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

      const backup =
        createStoreBackup();

      const temporaryId =
        editing
          ? list.id
          : 'TEMP_LIST_' +
            Date.now();

      const optimisticList = {
        id:
          temporaryId,
        ...payload,
        uhrzeit:
          payload.beginn &&
          payload.ende
            ? payload.beginn +
              ' - ' +
              payload.ende
            : (
                payload.beginn ||
                payload.ende ||
                ''
              ),
        belegt:
          editing
            ? Number(
                list.belegt || 0
              )
            : 0,
        frei:
          payload.anzahl > 0
            ? Math.max(
                payload.anzahl -
                (
                  editing
                    ? Number(
                        list.belegt || 0
                      )
                    : 0
                ),
                0
              )
            : null,
        voll:
          false,
        eintragungen:
          editing
            ? (
                list.eintragungen ||
                []
              )
            : []
      };

      if (editing) {
        updateListOptimistic(
          list.id,
          optimisticList
        );
      } else {
        addListOptimistic(
          event.id,
          optimisticList
        );
      }

      dirty =
        false;

      root.innerHTML =
        '';

      renderAdminDashboard(
        contentElement,
        options
      );

      try {
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

        refreshStore()
          .then(() =>
            renderAdminDashboard(
              contentElement,
              options
            )
          )
          .catch(
            error =>
              console.warn(
                'Hintergrundaktualisierung fehlgeschlagen.',
                error
              )
          );
      } catch (error) {
        restoreStoreBackup(
          backup
        );

        renderAdminDashboard(
          contentElement,
          options
        );

        window.alert(
          error &&
          error.message
            ? error.message
            : 'Der Einsatz konnte nicht gespeichert werden.'
        );
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

  const backup =
    createStoreBackup();

  removeEntryOptimistic(
    entryId
  );

  renderAdminDashboard(
    contentElement,
    options
  );

  try {
    await apiPost(
      'deleteentry',
      {
        id:
          entryId
      },
      getStoredToken()
    );

    refreshStore()
      .catch(
        error =>
          console.warn(
            'Hintergrundaktualisierung fehlgeschlagen.',
            error
          )
      );
  } catch (error) {
    restoreStoreBackup(
      backup
    );

    renderAdminDashboard(
      contentElement,
      options
    );

    window.alert(
      error &&
      error.message
        ? error.message
        : 'Die Eintragung konnte nicht gelöscht werden.'
    );
  }
}

async function deleteList(
  contentElement,
  options,
  listId
) {
  if (
    !window.confirm(
      'Diesen Einsatz beziehungsweise diese Liste wirklich löschen?'
    )
  ) {
    return;
  }

  const backup =
    createStoreBackup();

  removeListOptimistic(
    listId
  );

  renderAdminDashboard(
    contentElement,
    options
  );

  try {
    await apiPost(
      'deletelist',
      {
        id:
          listId
      },
      getStoredToken()
    );

    refreshStore()
      .catch(
        error =>
          console.warn(
            'Hintergrundaktualisierung fehlgeschlagen.',
            error
          )
      );
  } catch (error) {
    restoreStoreBackup(
      backup
    );

    renderAdminDashboard(
      contentElement,
      options
    );

    window.alert(
      error &&
      error.message
        ? error.message
        : 'Der Einsatz konnte nicht gelöscht werden.'
    );
  }
}

async function archiveEvent(
  contentElement,
  options,
  eventId
) {
  if (
    !window.confirm(
      'Soll diese Veranstaltung einschließlich aller verbundenen Einsätze, Listen und Eintragungen archiviert werden? Sie kann später im Archiv vollständig wiederhergestellt werden.'
    )
  ) {
    return;
  }

  const backup =
    createStoreBackup();

  removeEventOptimistic(
    eventId
  );

  renderAdminDashboard(
    contentElement,
    options
  );

  try {
    await apiPost(
      'archiveevent',
      {
        id:
          eventId
      },
      getStoredToken()
    );

    refreshStore()
      .catch(error =>
        console.warn(
          'Die Übersicht konnte nach der Archivierung nicht sofort aktualisiert werden.',
          error
        )
      );
  } catch (error) {
    restoreStoreBackup(
      backup
    );

    renderAdminDashboard(
      contentElement,
      options
    );

    window.alert(
      error &&
      error.message
        ? error.message
        : 'Die Veranstaltung konnte nicht archiviert werden.'
    );
  }
}

async function deleteEvent(
  contentElement,
  options,
  eventId
) {
  if (
    !window.confirm(
      'Soll diese Veranstaltung einschließlich aller verbundenen Einsätze, Listen und Eintragungen wirklich gelöscht werden?'
    )
  ) {
    return;
  }

  const backup =
    createStoreBackup();

  removeEventOptimistic(
    eventId
  );

  renderAdminDashboard(
    contentElement,
    options
  );

  try {
    await apiPost(
      'deleteevent',
      {
        id:
          eventId
      },
      getStoredToken()
    );

    refreshStore()
      .catch(
        error =>
          console.warn(
            'Hintergrundaktualisierung fehlgeschlagen.',
            error
          )
      );
  } catch (error) {
    restoreStoreBackup(
      backup
    );

    renderAdminDashboard(
      contentElement,
      options
    );

    window.alert(
      error &&
      error.message
        ? error.message
        : 'Die Veranstaltung konnte nicht gelöscht werden.'
    );
  }
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

function renderAdminPointsOverview(
  points
) {
  if (
    !adminState.pointsVisible ||
    !points ||
    !points.konfiguration ||
    points.konfiguration.punkteAktiv !==
      true
  ) {
    return '';
  }

  const people =
    sortAdminPointsPeople(
      points.personen || [],
      adminState.pointsSort
    );

  const label =
    points.konfiguration
      .punkteBezeichnung ||
    'Punkte';

  return `
    <section class="admin-points-card">
      <header class="admin-points-header">
        <div>
          <span class="eyebrow">
            Aktuelles Vereinsjahr
          </span>

          <h2>
            Punkteübersicht aller verwendeten Namen
          </h2>

          <p>
            Die Übersicht entsteht ausschließlich aus den Namen,
            die bei Eintragungen verwendet wurden.
          </p>
        </div>

        <label class="filter-field admin-points-sort">
          <span>Sortieren nach</span>

          <select id="adminPointsSort">
            ${adminSortOption(
              'name-asc',
              'Name A–Z'
            )}

            ${adminSortOption(
              'name-desc',
              'Name Z–A'
            )}

            ${adminSortOption(
              'points-desc',
              'Istpunkte – höchste zuerst'
            )}

            ${adminSortOption(
              'points-asc',
              'Istpunkte – niedrigste zuerst'
            )}

            ${adminSortOption(
              'remaining-desc',
              'Fehlende Punkte – höchste zuerst'
            )}

            ${adminSortOption('status-open', 'Offene zuerst')}
            ${adminSortOption('only-open', 'Nur offene')}
          </select>
        </label>
      </header>

      <div class="admin-points-summary">
        ${adminOverviewItem(people.length, 'Namen')}
        ${adminOverviewItem(people.filter(person => person.sollwertErreicht).length, 'Soll erfüllt')}
      </div>

      <div class="admin-points-table-wrap">
        <table class="admin-points-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Soll</th>
              <th>Ist</th>
              <th>Differenz</th>
              <th>Eintragungen</th>
              <th>Status</th>
            </tr>
          </thead>

          <tbody>
            ${people.length
              ? people.map(person => `
                  <tr>
                    <td>
                      <strong>
                        ${escapeHtml(person.name)}
                      </strong>
                    </td>

                    <td>
                      ${formatAdminPointsNumber(
                        person.sollwert
                      )}
                      ${escapeHtml(label)}
                    </td>

                    <td>
                      <strong>
                        ${formatAdminPointsNumber(
                          person.punkte
                        )}
                      </strong>
                      ${escapeHtml(label)}
                    </td>

                    ${renderAdminDifferenceCell(person, label)}

                    <td>
                      ${escapeHtml(
                        person.anzahlEintragungen
                      )}
                    </td>

                    <td>
                      <span class="points-status ${
                        person.sollwertErreicht
                          ? 'is-reached'
                          : 'is-open'
                      }">
                        ${person.sollwertErreicht
                          ? 'Erfüllt'
                          : 'Offen'}
                      </span>
                    </td>
                  </tr>
                `).join('')
              : `
                <tr>
                  <td colspan="6">
                    Noch keine Punkte-Eintragungen vorhanden.
                  </td>
                </tr>
              `}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function adminSortOption(
  value,
  label
) {
  return `
    <option
      value="${value}"
      ${adminState.pointsSort === value
        ? 'selected'
        : ''}
    >
      ${label}
    </option>
  `;
}

function sortAdminPointsPeople(
  people,
  sort
) {
  const result =
    people.slice();

  switch (sort) {
    case 'name-desc':
      return result.sort(
        (a, b) =>
          String(b.name || '')
            .localeCompare(
              String(a.name || ''),
              'de'
            )
      );

    case 'points-desc':
      return result.sort(
        (a, b) =>
          Number(b.punkte || 0) -
          Number(a.punkte || 0)
      );

    case 'points-asc':
      return result.sort(
        (a, b) =>
          Number(a.punkte || 0) -
          Number(b.punkte || 0)
      );

    case 'remaining-desc':
      return result.sort(
        (a, b) =>
          Number(b.rest || 0) -
          Number(a.rest || 0)
      );

    case 'status-open':
      return result.sort((a, b) => Number(a.sollwertErreicht) - Number(b.sollwertErreicht) || String(a.name || '').localeCompare(String(b.name || ''), 'de'));

    case 'only-open':
      return result.filter(person => !person.sollwertErreicht).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'de'));

    case 'name-asc':
    default:
      return result.sort(
        (a, b) =>
          String(a.name || '')
            .localeCompare(
              String(b.name || ''),
              'de'
            )
      );
  }
}

function renderAdminDifferenceCell(person, label) {
  const difference = Number(person.punkte || 0) - Number(person.sollwert || 0);
  const cssClass = difference > 0 ? 'is-positive' : difference < 0 ? 'is-negative' : 'is-neutral';
  return `<td class="points-difference ${cssClass}"><strong>${difference > 0 ? '+' : ''}${formatAdminPointsNumber(difference)}</strong> ${escapeHtml(label)}</td>`;
}

function formatAdminPointsNumber(
  value
) {
  return Number(value || 0)
    .toLocaleString(
      'de-DE',
      {
        maximumFractionDigits:
          2
      }
    );
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
