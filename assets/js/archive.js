/**
 * Vereinsverwaltung – Archiv
 *
 * Das Archiv ist bewusst admin-geschützt, weil archivierte
 * Eintragungen Namen und öffentlich sichtbare Bemerkungen enthalten können.
 */

import {
  apiPost,
  getTenant
} from './api.js';

import {
  getStoredToken,
  login,
  validateSession
} from './auth.js';

import {
  refreshStore,
  addEventOptimistic,
  createStoreBackup,
  restoreStoreBackup,
  persistStoreCache
} from './store.js';

const archiveState = {
  overview:
    null,
  details:
    new Map(),
  search:
    '',
  category:
    '',
  year:
    '',
  openEventId:
    ''
};

export async function renderArchivePage(
  options
) {
  const {
    contentElement,
    setPageHeading
  } = options;

  setPageHeading(
    'Archiv',
    'Vergangene Veranstaltungen, Einsätze und Eintragungen'
  );

  contentElement.innerHTML =
    createArchiveLoadingMarkup();

  const session =
    await validateSession();

  if (!session) {
    renderArchiveLogin(
      contentElement,
      options
    );

    return;
  }

  await loadArchiveOverview(
    contentElement,
    options
  );
}

function renderArchiveLogin(
  contentElement,
  options
) {
  contentElement.innerHTML = `
    <section class="admin-login-shell">
      <article class="admin-login-card">
        <div class="admin-login-icon">◰</div>

        <span class="eyebrow">
          Geschützter Bereich
        </span>

        <h2>Archiv öffnen</h2>

        <p>
          Das Archiv enthält frühere Eintragungen und ist deshalb
          mit dem gemeinsamen Adminpasswort geschützt.
        </p>

        <form
          id="archiveLoginForm"
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
            id="archiveLoginError"
            class="form-error"
            hidden
          ></div>

          <button
            type="submit"
            class="button button-primary"
          >
            Archiv öffnen
          </button>
        </form>
      </article>
    </section>
  `;

  const form =
    contentElement.querySelector(
      '#archiveLoginForm'
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
          '#archiveLoginError'
        );

      button.disabled =
        true;

      errorBox.hidden =
        true;

      try {
        await login(
          form.elements.password.value
        );

        await loadArchiveOverview(
          contentElement,
          options
        );
      } catch (error) {
        errorBox.textContent =
          error &&
          error.message
            ? error.message
            : 'Das Archiv konnte nicht geöffnet werden.';

        errorBox.hidden =
          false;

        button.disabled =
          false;
      }
    }
  );
}

async function loadArchiveOverview(
  contentElement,
  options
) {
  const cached =
    readArchiveSessionCache_();

  if (cached) {
    archiveState.overview =
      cached;

    renderArchiveOverview(
      contentElement,
      options
    );
  } else {
    contentElement.innerHTML =
      createArchiveLoadingMarkup();
  }

  try {
    archiveState.overview =
      await apiPost(
        'archiveoverview',
        {},
        getStoredToken()
      );

    writeArchiveSessionCache_(
      archiveState.overview
    );

    renderArchiveOverview(
      contentElement,
      options
    );
  } catch (error) {
    if (cached) {
      console.warn(
        'Archivaktualisierung fehlgeschlagen; der letzte Sitzungsstand bleibt sichtbar.',
        error
      );

      return;
    }
    contentElement.innerHTML = `
      <section class="error-card">
        <span class="eyebrow">Archiv</span>
        <h2>Das Archiv konnte nicht geladen werden</h2>
        <p>
          ${escapeHtml(
            error &&
            error.message
              ? error.message
              : 'Die Anfrage ist fehlgeschlagen.'
          )}
        </p>

        <button
          type="button"
          class="button button-primary"
          id="retryArchiveButton"
        >
          Erneut versuchen
        </button>
      </section>
    `;

    contentElement
      .querySelector(
        '#retryArchiveButton'
      )
      .addEventListener(
        'click',
        () =>
          loadArchiveOverview(
            contentElement,
            options
          )
      );
  }
}

