// « Maison » and « Travail »: two addresses the traveller picks once in the place
// search, then reaches with one touch. They stay on the phone only, never on SIRA's servers.
import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { rememberPlace } from '@/lib/places';
import type { Coordinates } from '@/lib/sira-api';

export type SavedPlaceKind = 'home' | 'work';
export type SavedPlace = { title: string; subtitle: string } & Coordinates;
type SavedPlaces = Partial<Record<SavedPlaceKind, SavedPlace>>;

export const SAVED_PLACE_LABELS: Record<SavedPlaceKind, string> = { home: 'Maison', work: 'Travail' };

const KEY = 'sira-saved-places';
let saved: SavedPlaces = {};
const listeners = new Set<() => void>();

function publish(next: SavedPlaces) {
  saved = next;
  // Searches and journeys find the address's coordinates by its title.
  for (const place of Object.values(saved)) rememberPlace(place.title, { latitude: place.latitude, longitude: place.longitude });
  listeners.forEach((listener) => listener());
}

function isSavedPlace(value: unknown): value is SavedPlace {
  const place = value as SavedPlace | null;
  return Boolean(place && typeof place.title === 'string' && Number.isFinite(place.latitude) && Number.isFinite(place.longitude));
}

export async function loadSavedPlaces() {
  try {
    const text = Platform.OS === 'web' ? window.localStorage.getItem(KEY) : await SecureStore.getItemAsync(KEY);
    if (!text) return;
    const stored = JSON.parse(text) as Record<string, unknown>;
    const valid: SavedPlaces = {};
    for (const kind of ['home', 'work'] as const) if (isSavedPlace(stored[kind])) valid[kind] = stored[kind];
    publish({ ...valid, ...saved });
  } catch { /* mémoire illisible : les raccourcis sont à refaire */ }
}

export function savePlace(kind: SavedPlaceKind, place: SavedPlace | null) {
  const next = { ...saved };
  if (place) next[kind] = place;
  else delete next[kind];
  publish(next);
  const text = JSON.stringify(next);
  try {
    if (Platform.OS === 'web') window.localStorage.setItem(KEY, text);
    else void SecureStore.setItemAsync(KEY, text).catch(() => {});
  } catch { /* stockage indisponible : gardé jusqu'à la fermeture de l'appli */ }
}

export function useSavedPlaces() {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    () => saved,
    () => saved,
  );
}
