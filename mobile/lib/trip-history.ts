// Trip history on the phone (rules: lib/trip-history-core.ts). A trip is recorded when its guidance starts
// (journeyStore.start) and marked as done on arrival (journeyStore.finish). Web: localStorage ; phone: a file
// of the app (too large for the secure store, and nothing secret in it).
import { File, Paths } from 'expo-file-system';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { journeyTitle } from '@/lib/journey-format';
import type { ApiJourney } from '@/lib/sira-api';
import type { JourneySearch } from '@/lib/journey-store';
import { addTrip, markFinished, parseStoredTrips, removeTrip, type TripCategory, type TripRecord } from '@/lib/trip-history-core';

export * from '@/lib/trip-history-core';

const KEY = 'sira-historique-trajets';
let trips: TripRecord[] = [];
let loaded = false;
let current: string | null = null; // trip being followed, marked as done on arrival
const listeners = new Set<() => void>();
const file = () => new File(Paths.document, `${KEY}.json`);

function publish(next: TripRecord[], persist = true) {
  trips = next;
  listeners.forEach((listener) => listener());
  if (!persist) return;
  const text = JSON.stringify(trips);
  try {
    if (Platform.OS === 'web') window.localStorage.setItem(KEY, text);
    else void file().write(text).catch(() => {});
  } catch { /* stockage indisponible : gardé jusqu'à la fermeture de l'appli */ }
}

export async function loadTripHistory() {
  if (loaded) return;
  try {
    let text: string | null = null;
    if (Platform.OS === 'web') text = window.localStorage.getItem(KEY);
    else if (file().exists) text = await file().text();
    // A trip recorded before the phone answered is kept with the stored ones.
    if (!loaded) publish([...trips, ...parseStoredTrips(text).filter((old) => !trips.some((trip) => trip.id === old.id))], false);
  } catch { /* historique illisible : il repart de zéro */ }
  loaded = true;
}

// The guidance starts: one line in the history, with SIRA-MORE's figures for this journey.
// The option (Coulé, Debout, Suspendu) under which SIRA-MORE proposed this journey, if any.
export const journeyCategory = (search: JourneySearch, journey: ApiJourney) =>
  (Object.keys(search.categories) as TripCategory[]).find((name) => search.categories[name]?.includes(journey.id)) ?? null;

export function recordTripStart(search: JourneySearch | null, journey: ApiJourney) {
  if (!search) return;
  const category = journeyCategory(search, journey);
  const id = `trajet-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  current = id;
  const point = (place: JourneySearch['departure']) => ({ name: place.name, latitude: place.latitude, longitude: place.longitude });
  publish(addTrip(trips, {
    id,
    at: Date.now(),
    from: point(search.departure),
    to: point(search.arrival),
    category,
    transport: journeyTitle(journey),
    durationMin: Math.round(journey.duration),
    priceF: journey.price ?? null,
    finished: false,
  }));
}

export function recordTripFinished() {
  if (!current) return;
  publish(markFinished(trips, current));
  current = null;
}

export const deleteTrip = (id: string) => publish(removeTrip(trips, id));
export const clearTripHistory = () => publish([]);

export function useTripHistory() {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    () => trips,
    () => trips,
  );
}
