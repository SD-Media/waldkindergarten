/**
 * Vereinsverwaltung – öffentliches Modul „Einsätze“
 */

import {
  apiGet,
  apiPost
} from './api.js';

const moduleState = {
  events: [],
  lists: [],
  entries: [],
  categories: [],
  settings: {},
  search: '',
  category: '',
  availability: 'all',
  loading: false
};

/**
 * Rendert die vollständige Einsatzseite.
 *
 * @param {Object} options
 */
export async function renderEventsPage(options) {
  const {
    contentElement,
    setPageHeading,
    settings = {},
    categories = [],
    refreshFrontendData
  } = options;

  moduleState.settings = settings;
  moduleState.categories = Array.isArray(categories)
    ? categories
    : [];

  setPageHeading(
    'Einsätze',
    'Veranstaltungen, Aufgaben und freie Plätze'
  );

  contentElement.innerHTML = createLoadingMarkup();

  try {
    moduleState.loading = true;

    const [
      events,
      lists,
      entries
    ] = await Promise.all([
      apiGet('events'),
      apiGet('lists'),
      apiGet('entries')
    ]);

    moduleState.events = Array.isArray(events)
      ? events
      : [];

    moduleState.lists = Array.isArray(lists)
      ? lists
      : [];

    moduleState.entries = Array.isArray(entries)
      ? entries
      : [];

    renderContent(
      contentElement,
      refreshFrontendData
    );
  } catch (error) {
    renderModuleError(
      contentElement,
      error,
      () => renderEventsPage(options)
    );
  } finally {
    moduleState.loading = false;
  }
}

function renderContent(
  contentElement,
  refreshFrontendData
) {
  const filteredEvents =
    getFilteredEvents();

  contentElement.innerHTML = `
    <section class="events-toolbar panel-card">
      <div class="events-search-wrap">
        <label class="sr-only" for="eventsSearch">
          Einsätze durchsuchen
        </label>
        <input
          id="eventsSearch"
          class="search-input"
          type="search"
          value="${escapeHtml(moduleState.search)}"
          placeholder="Veranstaltungen und Einsätze durchsuchen …"
          autocomplete="off"
        >
      </div>

      <div class="events-filter-row">
        <label class="filter-field">
          <span>Kategorie</span>
          <select id="categoryFilter">
            <option value="">Alle Kategorien</option>
            ${moduleState.categories
              .map(category => `
                <option
                  value="${escapeHtml(category.bezeichnung)}"
                  ${moduleState.category === category.bezeichnung
                    ? 'selected'
                    : ''}
                >
                  ${escapeHtml(category.bezeichnung)}
                </option>
              `)
              .join('')}
          </select>
        </label>

        <label class="filter-field">
          <span>Verfügbarkeit</span>
          <select id="availabilityFilter">
            <option
              value="all"
              ${moduleState.availability === 'all'
                ? 'selected'
                : ''}
            >
              Alle
            </option>
            <option
              value="available"
              ${moduleState.availability === 'available'
                ? 'selected'
                : ''}
            >
              Nur mit freien Plätzen
            </option>
            <option
              value="open"
              ${moduleState.availability === 'open'
                ? 'selected'
                : ''}
            >
              Nur offene Listen
            </option>
          </select>
        </label>
      </div>
    </section>

    <section class="events-summary">
      <div>
        <strong>${filteredEvents.length}</strong>
        <span>
          ${filteredEvents.length === 1
            ? 'Veranstaltung'
            : 'Veranstaltungen'}
        </span>
      </div>
      <div>
        <strong>${countVisibleLists(filteredEvents)}</strong>
        <span>
          ${countVisibleLists(filteredEvents) === 1
            ? 'Einsatz'
            : 'Einsätze'}
        </span>
      </div>
      <div>
        <strong>${countAvailablePlaces(filteredEvents)}</strong>
        <span>freie Plätze</span>
      </div>
    </section>

    <section id="eventsResults" class="events-stack">
      ${filteredEvents.length
        ? filteredEvents
            .map(event =>
              renderEventCard(
                event,
                getVisibleListsForEvent(event.id)
              )
            )
            .join('')
        : renderNoResults()}
    </section>

    <div id="entryDialogRoot"></div>
    <div id="eventsToastRoot" class="toast-root"></div>
  `;

  bindFilters(
    contentElement,
    refreshFrontendData
  );

  bindEntryButtons(
    contentElement,
    refreshFrontendData
  );
}

