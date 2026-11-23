// Types et calculs partagés par la carte web (osm-map-view.web.tsx) et la carte native (osm-map-view.tsx).

// Un lieu du quotidien sur la carte d'accueil. icon : nom MaterialCommunityIcons ;
// highlighted : pharmacie de garde (marqueur plus grand, bord jaune).
export type MapPlace = { id: string; lat: number; lon: number; color: string; icon: string; label: string; highlighted?: boolean };

// Marge de cadrage, pour que les lieux ne passent pas sous la liste ou la rangée de catégories.
export type MapPadding = { top: number; bottom: number; left: number; right: number };

type MapPoint = { latitude: number; longitude: number };

// Un autre trajet possible, dessiné en gris sous le trajet choisi (écran des trajets) : le toucher le choisit.
// label : son étiquette sur la carte (« Suspendu · 21 min »).
export type MapRoute = { id: string; coordinates: MapPoint[]; label?: string };

// Étiquette posée sur un trajet ; id null pour le trajet choisi (le toucher ne change rien).
export type RouteLabel = { id: string | null; text: string; point: MapPoint; chosen: boolean };

// Au plus ~150 points par trajet pour le calcul : assez pour une étiquette, rapide sur un téléphone.
const sample = (path: MapPoint[]) => path.filter((_, index) => index % Math.max(1, Math.floor(path.length / 150)) === 0);

// Où poser l'étiquette d'un trajet : son point le plus éloigné des autres trajets tracés, pour
// qu'elle reste visible là où les lignes se superposent. Les 10 % du début et de la fin sont
// écartés (départ et arrivée ont déjà leur marqueur). Seul sur la carte : son milieu.
function labelPoint(path: MapPoint[], others: MapPoint[][]): MapPoint | null {
  if (path.length === 0) return null;
  const middle = path[Math.floor(path.length / 2)];
  const near = others.flatMap(sample);
  if (near.length === 0) return middle;
  const margin = Math.floor(path.length * 0.1);
  let best = middle;
  let bestDistance = -1;
  for (const point of sample(path.slice(margin, path.length - margin))) {
    const cos = Math.cos((point.latitude * Math.PI) / 180);
    let nearest = Infinity;
    for (const other of near) {
      const distance = (point.latitude - other.latitude) ** 2 + ((point.longitude - other.longitude) * cos) ** 2;
      if (distance < nearest) nearest = distance;
    }
    if (nearest > bestDistance) { bestDistance = nearest; best = point; }
  }
  return best;
}

// Les étiquettes du trajet choisi et des autres, seulement quand plusieurs trajets sont tracés.
export function routeLabels(active: MapPoint[], activeLabel: string | undefined, alternatives: MapRoute[]): RouteLabel[] {
  const drawn = alternatives.filter((route) => route.coordinates.length > 1 && route.label);
  if (drawn.length === 0 || !activeLabel || active.length < 2) return [];
  const labels: RouteLabel[] = [];
  const activePoint = labelPoint(active, drawn.map((route) => route.coordinates));
  if (activePoint) labels.push({ id: null, text: activeLabel, point: activePoint, chosen: true });
  drawn.forEach((route) => {
    const others = [active, ...drawn.filter((other) => other !== route).map((other) => other.coordinates)];
    const point = labelPoint(route.coordinates, others);
    if (point && route.label) labels.push({ id: route.id, text: route.label, point, chosen: false });
  });
  return labels;
}

// Bouton « Ma position » : chaque nouvelle key recentre la carte sur ces coordonnées.
// wide : position approximative, la carte zoome moins pour montrer tout le cercle de précision.
export type CenterRequest = { coordinates: MapPoint; key: number; wide?: boolean };

// Demande de zoom des boutons + / − : delta en niveaux de zoom (+1, −1) ; key change à chaque toucher.
export type ZoomRequest = { delta: number; key: number };

