/**
 * Vereinsverwaltung – zentraler Frontend-Datenspeicher
 *
 * Verhindert unnötige doppelte API-Abfragen.
 */

import {
  apiGet
} from './api.js';

const CACHE_MAX_AGE_MS =
  60 * 1000;

const STORE_CACHE_KEY =
  'vereinsverwaltung_frontend_cache_v1';

const STORE_CACHE_MAX_AGE_MS =
  24 * 60 * 60 * 1000;

const state = {
  frontendData: null,
  categories: [],
  loadedAt: 0,
  loadingPromise: null
};

/**
 * Lädt die zuletzt bekannten Daten aus dem Browser-Cache.
 *
 * @return {boolean}
 */
export function hydrateStoreFromCache() {
  try {
    const raw =
      window.localStorage.getItem(
        STORE_CACHE_KEY
      );

    if (!raw) {
      return false;
    }

    const cached =
      JSON.parse(raw);

    if (
      !cached ||
      !cached.frontendData ||
      !cached.savedAt
    ) {
      return false;
    }

    if (
      Date.now() -
      Number(cached.savedAt) >
      STORE_CACHE_MAX_AGE_MS
    ) {
      window.localStorage.removeItem(
        STORE_CACHE_KEY
      );

      return false;
    }

    state.frontendData =
      cached.frontendData;

    state.categories =
      Array.isArray(
        cached.categories
      )
        ? cached.categories
        : [];

    state.loadedAt =
      Number(
        cached.savedAt
      );

    return true;
  } catch (error) {
    console.warn(
      'Browser-Cache konnte nicht gelesen werden.',
      error
    );

    return false;
  }
}

/**
 * Speichert die zuletzt bekannten Daten lokal.
 */
export function persistStoreCache() {
  try {
    if (!state.frontendData) {
      return;
    }

    window.localStorage.setItem(
      STORE_CACHE_KEY,
      JSON.stringify({
        frontendData:
          state.frontendData,
        categories:
          state.categories,
        savedAt:
          Date.now()
      })
    );
  } catch (error) {
    console.warn(
      'Browser-Cache konnte nicht gespeichert werden.',
      error
    );
  }
}

export function getStoreSnapshot() {
  return {
    frontendData:
      state.frontendData,
    categories:
      state.categories,
    loadedAt:
      state.loadedAt
  };
}

export async function loadStore(
  options = {}
) {
  const force =
    options.force === true;

  const isFresh =
    state.frontendData &&
    Date.now() -
      state.loadedAt <
      CACHE_MAX_AGE_MS;

  if (
    !force &&
    isFresh
  ) {
    return getStoreSnapshot();
  }

  if (
    state.loadingPromise
  ) {
    return state.loadingPromise;
  }

  state.loadingPromise =
    (async () => {
      /*
       * Schnellstart:
       * Zuerst werden nur Übersichtsdaten geladen.
       * Die aufwendige Punkteberechnung folgt später im Hintergrund.
       */
      const frontendData =
        await apiGet(
          'overviewdata',
          {},
          {
            timeoutMs:
              45000,
            attempts:
              2
          }
        );

      state.frontendData =
        frontendData;

      state.loadedAt =
        Date.now();

      persistStoreCache();

      loadCategoriesInBackground_();

      return getStoreSnapshot();
    })()
      .finally(() => {
        state.loadingPromise =
          null;
      });

  return state.loadingPromise;
}

/**
 * Lädt anschließend den vollständigen Datenstand einschließlich
 * Punkteberechnung und Kategorien.
 *
 * @return {Promise<Object>}
 */
export async function refreshStore() {
  const [
    frontendData,
    categories
  ] =
    await Promise.all([
      apiGet(
        'frontenddata',
        {},
        {
          timeoutMs:
            65000,
          attempts:
            2
        }
      ),
      apiGet(
        'categories',
        {},
        {
          timeoutMs:
            35000,
          attempts:
            2
        }
      ).catch(error => {
        console.warn(
          'Kategorien konnten nicht aktualisiert werden.',
          error
        );

        return state.categories;
      })
    ]);

  state.frontendData =
    frontendData;

  state.categories =
    sortStoreCategories_(
      categories
    );

  state.loadedAt =
    Date.now();

  persistStoreCache();

  return getStoreSnapshot();
}