function getFilteredEvents() {
  const search =
    normalizeText(moduleState.search);

  return moduleState.events.filter(event => {
    const lists =
      getVisibleListsForEvent(event.id);

    if (!lists.length) {
      return false;
    }

    if (!search) {
      return true;
    }

    const eventText = normalizeText([
      event.titel,
      event.beschreibung,
      event.startdatum,
      event.enddatum
    ].join(' '));

    const listText = normalizeText(
      lists.map(list => [
        list.titel,
        list.beschreibung,
        list.kategorie,
        list.typ,
        list.datum,
        list.uhrzeit
      ].join(' ')).join(' ')
    );

    return (
      eventText.includes(search) ||
      listText.includes(search)
    );
  });
}

function getVisibleListsForEvent(eventId) {
  return moduleState.lists
    .filter(list =>
      String(list.veranstaltungId) ===
      String(eventId)
    )
    .filter(list => {
      if (
        moduleState.category &&
        list.kategorie !== moduleState.category
      ) {
        return false;
      }

      const occupancy =
        getOccupancy(list);

      if (
        moduleState.availability ===
        'available'
      ) {
        return (
          String(list.status).toLowerCase() ===
            'offen' &&
          occupancy.isAvailable
        );
      }

      if (
        moduleState.availability ===
        'open'
      ) {
        return (
          String(list.status).toLowerCase() ===
          'offen'
        );
      }

      return true;
    })
    .sort((a, b) => {
      const sortA = Number(a.sortierung || 0);
      const sortB = Number(b.sortierung || 0);

      if (sortA !== sortB) {
        return sortA - sortB;
      }

      return String(a.titel || '')
        .localeCompare(
          String(b.titel || ''),
          'de'
        );
    });
}

function renderEventCard(event, lists) {
  return `
    <article class="event-card">
      <header class="event-card-header">
        <div class="event-date-block">
          <span>${escapeHtml(
            formatEventDate(event)
          )}</span>
        </div>

        <div class="event-title-area">
          <div class="event-title-row">
            <h2>${escapeHtml(event.titel)}</h2>
            <span class="status-badge ${
              String(event.status).toLowerCase() ===
                'offen'
                ? 'is-open'
                : 'is-closed'
            }">
              ${escapeHtml(
                String(event.status || 'offen')
              )}
            </span>
          </div>

          ${event.beschreibung
            ? `<p>${escapeHtml(event.beschreibung)}</p>`
            : ''}
        </div>
      </header>

      <div class="event-list-grid">
        ${lists
          .map(list =>
            renderListCard(
              list,
              event
            )
          )
          .join('')}
      </div>
    </article>
  `;
}

