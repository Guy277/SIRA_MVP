// Where the traveller is on the current step of a trip, in words and for the map: « Descends dans 3 arrêts »,
// « Ton arrêt est le prochain », and how the guidance map frames the step. Inspired by the stop countdown of
// the Transit app (« Get off in 2 stops », « Your stop is next! ») — see docs/etude-guidage-carte.md.
// Pure functions (no import) so that tests/ride-progress.test.mjs runs them with Node.

export type Point = { latitude: number; longitude: number };
export type RideStop = { name: string; lat: number; lon: number };
export type LegLike = { mode: string; geometry?: [number, number][]; ride_stops?: RideStop[]; alight_stop?: { name: string; on_line: boolean } | null };
export type RideProgress = { stopsLeft: number | null; metresLeft: number | null };

const VEHICLES = ['sotra', 'gbaka', 'woro', 'taxi', 'boat'];
// The countdown in stops needs the stops of the ride: at least the boarding stop, one stop on the way and the
// stop where to get off. Below that (or for informal stops SIRA does not know), it counts in metres.
export const MIN_STOPS_TO_COUNT = 3;
// Same distance as « Prépare-toi » in lib/guidance.ts.
export const ALIGHT_WARN_M = 600;
const HERE_M = 80;

export function metres(a: Point, b: Point) {
  const rad = Math.PI / 180;
  const h = Math.sin(((b.latitude - a.latitude) * rad) / 2) ** 2
    + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(((b.longitude - a.longitude) * rad) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

const pathOf = (leg: LegLike): Point[] => (leg.geometry ?? []).map(([longitude, latitude]) => ({ latitude, longitude }));

// Metres left along the step: from the traveller to the nearest point of the path, then along the path.
// Without a position: the whole step.
function metresLeftOn(path: Point[], here: Point | null): number | null {
  if (!path.length) return null;
  let start = 0;
  let toPath = 0;
  if (here) {
    let best = Number.POSITIVE_INFINITY;
    path.forEach((point, index) => {
      const distance = metres(here, point);
      if (distance < best) { best = distance; start = index; }
    });
    toPath = best;
  }
  let along = 0;
  for (let index = start + 1; index < path.length; index += 1) along += metres(path[index - 1], path[index]);
  return Math.round(toPath + along);
}

// Stops still to reach, the stop where to get off included (0: the traveller is at it). The first stop is where
// they got on. The nearest stop counts as reached when the traveller is at it (80 m) or past it, that is closer
// to the end than the stop is.
function stopsLeftOn(stops: RideStop[], here: Point | null): number | null {
  if (stops.length < MIN_STOPS_TO_COUNT) return null;
  const lastIndex = stops.length - 1;
  if (!here) return lastIndex;
  const at = (stop: RideStop): Point => ({ latitude: stop.lat, longitude: stop.lon });
  const end = at(stops[lastIndex]);
  let nearest = 0;
  stops.forEach((stop, index) => { if (metres(here, at(stop)) < metres(here, at(stops[nearest]))) nearest = index; });
  const reached = nearest === 0 || metres(here, at(stops[nearest])) <= HERE_M || metres(here, end) < metres(at(stops[nearest]), end);
  return reached ? lastIndex - nearest : lastIndex - nearest + 1;
}

export function rideProgress(leg: LegLike, here: Point | null): RideProgress {
  return { stopsLeft: stopsLeftOn(leg.ride_stops ?? [], here), metresLeft: metresLeftOn(pathOf(leg), here) };
}

// « 800 m », « 1,2 km ».
export function shortDistance(m: number) {
  if (m < 1000) return `${Math.max(50, Math.round(m / 50) * 50)} m`;
  return `${(Math.round(m / 100) / 10).toLocaleString('fr-FR')} km`;
}

// The line under the instruction during a ride. urgent: the moment to get ready (the banner stands out).
export function rideCountdown(leg: LegLike, progress: RideProgress): { text: string; urgent: boolean } | null {
  if (!VEHICLES.includes(leg.mode)) return null;
  const name = leg.alight_stop?.on_line ? leg.alight_stop.name : null;
  const { stopsLeft, metresLeft } = progress;
  if (leg.mode !== 'taxi' && stopsLeft !== null) {
    if (stopsLeft <= 0) return { text: name ? `C’est ton arrêt : « ${name} ». Descends.` : 'C’est ton arrêt. Descends.', urgent: true };
    if (stopsLeft === 1) return { text: name ? `Ton arrêt est le prochain : « ${name} »` : 'Ton arrêt est le prochain', urgent: true };
    return { text: `Descends dans ${stopsLeft} arrêts${name ? ` · « ${name} »` : ''}`, urgent: false };
  }
  if (metresLeft === null) return null;
  const arrive = leg.mode === 'taxi';
  if (metresLeft <= HERE_M) return { text: arrive ? 'Tu es arrivé : descends du taxi.' : name ? `C’est ici : « ${name} ». Descends.` : 'C’est ici. Descends.', urgent: true };
  const where = name ? ` · « ${name} »` : '';
  return { text: `${arrive ? 'Tu arrives dans' : 'Descends dans'} ${shortDistance(metresLeft)}${arrive ? '' : where}`, urgent: metresLeft <= ALIGHT_WARN_M };
}

// « Prépare-toi » when the stops are known: as the next stop is the traveller's. Otherwise lib/guidance.ts
// keeps its distance rule (600 m before the end).
export function warnByStops(progress: RideProgress): boolean | null {
  return progress.stopsLeft === null ? null : progress.stopsLeft <= 1;
}

// How the guidance map frames the step (a SIRA design choice, the apps studied say nothing of the map during
// a ride): on foot, close and tilted to see the street ahead; waiting, close on the stop; in a vehicle, a bit
// further and a bit less tilted, closer as the stop where to get off nears. The map stays in 3D: on a long ride
// it does not zoom out to show the stop (seen in the browser: from zoom 13.5 the 3D no longer shows); the banner
// gives the stops left instead.
export type FollowCamera = { kind: 'marche' | 'arret' | 'vehicule'; zoom: number; pitch: number };
export function followCamera(leg: LegLike, metresLeft: number | null): FollowCamera {
  if (leg.mode === 'walk' || leg.mode === 'transfer') return { kind: 'marche', zoom: 17, pitch: 55 };
  if (leg.mode === 'wait') return { kind: 'arret', zoom: 17, pitch: 45 };
  // 300 m left or less: 16.5 ; each doubling of the distance, half a zoom level out ; never below 15.
  const raw = 16.5 - Math.log2(Math.max(metresLeft ?? 300, 300) / 300) / 2;
  return { kind: 'vehicule', zoom: Math.round(Math.min(16.5, Math.max(15, raw)) * 4) / 4, pitch: 50 };
}