// Ce que règlent les boutons de carte (Calques, 2D/3D, boussole) et le guidage. Seule la carte web
// (MapLibre) s'en sert pour l'instant ; la carte du téléphone les ignore jusqu'à son passage à MapLibre.
export type MapDisplayOptions = {
  mapStyle?: 'plan' | 'nuit' | 'epure';
  tilted?: boolean;  // carte inclinée, bâtiments debout
  showTransitLines?: boolean;  // couche « Lignes SIRA »
  showBuildings?: boolean;
  // Cap de la carte en degrés (0 = nord en haut) : l'écran montre la boussole quand elle est tournée.
  onBearingChange?: (bearing: number) => void;
  // Boussole : chaque nouvelle key remet le nord en haut.
  northRequest?: { key: number } | null;
  // Guidage : la carte suit ce point, inclinée et tournée dans le sens du trajet ; null = vue d'ensemble.
  follow?: MapPoint | null;
  // Suivi en pause (le voyageur regarde ailleurs) : la carte reste penchée là où il l'a mise.
  followPaused?: boolean;
  // Vue du suivi selon l'étape (lib/ride-progress-core.ts) : à pied, à l'arrêt, en véhicule.
  followCamera?: { kind: string; zoom: number; pitch: number } | null;
  // Le voyageur déplace la carte à un doigt pendant le suivi (à chaque fois) : l'écran met le suivi en pause.
  // Zoomer à deux doigts ne compte pas : le suivi continue, au zoom choisi.
  onFollowPause?: () => void;
};

const toRad = (degrees: number) => (degrees * Math.PI) / 180;
const metres = (a: MapPoint, b: MapPoint) =>
  Math.hypot(b.latitude - a.latitude, (b.longitude - a.longitude) * Math.cos(toRad(a.latitude))) * 111_320;

// Sens de marche (0 = nord, 90 = est) au point le plus proche du trajet, vers un point ~25 m plus loin :
// la carte du guidage se tourne pour que la route monte devant le voyageur. null : trajet trop court.
// ---- Guidage dans l'appli installée (react-native-maps) : la caméra se règle autrement que sur le web. ----

// Mètres par point d'écran à un zoom donné (tuiles de 256 points, projection Web Mercator).
export const metresPerPoint = (zoom: number, latitude: number) => (156_543.034 * Math.cos(toRad(latitude))) / 2 ** zoom;

// Plans d'Apple (iPhone) règle la caméra par son altitude en mètres, pas par un zoom. Approximation : la hauteur de
// l'écran couvre au sol ce qu'elle couvrirait à ce zoom, vue sous un angle vertical de 30°. À régler sur un iPhone.
export const IOS_CAMERA_FOV_DEG = 30;
export function altitudeForZoom(zoom: number, latitude: number, screenHeightPt: number) {
  const span = metresPerPoint(zoom, latitude) * screenHeightPt;
  return Math.round(span / (2 * Math.tan(toRad(IOS_CAMERA_FOV_DEG / 2))));
}

// Un point à `distance` mètres devant, dans la direction `headingDeg` (0 = nord) : la caméra vise un peu devant le
// voyageur pour que son point soit dans le bas de l'écran et la route devant lui, comme sur le web (offset).
export function pointAhead(point: MapPoint, headingDeg: number, distance: number): MapPoint {
  const angle = toRad(headingDeg);
  return {
    latitude: point.latitude + (distance * Math.cos(angle)) / 111_320,
    longitude: point.longitude + (distance * Math.sin(angle)) / (111_320 * Math.cos(toRad(point.latitude))),
  };
}

export function headingAlong(path: MapPoint[], here: MapPoint): number | null {
  if (path.length < 2) return null;
  let nearest = 0;
  path.forEach((point, index) => { if (metres(here, point) < metres(here, path[nearest])) nearest = index; });
  const from = path[nearest];
  const ahead = path.slice(nearest + 1).find((point) => metres(from, point) >= 25) ?? path[path.length - 1];
  if (metres(from, ahead) < 1) return null;
  const angle = Math.atan2((ahead.longitude - from.longitude) * Math.cos(toRad(from.latitude)), ahead.latitude - from.latitude);
  return ((angle * 180) / Math.PI + 360) % 360;
}
