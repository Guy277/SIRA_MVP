// The traveller's favourite trips (a departure and an arrival they make often), kept on the phone only.
// Pure rules, tested with Node (npm test); storage lives in lib/favorites.ts.

export type FavoriteCategory = 'coule' | 'debout' | 'suspendu';
export type FavoritePoint = { name: string; latitude: number; longitude: number };
export type FavoriteRecord = {
  id: string; // same departure and arrival = same favourite (see favoriteId)
  addedAt: number; // ms
  from: FavoritePoint;
  to: FavoritePoint;
  // The journey seen when it was added (SIRA-MORE's estimate then). « Y aller » computes them again.
  category: FavoriteCategory | null;
  transport: string;
  durationMin: number;
  priceF: number | null;
};

export const MAX_FAVORITES = 30;
const CATEGORIES: FavoriteCategory[] = ['coule', 'debout', 'suspendu'];

const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const round = (value: number) => value.toFixed(3); // about 100 m: the same stop or place

// A favourite is a trip, not one journey: the same two places give the same favourite.
export const favoriteId = (from: FavoritePoint, to: FavoritePoint) =>
  `fav:${fold(from.name)}@${round(from.latitude)},${round(from.longitude)}>${fold(to.name)}@${round(to.latitude)},${round(to.longitude)}`;

export type NewFavorite = Omit<FavoriteRecord, 'id' | 'addedAt'>;

// Newest first; adding the same trip again updates it instead of doubling it.
export function addFavorite(list: FavoriteRecord[], favorite: NewFavorite, now = Date.now(), max = MAX_FAVORITES): FavoriteRecord[] {
  const id = favoriteId(favorite.from, favorite.to);
  return [{ ...favorite, id, addedAt: now }, ...list.filter((item) => item.id !== id)].slice(0, max);
}

export const removeFavorite = (list: FavoriteRecord[], id: string) => list.filter((item) => item.id !== id);

export const isFavorite = (list: FavoriteRecord[], from: FavoritePoint, to: FavoritePoint) =>
  list.some((item) => item.id === favoriteId(from, to));

// Added if absent, removed if present; tells which.
export function toggleFavorite(list: FavoriteRecord[], favorite: NewFavorite, now = Date.now()) {
  const id = favoriteId(favorite.from, favorite.to);
  return list.some((item) => item.id === id)
    ? { list: removeFavorite(list, id), added: false }
    : { list: addFavorite(list, favorite, now), added: true };
}

const isPoint = (value: unknown): value is FavoritePoint => {
  const point = value as FavoritePoint | null;
  return Boolean(point && typeof point.name === 'string' && point.name.trim()
    && Number.isFinite(point.latitude) && Number.isFinite(point.longitude));
};

// What was stored, or nothing if it cannot be read: a damaged entry is dropped, never shown half-empty.
export function parseStoredFavorites(text: string | null | undefined): FavoriteRecord[] {
  if (!text) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is FavoriteRecord => Boolean(item)
    && typeof item.id === 'string' && Number.isFinite(item.addedAt) && isPoint(item.from) && isPoint(item.to)
    && (item.category === null || CATEGORIES.includes(item.category))
    && typeof item.transport === 'string' && Number.isFinite(item.durationMin)
    && (item.priceF === null || Number.isFinite(item.priceF)))
    .sort((a, b) => b.addedAt - a.addedAt)
    .slice(0, MAX_FAVORITES);
}

const CATEGORY_WORDS: Record<FavoriteCategory, string> = { coule: 'Coulé', debout: 'Debout', suspendu: 'Suspendu' };

// Search by place, option or transport, without accents (« coule » finds « Coulé »).
export function searchFavorites(list: FavoriteRecord[], query: string) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return list;
  return list.filter((item) => {
    const text = fold([item.from.name, item.to.name, item.transport, item.category ? CATEGORY_WORDS[item.category] : ''].join(' '));
    return words.every((word) => text.includes(word));
  });
}
