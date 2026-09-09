import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';


const root = path.resolve();
const defaultGtfsPath = path.join(root, "data", "abidjan-master", "abidjan-master", "Données", "abidjan.zip");
const defaultLinesPath = path.join(root, "data", "abidjan-master", "abidjan-master", "Données", "abidjantransport_lignes.csv");
const outputPath = path.join(root, "data", "processed", "transport-network-unified.json");

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

function readZipEntries(filePath) {
  const buffer = fs.readFileSync(filePath);
  const endSignature = 0x06054b50;
  let endOffset = -1;
  for (let index = buffer.length - 22; index >= Math.max(0, buffer.length - 65_557); index -= 1) {
    if (buffer.readUInt32LE(index) === endSignature) {
      endOffset = index;
      break;
    }
  }
  if (endOffset < 0) throw new Error(`Archive ZIP invalide: ${filePath}`);

  const entryCount = buffer.readUInt16LE(endOffset + 10);
  const directoryOffset = buffer.readUInt32LE(endOffset + 16);
  const entries = new Map();
  let offset = directoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error("Répertoire central ZIP invalide.");
    const compression = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    if (compression !== 0 && compression !== 8) throw new Error(`Compression ZIP non supportée: ${compression}`);
    entries.set(name, compression === 8 ? zlib.inflateRawSync(compressed) : compressed);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function requiredEntries(zipPath) {
  const entries = readZipEntries(zipPath);
  const read = (name) => {
    const content = entries.get(name);
    if (!content) throw new Error(`Fichier GTFS absent dans l'archive: ${name}`);
    return content.toString("utf8");
  };
  return {
    agency: parseCsv(read("agency.txt")),
    stops: parseCsv(read("stops.txt")),
    routes: parseCsv(read("routes.txt")),
    trips: parseCsv(read("trips.txt")),
    stopTimes: parseCsv(read("stop_times.txt")),
    shapes: parseCsv(read("shapes.txt")),
    frequencies: parseCsv(read("frequencies.txt")),
    calendar: parseCsv(read("calendar.txt")),
    feedInfo: parseCsv(read("feed_info.txt")),
  };
}

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function fareFromCsv(raw) {
  const match = String(raw ?? "").replace(",", ".").match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function modeFromRoute(route, agency) {
  const value = `${route.route_long_name} ${agency?.agency_name ?? ""}`.toLowerCase();
  if (route.route_type === "4" || /ferry|bateau|aqualine|stl/.test(value)) return "FERRY";
  if (/gbaka/.test(value)) return "GBAKA";
  if (/woro/.test(value)) return "WORO_WORO";
  return "SOTRA_BUS";
}

function parseArgs() {
  const args = process.argv.slice(2);
  const valueAfter = (name, fallback) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : fallback;
  };
  return {
    gtfsPath: path.resolve(valueAfter("--gtfs", defaultGtfsPath)),
    linesPath: path.resolve(valueAfter("--lines", defaultLinesPath)),
    outputPath: path.resolve(valueAfter("--output", outputPath)),
  };
}

function importTransportData({ gtfsPath, linesPath, outputPath: destination }) {
  if (!fs.existsSync(gtfsPath)) throw new Error(`Archive GTFS introuvable: ${gtfsPath}`);
  if (!fs.existsSync(linesPath)) throw new Error(`Export des lignes introuvable: ${linesPath}`);

  const gtfs = requiredEntries(gtfsPath);
  const lineRows = parseCsv(fs.readFileSync(linesPath, "utf8"));
  const linesByCode = new Map(lineRows.filter((line) => line.code).map((line) => [line.code.trim(), line]));
  const agenciesById = new Map(gtfs.agency.map((agency) => [agency.agency_id, agency]));
  const shapesById = new Map();
  for (const point of gtfs.shapes) {
    if (!shapesById.has(point.shape_id)) shapesById.set(point.shape_id, []);
    shapesById.get(point.shape_id).push({ sequence: Number(point.shape_pt_sequence), coordinate: [numberOrNull(point.shape_pt_lon), numberOrNull(point.shape_pt_lat)] });
  }
  for (const points of shapesById.values()) {
    points.sort((left, right) => left.sequence - right.sequence);
    points.splice(0, points.length, ...points.map((point) => point.coordinate));
  }
  const tripsByRoute = new Map();
  for (const trip of gtfs.trips) {
    if (!tripsByRoute.has(trip.route_id)) tripsByRoute.set(trip.route_id, []);
    tripsByRoute.get(trip.route_id).push(trip);
  }

  const routes = gtfs.routes.map((route) => {
    const agency = agenciesById.get(route.agency_id);
    const sourceLine = linesByCode.get(route.route_short_name?.trim());
    const trip = tripsByRoute.get(route.route_id)?.[0];
    const fare = fareFromCsv(sourceLine?.["osm:charge"]);
    return {
      id: route.route_id,
      agency_id: route.agency_id,
      agency_name: agency?.agency_name ?? null,
      short_name: route.route_short_name || null,
      long_name: route.route_long_name || null,
      route_type: numberOrNull(route.route_type),
      mode: modeFromRoute(route, agency),
      shape_id: trip?.shape_id ?? null,
      color: route.route_color || null,
      fare_amount_fcfa: fare,
      fare_raw: sourceLine?.["osm:charge"] || null,
      frequency_raw: sourceLine?.frequency || null,
      opening_hours: sourceLine?.opening_hours || null,
      frequency_exceptions: sourceLine?.frequency_exceptions || null,
      geometry: trip ? shapesById.get(trip.shape_id) ?? [] : [],
      data_status: "historical",
      fare_status: fare === null ? "unknown" : "historical",
      validation_status: "pending",
      source: {
        gtfs: "data/abidjan-master/abidjan-master/Données/abidjan.zip",
        line_metadata: sourceLine ? "data/abidjan-master/abidjan-master/Données/abidjantransport_lignes.csv" : null,
        data_date: "2021-10-12",
      },
    };
  });

  const result = {
    schema_version: "sira-transport-unified-v1",
    generated_at: new Date().toISOString(),
    status_definitions: {
      historical: "Source GTFS/OSM historique, non temps réel.",
      estimated: "Valeur déduite ou absente, à confirmer.",
      validated: "Valeur confirmée par un opérateur ou une observation terrain.",
    },
    metadata: {
      data_status: "historical",
      validation_status: "pending",
      source_date: "2021-10-12",
      license: "ODbL / Licence Ouverte 2.0 selon la source",
      fare_note: "Les tarifs issus de osm:charge sont historiques et non validés par SIRA.",
      missing_gtfs_fare_files: ["fare_attributes.txt", "fare_rules.txt"],
    },
    agencies: gtfs.agency,
    routes,
    stops: gtfs.stops.map((stop) => ({
      id: stop.stop_id,
      code: stop.stop_code || null,
      name: stop.stop_name,
      description: stop.stop_desc || null,
      location_type: numberOrNull(stop.location_type),
      parent_station: stop.parent_station || null,
      latitude: numberOrNull(stop.stop_lat),
      longitude: numberOrNull(stop.stop_lon),
      zone_id: stop.zone_id || null,
      wheelchair_boarding: stop.wheelchair_boarding || null,
      data_status: "historical",
      validation_status: "pending",
    })),
    trips: gtfs.trips,
    stop_times: gtfs.stopTimes,
    frequencies: gtfs.frequencies,
    shapes: [...shapesById.entries()].map(([shape_id, geometry]) => ({
      shape_id,
      geometry,
      data_status: "historical",
      validation_status: "pending",
    })),
    calendar: gtfs.calendar,
    feed_info: gtfs.feedInfo,
    counts: {
      agencies: gtfs.agency.length,
      routes: routes.length,
      stops: gtfs.stops.length,
      trips: gtfs.trips.length,
      stop_times: gtfs.stopTimes.length,
      frequencies: gtfs.frequencies.length,
      shapes: gtfs.shapes.length,
      line_metadata_rows: lineRows.length,
      routes_with_fares: routes.filter((route) => route.fare_amount_fcfa !== null).length,
      routes_without_fares: routes.filter((route) => route.fare_amount_fcfa === null).length,
    },
  };

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  try {
    const result = importTransportData(parseArgs());
    console.log(`Import GTFS + CSV termine : ${result.counts.routes} routes, ${result.counts.stops} arrets, ${result.counts.stop_times} horaires.`);
    console.log(`Fichier unifie : ${outputPath}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

export { importTransportData, parseCsv, readZipEntries };
