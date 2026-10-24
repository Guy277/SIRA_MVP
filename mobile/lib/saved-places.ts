// « Maison », « Travail » and the places the traveller names (« Chez Maman »…), on the
// phone only: never kept on SIRA's servers. They are offered in one touch in the place
// search and on the home screen, name the arrival (« Te voilà à la maison ! ») and are
// sent with a spoken question so SIRA understands « emmène-moi à la maison ».
import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { rememberPlace } from '@/lib/places';
import {
  FIXED_PLACES, labelError, MAX_CUSTOM_PLACES, orderPlaces, parseStoredPlaces,
  type PlaceAddress, type SavedPlace,
} from '@/lib/saved-places-core';

export * from '@/lib/saved-places-core';

const KEY = 'sira-saved-places';
let places: SavedPlace[] = [];
let loaded = false;
const listeners = new Set<() => void>();

function publish(next: SavedPlace[], persist = true) {
  places = orderPlaces(next);
  // Searches and journeys find a place's coordinates by its title.
  for (const place of places) rememberPlace(place.title, { latitude: place.latitude, longitude: place.longitude });
  listeners.forEach((listener) => listener());
  if (!persist) return;
  const text = JSON.stringify(places);
  try {
    if (Platform.OS === 'web') window.localStorage.setItem(KEY, text);
    else void SecureStore.setItemAsync(KEY, text).catch(() => {});
  } catch { /* stockage indisponible : gardé jusqu'à la fermeture de l'appli */ }
}

export async function loadSavedPlaces() {
  if (loaded) return;
  try {
    const text = Platform.OS === 'web' ? window.localStorage.getItem(KEY) : await SecureStore.getItemAsync(KEY);
    // A change made before the phone answered wins over what was stored.
    if (!loaded) publish(parseStoredPlaces(text), false);
  } catch { /* mémoire illisible : les lieux sont à refaire */ }
  loaded = true;
}

export const savedPlaces = () => places;

// Address of Maison or Travail, or of one of the traveller's places; null removes Maison or Travail's address.
export function setPlaceAddress(id: string, address: PlaceAddress | null) {
  loaded = true;
  const existing = places.find((place) => place.id === id);
  const fixed = id === 'home' || id === 'work' ? FIXED_PLACES[id] : null;
  if (!address) {
    if (fixed) publish(places.filter((place) => place.id !== id));
    return;
  }
  if (existing) publish(places.map((place) => (place.id === id ? { ...place, ...address } : place)));
  else if (fixed) publish([...places, { ...address, ...fixed, kind: id as 'home' | 'work' }]);
}

// A new named place: the reason it cannot be added, or null once added.
export function addPlace(label: string, icon: string, address: PlaceAddress): string | null {
  loaded = true;
  if (places.filter((place) => place.kind === 'custom').length >= MAX_CUSTOM_PLACES) {
    return `${MAX_CUSTOM_PLACES} lieux au plus : supprime-en un pour en ajouter un autre.`;
  }
  const error = labelError(label, places);
  if (error) return error;
  const id = `lieu-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  publish([...places, { ...address, id, kind: 'custom', label: label.trim(), icon }]);
  return null;
}

// Renaming or another icon for one of the traveller's places.
export function updatePlace(id: string, changes: { label?: string; icon?: string }): string | null {
  loaded = true;
  const place = places.find((item) => item.id === id);
  if (!place || place.kind !== 'custom') return 'Ce lieu n’existe plus.';
  if (changes.label !== undefined) {
    const error = labelError(changes.label, places, id);
    if (error) return error;
  }
  publish(places.map((item) => (item.id === id
    ? { ...item, label: changes.label?.trim() ?? item.label, icon: changes.icon ?? item.icon }
    : item)));
  return null;
}

export function removePlace(id: string) {
  loaded = true;
  publish(places.filter((place) => place.id !== id));
}

// The saved place a journey goes to, found by its address's title.
export const placeForTitle = (title: string | null | undefined) =>
  title ? places.find((place) => place.title === title) ?? null : null;

export function useSavedPlaces() {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    () => places,
    () => places,
  );
}
