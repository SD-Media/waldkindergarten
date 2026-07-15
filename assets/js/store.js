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
