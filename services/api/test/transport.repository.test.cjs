const test = require("node:test");
const assert = require("node:assert/strict");
const { TransportRepository } = require("../dist/mobility/transport.repository.js");

function createRepositoryWithRows(rowsByQuery) {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "postgresql://mock/mock/mock";
  const repository = new TransportRepository();
  const pool = repository.pool;
  pool.connect = async () => ({
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    query: async (sql, params) => {
      const key = sql.includes("candidate_routes") ? "segment" : "nearby";
      const rows = rowsByQuery[key] ?? [];
      return { rows };
    },
    release: () => undefined,
  });
  process.env.DATABASE_URL = originalDatabaseUrl;
  return repository;
}

test("findNearbyStops retourne les champs attendus depuis PostGIS", async () => {
  const repository = createRepositoryWithRows({
    nearby: [{
      id: "n6904171076",
      name: "Cash Center Plateau",
      code: null,
      latitude: 5.3206143,
      longitude: -4.0196363,
      distance_m: "123.38",
    }],
  });
  const stops = await repository.findNearbyStops(5.3196, -4.0201, 500, 5);
  assert.equal(stops.length, 1);
  assert.equal(stops[0].id, "n6904171076");
  assert.equal(stops[0].name, "Cash Center Plateau");
  assert.equal(stops[0].latitude, 5.3206143);
  assert.equal(stops[0].longitude, -4.0196363);
  assert.ok(stops[0].distance_m > 0);
});

test("findFirstTransitSegment expose route, arrets, geometrie et tarif nullable", async () => {
  const repository = createRepositoryWithRows({
    segment: [{
      route_id: "r13499675",
      short_name: null,
      long_name: "gbaka : Agripac ↔ Treichville",
      mode: "GBAKA",
      operator: "Gbaka d'Abobo",
      historical_fare: null,
      fare_status: "unknown",
      data_status: "historical",
      confidence: null,
      from_stop_id: "n7184140913",
      from_stop_name: "Au 19",
      from_stop_code: null,
      from_latitude: 5.2560547,
      from_longitude: -3.9968066,
      from_distance_m: 0,
      to_stop_id: "n6938343085",
      to_stop_name: "Agripac",
      to_stop_code: null,
      to_latitude: 5.4436702,
      to_longitude: -4.048408,
      to_distance_m: 0,
      geometry: { type: "LineString", coordinates: [[-4.0483814, 5.4445267], [-4.048431, 5.4445142]] },
    }],
  });
  const segment = await repository.findFirstTransitSegment({
    origin: { lat: 5.2560547, lon: -3.9968066 },
    destination: { lat: 5.4436702, lon: -4.048408 },
    radiusM: 1500,
  });
  assert.ok(segment);
  assert.equal(segment.route_id, "r13499675");
  assert.equal(segment.mode, "GBAKA");
  assert.equal(segment.fare_status, "unknown");
  assert.equal(segment.historical_fare, null);
  assert.equal(segment.data_status, "historical");
  assert.equal(segment.geometry.type, "LineString");
  assert.ok(segment.geometry.coordinates.length >= 2);
});

test("findFirstTransitSegment retourne null sans relation inventee", async () => {
  const repository = createRepositoryWithRows({ segment: [] });
  const segment = await repository.findFirstTransitSegment({
    origin: { lat: 5.3196, lon: -4.0201 },
    destination: { lat: 5.2614, lon: -3.9263 },
    radiusM: 200,
  });
  assert.equal(segment, null);
});

test("TransportRepository est desactive sans DATABASE_URL", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  const repository = new TransportRepository();
  assert.equal(repository.enabled, false);
  process.env.DATABASE_URL = originalDatabaseUrl;
});
