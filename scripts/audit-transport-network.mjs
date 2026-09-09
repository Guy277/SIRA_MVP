import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve();
const networkPath = path.join(root, "data", "processed", "transport-network-unified.json");
const linesPath = path.join(root, "data", "abidjan-master", "abidjan-master", "Données", "abidjantransport_lignes.csv");
const geoJsonPath = path.join(root, "data", "processed", "transport-lines-normalized.geojson");
const outputPath = path.join(root, "data", "metadata", "transport-network-audit.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];
    if (character === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(value);
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }
  if (value.length || row.length) {
    row.push(value);
    rows.push(row);
  }
  const headers = rows.shift() ?? [];
  return rows.map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""])));
}

function countBy(values) {
  return Object.fromEntries([...values.entries()].sort((left, right) => right[1] - left[1]));
}

function duplicateValues(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].filter(([, count]) => count > 1).map(([value, count]) => ({ value, count }));
}

function auditTransportNetwork({ networkPath: sourceNetworkPath = networkPath, linesPath: sourceLinesPath = linesPath, geoJsonPath: sourceGeoJsonPath = geoJsonPath, outputPath: destination = outputPath }) {
  const network = readJson(sourceNetworkPath);
  const sourceLines = parseCsv(fs.readFileSync(sourceLinesPath, "utf8"));
  const geoJson = readJson(sourceGeoJsonPath);
  const routes = network.routes ?? [];
  const stops = network.stops ?? [];
  const trips = network.trips ?? [];
  const stopTimes = network.stop_times ?? [];
  const frequencies = network.frequencies ?? [];

  const routeIds = new Set(routes.map((route) => route.id));
  const stopIds = new Set(stops.map((stop) => stop.id));
  const tripIds = new Set(trips.map((trip) => trip.trip_id));
  const stopTimesByTrip = new Map();
  const stopIdsByRoute = new Map();
  for (const stopTime of stopTimes) {
    if (!tripIds.has(stopTime.trip_id) || !stopIds.has(stopTime.stop_id)) continue;
    if (!stopTimesByTrip.has(stopTime.trip_id)) stopTimesByTrip.set(stopTime.trip_id, []);
    stopTimesByTrip.get(stopTime.trip_id).push(stopTime);
  }
  for (const trip of trips) {
    const tripStops = stopTimesByTrip.get(trip.trip_id) ?? [];
    if (!stopIdsByRoute.has(trip.route_id)) stopIdsByRoute.set(trip.route_id, new Set());
    for (const stopTime of tripStops) stopIdsByRoute.get(trip.route_id).add(stopTime.stop_id);
  }

  const frequencyRouteIds = new Set(trips.filter((trip) => frequencies.some((frequency) => frequency.trip_id === trip.trip_id)).map((trip) => trip.route_id));
  const routeStats = routes.map((route) => ({
    id: route.id,
    short_name: route.short_name,
    mode: route.mode,
    stop_count: stopIdsByRoute.get(route.id)?.size ?? 0,
    trip_count: trips.filter((trip) => trip.route_id === route.id).length,
    has_stop_times: trips.some((trip) => trip.route_id === route.id && (stopTimesByTrip.get(trip.trip_id)?.length ?? 0) > 0),
    has_frequency: frequencyRouteIds.has(route.id),
    has_fare: route.fare_amount_fcfa !== null,
    has_geometry: Array.isArray(route.geometry) && route.geometry.length > 1,
  }));

  const coordinates = stops.map((stop) => [stop.longitude, stop.latitude]);
  const outsideAbidjan = coordinates.filter(([longitude, latitude]) => longitude < -4.4 || longitude > -3.6 || latitude < 5.1 || latitude > 5.7);
  const normalizedIds = new Set((geoJson.features ?? []).map((feature) => feature.properties?.line_id ?? feature.id).filter(Boolean));
  const sourceLineIds = new Set(sourceLines.map((line) => line.line_id).filter(Boolean));
  const geoJsonSourceIntersection = [...normalizedIds].filter((id) => sourceLineIds.has(id));
  const modes = new Map();
  for (const route of routes) modes.set(route.mode, (modes.get(route.mode) ?? 0) + 1);

  const report = {
    schema_version: "sira-transport-network-audit-v1",
    generated_at: new Date().toISOString(),
    dataset: {
      path: "data/processed/transport-network-unified.json",
      source_date: network.metadata?.source_date ?? null,
      data_status: network.metadata?.data_status ?? null,
      validation_status: network.metadata?.validation_status ?? null,
    },
    summary: {
      routes: routes.length,
      stops: stops.length,
      trips: trips.length,
      stop_times: stopTimes.length,
      frequencies: frequencies.length,
      source_line_rows: sourceLines.length,
      normalized_geojson_features: geoJson.features?.length ?? 0,
      routes_with_stops: routeStats.filter((route) => route.stop_count > 0).length,
      routes_without_stops: routeStats.filter((route) => route.stop_count === 0).length,
      routes_with_stop_times: routeStats.filter((route) => route.has_stop_times).length,
      routes_without_stop_times: routeStats.filter((route) => !route.has_stop_times).length,
      routes_with_frequency: routeStats.filter((route) => route.has_frequency).length,
      routes_without_frequency: routeStats.filter((route) => !route.has_frequency).length,
      routes_with_fare: routeStats.filter((route) => route.has_fare).length,
      routes_without_fare: routeStats.filter((route) => !route.has_fare).length,
      routes_with_geometry: routeStats.filter((route) => route.has_geometry).length,
      routes_without_geometry: routeStats.filter((route) => !route.has_geometry).length,
    },
    modes: countBy(modes),
    coordinate_bounds: {
      longitude_min: Math.min(...coordinates.map(([longitude]) => longitude)),
      longitude_max: Math.max(...coordinates.map(([longitude]) => longitude)),
      latitude_min: Math.min(...coordinates.map(([, latitude]) => latitude)),
      latitude_max: Math.max(...coordinates.map(([, latitude]) => latitude)),
      stops_outside_greater_abidjan_bounds: outsideAbidjan.length,
    },
    referential_integrity: {
      invalid_trip_route_references: trips.filter((trip) => !routeIds.has(trip.route_id)).length,
      invalid_stop_time_trip_references: stopTimes.filter((stopTime) => !tripIds.has(stopTime.trip_id)).length,
      invalid_stop_time_stop_references: stopTimes.filter((stopTime) => !stopIds.has(stopTime.stop_id)).length,
      invalid_frequency_trip_references: frequencies.filter((frequency) => !tripIds.has(frequency.trip_id)).length,
    },
    duplicates: {
      route_ids: duplicateValues(routes.map((route) => route.id)),
      stop_ids: duplicateValues(stops.map((stop) => stop.id)),
      trip_ids: duplicateValues(trips.map((trip) => trip.trip_id)),
      stop_time_keys: duplicateValues(stopTimes.map((stopTime) => `${stopTime.trip_id}|${stopTime.stop_sequence}`)),
    },
    source_alignment: {
      normalized_geojson_ids_matching_csv_line_ids: geoJsonSourceIntersection.length,
      normalized_geojson_ids_not_matching_csv_line_ids: normalizedIds.size - geoJsonSourceIntersection.length,
      note: "Les identifiants GTFS route_id et les identifiants OSM line_id ne sont pas du meme espace. La correspondance directe complete doit etre explicitee avant PostGIS.",
    },
    quality_flags: [
      ...(outsideAbidjan.length ? ["stops_outside_greater_abidjan_bounds"] : []),
      ...(routeStats.some((route) => route.stop_count === 0) ? ["routes_without_stops"] : []),
      ...(routeStats.some((route) => !route.has_frequency) ? ["routes_without_frequency"] : []),
      ...(routeStats.some((route) => !route.has_fare) ? ["routes_without_fare"] : []),
      ...(network.metadata?.validation_status !== "validated" ? ["dataset_not_validated"] : []),
    ],
  };

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const report = auditTransportNetwork({});
  console.log(JSON.stringify(report.summary, null, 2));
  console.log(`Rapport d'audit : ${outputPath}`);
}

export { auditTransportNetwork, parseCsv };