// The traveller's own places: « Maison », « Travail » and the ones they name
// themselves (« Chez Maman », « École »). Pure rules, tested with Node (npm test);
// storage and screens live in lib/saved-places.ts.

export type SavedPlaceKind = 'home' | 'work' | 'custom';
export type PlaceAddress = { title: string; subtitle: string; latitude: number; longitude: number };
export type SavedPlace = PlaceAddress & { id: string; kind: SavedPlaceKind; label: string; icon: string };

export const MAX_CUSTOM_PLACES = 8;
export const MAX_LABEL_LENGTH = 30;
// Ionicons names offered for a place the traveller names.
export const PLACE_ICONS = ['heart', 'people', 'school', 'cart', 'fitness', 'medkit', 'restaurant', 'book', 'football', 'star'] as const;
// Read aloud by the phone's screen reader.
export const PLACE_ICON_LABELS: Record<(typeof PLACE_ICONS)[number], string> = {
  heart: 'cœur', people: 'famille', school: 'école', cart: 'courses', fitness: 'sport',
  medkit: 'santé', restaurant: 'restaurant', book: 'études', football: 'foot', star: 'étoile',
};
export const FIXED_PLACES = {
  home: { id: 'home', label: 'Maison', icon: 'home' },
  work: { id: 'work', label: 'Travail', icon: 'briefcase' },
} as const;

const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

const hasAddress = (place: Partial<PlaceAddress> | null): place is Partial<SavedPlace> & PlaceAddress =>
  Boolean(place && typeof place.title === 'string' && place.title.trim()
    && Number.isFinite(place.latitude) && Number.isFinite(place.longitude));

// Maison, then Travail, then the traveller's places in the order they were added.
export function orderPlaces(places: SavedPlace[]) {
  const rank = (place: SavedPlace) => (place.kind === 'home' ? 0 : place.kind === 'work' ? 1 : 2);
  return [...places].sort((a, b) => rank(a) - rank(b));
}

// What is stored on the phone: the list, or the first version ({ home, work }).
export function parseStoredPlaces(text: string | null): SavedPlace[] {
  if (!text) return [];
  let stored: unknown;
  try { stored = JSON.parse(text); } catch { return []; }
  const items: unknown[] = Array.isArray(stored)
    ? stored
    : Object.entries((stored ?? {}) as Record<string, unknown>).map(([kind, place]) => ({ ...(place as object), kind, id: kind }));
  const places: SavedPlace[] = [];
  for (const item of items) {
    const place = item as Partial<SavedPlace> | null;
    if (!hasAddress(place)) continue;
    const address = { title: place.title.trim(), subtitle: typeof place.subtitle === 'string' ? place.subtitle : '', latitude: place.latitude, longitude: place.longitude };
    if (place.kind === 'home' || place.kind === 'work') {
      if (places.some((other) => other.kind === place.kind)) continue;
      places.push({ ...address, ...FIXED_PLACES[place.kind], kind: place.kind });
    } else if (typeof place.id === 'string' && typeof place.label === 'string' && place.label.trim()
      && places.filter((other) => other.kind === 'custom').length < MAX_CUSTOM_PLACES) {
      const icon = PLACE_ICONS.includes(place.icon as (typeof PLACE_ICONS)[number]) ? place.icon as string : 'star';
      places.push({ ...address, id: place.id, kind: 'custom', label: place.label.trim().slice(0, MAX_LABEL_LENGTH), icon });
    }
  }
  return orderPlaces(places);
}

// Why a name cannot be used, or null. Maison and Travail have their own place.
export function labelError(label: string, places: SavedPlace[], editingId?: string): string | null {
  const name = fold(label);
  if (!name) return 'Donne un nom à ce lieu.';
  if (label.trim().length > MAX_LABEL_LENGTH) return `${MAX_LABEL_LENGTH} caractères au plus.`;
  if (name.length < 3) return 'Au moins 3 lettres, pour que SIRA le reconnaisse quand tu le dis.';
  if (['maison', 'travail', 'chez moi'].includes(name)) return 'Maison et Travail ont déjà leur place en haut de la liste.';
  if (places.some((place) => place.id !== editingId && fold(place.label) === name)) return 'Tu as déjà un lieu avec ce nom.';
  return null;
}

// « Te voilà … » : à la maison, au travail, chez Maman, à École.
export function arrivalPhrase(place: Pick<SavedPlace, 'kind' | 'label'>) {
  if (place.kind === 'home') return 'à la maison';
  if (place.kind === 'work') return 'au travail';
  return /^chez\s/i.test(place.label) ? `chez ${place.label.replace(/^chez\s+/i, '')}` : `à ${place.label}`;
}

// Sent with a question to the voice assistant, which reads them for that question only.
export const voicePlaces = (places: SavedPlace[]) =>
  places.map((place) => ({ kind: place.kind, label: place.label, title: place.title, lat: place.latitude, lon: place.longitude }));
