import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = join(root, "data", "raw", "abidjantransport_lignes.geojson");
const outputPath = join(root, "data", "pilot", "corridors.json");

const source = JSON.parse(readFileSync(sourcePath, "utf8"));

const hubs = {
  yopougon: { name: "Yopougon Kouté / Sideci", coordinates: [-4.0736981, 5.3295751] },
  adjame_nord: { name: "Adjamé — Gare Nord", coordinates: [-4.028164, 5.3610529] },
  adjame_liberte: { name: "Adjamé Liberté", coordinates: [-4.0162, 5.3534] },
  plateau: { name: "Plateau — Gare Sud", coordinates: [-4.0197166, 5.3197413] },
  plateau_admin: { name: "Plateau — Cité Administrative", coordinates: [-4.0238837, 5.3312414] },
  riviera: { name: "Cocody / Riviera", coordinates: [-3.961682, 5.3596232] },
  bingerville: { name: "Bingerville", coordinates: [-3.889413, 5.3575965] },
  treichville: { name: "Treichville — Gare de Bassam", coordinates: [-4.0024749, 5.299662] },
  abobo: { name: "Abobo — Gare Mairie", coordinates: [-4.016225, 5.4085981] },
};

const routeSpecs = [
  ["yopougon_plateau_46", "Line:relation:10256311", "yopougon", "plateau_admin"],
  ["yopougon_adjame_43", "Line:relation:10220180", "yopougon", "adjame_nord"],
  ["adjame_nord_plateau_46", "Line:relation:10256311", "adjame_nord", "plateau_admin"],
  ["plateau_adjame_91", "Line:relation:10087961", "plateau", "adjame_liberte"],
  ["adjame_riviera_gbaka", "Line:relation:10402749", "adjame_liberte", "riviera"],
  ["adjame_bingerville_gbaka", "Line:relation:10402749", "adjame_liberte", "bingerville"],
  ["adjame_bingerville_gbaka_alt", "Line:relation:10410754", "adjame_liberte", "bingerville"],
  ["plateau_riviera_28", "Line:relation:10235433", "plateau", "riviera"],
  ["plateau_bingerville_773", "Line:relation:10397199", "plateau", "bingerville"],
  ["treichville_adjame_gbaka", "Line:relation:10179006", "treichville", "adjame_liberte"],
  ["treichville_adjame_22", "Line:relation:10225666", "treichville", "adjame_nord"],
  ["abobo_adjame_gbaka", "Line:relation:10179435", "abobo", "adjame_liberte"],
  ["abobo_plateau_15", "Line:relation:9589447", "abobo", "plateau"],
];

const coordinateKey = ([lon, lat]) => `${lon.toFixed(6)},${lat.toFixed(6)}`;

const distanceKm = (a, b) => {
  const radians = (value) => (value * Math.PI) / 180;
  const lat1 = radians(a[1]);
  const lat2 = radians(b[1]);
  const deltaLat = radians(b[1] - a[1]);
  const deltaLon = radians(b[0] - a[0]);
  const value = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
};

function buildGraph(feature) {
  const lines = feature.geometry.type === "MultiLineString" ? feature.geometry.coordinates : [feature.geometry.coordinates];
  const adjacency = new Map();
  const coordinates = new Map();

  const addEdge = (from, to) => {
    const fromKey = coordinateKey(from);
    const toKey = coordinateKey(to);
    coordinates.set(fromKey, from);
    coordinates.set(toKey, to);
    if (!adjacency.has(fromKey)) adjacency.set(fromKey, []);
    if (!adjacency.has(toKey)) adjacency.set(toKey, []);
    const weight = distanceKm(from, to);
    adjacency.get(fromKey).push({ key: toKey, weight });
    adjacency.get(toKey).push({ key: fromKey, weight });
  };

  for (const line of lines) {
    for (let index = 1; index < line.length; index += 1) addEdge(line[index - 1], line[index]);
  }
  return { adjacency, coordinates };
}

function connectedComponents(adjacency) {
  const seen = new Set();
  const components = [];
  for (const start of adjacency.keys()) {
    if (seen.has(start)) continue;
    const queue = [start];
    const component = [];
    seen.add(start);
    while (queue.length) {
      const current = queue.pop();
      component.push(current);
      for (const edge of adjacency.get(current) ?? []) {
        if (!seen.has(edge.key)) {
          seen.add(edge.key);
          queue.push(edge.key);
        }
      }
    }
    components.push(component);
  }
  return components;
}

