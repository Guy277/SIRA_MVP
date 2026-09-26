// Turns engine journeys into what the maquette's cards and timeline display.
import type { ApiJourney, ApiLeg, CategoryName, Coordinates, LegMode } from '@/lib/sira-api';

export type CategoryLabel = 'Coulé' | 'Debout' | 'Suspendu';

export const CATEGORY_LABELS: Record<CategoryName, CategoryLabel> = { coule: 'Coulé', debout: 'Debout', suspendu: 'Suspendu' };
export const CATEGORY_BY_LABEL: Record<CategoryLabel, CategoryName> = { 'Coulé': 'coule', 'Debout': 'debout', 'Suspendu': 'suspendu' };

export const MODE_NAMES: Record<LegMode, string> = {
  walk: 'Marche', wait: 'Attente', transfer: 'Correspondance', sotra: 'Bus SOTRA', gbaka: 'Gbaka', woro: 'Wôrô-wôrô', taxi: 'Taxi', boat: 'Bateau-bus',
};

const VEHICLE_MODES: LegMode[] = ['sotra', 'gbaka', 'woro', 'taxi', 'boat'];
export const isVehicle = (leg: ApiLeg) => VEHICLE_MODES.includes(leg.mode);

export const formatClock = (date: Date) => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
export const formatDuration = (minutes: number) => minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;
export const formatPrice = (price: number | null | undefined) => price == null ? 'Prix inconnu' : price === 0 ? 'Gratuit' : `≈ ${price.toLocaleString('fr-FR')} F`;
export const formatDistance = (km: number | undefined) => km == null ? '' : km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1).replace('.', ',')} km`;

// Short card title in the Bonjour RATP spirit: the lines you actually take.
export function journeyTitle(journey: ApiJourney) {
  const vehicles = journey.legs.filter(isVehicle);
  if (!vehicles.length) return 'À pied';
  return vehicles.map((leg) => leg.mode === 'taxi' ? 'Taxi' : shortLine(leg)).join(' › ');
}

function shortLine(leg: ApiLeg) {
  const label = leg.label.split(':')[0].trim();
  return label.length > 22 ? MODE_NAMES[leg.mode] : label.replace(/^bus /i, 'Bus ').replace(/^gbaka/i, 'Gbaka');
}

// One badge per step, as in Bonjour RATP: every line that can be taken on
// the stretch is listed ("26 / 85 / 91"), gbakas and wôrô-wôrôs have no
// number so they are counted instead.
export type LegBadge =
  | { kind: 'walk'; minutes: number }
  | { kind: 'vehicle'; mode: LegMode; text: string };

const MODE_SHORT: Partial<Record<LegMode, string>> = { gbaka: 'Gbaka', woro: 'Wôrô', taxi: 'Taxi', boat: 'Bateau', sotra: 'Bus' };

export function legCodes(leg: ApiLeg) {
  const same = (leg.alternatives ?? []).filter((line) => line.mode === leg.mode);
  const codes = [leg.line_code, ...same.map((line) => line.code)].filter((code): code is string => Boolean(code));
  return { codes: [...new Set(codes)], lines: 1 + same.length };
}

export function legBadges(journey: ApiJourney): LegBadge[] {
  return journey.legs.flatMap((leg): LegBadge[] => {
    if (leg.mode === 'walk' || leg.mode === 'transfer') return leg.duration >= 1 ? [{ kind: 'walk', minutes: leg.duration }] : [];
    if (!isVehicle(leg)) return [];
    const { codes, lines } = legCodes(leg);
    const text = codes.length
      ? codes.slice(0, 3).join(' / ') + (codes.length > 3 ? ` +${codes.length - 3}` : '')
      : `${MODE_SHORT[leg.mode] ?? MODE_NAMES[leg.mode]}${lines > 1 ? ` ×${lines}` : ''}`;
    return [{ kind: 'vehicle', mode: leg.mode, text }];
  });
}

// "Aussi possible : bus 15, 51 · gbaka vers Yopougon Palais" for a ride step.
// Lists already show same-mode lines in the badge, so they can skip them.
export function alternativesText(leg: ApiLeg, { otherModesOnly = false } = {}) {
  const others = (leg.alternatives ?? []).filter((line) => !otherModesOnly || line.mode !== leg.mode);
  if (!others.length) return null;
  const names = others.slice(0, 4).map((line) => {
    if (line.code) return `${line.mode === 'boat' ? 'bateau' : 'bus'} ${line.code}`;
    const [, route] = line.name.split(':');
    const terminus = route?.split('↔').pop()?.trim();
    return `${MODE_SHORT[line.mode]?.toLowerCase() ?? 'ligne'}${terminus ? ` vers ${terminus}` : ''}`;
  });
  return `Aussi possible : ${names.join(', ')}${others.length > 4 ? '…' : ''}`;
}

export function journeySummary(journey: ApiJourney) {
  const changes = journey.transfer_count ?? 0;
  const walk = journey.walking_distance_m ?? 0;
  return [changes === 0 ? 'Direct' : `${changes} changement${changes > 1 ? 's' : ''}`, walk ? `${formatDistance(walk / 1000)} à pied` : null].filter(Boolean).join(' · ');
}

// Step timeline with real clock times, starting at the chosen departure.
export function timeline(journey: ApiJourney, departureAt: Date) {
  let cursor = departureAt.getTime();
  return journey.legs.filter((leg) => leg.mode !== 'wait' || leg.duration > 0).map((leg) => {
    const start = new Date(cursor);
    cursor += leg.duration * 60_000;
    return { leg, start, end: new Date(cursor) };
  });
}

export function arrivalTime(journey: ApiJourney, departureAt: Date) {
  return new Date(departureAt.getTime() + journey.duration * 60_000);
}

export function stepTitle(leg: ApiLeg) {
  switch (leg.mode) {
    case 'walk': return `Marchez pendant ${leg.duration} min`;
    case 'wait': return `Attendez environ ${leg.duration} min`;
    case 'transfer': return `Changez à pied (${leg.duration} min)`;
    case 'taxi': return `Prenez un taxi (${leg.duration} min)`;
    default: return `Prenez le ${shortLine(leg)} (${leg.duration} min)`;
  }
}

// Plain-French second line of a timeline step (no P90 or method jargon).
export function stepDescription(leg: ApiLeg & { duration_p90?: number }) {
  const metres = /(\d[\d\s]*) m\b/.exec(leg.detail)?.[1]?.replace(/\s/g, '');
  switch (leg.mode) {
    case 'walk':
    case 'transfer':
      return metres ? `${Number(metres).toLocaleString('fr-FR')} m à pied` : 'Courte marche';
    case 'wait':
      return leg.duration_p90 && leg.duration_p90 > leg.duration
        ? `Aux heures de pointe, prévoir jusqu’à ${leg.duration_p90} min`
        : 'Temps d’attente estimé';
    case 'taxi':
      return 'Taxi compteur, trajet direct';
    default: {
      const [, direction] = leg.label.split(':');
      return direction ? `Direction ${direction.trim()}` : leg.label;
    }
  }
}

export const toLatLng = ([longitude, latitude]: [number, number]): Coordinates => ({ latitude, longitude });

export function journeyPath(journey: ApiJourney | null | undefined): Coordinates[] {
  if (!journey) return [];
  const points = journey.geometry?.length ? journey.geometry : journey.legs.flatMap((leg) => leg.geometry ?? []);
  return points.map(toLatLng);
}
