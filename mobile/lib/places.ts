// Screens pass places around by their title; this registry keeps the
// coordinates behind each title picked from search, GPS or shortcuts.
import * as Location from 'expo-location';
import { useSyncExternalStore } from 'react';
import { ABIDJAN_COORDINATES_MAP } from '@/services/osrm-service';
import { reversePlace, searchPlaces, type Coordinates } from '@/lib/sira-api';
import { needsSecureContext, POSITION_NEEDS_HTTPS } from '@/lib/secure-context';
import { usageAllowed, USAGE_OFF_MESSAGES } from '@/lib/usage';

export const CURRENT_LOCATION = 'Ma position actuelle';

const registry = new Map<string, Coordinates>(Object.entries(ABIDJAN_COORDINATES_MAP));

export function rememberPlace(title: string, coordinates: Coordinates) {
  registry.set(title, coordinates);
}

// The traveller's own position (« Ma position », or the landmark it is named after) is read
// live from the GPS, never from the registry: a landmark that is also a known place (a station)
// keeps its own coordinates, and « Ma position » follows the traveller as they move.
export function knownPlace(title: string) {
  if (current.status === 'ready' && isOwnPosition(title)) return current.coordinates;
  return registry.get(title) ?? null;
}

// Demo mode: EXPO_PUBLIC_SIRA_POSITION_DEMO="5.4410,-4.0090" (Abobo) fixes the traveller's position,
// so a presentation shows the same places and journeys wherever it is given.
function demoPosition(): Coordinates | null {
  const [latitude, longitude] = (process.env.EXPO_PUBLIC_SIRA_POSITION_DEMO ?? '').split(',').map(Number);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
}

// Beyond this margin of error the position is called approximate: a computer without GPS
// guesses it from the Wi-Fi or its internet address, often kilometres away. (SIRA's own choice.)
export const APPROXIMATE_POSITION_M = 500;
// Moved farther than this from where it was named, the position is named again (new landmark).
const RENAME_AFTER_M = 300;

// accuracyM: the margin of error the device gives with the position (null when unknown).
type Fix = { coordinates: Coordinates; accuracyM: number | null };

// The first position comes quickly (balanced accuracy); the follow-up below refines it.
async function locate(): Promise<Fix> {
  if (!(await usageAllowed('location'))) throw new Error(USAGE_OFF_MESSAGES.location);
  const demo = demoPosition();
  if (demo) {
    rememberPlace(CURRENT_LOCATION, demo);
    return { coordinates: demo, accuracyM: null };
  }
  if (needsSecureContext()) throw new Error(POSITION_NEEDS_HTTPS);
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') throw new Error('Autorise la localisation pour partir de ta position.');
  const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  const coordinates = { latitude: position.coords.latitude, longitude: position.coords.longitude };
  rememberPlace(CURRENT_LOCATION, coordinates);
  return { coordinates, accuracyM: position.coords.accuracy ?? null };
}

// Asks for location permission only when the user picks "Ma position actuelle".
// Not at all when the traveller turned the position off in SIRA (Profil > Autorisations).
export async function locateUser(): Promise<Coordinates> {
  return (await locate()).coordinates;
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
    // Not an earlier « Près de … » of the traveller (it gave « Près de Près de … »).
    if (title === CURRENT_LOCATION || title === 'Ma position' || title.startsWith('Près de ')) continue;
    const distance = distanceM(coordinates, place);
    if (!best || distance < best.distance) best = { title, distance };
  }
  return best && best.distance < 3000 ? `Près de ${best.title}` : null;
}

// Where the traveller is, located at start-up, then followed while a screen shows
// it, and named after the nearest landmark (junction, station, bus stop…) so it
// can be the default departure. The traveller can still pick another departure.
export type CurrentPlace =
  | { status: 'locating' }
  // outside: found, but too far from the Grand Abidjan to start a journey.
  // accuracyM: margin of error in metres, null when the device does not say.
  | { status: 'ready'; title: string; subtitle: string; coordinates: Coordinates; outside: boolean; accuracyM: number | null }
  | { status: 'unavailable'; reason: string };

// True when the device itself says its position may be off by more than APPROXIMATE_POSITION_M.
export const isApproximate = (place: CurrentPlace) =>
  place.status === 'ready' && place.accuracyM !== null && place.accuracyM > APPROXIMATE_POSITION_M;

// SIRA covers the Grand Abidjan: a position far from it is named as such.
export const ABIDJAN_CENTRE: Coordinates = { latitude: 5.345, longitude: -4.02 };
export const GRAND_ABIDJAN_RADIUS_M = 60_000;

let current: CurrentPlace = { status: 'locating' };
let pending: Promise<CurrentPlace> | null = null;
const currentListeners = new Set<() => void>();
const notifyCurrent = () => currentListeners.forEach((listener) => listener());
// Where the position was last named: it is named again only after a real move.
let namedAt: Coordinates | null = null;

