// Zones the traveller follows (« Suivre cette zone »), kept on the phone: the rules, without
// storage, so they can be tested (tests/followed-zones.test.mjs). A zone is a circle around
// the place of a report; a new report inside it raises an alert while SIRA is open.

export type FollowedZone = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  radiusM: number;
  addedAt: number;
};

// SIRA's own choices (no data behind them): a zone covers 500 m around the report, which takes in
// the junction and the streets next to it; at most 10 zones, so alerts stay readable.
export const ZONE_RADIUS_M = 500;
export const MAX_ZONES = 10;
// Two zones closer than this are the same place: following again updates it instead of doubling.
export const SAME_ZONE_M = 150;

export function distanceM(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const radians = (value: number) => (value * Math.PI) / 180;
  const h = Math.sin(radians(b.latitude - a.latitude) / 2) ** 2
    + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(radians(b.longitude - a.longitude) / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export const zoneId = (latitude: number, longitude: number) => `zone-${latitude.toFixed(4)},${longitude.toFixed(4)}`;

// The zone already followed at this place, if any.
export function followedZoneAt(list: FollowedZone[], point: { latitude: number; longitude: number }) {
  return list.find((zone) => distanceM(zone, point) <= SAME_ZONE_M) ?? null;
}

export type NewZone = { label: string; latitude: number; longitude: number };

// Newest first; following the same place again updates its name and date; at most MAX_ZONES.
export function addZone(list: FollowedZone[], zone: NewZone, now = Date.now(), max = MAX_ZONES): FollowedZone[] {
  const same = followedZoneAt(list, zone);
  const others = same ? list.filter((item) => item.id !== same.id) : list;
  const added: FollowedZone = {
    id: same?.id ?? zoneId(zone.latitude, zone.longitude),
    label: zone.label.trim() || 'Zone suivie',
    latitude: zone.latitude,
    longitude: zone.longitude,
    radiusM: ZONE_RADIUS_M,
    addedAt: now,
  };
  return [added, ...others].slice(0, max);
}

export const removeZone = (list: FollowedZone[], id: string) => list.filter((zone) => zone.id !== id);

// The followed zones a report falls in.
export const zonesContaining = (list: FollowedZone[], point: { latitude: number; longitude: number }) =>
  list.filter((zone) => distanceM(zone, point) <= zone.radiusM);

// Read back from storage; anything unreadable is dropped rather than trusted.
export function parseStoredZones(text: string | null | undefined): FollowedZone[] {
  if (!text) return [];
  try {
    const value: unknown = JSON.parse(text);
    if (!Array.isArray(value)) return [];
    return value.filter((zone): zone is FollowedZone => Boolean(zone)
      && typeof zone.id === 'string' && typeof zone.label === 'string'
      && Number.isFinite(zone.latitude) && Number.isFinite(zone.longitude)
      && Number.isFinite(zone.radiusM) && Number.isFinite(zone.addedAt)).slice(0, MAX_ZONES);
  } catch {
    return [];
  }
}
