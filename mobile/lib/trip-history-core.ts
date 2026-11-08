// The traveller's trip history: every journey started from SIRA, kept on the phone only (never on SIRA's
// servers). Pure rules, tested with Node (npm test); storage lives in lib/trip-history.ts.

export type TripCategory = 'coule' | 'debout' | 'suspendu';
export type TripPoint = { name: string; latitude: number; longitude: number };
export type TripRecord = {
  id: string;
  at: number; // start, in ms
  from: TripPoint;
  to: TripPoint;
  category: TripCategory | null;
  transport: string; // « Bus 203 › Wôrô », « Taxi », « À pied »
  durationMin: number;
  priceF: number | null; // estimate of SIRA-MORE when the trip started, not what was paid
  finished: boolean; // arrived (the guidance said « Te voilà »)
};

export const MAX_TRIPS = 50;
export const CATEGORY_NAMES: Record<TripCategory, string> = { coule: 'Coulé', debout: 'Debout', suspendu: 'Suspendu' };

// Newest first; the oldest go once there are more than max.
export function addTrip(trips: TripRecord[], trip: TripRecord, max = MAX_TRIPS): TripRecord[] {
  return [trip, ...trips.filter((item) => item.id !== trip.id)].slice(0, max);
}

export const markFinished = (trips: TripRecord[], id: string) =>
  trips.map((trip) => (trip.id === id ? { ...trip, finished: true } : trip));

export const removeTrip = (trips: TripRecord[], id: string) => trips.filter((trip) => trip.id !== id);

const isPoint = (value: unknown): value is TripPoint => {
  const point = value as TripPoint | null;
  return Boolean(point && typeof point.name === 'string' && point.name.trim()
    && Number.isFinite(point.latitude) && Number.isFinite(point.longitude));
};

// What was stored, or nothing if it cannot be read: a damaged entry is dropped, never shown half-empty.
export function parseStoredTrips(text: string | null | undefined): TripRecord[] {
  if (!text) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is TripRecord => Boolean(item)
    && typeof item.id === 'string' && Number.isFinite(item.at) && isPoint(item.from) && isPoint(item.to)
    && (item.category === null || item.category in CATEGORY_NAMES)
    && typeof item.transport === 'string' && Number.isFinite(item.durationMin)
    && (item.priceF === null || Number.isFinite(item.priceF)) && typeof item.finished === 'boolean')
    .sort((a, b) => b.at - a.at)
    .slice(0, MAX_TRIPS);
}

// « D'Abobo Samaké à Orange Digital Center » (élision devant une voyelle).
export function tripTitle(trip: Pick<TripRecord, 'from' | 'to'>) {
  // Élision devant une voyelle (« D’Abobo », « D’Adjamé ») ; pas devant y ni h (« De Yopougon »).
  const de = /^[aeiouàâäéèêëîïôöùûü]/i.test(trip.from.name) ? 'D’' : 'De ';
  return `${de}${trip.from.name} à ${trip.to.name}`;
}

const pad = (n: number) => String(n).padStart(2, '0');
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const dayStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

// « Aujourd'hui, 08:30 », « Hier, 17:45 », « 12 sept., 10:45 » (heure du téléphone).
export function whenLabel(at: number, now = Date.now()) {
  const date = new Date(at);
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const days = Math.round((dayStart(new Date(now)) - dayStart(date)) / 86_400_000);
  if (days === 0) return `Aujourd’hui, ${time}`;
  if (days === 1) return `Hier, ${time}`;
  return `${date.getDate()} ${MONTHS[date.getMonth()]}, ${time}`;
}

const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Search by place, option or transport, without accents (« coule » finds « Coulé »).
export function searchTrips(trips: TripRecord[], query: string) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return trips;
  return trips.filter((trip) => {
    const text = fold([trip.from.name, trip.to.name, trip.transport, trip.category ? CATEGORY_NAMES[trip.category] : ''].join(' '));
    return words.every((word) => text.includes(word));
  });
}
