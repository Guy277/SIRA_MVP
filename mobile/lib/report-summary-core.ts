// What is being reported right now, for the « Signaler un évènement » screen: the travellers' active reports
// counted by kind, around the traveller (or in the whole Grand Abidjan when their position is unknown).
// Pure rules, tested with Node (npm test).

export type ReportCategory =
  'accident' | 'embouteillage' | 'route_bloquee' | 'inondation' | 'route_degradee' | 'vehicule_panne' | 'autre';
type Report = { type: string; lat: number; lon: number; createdAt: string; status: string };
type Point = { latitude: number; longitude: number };

// « Près de toi » : 3 km, the distance SIRA already uses to name a place « Près de … » (lib/places.ts).
export const NEAR_RADIUS_M = 3000;

// Screen categories -> API report types (works and transport have no card: they count as « Autre »).
export const CATEGORY_TYPE: Record<ReportCategory, string> = {
  accident: 'accident',
  embouteillage: 'traffic',
  route_bloquee: 'blocked',
  inondation: 'flood',
  route_degradee: 'road_damage',
  vehicule_panne: 'breakdown',
  autre: 'other',
};
const CATEGORY_OF_TYPE: Record<string, ReportCategory> = Object.fromEntries(
  Object.entries(CATEGORY_TYPE).map(([category, type]) => [type, category as ReportCategory]),
);
export const categoryOfType = (type: string): ReportCategory => CATEGORY_OF_TYPE[type] ?? 'autre';

const ACTIVE = ['reported', 'confirmed', 'reliable'];

// Great-circle distance, in metres.
export function distanceM(a: Point, b: Point) {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLon = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

export type ReportSummary = {
  scope: 'near' | 'city'; // near: within NEAR_RADIUS_M of the traveller ; city: position unknown
  total: number;
  byCategory: Partial<Record<ReportCategory, number>>;
  latestAt: number | null; // ms, newest report counted
  cityTotal: number; // every active report, for « ailleurs dans le Grand Abidjan »
};

export function summarizeReports(reports: Report[], position: Point | null, radiusM = NEAR_RADIUS_M): ReportSummary {
  const active = reports.filter((report) => ACTIVE.includes(report.status));
  const counted = position
    ? active.filter((report) => distanceM(position, { latitude: report.lat, longitude: report.lon }) <= radiusM)
    : active;
  const byCategory: Partial<Record<ReportCategory, number>> = {};
  let latestAt: number | null = null;
  for (const report of counted) {
    const category = categoryOfType(report.type);
    byCategory[category] = (byCategory[category] ?? 0) + 1;
    const at = Date.parse(report.createdAt);
    if (Number.isFinite(at) && (latestAt === null || at > latestAt)) latestAt = at;
  }
  return { scope: position ? 'near' : 'city', total: counted.length, byCategory, latestAt, cityTotal: active.length };
}

// Singular and plural, as read on the screen.
const WORDS: Record<ReportCategory, [string, string]> = {
  accident: ['accident', 'accidents'],
  embouteillage: ['embouteillage', 'embouteillages'],
  route_bloquee: ['route bloquée', 'routes bloquées'],
  inondation: ['inondation', 'inondations'],
  route_degradee: ['route dégradée', 'routes dégradées'],
  vehicule_panne: ['véhicule en panne', 'véhicules en panne'],
  autre: ['autre évènement', 'autres évènements'],
};
const ORDER = Object.keys(CATEGORY_TYPE) as ReportCategory[];

export const countWords = (category: ReportCategory, count: number) => `${count} ${WORDS[category][count > 1 ? 1 : 0]}`;

// « 2 embouteillages · 1 accident », most reported first (screen order when equal).
export function summaryLine(summary: ReportSummary) {
  return ORDER
    .filter((category) => summary.byCategory[category])
    .sort((a, b) => (summary.byCategory[b] ?? 0) - (summary.byCategory[a] ?? 0))
    .map((category) => countWords(category, summary.byCategory[category] ?? 0))
    .join(' · ');
}

// « à l’instant », « il y a 5 min », « il y a 2 h ».
export function sinceLabel(at: number, now = Date.now()) {
  const minutes = Math.max(0, Math.round((now - at) / 60_000));
  if (minutes < 1) return 'à l’instant';
  if (minutes < 60) return `il y a ${minutes} min`;
  return `il y a ${Math.round(minutes / 60)} h`;
}
