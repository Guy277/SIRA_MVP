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
