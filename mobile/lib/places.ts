// Screens pass places around by their title; this registry keeps the
// coordinates behind each title picked from search, GPS or shortcuts.
import * as Location from 'expo-location';
import { useSyncExternalStore } from 'react';
import { ABIDJAN_COORDINATES_MAP } from '@/services/osrm-service';
import { reversePlace, searchPlaces, type Coordinates } from '@/lib/sira-api';

export const CURRENT_LOCATION = 'Ma position actuelle';

const registry = new Map<string, Coordinates>(
  Object.entries(ABIDJAN_COORDINATES_MAP).filter(([title]) => title !== CURRENT_LOCATION),
);

export function rememberPlace(title: string, coordinates: Coordinates) {
  registry.set(title, coordinates);
}

export function knownPlace(title: string) {
  return registry.get(title) ?? null;
}

// Asks for location permission only when the user picks "Ma position actuelle".
export async function locateUser(): Promise<Coordinates> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') throw new Error('Autorisez la localisation pour partir de votre position.');
  const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  const coordinates = { latitude: position.coords.latitude, longitude: position.coords.longitude };
  rememberPlace(CURRENT_LOCATION, coordinates);
  return coordinates;
}

export function distanceM(a: Coordinates, b: Coordinates) {
  const radians = (value: number) => value * Math.PI / 180;
  const h = Math.sin(radians(b.latitude - a.latitude) / 2) ** 2
    + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(radians(b.longitude - a.longitude) / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// Names a position from the closest known place, computed on the device so
// no coordinates are sent anywhere before the user submits a report. Null
// when nothing known is near: raw coordinates are never shown to travellers.
export function nearestPlaceLabel(coordinates: Coordinates): string | null {
  let best: { title: string; distance: number } | null = null;
  for (const [title, place] of registry) {
    if (title === CURRENT_LOCATION) continue;
    const distance = distanceM(coordinates, place);
    if (!best || distance < best.distance) best = { title, distance };
  }
  return best && best.distance < 3000 ? `Près de ${best.title}` : null;
}

// Where the traveller is, located once at start-up and named after the
// nearest landmark (junction, station, bus stop…) so it can be the default
// departure. The traveller can still pick another departure.
export type CurrentPlace =
  | { status: 'locating' }
  // outside: found, but too far from the Grand Abidjan to start a journey.
  | { status: 'ready'; title: string; subtitle: string; coordinates: Coordinates; outside: boolean }
  | { status: 'unavailable'; reason: string };

// SIRA covers the Grand Abidjan: a position far from it is named as such.
export const ABIDJAN_CENTRE: Coordinates = { latitude: 5.345, longitude: -4.02 };
export const GRAND_ABIDJAN_RADIUS_M = 60_000;

let current: CurrentPlace = { status: 'locating' };
let pending: Promise<CurrentPlace> | null = null;
const currentListeners = new Set<() => void>();

export function ensureCurrentPlace(): Promise<CurrentPlace> {
  if (current.status === 'ready') return Promise.resolve(current);
  pending ??= (async () => {
    try {
      const coordinates = await locateUser();
      // Named on the device when the landmark service cannot be reached.
      const named = await reversePlace(coordinates).catch(() => null);
      // Landmark name when there is one, otherwise simply "Ma position"
      // (as "Ma position" in Bonjour RATP or "Votre position" in Google Maps).
      const landmark = named?.title && named.title !== 'Ma position' ? named.title : nearestPlaceLabel(coordinates);
      const title = landmark ?? 'Ma position';
      const outside = distanceM(coordinates, ABIDJAN_CENTRE) > GRAND_ABIDJAN_RADIUS_M;
      rememberPlace(title, coordinates);
      current = { status: 'ready', title, subtitle: outside ? 'Hors du Grand Abidjan' : named?.subtitle ?? 'Position GPS', coordinates, outside };
    } catch (error) {
      current = { status: 'unavailable', reason: error instanceof Error ? error.message : 'Localisation indisponible.' };
    }
    pending = null;
    currentListeners.forEach((listener) => listener());
    return current;
  })();
  return pending;
}

// True for labels that stand for the traveller's own position.
export function isOwnPosition(label: string) {
  return label === CURRENT_LOCATION || label === 'Ma position' || (current.status === 'ready' && label === current.title);
}

export function useCurrentPlace() {
  return useSyncExternalStore(
    (listener) => { currentListeners.add(listener); return () => currentListeners.delete(listener); },
    () => current,
    () => current,
  );
}

// Typed titles that were never picked from a list are geocoded on demand.
export async function resolvePlace(title: string): Promise<Coordinates> {
  const known = knownPlace(title);
  if (known) return known;
  if (title === CURRENT_LOCATION) {
    const place = await ensureCurrentPlace();
    if (place.status !== 'ready') throw new Error(place.status === 'unavailable' ? place.reason : 'Localisation indisponible.');
    return place.coordinates;
  }
  const [first] = await searchPlaces(title);
  if (!first) throw new Error(`Lieu introuvable à Abidjan : « ${title} ».`);
  rememberPlace(title, first.coordinates);
  return first.coordinates;
}