// Landmark name when there is one, otherwise simply "Ma position" (as "Ma position" in
// Bonjour RATP or "Votre position" in Google Maps). Named on the device when the landmark
// service cannot be reached. The landmark's own coordinates are left as they are.
async function describe(coordinates: Coordinates) {
  const named = await reversePlace(coordinates).catch(() => null);
  const landmark = named?.title && named.title !== 'Ma position' ? named.title : nearestPlaceLabel(coordinates);
  const outside = distanceM(coordinates, ABIDJAN_CENTRE) > GRAND_ABIDJAN_RADIUS_M;
  return { title: landmark ?? 'Ma position', subtitle: outside ? 'Hors du Grand Abidjan' : named?.subtitle ?? 'Position GPS', outside };
}

export function ensureCurrentPlace(): Promise<CurrentPlace> {
  if (current.status === 'ready') return Promise.resolve(current);
  pending ??= (async () => {
    try {
      const { coordinates, accuracyM } = await locate();
      current = { status: 'ready', ...(await describe(coordinates)), coordinates, accuracyM };
      namedAt = coordinates;
    } catch (error) {
      current = { status: 'unavailable', reason: error instanceof Error ? error.message : 'Localisation indisponible.' };
    }
    pending = null;
    notifyCurrent();
    // Permission may have just been given: the follow-up can start now.
    if (currentListeners.size > 0) void startFollowing();
    return current;
  })();
  return pending;
}

// While a screen shows the position, the device keeps reporting it: the traveller's moves and
// better fixes (GPS after Wi-Fi) replace the first position instead of it staying fixed.
let following: { remove: () => void } | null = null;
let followStarting = false;

async function startFollowing() {
  if (following || followStarting || demoPosition() || needsSecureContext()) return;
  followStarting = true;
  try {
    if (!(await usageAllowed('location'))) return;
    // Never asks: the first locate() asked already; without permission there is nothing to follow.
    if ((await Location.getForegroundPermissionsAsync()).status !== 'granted') return;
    const subscription = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, distanceInterval: 20, timeInterval: 10_000 },
      (position) => { void moved({ latitude: position.coords.latitude, longitude: position.coords.longitude }, position.coords.accuracy ?? null); },
    );
    // Every screen may have closed meanwhile.
    if (currentListeners.size === 0) subscription.remove();
    else following = subscription;
  } catch {
    // No follow-up (browser without it): the first position stays.
  } finally {
    followStarting = false;
  }
}

function stopFollowing() {
  following?.remove();
  following = null;
}

async function moved(coordinates: Coordinates, accuracyM: number | null) {
  if (current.status !== 'ready') return;
  rememberPlace(CURRENT_LOCATION, coordinates);
  current = { ...current, coordinates, accuracyM, outside: distanceM(coordinates, ABIDJAN_CENTRE) > GRAND_ABIDJAN_RADIUS_M };
  notifyCurrent();
  if (namedAt && distanceM(coordinates, namedAt) <= RENAME_AFTER_M) return;
  namedAt = coordinates;
  const description = await describe(coordinates);
  if (current.status !== 'ready') return;
  current = { ...current, ...description };
  notifyCurrent();
}

// The traveller has moved (end of a trip): « Ma position » is looked up again.
export function refreshCurrentPlace() {
  if (pending) return pending;
  current = { status: 'locating' };
  notifyCurrent();
  return ensureCurrentPlace();
}

// True for labels that stand for the traveller's own position.
export function isOwnPosition(label: string) {
  return label === CURRENT_LOCATION || label === 'Ma position' || (current.status === 'ready' && label === current.title);
}

// What the traveller reads for a place: their own position is « Ma position », as in
// Google Maps (« Votre position ») or Bonjour RATP, not the landmark it was named after.
export const placeLabel = (label: string) => (isOwnPosition(label) ? 'Ma position' : label);

// The first screen showing the position starts its follow-up; the last one to close stops it.
export function useCurrentPlace() {
  return useSyncExternalStore(
    (listener) => {
      currentListeners.add(listener);
      if (current.status === 'ready') void startFollowing();
      return () => {
        currentListeners.delete(listener);
        if (currentListeners.size === 0) stopFollowing();
      };
    },
    () => current,
    () => current,
  );
}

// Typed titles that were never picked from a list are geocoded on demand.
export async function resolvePlace(title: string): Promise<Coordinates> {
  const known = knownPlace(title);
  if (known) return known;
  if (isOwnPosition(title)) {
    const place = await ensureCurrentPlace();
    if (place.status !== 'ready') throw new Error(place.status === 'unavailable' ? place.reason : 'Localisation indisponible.');
    return place.coordinates;
  }
  const [first] = await searchPlaces(title);
  if (!first) throw new Error(`Lieu introuvable à Abidjan : « ${title} ».`);
  rememberPlace(title, first.coordinates);
  return first.coordinates;
}
