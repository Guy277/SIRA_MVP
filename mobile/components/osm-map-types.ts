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
