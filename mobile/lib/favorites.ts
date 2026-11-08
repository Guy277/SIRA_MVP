// Favourite trips on the phone (rules: lib/favorites-core.ts). Added from a journey's detail or from the
// history. Web: localStorage ; phone: a file of the app (nothing secret in it, never sent to SIRA's servers).
import { File, Paths } from 'expo-file-system';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import {
  addFavorite as add, parseStoredFavorites, removeFavorite as remove, toggleFavorite as toggle,
  type FavoriteRecord, type NewFavorite,
} from '@/lib/favorites-core';

export * from '@/lib/favorites-core';

const KEY = 'sira-favoris';
let favorites: FavoriteRecord[] = [];
let loaded = false;
const listeners = new Set<() => void>();
const file = () => new File(Paths.document, `${KEY}.json`);

function publish(next: FavoriteRecord[], persist = true) {
  favorites = next;
  listeners.forEach((listener) => listener());
  if (!persist) return;
  const text = JSON.stringify(favorites);
  try {
    if (Platform.OS === 'web') window.localStorage.setItem(KEY, text);
    else void file().write(text).catch(() => {});
  } catch { /* stockage indisponible : gardé jusqu'à la fermeture de l'appli */ }
}

export async function loadFavorites() {
  if (loaded) return;
  try {
    let text: string | null = null;
    if (Platform.OS === 'web') text = window.localStorage.getItem(KEY);
    else if (file().exists) text = await file().text();
    // A favourite added before the phone answered is kept with the stored ones.
    if (!loaded) publish([...favorites, ...parseStoredFavorites(text).filter((old) => !favorites.some((item) => item.id === old.id))], false);
  } catch { /* favoris illisibles : ils repartent de zéro */ }
  loaded = true;
}

export const addFavoriteTrip = (favorite: NewFavorite) => publish(add(favorites, favorite));
export const removeFavoriteTrip = (id: string) => publish(remove(favorites, id));

// true if the trip is now a favourite.
export function toggleFavoriteTrip(favorite: NewFavorite) {
  const result = toggle(favorites, favorite);
  publish(result.list);
  return result.added;
}

export function useFavorites() {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    () => favorites,
    () => favorites,
  );
}