/**
 * Lädt Kategorien ohne den sichtbaren Schnellstart zu blockieren.
 */
function loadCategoriesInBackground_() {
  if (
    Array.isArray(
      state.categories
    ) &&
    state.categories.length > 0
  ) {
    return;
  }

  apiGet(
    'categories',
    {},
    {
      timeoutMs:
        35000,
      attempts:
        2
    }
  )
    .then(categories => {
      state.categories =
        Array.isArray(
          categories
        )
          ? categories
          : [];

      persistStoreCache();
    })
    .catch(error => {
      console.warn(
        'Kategorien konnten im Hintergrund nicht geladen werden.',
        error
      );
    });
}


export function updateFrontendData(
  frontendData
) {
  state.frontendData =
    frontendData;

  state.loadedAt =
    Date.now();

  persistStoreCache();
}

export function updateCategories(
  categories
) {
  state.categories =
    sortStoreCategories_(
      categories
    );

  persistStoreCache();
}

export function getAllEvents() {
  const data =
    state.frontendData;

  if (
    !data ||
    !data.veranstaltungen
  ) {
    return [];
  }

  return []
    .concat(
      data.veranstaltungen.anstehend ||
        [],
      data.veranstaltungen.vergangen ||
        [],
      data.veranstaltungen.ohneDatum ||
        []
    );
}

export function getAllLists() {
  return getAllEvents()
    .flatMap(event =>
      Array.isArray(event.listen)
        ? event.listen
        : []
    );
}

export function getAllEntries() {
  return getAllLists()
    .flatMap(list =>
      Array.isArray(
        list.eintragungen
      )
        ? list.eintragungen
        : []
    );
}


/**
 * Erstellt eine vollständige Sicherung der aktuell geladenen Frontenddaten.
 *
 * @return {Object|null}
 */
export function createStoreBackup() {
  return state.frontendData
    ? JSON.parse(
        JSON.stringify(
          state.frontendData
        )
      )
    : null;
}

/**
 * Stellt zuvor gesicherte Frontenddaten wieder her.
 *
 * @param {Object|null} backup
 */
export function restoreStoreBackup(
  backup
) {
  state.frontendData =
    backup
      ? JSON.parse(
          JSON.stringify(
            backup
          )
        )
      : null;

  state.loadedAt =
    Date.now();
}

/**
 * Fügt eine Veranstaltung lokal ein.
 *
 * @param {Object} event
 */
export function addEventOptimistic(
  event
) {
  const target =
    ensureEventGroup_(
      'anstehend'
    );

  target.push(
    event
  );
}

/**
 * Aktualisiert eine Veranstaltung lokal.
 *
 * @param {string} eventId
 * @param {Object} updates
 */
export function updateEventOptimistic(
  eventId,
  updates
) {
  const event =
    findEventMutable_(
      eventId
    );

  if (!event) {
    return;
  }

  const oldDate =
    event.startdatum;

  const oldResponsible =
    String(
      event.verantwortlich || ''
    );

  Object.assign(
    event,
    updates
  );

  if (
    Array.isArray(
      event.listen
    )
  ) {
    event.listen.forEach(list => {
      if (
        updates.startdatum &&
        list.datum ===
          oldDate
      ) {
        list.datum =
          updates.startdatum;
      }

      if (
        Object.prototype
          .hasOwnProperty.call(
            updates,
            'verantwortlich'
          ) &&
        String(
          list.verantwortlich || ''
        ) ===
          oldResponsible
      ) {
        list.verantwortlich =
          String(
            updates.verantwortlich || ''
          );
      }
    });
  }
}

/**
 * Entfernt eine Veranstaltung einschließlich ihrer lokalen Unterdaten.
 *
 * @param {string} eventId
 */
export function removeEventOptimistic(
  eventId
) {
  for (
    const group of
    getEventGroups_()
  ) {
    const index =
      group.findIndex(event =>
        event.id ===
        eventId
      );

    if (index >= 0) {
      group.splice(
        index,
        1
      );

      return;
    }
  }
}

/**
 * Fügt einen Einsatz lokal ein.
 *
 * @param {string} eventId
 * @param {Object} list
 */
