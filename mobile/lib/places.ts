// Screens pass places around by their title; this registry keeps the
// coordinates behind each title picked from search, GPS or shortcuts.
import * as Location from 'expo-location';
import { ABIDJAN_COORDINATES_MAP } from '@/services/osrm-service';
import { searchPlaces, type Coordinates } from '@/lib/sira-api';

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
// no coordinates are sent anywhere before the user submits a report.
export function nearestPlaceLabel(coordinates: Coordinates) {
  let best: { title: string; distance: number } | null = null;
  for (const [title, place] of registry) {
    if (title === CURRENT_LOCATION) continue;
    const distance = distanceM(coordinates, place);
    if (!best || distance < best.distance) best = { title, distance };
  }
  return best && best.distance < 3000 ? `Près de ${best.title}` : `${coordinates.latitude.toFixed(4)}, ${coordinates.longitude.toFixed(4)}`;
}

// Typed titles that were never picked from a list are geocoded on demand.
export async function resolvePlace(title: string): Promise<Coordinates> {
  const known = knownPlace(title);
  if (known) return known;
  if (title === CURRENT_LOCATION) return locateUser();
  const [first] = await searchPlaces(title);
  if (!first) throw new Error(`Lieu introuvable à Abidjan : « ${title} ».`);
  rememberPlace(title, first.coordinates);
  return first.coordinates;
}