function renderArchiveOverview(
  contentElement,
  options
) {
  const overview =
    archiveState.overview || {
      veranstaltungen:
        [],
      anzahl: {
        veranstaltungen:
          0,
        listen:
          0,
        eintragungen:
          0
      }
    };

  const events =
    filterArchivedEvents(
      overview.veranstaltungen || []
    );

  const categories =
    Array.from(
      new Set(
        (
          overview.veranstaltungen || []
        )
          .flatMap(event =>
            event.kategorien || []
          )
          .filter(Boolean)
      )
    )
      .sort(
        (a, b) =>
          a.localeCompare(
            b,
            'de'
          )
      );

  const years =
    Array.from(
      new Set(
        (
          overview.veranstaltungen || []
        )
          .map(event =>
            getArchiveYear(
              event.startdatum
            )
          )
          .filter(Boolean)
      )
    )
      .sort(
        (a, b) =>
          Number(b) -
          Number(a)
      );

  contentElement.innerHTML = `
    <section class="archive-summary-card">
      <div>
        <span class="eyebrow">
          ${escapeHtml(
            overview.einrichtungsname ||
            'Vereinsarchiv'
          )}
        </span>

        <h2>Archivierte Veranstaltungen</h2>

        <p>
          Archivierte Inhalte bleiben vollständig erhalten und können
          bei Bedarf wiederhergestellt werden.
        </p>
      </div>

      <div class="archive-summary-metrics">
        ${archiveMetric(
          overview.anzahl.veranstaltungen,
          'Veranstaltungen'
        )}

        ${archiveMetric(
          overview.anzahl.listen,
          'Einsätze / Listen'
        )}

        ${archiveMetric(
          overview.anzahl.eintragungen,
          'Eintragungen'
        )}
      </div>
    </section>

    <section class="archive-filter-card">
      <label class="form-field archive-search-field">
        <span>Suchen</span>

        <input
          id="archiveSearch"
          type="search"
          value="${escapeHtml(archiveState.search)}"
          placeholder="Titel, Beschreibung oder Verantwortliche durchsuchen"
        >
      </label>

      <label class="filter-field">
        <span>Kategorie</span>

        <select id="archiveCategory">
          <option value="">Alle Kategorien</option>

          ${categories
            .map(category => `
              <option
                value="${escapeHtml(category)}"
                ${archiveState.category === category
                  ? 'selected'
                  : ''}
              >
                ${escapeHtml(category)}
              </option>
            `)
            .join('')}
        </select>
      </label>

      <label class="filter-field">
        <span>Jahr</span>

        <select id="archiveYear">
          <option value="">Alle Jahre</option>

          ${years
            .map(year => `
              <option
                value="${escapeHtml(year)}"
                ${archiveState.year === year
                  ? 'selected'
                  : ''}
              >
                ${escapeHtml(year)}
              </option>
            `)
            .join('')}
        </select>
      </label>
    </section>

    <section class="archive-result-info">
      <strong>${events.length}</strong>
      <span>
        ${events.length === 1
          ? 'archivierte Veranstaltung'
          : 'archivierte Veranstaltungen'}
      </span>
    </section>

    <section class="archive-event-stack">
      ${events.length
        ? events
            .map(event =>
              renderArchiveEventCard(
                event
              )
            )
            .join('')
        : `
          <div class="empty-state">
            <div class="empty-icon">◰</div>
            <h2>Keine passenden Archivdaten</h2>
            <p>
              Ändere die Suche oder die ausgewählten Filter.
            </p>
          </div>
        `}
    </section>
  `;

  bindArchiveFilters(
    contentElement,
    options
  );

  bindArchiveCards(
    contentElement,
    options
  );
}

