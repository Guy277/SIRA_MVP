import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { Pool, type PoolClient } from "pg";

type StopRow = {
  id: string;
  name: string;
  code: string | null;
  latitude: number;
  longitude: number;
  distance_m: number;
};

type SegmentRequest = {
  origin: { lat: number; lon: number };
  destination: { lat: number; lon: number };
  radiusM: number;
};

@Injectable()
export class TransportRepository implements OnModuleDestroy {
  private readonly logger = new Logger(TransportRepository.name);
  private readonly pool?: Pool;

  constructor() {
    if (process.env.DATABASE_URL) this.pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
  }

  get enabled() {
    return Boolean(this.pool);
  }

  async onModuleDestroy() {
    await this.pool?.end();
  }

  async findNearbyStops(latitude: number, longitude: number, radiusM: number, limit = 5): Promise<StopRow[]> {
    const client = await this.getClient();
    try {
      const result = await client.query<StopRow>(
        `SELECT source_id AS id, name, code, latitude, longitude,
                ST_Distance(geometry::geography, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography) AS distance_m
         FROM transport_gtfs_stops
         WHERE ST_DWithin(geometry::geography, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography, $3)
         ORDER BY geometry::geography <-> ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
         LIMIT $4`,
        [latitude, longitude, radiusM, limit],
      );
      return result.rows.map((row) => ({ ...row, distance_m: Number(row.distance_m) }));
    } finally {
      client.release();
    }
  }

  async findFirstTransitSegment(request: SegmentRequest) {
    const client = await this.getClient();
    try {
      const result = await client.query(`
        WITH origin_stops AS (
          SELECT source_id, name, code, latitude, longitude,
                 ST_Distance(geometry::geography, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography) AS distance_m
          FROM transport_gtfs_stops
          WHERE ST_DWithin(geometry::geography, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography, $5)
          ORDER BY geometry::geography <-> ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
          LIMIT 8
        ), destination_stops AS (
          SELECT source_id, name, code, latitude, longitude,
                 ST_Distance(geometry::geography, ST_SetSRID(ST_MakePoint($4, $3), 4326)::geography) AS distance_m
          FROM transport_gtfs_stops
          WHERE ST_DWithin(geometry::geography, ST_SetSRID(ST_MakePoint($4, $3), 4326)::geography, $5)
          ORDER BY geometry::geography <-> ST_SetSRID(ST_MakePoint($4, $3), 4326)::geography
          LIMIT 8
        ), candidate_routes AS (
          SELECT DISTINCT ON (r.source_id, os.source_id, ds.source_id)
            r.source_id AS route_id, r.short_name, r.long_name, r.mode, r.operator,
            r.historical_fare, r.fare_status, r.data_status, r.confidence,
            os.source_id AS from_stop_id, os.name AS from_stop_name, os.code AS from_stop_code,
            os.latitude AS from_latitude, os.longitude AS from_longitude, os.distance_m AS from_distance_m,
            ds.source_id AS to_stop_id, ds.name AS to_stop_name, ds.code AS to_stop_code,
            ds.latitude AS to_latitude, ds.longitude AS to_longitude, ds.distance_m AS to_distance_m,
            ST_AsGeoJSON(
              ST_LineSubstring(
                r.geometry,
                LEAST(
                  ST_LineLocatePoint(r.geometry, ST_SetSRID(ST_MakePoint(os.longitude, os.latitude), 4326)),
                  ST_LineLocatePoint(r.geometry, ST_SetSRID(ST_MakePoint(ds.longitude, ds.latitude), 4326))
                ),
                GREATEST(
                  ST_LineLocatePoint(r.geometry, ST_SetSRID(ST_MakePoint(os.longitude, os.latitude), 4326)),
                  ST_LineLocatePoint(r.geometry, ST_SetSRID(ST_MakePoint(ds.longitude, ds.latitude), 4326))
                )
              )
            )::json AS geometry
          FROM origin_stops os
          JOIN transport_gtfs_stop_times from_times ON from_times.stop_source_id = os.source_id
          JOIN transport_gtfs_trips from_trips ON from_trips.source_id = from_times.trip_source_id
          JOIN transport_gtfs_stop_times to_times ON to_times.trip_source_id = from_times.trip_source_id
          JOIN destination_stops ds ON ds.source_id = to_times.stop_source_id
          JOIN transport_gtfs_routes r ON r.source_id = from_trips.route_source_id
          WHERE to_times.stop_sequence > from_times.stop_sequence
          ORDER BY r.source_id, os.source_id, ds.source_id, from_times.stop_sequence
        )
        SELECT * FROM candidate_routes
        ORDER BY from_distance_m + to_distance_m
        LIMIT 1`,
        [request.origin.lat, request.origin.lon, request.destination.lat, request.destination.lon, request.radiusM],
      );
      return result.rows[0] ?? null;
    } finally {
      client.release();
    }
  }

  private async getClient(): Promise<PoolClient> {
    if (!this.pool) throw new Error("DATABASE_URL is not configured");
    try {
      return await this.pool.connect();
    } catch (error) {
      this.logger.warn(`PostGIS unavailable: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
}