export function addListOptimistic(
  eventId,
  list
) {
  const event =
    findEventMutable_(
      eventId
    );

  if (!event) {
    return;
  }

  if (
    !Array.isArray(
      event.listen
    )
  ) {
    event.listen = [];
  }

  event.listen.push(
    list
  );
}

/**
 * Aktualisiert einen Einsatz lokal.
 *
 * @param {string} listId
 * @param {Object} updates
 */
export function updateListOptimistic(
  listId,
  updates
) {
  const result =
    findListMutable_(
      listId
    );

  if (!result) {
    return;
  }

  Object.assign(
    result.list,
    updates
  );
}

/**
 * Entfernt einen Einsatz lokal.
 *
 * @param {string} listId
 */
export function removeListOptimistic(
  listId
) {
  const result =
    findListMutable_(
      listId
    );

  if (!result) {
    return;
  }

  const index =
    result.event.listen
      .findIndex(list =>
        list.id ===
        listId
      );

  if (index >= 0) {
    result.event.listen.splice(
      index,
      1
    );
  }
}

/**
 * Fügt eine Eintragung lokal ein.
 *
 * @param {string} listId
 * @param {Object} entry
 */
export function addEntryOptimistic(
  listId,
  entry
) {
  const result = findListMutable_(listId);
  if (!result) return;
  if (!Array.isArray(result.list.eintragungen)) result.list.eintragungen = [];
  result.list.eintragungen.push(entry);
  result.list.belegt = result.list.eintragungen.length;
  const maximum = Number(result.list.anzahl || 0);
  result.list.frei = maximum > 0 ? Math.max(maximum - result.list.belegt, 0) : null;
  result.list.voll = maximum > 0 && result.list.belegt >= maximum;
  updatePointsForAddedEntry_(entry, result.event, result.list);
}


/**
 * Entfernt eine Eintragung lokal.
 *
 * @param {string} entryId
 */
export function removeEntryOptimistic(entryId) {
  for (const event of getAllEvents()) {
    for (const list of (event.listen || [])) {
      const entries = list.eintragungen || [];
      const index = entries.findIndex(entry => entry.id === entryId);
      if (index < 0) continue;
      const removedEntry = entries[index];
      entries.splice(index, 1);
      list.belegt = entries.length;
      const maximum = Number(list.anzahl || 0);
      list.frei = maximum > 0 ? Math.max(maximum - entries.length, 0) : null;
      list.voll = maximum > 0 && entries.length >= maximum;
      updatePointsForRemovedEntry_(removedEntry, list);
      return;
    }
  }
}

export function updatePointsConfigOptimistic(config) {
  if (!state.frontendData) return;
  if (!state.frontendData.einstellungen) state.frontendData.einstellungen = {};
  Object.assign(state.frontendData.einstellungen, config);
  if (!state.frontendData.punkte) {
    state.frontendData.punkte = { konfiguration: {}, gesamtpunkte: 0, personen: [] };
  }
  state.frontendData.punkte.konfiguration = {
    ...state.frontendData.punkte.konfiguration,
    ...config
  };
  recalculateAllPointPersons_();
}

function updatePointsForAddedEntry_(entry, event, list) {
  const pointsData = state.frontendData && state.frontendData.punkte;
  if (!pointsData || !pointsData.konfiguration || pointsData.konfiguration.punkteAktiv !== true) return;
  const name = String(entry.name || '').trim();
  if (!name) return;
  const points = Number(list.punkte || 0);
  let person = (pointsData.personen || []).find(item => normalizeStorePersonName_(item.name) === normalizeStorePersonName_(name));
  if (!person) {
    person = {
      name,
      punkte: 0,
      anzahlEintragungen: 0,
      sollwert: Number(pointsData.konfiguration.sollwert || 0),
      rest: 0,
      sollwertErreicht: false,
      status: 'offen',
      details: []
    };
    pointsData.personen.push(person);
  }
  person.punkte = Number(person.punkte || 0) + points;
  person.anzahlEintragungen = Number(person.anzahlEintragungen || 0) + 1;
  if (!Array.isArray(person.details)) person.details = [];
  person.details.push({
    veranstaltung: event.titel || '',
    veranstaltungId: event.id || '',
    liste: list.titel || '',
    listenId: list.id || '',
    datum: list.datum || '',
    uhrzeit: list.uhrzeit || '',
    verantwortlich: list.verantwortlich || '',
    punkte: points
  });
  pointsData.gesamtpunkte = Number(pointsData.gesamtpunkte || 0) + points;
  recalculatePointPerson_(person, pointsData.konfiguration);
}