function renderArchiveEventCard(
  event
) {
  const details =
    archiveState.details.get(
      event.id
    );

  const expanded =
    archiveState.openEventId ===
    event.id;

  return `
    <article class="archive-event-card">
      <header class="archive-event-header">
        <button
          type="button"
          class="archive-event-toggle"
          data-archive-toggle="${escapeHtml(event.id)}"
          aria-expanded="${expanded}"
        >
          <div class="archive-date-card">
            <strong>
              ${escapeHtml(
                event.startdatum ||
                'Ohne Datum'
              )}
            </strong>

            ${event.enddatum &&
              event.enddatum !==
              event.startdatum
              ? `
                <span>
                  bis ${escapeHtml(event.enddatum)}
                </span>
              `
              : ''}
          </div>

          <div class="archive-event-copy">
            <span class="event-kicker">
              Archivierte Veranstaltung
            </span>

            <h3>${escapeHtml(event.titel)}</h3>

            ${event.beschreibung
              ? `
                <p>${escapeHtml(event.beschreibung)}</p>
              `
              : ''}

            <div class="archive-event-meta">
              ${event.verantwortlich
                ? archiveMeta(
                    'Verantwortlich',
                    event.verantwortlich
                  )
                : ''}

              ${archiveMeta(
                'Einsätze / Listen',
                event.anzahlListen || 0
              )}

              ${archiveMeta(
                'Eintragungen',
                event.anzahlEintragungen || 0
              )}
            </div>

            ${event.kategorien &&
              event.kategorien.length
              ? `
                <div class="archive-category-chips">
                  ${event.kategorien
                    .map(category => `
                      <span>
                        ${escapeHtml(category)}
                      </span>
                    `)
                    .join('')}
                </div>
              `
              : ''}
          </div>

          <span class="archive-chevron">
            ${expanded
              ? '⌃'
              : '⌄'}
          </span>
        </button>

        <button
          type="button"
          class="button button-secondary archive-restore-button"
          data-archive-restore="${escapeHtml(event.id)}"
        >
          Wiederherstellen
        </button>
      </header>

      ${expanded
        ? `
          <div class="archive-event-details">
            ${details
              ? renderArchiveDetails(
                  details
                )
              : createArchiveDetailsLoadingMarkup()}
          </div>
        `
        : ''}
    </article>
  `;
}

function renderArchiveDetails(
  data
) {
  const lists =
    data.listen || [];

  return `
    ${lists.length
      ? `
        <div class="archive-list-stack">
          ${lists
            .map(list =>
              renderArchiveList(
                list
              )
            )
            .join('')}
        </div>
      `
      : `
        <div class="admin-empty-child">
          Diese Veranstaltung enthält keine archivierten Einsätze oder Listen.
        </div>
      `}
  `;
}

function renderArchiveList(
  list
) {
  const entries =
    list.eintragungen || [];

  return `
    <article class="archive-list-card">
      <div class="archive-list-heading">
        <div>
          <span class="archive-list-category">
            ${escapeHtml(
              list.kategorie ||
              'Ohne Kategorie'
            )}
          </span>

          <h4>${escapeHtml(list.titel)}</h4>

          ${list.beschreibung
            ? `
              <p>${escapeHtml(list.beschreibung)}</p>
            `
            : ''}
        </div>

        <strong>
          ${formatArchiveNumber(
            list.punkte
          )}
          Punkte
        </strong>
      </div>

      <div class="archive-list-meta">
        ${list.datum
          ? archiveMeta(
              'Datum',
              list.datum
            )
          : ''}

        ${list.uhrzeit
          ? archiveMeta(
              'Uhrzeit',
              list.uhrzeit +
              ' Uhr'
            )
          : ''}

        ${list.verantwortlich
          ? archiveMeta(
              'Verantwortlich',
              list.verantwortlich
            )
          : ''}

        ${archiveMeta(
          'Eintragungen',
          entries.length
        )}
      </div>

      ${entries.length
        ? `
          <div class="archive-entry-chips">
            ${entries
              .map(entry =>
                renderArchiveEntry(
                  entry
                )
              )
              .join('')}
          </div>
        `
        : `
          <div class="no-entries">
            Keine archivierten Eintragungen
          </div>
        `}
    </article>
  `;
}

function renderArchiveEntry(
  entry
) {
  const details = [];

  if (entry.beitrag) {
    details.push(
      entry.beitrag
    );
  }

  if (
    entry.menge !== '' &&
    entry.menge !== null &&
    entry.menge !== undefined
  ) {
    details.push(
      'Menge: ' +
      entry.menge
    );
  }

  if (entry.bemerkung) {
    details.push(
      entry.bemerkung
    );
  }

  return `
    <div class="entry-chip">
      <strong>
        ${escapeHtml(entry.name)}
      </strong>

      ${details.length
        ? `
          <span>
            ${escapeHtml(
              details.join(' · ')
            )}
          </span>
        `
        : ''}
    </div>
  `;
}