function renderListCard(list, event) {
  const occupancy =
    getOccupancy(list);

  const category =
    getCategory(list.kategorie);

  const isOpen =
    String(list.status).toLowerCase() ===
    'offen';

  const canRegister =
    isOpen &&
    occupancy.isAvailable;

  const type =
    normalizeListType(list.typ);

  const entries =
    getEntriesForList(list.id);

  return `
    <article
      class="assignment-card"
      style="--category-color:${escapeHtml(
        category.farbe
      )}"
    >
      <div class="assignment-accent"></div>

      <div class="assignment-card-body">
        <div class="assignment-topline">
          <span
            class="category-chip"
            style="
              --chip-color:${escapeHtml(category.farbe)};
              --chip-background:${escapeHtml(
                hexToRgba(category.farbe, 0.11)
              )};
            "
          >
            ${escapeHtml(list.kategorie || 'Sonstiges')}
          </span>

          <span class="type-label">
            ${escapeHtml(type.label)}
          </span>
        </div>

        <h3>${escapeHtml(list.titel)}</h3>

        ${list.beschreibung
          ? `<p class="assignment-description">
              ${escapeHtml(list.beschreibung)}
            </p>`
          : ''}

        <div class="assignment-meta">
          ${list.datum
            ? metaItem('Datum', list.datum)
            : ''}
          ${list.uhrzeit
            ? metaItem('Uhrzeit', list.uhrzeit)
            : ''}
          ${pointsMarkup(list)}
        </div>

        ${occupancy.maximum > 0
          ? `
            <div class="occupancy-block">
              <div class="occupancy-heading">
                <span>
                  ${occupancy.used} von
                  ${occupancy.maximum} belegt
                </span>
                <strong>
                  ${occupancy.free > 0
                    ? occupancy.free +
                      ' frei'
                    : 'Voll'}
                </strong>
              </div>

              <div
                class="progress-track"
                aria-label="${occupancy.used} von ${occupancy.maximum} Plätzen belegt"
              >
                <span
                  style="width:${occupancy.percent}%"
                ></span>
              </div>
            </div>
          `
          : `
            <div class="occupancy-unlimited">
              Keine feste Begrenzung
            </div>
          `}

        ${entries.length
          ? `
            <details class="entry-list">
              <summary>
                Bereits eingetragen
                <span>${entries.length}</span>
              </summary>
              <div class="entry-list-content">
                ${entries
                  .map(entry =>
                    renderEntry(entry, type)
                  )
                  .join('')}
              </div>
            </details>
          `
          : `
            <div class="no-entries">
              Noch keine Eintragungen
            </div>
          `}

        <div class="assignment-actions">
          <button
            type="button"
            class="button ${
              canRegister
                ? 'button-primary'
                : 'button-disabled'
            }"
            data-entry-list-id="${escapeHtml(list.id)}"
            data-event-title="${escapeHtml(event.titel)}"
            ${canRegister
              ? ''
              : 'disabled'}
          >
            ${isOpen
              ? occupancy.isAvailable
                ? 'Jetzt eintragen'
                : 'Keine Plätze frei'
              : 'Eintragung geschlossen'}
          </button>
        </div>
      </div>
    </article>
  `;
}

function renderEntry(entry, type) {
  const details = [];

  if (
    type.needsContribution &&
    entry.beitrag
  ) {
    details.push(entry.beitrag);
  }

  if (
    entry.menge !== '' &&
    entry.menge !== null &&
    entry.menge !== undefined
  ) {
    details.push('Menge: ' + entry.menge);
  }

  return `
    <div class="entry-person">
      <span class="entry-avatar">
        ${escapeHtml(
          getInitials(entry.name)
        )}
      </span>
      <div>
        <strong>${escapeHtml(entry.name)}</strong>
        ${details.length
          ? `<span>${escapeHtml(details.join(' · '))}</span>`
          : ''}
      </div>
    </div>
  `;
}

function bindFilters(
  contentElement,
  refreshFrontendData
) {
  const search =
    contentElement.querySelector(
      '#eventsSearch'
    );

  const category =
    contentElement.querySelector(
      '#categoryFilter'
    );

  const availability =
    contentElement.querySelector(
      '#availabilityFilter'
    );

  let searchTimeout;

  search.addEventListener('input', event => {
    window.clearTimeout(searchTimeout);

    searchTimeout = window.setTimeout(() => {
      moduleState.search =
        event.target.value;

      renderContent(
        contentElement,
        refreshFrontendData
      );

      const newSearch =
        contentElement.querySelector(
          '#eventsSearch'
        );

      newSearch.focus();
      newSearch.setSelectionRange(
        newSearch.value.length,
        newSearch.value.length
      );
    }, 180);
  });

  category.addEventListener('change', event => {
    moduleState.category =
      event.target.value;

    renderContent(
      contentElement,
      refreshFrontendData
    );
  });

  availability.addEventListener(
    'change',
    event => {
      moduleState.availability =
        event.target.value;

      renderContent(
        contentElement,
        refreshFrontendData
      );
    }
  );
}

