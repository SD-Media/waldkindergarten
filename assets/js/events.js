/**
 * Vereinsverwaltung – öffentliche Übersicht
 */

import {
  apiPost
} from './api.js';

import {
  getStoreSnapshot,
  refreshStore,
  getAllEvents,
  createStoreBackup,
  restoreStoreBackup,
  addEntryOptimistic,
  finalizeEntryOptimistic
} from './store.js';

const viewState = {
  search: '',
  category: '',
  availability: 'all'
};

export async function renderOverviewPage(
  options
) {
  const {
    contentElement,
    setPageHeading
  } = options;

  setPageHeading(
    'Übersicht',
    'Veranstaltungen & Listen'
  );

  renderOverview(
    contentElement,
    options
  );
}

function renderOverview(
  contentElement,
  options
) {
  const snapshot =
    getStoreSnapshot();

  const data =
    snapshot.frontendData;

  if (!data) {
    contentElement.innerHTML =
      createLoadingMarkup();

    return;
  }

  const settings =
    data.einstellungen || {};

  const categories =
    snapshot.categories || [];

  const events =
    filterEvents(
      getAllEvents()
    );

  contentElement.innerHTML = `
    <section class="events-toolbar panel-card">
      <div class="events-search-wrap">
        <label class="sr-only" for="overviewSearch">
          Übersicht durchsuchen
        </label>

        <input
          id="overviewSearch"
          class="search-input"
          type="search"
          value="${escapeHtml(viewState.search)}"
          placeholder="Veranstaltungen & Listen durchsuchen …"
          autocomplete="off"
        >
      </div>

      <div class="events-filter-row">
        <label class="filter-field">
          <span>Kategorie</span>

          <select id="overviewCategoryFilter">
            <option value="">
              Alle Kategorien
            </option>

            ${categories
              .map(category => `
                <option
                  value="${escapeHtml(category.bezeichnung)}"
                  ${viewState.category === category.bezeichnung
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

          <select id="overviewAvailabilityFilter">
            <option
              value="all"
              ${viewState.availability === 'all'
                ? 'selected'
                : ''}
            >
              Alle
            </option>

            <option
              value="available"
              ${viewState.availability === 'available'
                ? 'selected'
                : ''}
            >
              Nur mit freien Plätzen
            </option>

            <option
              value="open"
              ${viewState.availability === 'open'
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
      ${summaryPill(
        events.length,
        events.length === 1
          ? 'Veranstaltung'
          : 'Veranstaltungen'
      )}

      ${summaryPill(
        countLists(events),
        countLists(events) === 1
          ? 'Liste'
          : 'Listen'
      )}

      ${summaryPill(
        countFreePlaces(events),
        'freie Plätze'
      )}
    </section>

    <section class="events-stack">
      ${events.length
        ? events
            .map(event =>
              renderEvent(
                event,
                categories,
                settings,
                contentElement,
                options
              )
            )
            .join('')
        : renderNoResults()}
    </section>

    <div id="overviewDialogRoot"></div>
    <div id="overviewToastRoot" class="toast-root"></div>
  `;

  bindFilters(
    contentElement,
    options
  );

  bindEntryButtons(
    contentElement,
    options
  );
}

function filterEvents(events) {
  const search =
    normalizeText(
      viewState.search
    );

  return events
    .map(event => ({
      ...event,
      listen:
        getFilteredLists(
          event.listen || []
        )
    }))
    .filter(event => {
      if (
        event.listen.length < 1
      ) {
        return false;
      }

      if (!search) {
        return true;
      }

      const eventText =
        normalizeText([
          event.titel,
          event.beschreibung,
          event.startdatum,
          event.enddatum,
          event.verantwortlich
        ].join(' '));

      const listText =
        normalizeText(
          event.listen
            .map(list => [
              list.titel,
              list.beschreibung,
              list.kategorie,
              list.typ,
              list.datum,
              list.uhrzeit,
              list.verantwortlich
            ].join(' '))
            .join(' ')
        );

      return (
        eventText.includes(search) ||
        listText.includes(search)
      );
    })
    .sort(
      compareEvents
    );
}

function getFilteredLists(lists) {
  return lists
    .filter(list => {
      if (
        viewState.category &&
        list.kategorie !==
          viewState.category
      ) {
        return false;
      }

      if (
        viewState.availability ===
        'available'
      ) {
        return (
          String(list.status)
            .toLowerCase() ===
            'offen' &&
          list.voll !== true
        );
      }

      if (
        viewState.availability ===
        'open'
      ) {
        return (
          String(list.status)
            .toLowerCase() ===
          'offen'
        );
      }

      return true;
    })
    .sort(
      compareLists
    );
}

function renderEvent(
  event,
  categories,
  settings
) {
  const date =
    parseGermanDate(
      event.startdatum
    );

  return `
    <article class="event-card${isPastEvent(event) ? ' is-past-event' : ''}">
      <header class="event-card-header">
        ${renderDateBadge(
          date,
          event.startdatum
        )}

        <div class="event-title-area">
          <div class="event-title-row">
            <div>
              <span class="event-kicker">
                Veranstaltung
              </span>

              <h2>
                ${escapeHtml(event.titel)}
              </h2>
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

          ${event.verantwortlich
            ? `
              <div class="event-responsible">
                <span>Verantwortlich</span>
                <strong>
                  ${escapeHtml(event.verantwortlich)}
                </strong>
              </div>
            `
            : ''}
        </div>
      </header>

      <div class="event-list-grid">
        ${event.listen
          .map(list =>
            renderList(
              list,
              event,
              categories,
              settings
            )
          )
          .join('')}
      </div>
    </article>
  `;
}

function renderList(
  list,
  event,
  categories,
  settings
) {
  const category =
    categories.find(item =>
      item.bezeichnung ===
      list.kategorie
    ) || {
      farbe:
        '#546E7A',
      bezeichnung:
        list.kategorie ||
        'Sonstiges'
    };

  const entries =
    Array.isArray(
      list.eintragungen
    )
      ? list.eintragungen
      : [];

  const isOpen =
    String(list.status)
      .toLowerCase() ===
    'offen';

  const hasLimit =
    Number(list.anzahl || 0) >
    0;

  const free =
    hasLimit
      ? Math.max(
          Number(list.anzahl) -
            entries.length,
          0
        )
      : null;

  const canRegister =
    isOpen &&
    (
      !hasLimit ||
      free > 0
    );

  return `
    <article
      class="assignment-card"
      style="--category-color:${escapeHtml(category.farbe)}"
    >
      <div class="assignment-accent"></div>

      <div class="assignment-card-body">
        <div class="assignment-topline">
          <span
            class="category-chip"
            style="
              --chip-color:${escapeHtml(category.farbe)};
              --chip-background:${escapeHtml(
                hexToRgba(
                  category.farbe,
                  0.11
                )
              )};
            "
          >
            ${escapeHtml(
              category.bezeichnung
            )}
          </span>
        </div>

        <h3>
          ${escapeHtml(list.titel)}
        </h3>

        ${list.beschreibung
          ? `
            <p class="assignment-description">
              ${escapeHtml(list.beschreibung)}
            </p>
          `
          : ''}

        <div class="assignment-meta">
          ${settings.punkteAktiv === true
            ? metaItem(
                settings.punkteBezeichnung ||
                  'Punkte',
                String(
                  list.punkte ?? 0
                )
              )
            : ''}

          ${metaItem(
            'Datum',
            list.datum ||
            event.startdatum ||
            'Ohne Datum'
          )}

          ${list.uhrzeit
            ? metaItem(
                'Uhrzeit',
                list.uhrzeit +
                ' Uhr'
              )
            : ''}

          ${list.verantwortlich
            ? metaItem(
                'Verantwortlich',
                list.verantwortlich
              )
            : ''}
        </div>

        ${hasLimit
          ? occupancyMarkup(
              calculateDisplayedOccupied_(
                list,
                entries
              ),
              Number(list.anzahl)
            )
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
                <span>
                  ${entries.length}
                </span>
              </summary>

              <div class="entry-list-content">
                ${entries
                  .map(renderPublicEntry)
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
            data-public-entry-list-id="${escapeHtml(list.id)}"
            ${canRegister
              ? ''
              : 'disabled'}
          >
            ${isOpen
              ? canRegister
                ? 'Jetzt eintragen'
                : 'Keine Plätze frei'
              : 'Eintragung geschlossen'}
          </button>
        </div>
      </div>
    </article>
  `;
}

function renderPublicEntry(entry) {
  const details = [];

  if (entry.beitrag) {
    details.push(
      String(
        entry.beitrag
      )
    );
  }

  if (
    entry.menge !== '' &&
    entry.menge !== null &&
    entry.menge !== undefined
  ) {
    details.push(
      'Menge: ' +
      String(
        entry.menge
      )
    );
  }

  if (entry.bemerkung) {
    details.push(
      String(
        entry.bemerkung
      )
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


function bindFilters(
  contentElement,
  options
) {
  const search =
    contentElement.querySelector(
      '#overviewSearch'
    );

  const category =
    contentElement.querySelector(
      '#overviewCategoryFilter'
    );

  const availability =
    contentElement.querySelector(
      '#overviewAvailabilityFilter'
    );

  let timer;

  search.addEventListener(
    'input',
    event => {
      clearTimeout(timer);

      timer =
        window.setTimeout(() => {
          viewState.search =
            event.target.value;

          renderOverview(
            contentElement,
            options
          );

          const nextSearch =
            contentElement.querySelector(
              '#overviewSearch'
            );

          nextSearch.focus();

          nextSearch.setSelectionRange(
            nextSearch.value.length,
            nextSearch.value.length
          );
        }, 180);
    }
  );

  category.addEventListener(
    'change',
    event => {
      viewState.category =
        event.target.value;

      renderOverview(
        contentElement,
        options
      );
    }
  );

  availability.addEventListener(
    'change',
    event => {
      viewState.availability =
        event.target.value;

      renderOverview(
        contentElement,
        options
      );
    }
  );
}

function bindEntryButtons(
  contentElement,
  options
) {
  contentElement
    .querySelectorAll(
      '[data-public-entry-list-id]'
    )
    .forEach(button => {
      button.addEventListener(
        'click',
        () => {
          const event =
            getAllEvents()
              .find(item =>
                (
                  item.listen || []
                ).some(list =>
                  list.id ===
                  button.dataset.publicEntryListId
                )
              );

          const list =
            event
              ? event.listen.find(item =>
                  item.id ===
                  button.dataset.publicEntryListId
                )
              : null;

          if (
            event &&
            list
          ) {
            openEntryDialog(
              contentElement,
              event,
              list,
              options
            );
          }
        }
      );
    });
}

function openEntryDialog(
  contentElement,
  event,
  list,
  options
) {
  const root =
    contentElement.querySelector(
      '#overviewDialogRoot'
    );

  const settings =
    getStoreSnapshot()
      .frontendData
      .einstellungen || {};

  const normalizedType =
    normalizeText(
      list.typ
    );

  const needsContribution =
    normalizedType !==
      'helfereinsatz' &&
    normalizedType !==
      'helfer-einsatz';

  root.innerHTML = `
    <div class="dialog-backdrop">
      <section
        class="dialog-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="publicEntryTitle"
      >
        <header class="dialog-header">
          <div>
            <span class="eyebrow">
              ${escapeHtml(event.titel)}
            </span>

            <h2 id="publicEntryTitle">
              ${escapeHtml(list.titel)}
            </h2>
          </div>

          <button
            type="button"
            class="icon-button"
            data-dialog-close
            aria-label="Dialog schließen"
          >
            ×
          </button>
        </header>

        <form
          id="publicEntryForm"
          class="dialog-form"
        >
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

          ${settings.punkteAktiv === true
            ? `
              <p class="form-hint">
                Bitte verwende bei allen Eintragungen dieselbe
                Schreibweise deines Namens.
              </p>
            `
            : ''}

          ${needsContribution
            ? `
              <label class="form-field">
                <span>Was wird mitgebracht oder gespendet?</span>

                <input
                  name="beitrag"
                  type="text"
                  maxlength="200"
                  required
                  placeholder="Was bringst du mit?"
                >
              </label>

              <label class="form-field">
                <span>Menge</span>

                <input
                  name="menge"
                  type="number"
                  min="1"
                  max="${Number(list.frei || 0) > 0
                    ? escapeHtml(list.frei)
                    : ''}"
                  step="1"
                  value="1"
                  required
                >
              </label>
            `
            : ''}

          <label class="form-field">
            <span>
              Bemerkung
              <small>optional und öffentlich sichtbar</small>
            </span>

            <textarea
              name="bemerkung"
              rows="3"
              maxlength="500"
              placeholder="Zusätzliche Information"
            ></textarea>
          </label>

          <div
            id="publicEntryError"
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

  const form =
    root.querySelector(
      '#publicEntryForm'
    );

  let dirty =
    false;

  form.addEventListener(
    'input',
    () => {
      dirty = true;
    }
  );

  bindSafeDialogClose(
    root,
    () => dirty
  );

  form.elements.name.focus();

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
          '#publicEntryError'
        );

      button.disabled =
        true;

      button.textContent =
        'Wird gespeichert …';

      errorBox.hidden =
        true;

      const data =
        new FormData(form);

      const payload = {
        listenId:
          list.id,
        name:
          String(
            data.get('name') ||
            ''
          ).trim(),
        beitrag:
          String(
            data.get('beitrag') ||
            ''
          ).trim(),
        menge:
          data.get('menge')
            ? Number(
                data.get('menge')
              )
            : '',
        bemerkung:
          String(
            data.get('bemerkung') ||
            ''
          ).trim()
      };

      const backup =
        createStoreBackup();

      const temporaryId =
        'TEMP_ENTRY_' +
        Date.now();

      addEntryOptimistic(
        list.id,
        {
          id:
            temporaryId,
          listenId:
            list.id,
          name:
            payload.name,
          beitrag:
            payload.beitrag,
          menge:
            payload.menge,
          bemerkung:
            payload.bemerkung,
          erstelltAm:
            '',
          aktualisiertAm:
            ''
        }
      );

      dirty =
        false;

      root.innerHTML =
        '';

      renderOverview(
        contentElement,
        options
      );

      try {
        const savedEntry =
          await apiPost(
            'createentry',
            {
              data:
                payload
            }
          );

        finalizeEntryOptimistic(
          temporaryId,
          savedEntry
        );

        window.setTimeout(
          () => {
            refreshStore()
              .then(() =>
                renderOverview(
                  contentElement,
                  options
                )
              )
              .catch(
                error =>
                  console.warn(
                    'Spätere Hintergrundaktualisierung fehlgeschlagen.',
                    error
                  )
              );
          },
          20000
        );
      } catch (error) {
        restoreStoreBackup(
          backup
        );

        renderOverview(
          contentElement,
          options
        );

        window.alert(
          error &&
          error.message
            ? error.message
            : 'Die Eintragung konnte nicht gespeichert werden.'
        );
      }
    }
  );
}

function bindSafeDialogClose(
  root,
  isDirty
) {
  root
    .querySelectorAll(
      '[data-dialog-close]'
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

function calculateDisplayedOccupied_(
  list,
  entries
) {
  const backendValue =
    Number(
      list.belegt
    );

  if (
    Number.isFinite(
      backendValue
    ) &&
    backendValue >= 0
  ) {
    return backendValue;
  }

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

function occupancyMarkup(
  used,
  maximum
) {
  const free =
    Math.max(
      maximum -
        used,
      0
    );

  const percent =
    Math.min(
      Math.round(
        used /
        maximum *
        100
      ),
      100
    );

  return `
    <div class="occupancy-block">
      <div class="occupancy-heading">
        <span>
          ${used} von ${maximum} belegt
        </span>

        <strong>
          ${free > 0
            ? free + ' frei'
            : 'Voll'}
        </strong>
      </div>

      <div class="progress-track">
        <span
          style="width:${percent}%"
        ></span>
      </div>
    </div>
  `;
}

function renderDateBadge(
  date,
  fallback
) {
  if (!date) {
    return `
      <div class="event-date-large is-text-date">
        <strong>
          ${escapeHtml(
            fallback ||
            'Ohne Datum'
          )}
        </strong>
      </div>
    `;
  }

  return `
    <div class="event-date-large">
      <span>
        ${escapeHtml(
          date.weekday
        )}
      </span>

      <strong>
        ${escapeHtml(
          date.day
        )}
      </strong>

      <span>
        ${escapeHtml(
          date.month
        )}
        ${escapeHtml(
          date.year
        )}
      </span>
    </div>
  `;
}

function parseGermanDate(value) {
  const match =
    /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(
      String(value || '')
    );

  if (!match) {
    return null;
  }

  const date =
    new Date(
      Number(match[3]),
      Number(match[2]) - 1,
      Number(match[1])
    );

  return {
    day:
      String(match[1])
        .padStart(
          2,
          '0'
        ),
    month:
      date.toLocaleDateString(
        'de-DE',
        {
          month:
            'short'
        }
      ).replace('.', ''),
    year:
      match[3],
    weekday:
      date.toLocaleDateString(
        'de-DE',
        {
          weekday:
            'long'
        }
      )
  };
}

function compareEvents(a, b) {
  const aPast =
    isPastEvent(a);

  const bPast =
    isPastEvent(b);

  if (aPast !== bPast) {
    return aPast
      ? 1
      : -1;
  }

  const difference =
    dateSortValue(
      a.startdatum
    ) -
    dateSortValue(
      b.startdatum
    );

  /*
   * Zukünftige Veranstaltungen: nächste zuerst.
   * Vergangene Veranstaltungen: zuletzt vergangene zuerst.
   */
  return aPast
    ? -difference
    : difference;
}

function isPastEvent(event) {
  const relevantDate =
    event && event.enddatum
      ? event.enddatum
      : event && event.startdatum
        ? event.startdatum
        : '';

  const timestamp =
    dateSortValue(
      relevantDate
    );

  if (
    timestamp ===
    Number.MAX_SAFE_INTEGER
  ) {
    return false;
  }

  const today =
    new Date();

  today.setHours(
    0,
    0,
    0,
    0
  );

  return timestamp <
    today.getTime();
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
  const parsed =
    parseGermanDate(value);

  if (!parsed) {
    return Number.MAX_SAFE_INTEGER;
  }

  return new Date(
    Number(parsed.year),
    [
      'Jan',
      'Feb',
      'Mär',
      'Apr',
      'Mai',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Okt',
      'Nov',
      'Dez'
    ].indexOf(parsed.month),
    Number(parsed.day)
  ).getTime();
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

function countLists(events) {
  return events.reduce(
    (sum, event) =>
      sum +
      event.listen.length,
    0
  );
}

function countFreePlaces(events) {
  return events.reduce(
    (sum, event) =>
      sum +
      event.listen.reduce(
        (listSum, list) =>
          listSum +
          (
            Number.isFinite(
              Number(list.frei)
            )
              ? Number(list.frei)
              : 0
          ),
        0
      ),
    0
  );
}

function summaryPill(
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

function metaItem(
  label,
  value
) {
  return `
    <div class="meta-item">
      <span>
        ${escapeHtml(label)}
      </span>

      <strong>
        ${escapeHtml(value)}
      </strong>
    </div>
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

function normalizeTypeLabel(value) {
  const text =
    String(value || '')
      .trim();

  return text ||
    'Liste';
}

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase(
      'de-DE'
    );
}

function getInitials(name) {
  return String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part =>
      part.charAt(0)
        .toUpperCase()
    )
    .join('') ||
    '?';
}

function hexToRgba(
  hex,
  alpha
) {
  const value =
    String(hex || '')
      .replace('#', '');

  if (
    !/^[0-9A-Fa-f]{6}$/.test(
      value
    )
  ) {
    return `rgba(84,110,122,${alpha})`;
  }

  return `rgba(${parseInt(value.slice(0, 2), 16)},${parseInt(value.slice(2, 4), 16)},${parseInt(value.slice(4, 6), 16)},${alpha})`;
}

function showToast(
  contentElement,
  message
) {
  const root =
    contentElement.querySelector(
      '#overviewToastRoot'
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

function createLoadingMarkup() {
  return `
    <section class="panel-card">
      <div class="skeleton skeleton-title"></div>
      <div class="skeleton"></div>
      <div class="skeleton skeleton-short"></div>
    </section>
  `;
}

function renderNoResults() {
  return `
    <div class="empty-state compact-empty-state">
      <div class="empty-icon">⌕</div>
      <h2>Keine passenden Einträge</h2>
      <p>
        Ändere die Suche oder die Filter.
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
