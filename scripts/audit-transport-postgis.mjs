import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const tables = {
  agencies: "transport_gtfs_agencies",
  routes: "transport_gtfs_routes",
  stops: "transport_gtfs_stops",
  trips: "transport_gtfs_trips",
  stop_times: "transport_gtfs_stop_times",
  frequencies: "transport_gtfs_frequencies",
  shapes: "transport_gtfs_shapes",
  fares: "transport_gtfs_fares",
};

async function auditPostgis({ databaseUrl = process.env.DATABASE_URL } = {}) {
  if (!databaseUrl) throw new Error("DATABASE_URL est obligatoire pour auditer PostgreSQL.");
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const counts = {};
    for (const [name, table] of Object.entries(tables)) {
      const result = await client.query(`SELECT count(*)::integer AS count FROM ${table}`);
      counts[name] = result.rows[0].count;
    }
    const checks = {};
    const queries = {
      routes_without_agency: "SELECT count(*)::integer AS count FROM transport_gtfs_routes r LEFT JOIN transport_gtfs_agencies a ON a.source_id = r.agency_source_id WHERE r.agency_source_id IS NOT NULL AND a.source_id IS NULL",
      trips_without_route: "SELECT count(*)::integer AS count FROM transport_gtfs_trips t LEFT JOIN transport_gtfs_routes r ON r.source_id = t.route_source_id WHERE r.source_id IS NULL",
      stop_times_without_trip: "SELECT count(*)::integer AS count FROM transport_gtfs_stop_times st LEFT JOIN transport_gtfs_trips t ON t.source_id = st.trip_source_id WHERE t.source_id IS NULL",
      stop_times_without_stop: "SELECT count(*)::integer AS count FROM transport_gtfs_stop_times st LEFT JOIN transport_gtfs_stops s ON s.source_id = st.stop_source_id WHERE s.source_id IS NULL",
      frequencies_without_trip: "SELECT count(*)::integer AS count FROM transport_gtfs_frequencies f LEFT JOIN transport_gtfs_trips t ON t.source_id = f.trip_source_id WHERE t.source_id IS NULL",
      routes_without_geometry: "SELECT count(*)::integer AS count FROM transport_gtfs_routes WHERE geometry IS NULL OR ST_IsEmpty(geometry) OR NOT ST_IsValid(geometry) OR ST_SRID(geometry) <> 4326",
      stops_without_geometry: "SELECT count(*)::integer AS count FROM transport_gtfs_stops WHERE geometry IS NULL OR ST_IsEmpty(geometry) OR NOT ST_IsValid(geometry) OR ST_SRID(geometry) <> 4326",
      shapes_without_geometry: "SELECT count(*)::integer AS count FROM transport_gtfs_shapes WHERE geometry IS NULL OR ST_IsEmpty(geometry) OR NOT ST_IsValid(geometry) OR ST_SRID(geometry) <> 4326",
      non_historical_routes: "SELECT count(*)::integer AS count FROM transport_gtfs_routes WHERE data_status NOT IN ('historical', 'estimated', 'validated', 'unknown')",
      invented_fares: "SELECT count(*)::integer AS count FROM transport_gtfs_fares WHERE amount IS NULL AND status <> 'unknown'",
    };
    for (const [name, query] of Object.entries(queries)) checks[name] = (await client.query(query)).rows[0].count;
    return { counts, checks, valid: Object.values(checks).every((value) => value === 0) };
  } finally {
    await client.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  auditPostgis()
    .then((report) => {
      console.log(JSON.stringify(report, null, 2));
      if (!report.valid) process.exitCode = 1;
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}

export { auditPostgis };