function bindEntryButtons(
  contentElement,
  refreshFrontendData
) {
  contentElement
    .querySelectorAll(
      '[data-entry-list-id]'
    )
    .forEach(button => {
      button.addEventListener(
        'click',
        () => {
          const list =
            moduleState.lists.find(item =>
              item.id ===
              button.dataset.entryListId
            );

          if (!list) {
            return;
          }

          openEntryDialog(
            contentElement,
            list,
            button.dataset.eventTitle,
            refreshFrontendData
          );
        }
      );
    });
}

function openEntryDialog(
  contentElement,
  list,
  eventTitle,
  refreshFrontendData
) {
  const type =
    normalizeListType(list.typ);

  const pointsEnabled =
    moduleState.settings.punkteAktiv ===
    true;

  const root =
    contentElement.querySelector(
      '#entryDialogRoot'
    );

  root.innerHTML = `
    <div class="dialog-backdrop" data-dialog-close>
      <section
        class="dialog-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="entryDialogTitle"
      >
        <header class="dialog-header">
          <div>
            <span class="eyebrow">
              ${escapeHtml(eventTitle)}
            </span>
            <h2 id="entryDialogTitle">
              ${escapeHtml(list.titel)}
            </h2>
          </div>

          <button
            type="button"
            class="icon-button"
            aria-label="Dialog schließen"
            data-dialog-close
          >
            ×
          </button>
        </header>

        <form id="entryForm" class="dialog-form">
          <label class="form-field">
            <span>Name</span>
            <input
              name="name"
              type="text"
              maxlength="120"
              required
              autocomplete="name"
              placeholder="Zum Beispiel Müller"
            >
          </label>

          ${pointsEnabled
            ? `
              <p class="form-hint">
                Bitte verwende bei allen Eintragungen immer dieselbe
                Schreibweise, damit deine Punkte korrekt zusammengeführt
                werden.
              </p>
            `
            : ''}

          ${type.needsContribution
            ? `
              <label class="form-field">
                <span>Beitrag</span>
                <input
                  name="beitrag"
                  type="text"
                  maxlength="200"
                  required
                  placeholder="${escapeHtml(
                    type.contributionPlaceholder
                  )}"
                >
              </label>

              <label class="form-field">
                <span>Menge</span>
                <input
                  name="menge"
                  type="number"
                  min="1"
                  step="1"
                  value="1"
                  required
                >
              </label>
            `
            : ''}

          <label class="form-field">
            <span>Bemerkung <small>optional</small></span>
            <textarea
              name="bemerkung"
              rows="3"
              maxlength="500"
              placeholder="Zusätzliche Information"
            ></textarea>
          </label>

          <div
            id="entryFormError"
            class="form-error"
            hidden
          ></div>

          <div class="dialog-actions">
            <button
              type="button"
              class="button button-secondary"
              data-dialog-close
            >
              Abbrechen
            </button>

            <button
              type="submit"
              class="button button-primary"
            >
              Eintragung speichern
            </button>
          </div>
        </form>
      </section>
    </div>
  `;

  const backdrop =
    root.querySelector('.dialog-backdrop');

  const form =
    root.querySelector('#entryForm');

  const nameInput =
    form.elements.name;

  window.setTimeout(
    () => nameInput.focus(),
    50
  );

  root
    .querySelectorAll('[data-dialog-close]')
    .forEach(element => {
      element.addEventListener(
        'click',
        event => {
          if (
            event.target === backdrop ||
            event.currentTarget !== backdrop
          ) {
            closeDialog(root);
          }
        }
      );
    });

  backdrop.addEventListener(
    'click',
    event => {
      if (event.target === backdrop) {
        closeDialog(root);
      }
    }
  );

  document.addEventListener(
    'keydown',
    function escapeListener(event) {
      if (event.key === 'Escape') {
        closeDialog(root);
        document.removeEventListener(
          'keydown',
          escapeListener
        );
      }
    }
  );

  form.addEventListener(
    'submit',
    async event => {
      event.preventDefault();

      const submitButton =
        form.querySelector(
          '[type="submit"]'
        );

      const errorBox =
        form.querySelector(
          '#entryFormError'
        );

      const formData =
        new FormData(form);

      const payload = {
        listenId: list.id,
        name:
          String(
            formData.get('name') || ''
          ).trim(),
        beitrag:
          String(
            formData.get('beitrag') || ''
          ).trim(),
        menge:
          formData.get('menge')
            ? Number(formData.get('menge'))
            : '',
        bemerkung:
          String(
            formData.get('bemerkung') || ''
          ).trim()
      };

      submitButton.disabled = true;
      submitButton.textContent =
        'Wird gespeichert …';

      errorBox.hidden = true;
      errorBox.textContent = '';

      try {
        await apiPost(
          'createentry',
          {
            data: payload
          }
        );

        closeDialog(root);

        showToast(
          contentElement,
          'Eintragung erfolgreich gespeichert.',
          'success'
        );

        const [
          entries
        ] = await Promise.all([
          apiGet('entries'),
          typeof refreshFrontendData ===
            'function'
            ? refreshFrontendData()
            : Promise.resolve()
        ]);

        moduleState.entries =
          Array.isArray(entries)
            ? entries
            : [];

        renderContent(
          contentElement,
          refreshFrontendData
        );
      } catch (error) {
        errorBox.textContent =
          error && error.message
            ? error.message
            : 'Die Eintragung konnte nicht gespeichert werden.';

        errorBox.hidden = false;

        submitButton.disabled = false;
        submitButton.textContent =
          'Eintragung speichern';
      }
    }
  );
}

