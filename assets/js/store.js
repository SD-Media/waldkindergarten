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

const state = {
  frontendData: null,
  categories: [],
  loadedAt: 0,
  loadingPromise: null
};

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
    Promise.all([
      apiGet('frontenddata'),
      state.categories.length &&
      !force
        ? Promise.resolve(
            state.categories
          )
        : apiGet('categories')
    ])
      .then(
        ([
          frontendData,
          categories
        ]) => {
          state.frontendData =
            frontendData;

          state.categories =
            Array.isArray(
              categories
            )
              ? categories
              : [];

          state.loadedAt =
            Date.now();

          return getStoreSnapshot();
        }
      )
      .finally(() => {
        state.loadingPromise =
          null;
      });

  return state.loadingPromise;
}

export async function refreshStore() {
  return loadStore({
    force:
      true
  });
}

export function updateFrontendData(
  frontendData
) {
  state.frontendData =
    frontendData;

  state.loadedAt =
    Date.now();
}

export function updateCategories(
  categories
) {
  state.categories =
    Array.isArray(categories)
      ? categories
      : [];
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
  const result =
    findListMutable_(
      listId
    );

  if (!result) {
    return;
  }

  if (
    !Array.isArray(
      result.list.eintragungen
    )
  ) {
    result.list.eintragungen = [];
  }

  result.list.eintragungen.push(
    entry
  );

  result.list.belegt =
    result.list.eintragungen.length;

  const maximum =
    Number(
      result.list.anzahl || 0
    );

  result.list.frei =
    maximum > 0
      ? Math.max(
          maximum -
            result.list.belegt,
          0
        )
      : null;

  result.list.voll =
    maximum > 0 &&
    result.list.belegt >=
      maximum;
}

/**
 * Entfernt eine Eintragung lokal.
 *
 * @param {string} entryId
 */
export function removeEntryOptimistic(
  entryId
) {
  for (
    const event of
    getAllEvents()
  ) {
    for (
      const list of
      (
        event.listen || []
      )
    ) {
      const entries =
        list.eintragungen || [];

      const index =
        entries.findIndex(entry =>
          entry.id ===
          entryId
        );

      if (index < 0) {
        continue;
      }

      entries.splice(
        index,
        1
      );

      list.belegt =
        entries.length;

      const maximum =
        Number(
          list.anzahl || 0
        );

      list.frei =
        maximum > 0
          ? Math.max(
              maximum -
                entries.length,
              0
            )
          : null;

      list.voll =
        maximum > 0 &&
        entries.length >=
          maximum;

      return;
    }
  }
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