function bindArchiveFilters(
  contentElement,
  options
) {
  const search =
    contentElement.querySelector(
      '#archiveSearch'
    );

  const category =
    contentElement.querySelector(
      '#archiveCategory'
    );

  const year =
    contentElement.querySelector(
      '#archiveYear'
    );

  let timer;

  search.addEventListener(
    'input',
    () => {
      window.clearTimeout(
        timer
      );

      timer =
        window.setTimeout(
          () => {
            archiveState.search =
              search.value.trim();

            renderArchiveOverview(
              contentElement,
              options
            );
          },
          180
        );
    }
  );

  category.addEventListener(
    'change',
    () => {
      archiveState.category =
        category.value;

      renderArchiveOverview(
        contentElement,
        options
      );
    }
  );

  year.addEventListener(
    'change',
    () => {
      archiveState.year =
        year.value;

      renderArchiveOverview(
        contentElement,
        options
      );
    }
  );
}

function bindArchiveCards(
  contentElement,
  options
) {
  contentElement
    .querySelectorAll(
      '[data-archive-toggle]'
    )
    .forEach(button => {
      button.addEventListener(
        'click',
        async () => {
          const eventId =
            button.dataset
              .archiveToggle;

          archiveState.openEventId =
            archiveState.openEventId ===
            eventId
              ? ''
              : eventId;

          renderArchiveOverview(
            contentElement,
            options
          );

          if (
            archiveState.openEventId &&
            !archiveState.details.has(
              eventId
            )
          ) {
            await loadArchiveDetails(
              contentElement,
              options,
              eventId
            );
          }
        }
      );
    });

  contentElement
    .querySelectorAll(
      '[data-archive-restore]'
    )
    .forEach(button => {
      button.addEventListener(
        'click',
        () =>
          restoreArchivedEvent(
            contentElement,
            options,
            button.dataset
              .archiveRestore
          )
      );
    });
}

async function loadArchiveDetails(
  contentElement,
  options,
  eventId
) {
  try {
    const details =
      await apiPost(
        'archiveeventdetails',
        {
          id:
            eventId
        },
        getStoredToken()
      );

    archiveState.details.set(
      eventId,
      details
    );

    renderArchiveOverview(
      contentElement,
      options
    );
  } catch (error) {
    window.alert(
      error &&
      error.message
        ? error.message
        : 'Die Archivdetails konnten nicht geladen werden.'
    );
  }
}

async function restoreArchivedEvent(
  contentElement,
  options,
  eventId
) {
  if (
    !window.confirm(
      'Soll diese Veranstaltung einschließlich aller archivierten Einsätze, Listen und Eintragungen wiederhergestellt werden?'
    )
  ) {
    return;
  }

  const overviewBackup =
    JSON.parse(
      JSON.stringify(
        archiveState.overview
      )
    );

  const storeBackup =
    createStoreBackup();

  try {
    let details =
      archiveState.details.get(
        eventId
      );

    if (!details) {
      details =
        await apiPost(
          'archiveeventdetails',
          {
            id:
              eventId
          },
          getStoredToken()
        );

      archiveState.details.set(
        eventId,
        details
      );
    }

    const restoredEvent =
      createRestoredFrontendEvent_(
        details
      );

    addEventOptimistic(
      restoredEvent
    );

    persistStoreCache();

    archiveState.overview
      .veranstaltungen =
      (
        archiveState.overview
          .veranstaltungen || []
      )
        .filter(event =>
          event.id !==
          eventId
        );

    archiveState.overview
      .anzahl.veranstaltungen =
      archiveState.overview
        .veranstaltungen.length;

    archiveState.details.delete(
      eventId
    );

    archiveState.openEventId =
      '';

    renderArchiveOverview(
      contentElement,
      options
    );

    await apiPost(
      'restoreevent',
      {
        id:
          eventId
      },
      getStoredToken()
    );

    window.setTimeout(
      () => {
        refreshStore()
          .catch(error =>
            console.warn(
              'Die Übersicht konnte nach der Wiederherstellung nicht sofort aktualisiert werden.',
              error
            )
          );
      },
      12000
    );

    loadArchiveOverview(
      contentElement,
      options
    )
      .catch(error =>
        console.warn(
          'Das Archiv konnte nach der Wiederherstellung nicht sofort aktualisiert werden.',
          error
        )
      );
  } catch (error) {
    restoreStoreBackup(
      storeBackup
    );

    archiveState.overview =
      overviewBackup;

    renderArchiveOverview(
      contentElement,
      options
    );

    window.alert(
      error &&
      error.message
        ? error.message
        : 'Die Veranstaltung konnte nicht wiederhergestellt werden.'
    );
  }
}