function updatePointsForRemovedEntry_(entry, list) {
  const pointsData = state.frontendData && state.frontendData.punkte;
  if (!pointsData || !Array.isArray(pointsData.personen)) return;
  const person = pointsData.personen.find(item => normalizeStorePersonName_(item.name) === normalizeStorePersonName_(entry.name));
  if (!person) return;
  const points = Number(list.punkte || 0);
  person.punkte = Math.max(0, Number(person.punkte || 0) - points);
  person.anzahlEintragungen = Math.max(0, Number(person.anzahlEintragungen || 0) - 1);
  if (Array.isArray(person.details)) {
    const detailIndex = person.details.findIndex(detail => String(detail.listenId || '') === String(list.id || ''));
    if (detailIndex >= 0) person.details.splice(detailIndex, 1);
  }
  pointsData.gesamtpunkte = Math.max(0, Number(pointsData.gesamtpunkte || 0) - points);
  recalculatePointPerson_(person, pointsData.konfiguration || {});
}

function recalculateAllPointPersons_() {
  const pointsData = state.frontendData && state.frontendData.punkte;
  if (!pointsData || !Array.isArray(pointsData.personen)) return;
  pointsData.personen.forEach(person => recalculatePointPerson_(person, pointsData.konfiguration || {}));
}

function recalculatePointPerson_(person, config) {
  const target = config.sollwertAktiv ? Number(config.sollwert || 0) : 0;
  const difference = Number(person.punkte || 0) - target;
  person.sollwert = target;
  person.rest = Math.max(0, -difference);
  person.differenz = difference;
  person.sollwertErreicht = !config.sollwertAktiv || difference >= 0;
  person.status = person.sollwertErreicht ? 'erfüllt' : 'offen';
}

function normalizeStorePersonName_(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('de-DE');
}


function getEventGroups_() {
  if (
    !state.frontendData ||
    !state.frontendData.veranstaltungen
  ) {
    return [];
  }

  return [
    state.frontendData.veranstaltungen.anstehend ||
      [],
    state.frontendData.veranstaltungen.vergangen ||
      [],
    state.frontendData.veranstaltungen.ohneDatum ||
      []
  ];
}

function ensureEventGroup_(
  name
) {
  if (
    !state.frontendData.veranstaltungen[
      name
    ]
  ) {
    state.frontendData.veranstaltungen[
      name
    ] = [];
  }

  return state.frontendData
    .veranstaltungen[
      name
    ];
}

function findEventMutable_(
  eventId
) {
  for (
    const group of
    getEventGroups_()
  ) {
    const event =
      group.find(item =>
        item.id ===
        eventId
      );

    if (event) {
      return event;
    }
  }

  return null;
}

function findListMutable_(
  listId
) {
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


export function finalizeEntryOptimistic(
  temporaryId,
  savedEntry
) {
  for (const event of getAllEvents()) {
    for (const list of (event.listen || [])) {
      const entry =
        (list.eintragungen || [])
          .find(item =>
            item.id === temporaryId
          );

      if (!entry) {
        continue;
      }

      Object.assign(
        entry,
        savedEntry || {}
      );

      if (
        savedEntry &&
        savedEntry.id
      ) {
        entry.id =
          savedEntry.id;
      }

      return;
    }
  }
}

function sortStoreCategories_(
  categories
) {
  return (
    Array.isArray(
      categories
    )
      ? categories.slice()
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
}

function calculateStoreListOccupied_(
  list
) {
  const entries =
    list.eintragungen || [];

  const type =
    String(
      list.typ || ''
    )
      .trim()
      .toLowerCase();

  const quantityBased =
    [
      'kuchenliste',
      'sachspende',
      'freie-mitbringliste'
    ].includes(
      type
    );

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