function closeDialog(root) {
  root.innerHTML = '';
}

function showToast(
  contentElement,
  message,
  type
) {
  const root =
    contentElement.querySelector(
      '#eventsToastRoot'
    );

  if (!root) {
    return;
  }

  const toast =
    document.createElement('div');

  toast.className =
    'toast toast-' + type;

  toast.textContent = message;

  root.appendChild(toast);

  window.setTimeout(
    () => toast.remove(),
    4200
  );
}

function getOccupancy(list) {
  const used =
    getEntriesForList(list.id).length;

  const maximum =
    Number(list.anzahl || 0);

  const hasLimit =
    Number.isFinite(maximum) &&
    maximum > 0;

  const free =
    hasLimit
      ? Math.max(maximum - used, 0)
      : Infinity;

  return {
    used,
    maximum:
      hasLimit
        ? maximum
        : 0,
    free,
    percent:
      hasLimit
        ? Math.min(
            Math.round(
              used / maximum * 100
            ),
            100
          )
        : 0,
    isAvailable:
      !hasLimit ||
      free > 0
  };
}

function getEntriesForList(listId) {
  return moduleState.entries
    .filter(entry =>
      String(entry.listenId) ===
      String(listId)
    )
    .sort((a, b) =>
      String(a.name || '')
        .localeCompare(
          String(b.name || ''),
          'de'
        )
    );
}

function getCategory(name) {
  return moduleState.categories
    .find(category =>
      category.bezeichnung === name
    ) || {
      bezeichnung:
        name || 'Sonstiges',
      farbe:
        '#546E7A',
      icon:
        'circle'
    };
}

function countVisibleLists(events) {
  return events.reduce(
    (sum, event) =>
      sum +
      getVisibleListsForEvent(
        event.id
      ).length,
    0
  );
}

function countAvailablePlaces(events) {
  return events.reduce(
    (sum, event) =>
      sum +
      getVisibleListsForEvent(event.id)
        .reduce(
          (listSum, list) => {
            const occupancy =
              getOccupancy(list);

            if (
              occupancy.maximum <= 0 ||
              !Number.isFinite(
                occupancy.free
              )
            ) {
              return listSum;
            }

            return (
              listSum +
              occupancy.free
            );
          },
          0
        ),
    0
  );
}