function createRestoredFrontendEvent_(
  details
) {
  const event =
    details.veranstaltung || {};

  const lists =
    (
      details.listen || []
    ).map(list => {
      const entries =
        list.eintragungen || [];

      const occupied =
        calculateRestoredOccupied_(
          list,
          entries
        );

      const maximum =
        Number(
          list.anzahl || 0
        );

      return {
        ...list,
        veranstaltungId:
          event.id,
        eintragungen:
          entries,
        belegt:
          occupied,
        frei:
          maximum > 0
            ? Math.max(
                maximum -
                occupied,
                0
              )
            : null,
        voll:
          maximum > 0 &&
          occupied >=
            maximum
      };
    });

  return {
    ...event,
    listen:
      lists,
    anzahlListen:
      lists.length,
    anzahlEintragungen:
      lists.reduce(
        (sum, list) =>
          sum +
          (
            list.eintragungen || []
          ).length,
        0
      )
  };
}

function calculateRestoredOccupied_(
  list,
  entries
) {
  const type =
    String(
      list.typ || ''
    )
      .trim()
      .toLowerCase()
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss')
      .replace(/[_\s]+/g, '-');

  const quantityBased =
    type !==
      'helfereinsatz' ||
    entries.some(entry => {
      const quantity =
        Number(
          entry.menge
        );

      return (
        String(
          entry.beitrag || ''
        ).trim() !==
          '' ||
        (
          Number.isFinite(
            quantity
          ) &&
          quantity > 1
        )
      );
    });

  if (!quantityBased) {
    return entries.length;
  }

  return entries.reduce(
    (sum, entry) => {
      const quantity =
        Number(
          entry.menge
        );

      return (
        sum +
        (
          Number.isFinite(
            quantity
          ) &&
          quantity > 0
            ? Math.floor(
                quantity
              )
            : 1
        )
      );
    },
    0
  );
}


function filterArchivedEvents(
  events
) {
  const search =
    normalizeArchiveText(
      archiveState.search
    );

  return events.filter(event => {
    const matchesSearch =
      !search ||
      normalizeArchiveText(
        [
          event.titel,
          event.beschreibung,
          event.verantwortlich,
          event.startdatum,
          event.enddatum,
          ...(event.kategorien || [])
        ].join(' ')
      )
        .includes(
          search
        );

    const matchesCategory =
      !archiveState.category ||
      (
        event.kategorien || []
      )
        .includes(
          archiveState.category
        );

    const matchesYear =
      !archiveState.year ||
      getArchiveYear(
        event.startdatum
      ) ===
      archiveState.year;

    return (
      matchesSearch &&
      matchesCategory &&
      matchesYear
    );
  });
}

function createArchiveLoadingMarkup() {
  return `
    <section class="panel-card">
      <div class="skeleton skeleton-title"></div>
      <div class="skeleton"></div>
      <div class="skeleton skeleton-short"></div>
    </section>
  `;
}

function createArchiveDetailsLoadingMarkup() {
  return `
    <div class="archive-details-loading">
      <div class="skeleton"></div>
      <div class="skeleton skeleton-short"></div>
    </div>
  `;
}

function archiveMetric(
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

function archiveMeta(
  label,
  value
) {
  return `
    <div class="archive-meta-item">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function getArchiveYear(
  date
) {
  const match =
    String(date || '')
      .match(
        /(\d{4})$/
      );

  return match
    ? match[1]
    : '';
}

function normalizeArchiveText(
  value
) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase(
      'de-DE'
    );
}

function formatArchiveNumber(
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

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getArchiveSessionCacheKey_() {
  return (
    'vereinsverwaltung_archive_cache_' +
    getTenant()
  );
}

function readArchiveSessionCache_() {
  try {
    const raw =
      sessionStorage.getItem(
        getArchiveSessionCacheKey_()
      );

    if (!raw) {
      return null;
    }

    const parsed =
      JSON.parse(
        raw
      );

    if (
      !parsed ||
      !parsed.data ||
      Date.now() -
        Number(
          parsed.savedAt || 0
        ) >
        10 * 60 * 1000
    ) {
      return null;
    }

    return parsed.data;
  } catch (error) {
    return null;
  }
}

function writeArchiveSessionCache_(
  data
) {
  try {
    sessionStorage.setItem(
      getArchiveSessionCacheKey_(),
      JSON.stringify({
        data:
          data,
        savedAt:
          Date.now()
      })
    );
  } catch (error) {
    console.warn(
      'Archivcache konnte nicht gespeichert werden.',
      error
    );
  }
}

