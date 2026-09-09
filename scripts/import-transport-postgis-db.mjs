import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const root = path.resolve();
const defaultNetworkPath = path.join(root, "data", "processed", "transport-network-unified.json");
const schemaPath = path.join(root, "infra", "database", "init", "003_transport_gtfs.sql");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function geometryWkt(coordinates) {
  const points = (coordinates ?? [])
    .filter((coordinate) => Array.isArray(coordinate) && coordinate.length >= 2 && coordinate.every((value) => Number.isFinite(value)))
    .map(([longitude, latitude]) => `${longitude} ${latitude}`);
  if (points.length < 2) return null;
  return `LINESTRING(${points.join(",")})`;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const index = args.indexOf("--network");
  return { networkPath: path.resolve(index >= 0 ? args[index + 1] : defaultNetworkPath) };
}

async function importIntoPostgis({ networkPath = defaultNetworkPath, databaseUrl = process.env.DATABASE_URL } = {}) {
  if (!databaseUrl) throw new Error("DATABASE_URL est obligatoire pour importer dans PostgreSQL.");
  const network = readJson(networkPath);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(fs.readFileSync(schemaPath, "utf8"));
    await client.query("TRUNCATE transport_gtfs_stop_times, transport_gtfs_frequencies, transport_gtfs_fares, transport_gtfs_trips, transport_gtfs_routes, transport_gtfs_stops, transport_gtfs_shapes, transport_gtfs_agencies");

    for (const agency of network.agencies ?? []) {
      await client.query(
        `INSERT INTO transport_gtfs_agencies (source_id, name, url, timezone, lang, source_dataset, data_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [agency.agency_id, agency.agency_name, agency.agency_url || null, agency.agency_timezone || null, agency.agency_lang || null, "abidjan.zip", "historical"],
      );
    }

    for (const shape of network.shapes ?? []) {
      const wkt = geometryWkt(shape.geometry);
      if (!wkt) continue;
      await client.query(
        `INSERT INTO transport_gtfs_shapes (source_id, geometry, source_dataset, data_status)
         VALUES ($1, ST_GeomFromText($2, 4326), $3, $4)`,
        [shape.shape_id, wkt, "abidjan.zip", shape.data_status ?? "historical"],
      );
    }

    for (const route of network.routes ?? []) {
      const wkt = geometryWkt(route.geometry);
      const agency = (network.agencies ?? []).find((item) => item.agency_id === route.agency_id);
      await client.query(
        `INSERT INTO transport_gtfs_routes
          (source_id, agency_source_id, short_name, long_name, route_type, mode, operator, frequency_raw, opening_hours, exceptions, color, shape_source_id, source_dataset, historical_fare, fare_status, data_status, confidence, geometry)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, ${wkt ? "ST_GeomFromText($18, 4326)" : "NULL"})`,
        [route.id, route.agency_id || null, route.short_name, route.long_name, route.route_type ?? null, route.mode, agency?.agency_name ?? null, route.frequency_raw, route.opening_hours, route.frequency_exceptions, route.color, route.shape_id, "abidjan.zip", route.fare_amount_fcfa, route.fare_status ?? "unknown", route.data_status ?? "historical", null, wkt],
      );
      await client.query(
        `INSERT INTO transport_gtfs_fares (route_source_id, amount, currency, status, raw_value, source_dataset)
         VALUES ($1, $2, 'XOF', $3, $4, $5)`,
        [route.id, route.fare_amount_fcfa, route.fare_status ?? "unknown", route.fare_raw, "abidjantransport_lignes.csv"],
      );
    }

    for (const stop of network.stops ?? []) {
      await client.query(
        `INSERT INTO transport_gtfs_stops
          (source_id, code, name, description, location_type, parent_station, latitude, longitude, data_status, source_dataset, geometry)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, ST_SetSRID(ST_MakePoint($8, $7), 4326))`,
        [stop.id, stop.code, stop.name, stop.description, stop.location_type ?? null, stop.parent_station ?? null, stop.latitude, stop.longitude, stop.data_status ?? "historical", "abidjan.zip"],
      );
    }

    for (const trip of network.trips ?? []) {
      await client.query(
        `INSERT INTO transport_gtfs_trips (source_id, route_source_id, service_id, headsign, direction_id, shape_source_id, data_status, source_dataset)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [trip.trip_id, trip.route_id, trip.service_id, trip.trip_headsign || null, trip.direction_id || null, trip.shape_id || null, "historical", "abidjan.zip"],
      );
    }

    for (const stopTime of network.stop_times ?? []) {
      await client.query(
        `INSERT INTO transport_gtfs_stop_times (trip_source_id, stop_source_id, arrival_time, departure_time, stop_sequence, timepoint)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [stopTime.trip_id, stopTime.stop_id, stopTime.arrival_time || null, stopTime.departure_time || null, stopTime.stop_sequence, stopTime.timepoint || null],
      );
    }

    for (const frequency of network.frequencies ?? []) {
      await client.query(
        `INSERT INTO transport_gtfs_frequencies (trip_source_id, start_time, end_time, headway_secs, exact_times)
         VALUES ($1, $2, $3, $4, $5)`,
        [frequency.trip_id, frequency.start_time, frequency.end_time, frequency.headway_secs, frequency.exact_times || null],
      );
    }

    await client.query("COMMIT");
    const counts = {};
    for (const table of ["agencies", "routes", "stops", "trips", "stop_times", "frequencies", "shapes", "fares"]) {
      const result = await client.query(`SELECT count(*)::integer AS count FROM transport_gtfs_${table}`);
      counts[table] = result.rows[0].count;
    }
    return counts;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  importIntoPostgis(parseArgs())
    .then((counts) => console.log(JSON.stringify({ imported: true, counts }, null, 2)))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}

export { geometryWkt, importIntoPostgis };