function normalizeListType(value) {
  const type =
    normalizeText(value)
      .replace(/\s+/g, '-');

  if (
    type.includes('kuchen') ||
    type.includes('sachspende') ||
    type.includes('mitbring')
  ) {
    return {
      label:
        type.includes('kuchen')
          ? 'Kuchenliste'
          : 'Beitragsliste',
      needsContribution:
        true,
      contributionPlaceholder:
        type.includes('kuchen')
          ? 'Zum Beispiel Apfelkuchen'
          : 'Was bringst du mit?'
    };
  }

  if (type.includes('schicht')) {
    return {
      label:
        'Schicht',
      needsContribution:
        false,
      contributionPlaceholder:
        ''
    };
  }

  return {
    label:
      'Helfereinsatz',
    needsContribution:
      false,
    contributionPlaceholder:
      ''
  };
}

function pointsMarkup(list) {
  if (
    moduleState.settings.punkteAktiv !==
      true ||
    list.punkte === '' ||
    list.punkte === null ||
    list.punkte === undefined
  ) {
    return '';
  }

  const label =
    moduleState.settings.punkteBezeichnung ||
    'Punkte';

  return metaItem(
    label,
    String(list.punkte)
  );
}

function metaItem(label, value) {
  return `
    <div class="meta-item">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function formatEventDate(event) {
  if (
    event.startdatum &&
    event.enddatum &&
    event.enddatum !== event.startdatum
  ) {
    return (
      event.startdatum +
      ' – ' +
      event.enddatum
    );
  }

  return (
    event.startdatum ||
    'Ohne Datum'
  );
}

function getInitials(name) {
  return String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part =>
      part.charAt(0).toUpperCase()
    )
    .join('') || '?';
}

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('de-DE');
}

function hexToRgba(hex, alpha) {
  const normalized =
    String(hex || '')
      .replace('#', '');

  if (
    !/^[0-9A-Fa-f]{6}$/.test(
      normalized
    )
  ) {
    return `rgba(84,110,122,${alpha})`;
  }

  const red =
    parseInt(
      normalized.substring(0, 2),
      16
    );

  const green =
    parseInt(
      normalized.substring(2, 4),
      16
    );

  const blue =
    parseInt(
      normalized.substring(4, 6),
      16
    );

  return `rgba(${red},${green},${blue},${alpha})`;
}

function createLoadingMarkup() {
  return `
    <section class="events-loading">
      <div class="panel-card">
        <div class="skeleton skeleton-title"></div>
        <div class="skeleton"></div>
        <div class="skeleton skeleton-short"></div>
      </div>
      <div class="panel-card">
        <div class="skeleton skeleton-title"></div>
        <div class="skeleton"></div>
        <div class="skeleton"></div>
      </div>
    </section>
  `;
}

function renderModuleError(
  contentElement,
  error,
  retry
) {
  contentElement.innerHTML = `
    <section class="error-card" role="alert">
      <span class="eyebrow">Einsätze</span>
      <h2>Die Einsätze konnten nicht geladen werden</h2>
      <p>${escapeHtml(
        error && error.message
          ? error.message
          : 'Unbekannter Fehler'
      )}</p>
      <button
        type="button"
        class="button button-primary"
        id="eventsRetryButton"
      >
        Erneut versuchen
      </button>
    </section>
  `;

  contentElement
    .querySelector(
      '#eventsRetryButton'
    )
    .addEventListener(
      'click',
      retry
    );
}

function renderNoResults() {
  return `
    <div class="empty-state compact-empty-state">
      <div class="empty-icon" aria-hidden="true">⌕</div>
      <h2>Keine passenden Einsätze</h2>
      <p>
        Ändere die Suche oder die ausgewählten Filter.
      </p>
    </div>
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
