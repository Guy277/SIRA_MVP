// Couche « Lignes SIRA » de la carte : les lignes de transport, allégées pour un téléphone.
// Le fichier complet (transport-lines-normalized.geojson, ~9,8 Mo) garde tout pour le calcul des trajets ;
// la carte n'a besoin que du tracé, du nom, du code et du mode.

type Position = number[];
type LineFeature = {
  properties?: Record<string, unknown> | null;
  geometry?: { type?: string; coordinates?: unknown } | null;
};

// ~5,5 m à l'équateur : en dessous, la différence ne se voit pas à l'écran, même zoomé sur une rue.
export const SIMPLIFY_TOLERANCE_DEG = 0.00005;

// Douglas-Peucker : garde les points qui s'écartent de plus de `tolerance` de la droite entre leurs voisins gardés.
export function simplifyLine(points: Position[], tolerance = SIMPLIFY_TOLERANCE_DEG): Position[] {
  if (points.length <= 2) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop()!;
    const [ax, ay] = points[first];
    const [bx, by] = points[last];
    const dx = bx - ax;
    const dy = by - ay;
    const length = Math.hypot(dx, dy);
    let farthest = -1;
    let farthestDistance = tolerance;
    for (let index = first + 1; index < last; index += 1) {
      const [px, py] = points[index];
      const distance = length === 0 ? Math.hypot(px - ax, py - ay) : Math.abs(dy * px - dx * py + bx * ay - by * ax) / length;
      if (distance > farthestDistance) { farthest = index; farthestDistance = distance; }
    }
    if (farthest > 0) {
      keep[farthest] = 1;
      stack.push([first, farthest], [farthest, last]);
    }
  }
  return points.filter((_, index) => keep[index]);
}

// 5 décimales : ~1 m, bien assez pour dessiner une ligne.
const round = ([lon, lat]: Position): Position => [Math.round(lon * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5];

// Le fichier découpe chaque ligne en petits tronçons de 2 points (46 057 pour 611 lignes) : on les remet bout à bout
// quand l'un commence où le précédent finit, sinon rien ne se simplifie.
export function joinSegments(segments: Position[][]): Position[][] {
  const chains: Position[][] = [];
  for (const segment of segments) {
    if (segment.length < 2) continue;
    const chain = chains[chains.length - 1];
    const end = chain?.[chain.length - 1];
    if (end && end[0] === segment[0][0] && end[1] === segment[0][1]) chain.push(...segment.slice(1));
    else chains.push([...segment]);
  }
  return chains;
}

function lines(geometry: LineFeature["geometry"]): Position[][] {
  if (!geometry) return [];
  if (geometry.type === "LineString") return [geometry.coordinates as Position[]];
  if (geometry.type === "MultiLineString") return geometry.coordinates as Position[][];
  return [];
}

export function mapLayer(features: LineFeature[]) {
  return {
    type: "FeatureCollection" as const,
    metadata: { source: "transport-lines-normalized.geojson", simplified_tolerance_deg: SIMPLIFY_TOLERANCE_DEG },
    features: features.flatMap((feature) => {
      const properties = feature.properties ?? {};
      const coordinates = joinSegments(lines(feature.geometry)).map((line) => simplifyLine(line).map(round)).filter((line) => line.length > 1);
      if (!coordinates.length) return [];
      return [{
        type: "Feature" as const,
        properties: { code: properties.code ?? null, name: properties.name ?? null, sira_mode: properties.sira_mode ?? "UNKNOWN" },
        geometry: { type: "MultiLineString" as const, coordinates },
      }];
    }),
  };
}