function nearestNode(component, coordinates, target) {
  let result = { key: component[0], distance: Number.POSITIVE_INFINITY };
  for (const key of component) {
    const distance = distanceKm(coordinates.get(key), target);
    if (distance < result.distance) result = { key, distance };
  }
  return result;
}

function shortestPath(adjacency, coordinates, start, finish) {
  const distances = new Map([[start, 0]]);
  const previous = new Map();
  const pending = [[0, start]];

  while (pending.length) {
    pending.sort((a, b) => a[0] - b[0]);
    const [distance, current] = pending.shift();
    if (distance !== distances.get(current)) continue;
    if (current === finish) break;
    for (const edge of adjacency.get(current) ?? []) {
      const nextDistance = distance + edge.weight;
      if (nextDistance < (distances.get(edge.key) ?? Number.POSITIVE_INFINITY)) {
        distances.set(edge.key, nextDistance);
        previous.set(edge.key, current);
        pending.push([nextDistance, edge.key]);
      }
    }
  }

  if (!distances.has(finish)) throw new Error(`Aucun chemin connecté entre ${start} et ${finish}.`);
  const path = [];
  let current = finish;
  while (current) {
    path.push(coordinates.get(current));
    if (current === start) break;
    current = previous.get(current);
  }
  return { coordinates: path.reverse(), distanceKm: distances.get(finish) };
}

function extractRoute(routeId, lineId, fromHubId, toHubId) {
  const feature = source.features.find((candidate) => candidate.properties?.line_id === lineId);
  if (!feature) throw new Error(`Ligne introuvable : ${lineId}`);
  const graph = buildGraph(feature);
  const components = connectedComponents(graph.adjacency);
  const from = hubs[fromHubId].coordinates;
  const to = hubs[toHubId].coordinates;
  let selected;

  for (const component of components) {
    const start = nearestNode(component, graph.coordinates, from);
    const finish = nearestNode(component, graph.coordinates, to);
    const score = start.distance + finish.distance;
    if (!selected || score < selected.score) selected = { component, start, finish, score };
  }

  if (!selected || selected.start.distance > 2 || selected.finish.distance > 2) {
    throw new Error(`La ligne ${lineId} est trop éloignée de ${fromHubId} ou ${toHubId}.`);
  }

  const path = shortestPath(graph.adjacency, graph.coordinates, selected.start.key, selected.finish.key);
  return {
    id: routeId,
    sourceLineId: lineId,
    name: feature.properties?.name,
    operator: feature.properties?.operator,
    network: feature.properties?.network,
    rawMode: feature.properties?.mode,
    fromHubId,
    toHubId,
    snapDistanceMeters: {
      from: Math.round(selected.start.distance * 1000),
      to: Math.round(selected.finish.distance * 1000),
    },
    distanceKm: Number(path.distanceKm.toFixed(2)),
    coordinates: path.coordinates,
  };
}

const routes = Object.fromEntries(routeSpecs.map((spec) => {
  const route = extractRoute(...spec);
  return [route.id, route];
}));

const output = {
  metadata: {
    generatedAt: new Date().toISOString(),
    geometrySource: "data.gouv.ci / DigitalTransport4Africa — Abidjan transport lines",
    sourceUrl: "https://data.gouv.ci/datasets/abidjantransport-lignes",
    sourceUpdatedAt: "2021-10-12",
    geometryStatus: "historical_open_data",
    timetableStatus: "estimated_mvp",
    fareStatus: "estimated_mvp",
    notice: "Les géométries suivent les tracés historiques publiés. Les durées, attentes et tarifs doivent être validés avec les opérateurs.",
  },
  hubs,
  routes,
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(output)}\n`);
console.log(`Generated ${Object.keys(routes).length} route segments in ${outputPath}`);
for (const route of Object.values(routes)) {
  console.log(`${route.id}: ${route.distanceKm} km, ${route.coordinates.length} points, snap ${route.snapDistanceMeters.from}/${route.snapDistanceMeters.to} m`);
}
