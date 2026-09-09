import assert from "node:assert/strict";
import test from "node:test";

const databaseUrl = process.env.DATABASE_URL ?? "postgresql://sira:sira_dev_password@localhost:5432/sira";
const apiBaseUrl = process.env.SIRA_API_URL ?? "http://localhost:8080/api/v1";

async function canReachPostgres() {
  try {
    const { Client } = await import("pg");
    const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 2000 });
    await client.connect();
    await client.query("SELECT 1");
    await client.end();
    return true;
  } catch {
    return false;
  }
}

async function canReachApi() {
  try {
    const response = await fetch(`${apiBaseUrl}/health`, { signal: AbortSignal.timeout(3000) });
    return response.ok;
  } catch {
    return false;
  }
}

test("integration PostGIS: arrets proches autour du Plateau", { skip: !(await canReachApi()) }, async () => {
  const response = await fetch(`${apiBaseUrl}/mobility/transport/stops/nearby?lat=5.3196&lon=-4.0201&radiusM=500`);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.source, "postgis");
  assert.equal(payload.dataStatus, "historical");
  assert.ok(payload.items.length > 0);
  const first = payload.items[0];
  assert.ok(first.id);
  assert.ok(first.name);
  assert.ok(Number.isFinite(first.latitude));
  assert.ok(Number.isFinite(first.longitude));
  assert.ok(first.distance_m > 0);
});

test("integration PostGIS: stop -> routes via relations GTFS", { skip: !(await canReachPostgres()) }, async () => {
  const { Client } = await import("pg");
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const result = await client.query(`
      SELECT r.source_id AS route_id, r.short_name, r.long_name, r.mode, r.operator, t.headsign, r.data_status, r.confidence
      FROM transport_gtfs_stops s
      JOIN transport_gtfs_stop_times st ON st.stop_source_id = s.source_id
      JOIN transport_gtfs_trips t ON t.source_id = st.trip_source_id
      JOIN transport_gtfs_routes r ON r.source_id = t.route_source_id
      WHERE s.source_id = $1
      LIMIT 1
    `, ["n6904171076"]);
    assert.ok(result.rows.length > 0);
    const route = result.rows[0];
    assert.ok(route.route_id);
    assert.ok(route.long_name);
    assert.ok(route.mode);
    assert.equal(route.data_status, "historical");
  } finally {
    await client.end();
  }
});

test("integration PostGIS: premier segment reel Au 19 -> Agripac", { skip: !(await canReachApi()) }, async () => {
  const response = await fetch(`${apiBaseUrl}/mobility/transport/segment`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      origin: { lat: 5.2560547, lon: -3.9968066, name: "Au 19" },
      destination: { lat: 5.4436702, lon: -4.048408, name: "Agripac" },
      radiusM: 1500,
    }),
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(response.status, 201);
  const payload = await response.json();
  assert.equal(payload.status, "found");
  assert.equal(payload.source, "postgis");
  assert.equal(payload.dataStatus, "historical");
  const leg = payload.legs[0];
  assert.equal(leg.type, "transit");
  assert.equal(leg.fromStop.name, "Au 19");
  assert.equal(leg.toStop.name, "Agripac");
  assert.equal(leg.fare, null);
  assert.equal(leg.fareStatus, "unknown");
  assert.equal(leg.geometry.type, "LineString");
  assert.ok(leg.geometry.coordinates.length > 10);
});

test("integration PostGIS: segment Plateau avec tarif historique", { skip: !(await canReachApi()) }, async () => {
  const response = await fetch(`${apiBaseUrl}/mobility/transport/segment`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      origin: { lat: 5.3196, lon: -4.0201, name: "Plateau Gare Sud" },
      destination: { lat: 5.3312, lon: -4.0239, name: "Cite Admin" },
      radiusM: 500,
    }),
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(response.status, 201);
  const payload = await response.json();
  assert.equal(payload.status, "found");
  const leg = payload.legs[0];
  assert.equal(leg.fare, 200);
  assert.equal(leg.fareStatus, "historical");
});

test("integration PostGIS: absence de chemin explicite", { skip: !(await canReachApi()) }, async () => {
  const response = await fetch(`${apiBaseUrl}/mobility/transport/segment`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      origin: { lat: 5.3196, lon: -4.0201 },
      destination: { lat: 5.2614, lon: -3.9263 },
      radiusM: 200,
    }),
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(response.status, 201);
  const payload = await response.json();
  assert.equal(payload.status, "no_transport_path_found");
  assert.equal(payload.fare, null);
  assert.equal(payload.fareStatus, "unknown");
});

test("non-regression: journeys GeoJSON reste disponible", { skip: !(await canReachApi()) }, async () => {
  const response = await fetch(`${apiBaseUrl}/mobility/journeys`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      origin: { lat: 5.3467, lon: -3.9951, name: "Cocody Danga" },
      destination: { lat: 5.3196, lon: -4.0201, name: "Plateau Gare Sud" },
      budget: 1500,
      preference: "balanced",
      constraints: { maxWalkingDistanceM: 1500, maxTransfers: 3, excludedModes: [] },
    }),
    signal: AbortSignal.timeout(30000),
  });
  assert.equal(response.status, 201);
  const payload = await response.json();
  assert.ok(Array.isArray(payload.journeys));
  assert.ok(payload.journeys.length > 0);
  assert.ok(payload.recommended_id);
});

const post = async (path, body) => {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  assert.equal(response.status, 201);
  return response.json();
};

test("integration Walk+PostGIS: walk() Valhalla retourne distance/duree/geometrie [lon,lat]", { skip: !(await canReachApi()) }, async () => {
  const r = await post("/mobility/transport/walk", {
    origin: { lat: 5.3196, lon: -4.0201, name: "Plateau Gare Sud" },
    destination: { lat: 5.3206143, lon: -4.0196363, name: "Cash Center Plateau" },
    maxDistanceM: 500, connectorKind: "access",
  });
  assert.equal(r.status, "found");
  assert.match(String(r.provider), /valhalla/);
  assert.ok(r.distanceM > 0);
  assert.ok(r.durationSeconds > 0);
  assert.equal(r.geometry.type, "LineString");
  assert.ok(r.geometry.coordinates.length > 1);
  const first = r.geometry.coordinates[0];
  assert.ok(Array.isArray(first));
  assert.equal(typeof first[0], "number");
  assert.equal(typeof first[1], "number");
  assert.ok(first[0] < 0);
});

test("integration Walk+PostGIS: walk-access trouve le meilleur arret parmi 3-5 candidats", { skip: !(await canReachApi()) }, async () => {
  const r = await post("/mobility/transport/walk-access", {
    origin: { lat: 5.3206, lon: -4.0196, name: "Plateau centre" },
    radiusM: 600, maxWalkingDistanceM: 500, maxCandidates: 5,
  });
  assert.equal(r.source, "postgis");
  assert.ok(r.candidatesEvaluated >= 1);
  assert.ok(r.candidatesEvaluated <= 5);
  assert.equal(r.status, "found");
  assert.match(String(r.provider), /valhalla/);
  assert.ok(r.stop.id);
  assert.ok(r.stop.name);
  assert.ok(r.walk.distanceM > 0);
  assert.ok(r.walk.durationSeconds > 0);
  assert.equal(r.walk.geometry.type, "LineString");
  assert.ok(r.walk.geometry.coordinates.length > 1);
  assert.ok(Array.isArray(r.candidates));
  assert.ok(r.candidates.every((c) => "stopId" in c && "walkStatus" in c));
});

test("integration Walk+PostGIS: walk-access no_accessible_stop_found si maxWalkingDistanceM=1", { skip: !(await canReachApi()) }, async () => {
  const r = await post("/mobility/transport/walk-access", {
    origin: { lat: 5.3206, lon: -4.0196 },
    radiusM: 600, maxWalkingDistanceM: 1, maxCandidates: 5,
  });
  assert.equal(r.status, "no_accessible_stop_found");
  assert.ok(r.candidatesEvaluated >= 1);
});

test("integration Walk+PostGIS: walk-egress arret PostGIS vers destination Valhalla", { skip: !(await canReachApi()) }, async () => {
  const r = await post("/mobility/transport/walk-egress", {
    fromStop: { lat: 5.3206143, lon: -4.0196363, id: "n6904171076", name: "Cash Center Plateau" },
    destination: { lat: 5.3196, lon: -4.0201, name: "Plateau Gare Sud" },
    maxWalkingDistanceM: 500,
  });
  assert.equal(r.status, "found");
  assert.ok(r.fromStop.id === "n6904171076");
  assert.ok(r.distanceM > 0);
  assert.ok(r.durationSeconds > 0);
  assert.equal(r.geometry.type, "LineString");
});

test("integration multimodal: trajet reel marche + transport PostGIS + marche", { skip: !(await canReachApi()) }, async () => {
  const r = await post("/mobility/transport/multimodal", {
    origin: { lat: 5.3197, lon: -4.02, name: "Near Plateau Gare Sud" },
    destination: { lat: 5.3313, lon: -4.0238, name: "Near Cite Admin" },
    radiusM: 1500,
    maxWalkingDistanceM: 1000,
    maxCandidates: 5,
  });
  assert.equal(r.source, "postgis");
  assert.equal(r.dataStatus, "historical");
  assert.ok(Array.isArray(r.legs));
  assert.equal(r.legs.length, 3);
  assert.equal(r.legs[0].mode, "WALK");
  assert.ok(r.legs[0].distanceM > 0);
  assert.ok(r.legs[0].durationSeconds > 0);
  assert.equal(r.legs[0].geometry.type, "LineString");
  assert.ok(r.legs[0].geometry.coordinates.length > 1);
  assert.equal(r.legs[1].mode, "SOTRA_BUS");
  assert.ok(r.legs[1].route.id);
  assert.ok(r.legs[1].route.longName);
  assert.ok(r.legs[1].distanceM > 0);
  assert.ok(r.legs[1].durationSeconds > 0);
  assert.equal(r.legs[1].geometry.type, "LineString");
  assert.ok(r.legs[1].geometry.coordinates.length > 1);
  assert.equal(r.legs[2].mode, "WALK");
  assert.ok(r.legs[2].distanceM > 0);
  assert.ok(r.legs[2].durationSeconds > 0);
  assert.equal(r.legs[2].geometry.type, "LineString");
  assert.ok(r.legs[2].geometry.coordinates.length > 1);
  assert.equal(r.summary.transfers, 0);
  assert.ok(r.summary.totalDistanceM > 0);
  assert.ok(r.summary.totalDurationSeconds > 0);
});

test("integration multimodal: tarif inconnu conserve null + unknown", { skip: !(await canReachApi()) }, async () => {
  const r = await post("/mobility/transport/multimodal", {
    origin: { lat: 5.2561, lon: -3.9967, name: "Near Au 19" },
    destination: { lat: 5.4438, lon: -4.0483, name: "Near Agripac" },
    radiusM: 1500,
    maxWalkingDistanceM: 1000,
    maxCandidates: 5,
  });
  const transitLeg = r.legs.find((leg) => leg.mode === "GBAKA");
  assert.ok(transitLeg);
  assert.equal(transitLeg.fare, null);
  assert.equal(transitLeg.fareStatus, "unknown");
  assert.equal(r.summary.fare, null);
  assert.equal(r.summary.fareStatus, "unknown");
});

test("integration multimodal: non-regression journeys GeoJSON", { skip: !(await canReachApi()) }, async () => {
  const response = await fetch(`${apiBaseUrl}/mobility/journeys`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      origin: { lat: 5.3467, lon: -3.9951, name: "Cocody Danga" },
      destination: { lat: 5.3196, lon: -4.0201, name: "Plateau Gare Sud" },
      budget: 1500,
      preference: "balanced",
      constraints: { maxWalkingDistanceM: 1500, maxTransfers: 3, excludedModes: [] },
    }),
    signal: AbortSignal.timeout(30000),
  });
  assert.equal(response.status, 201);
  const payload = await response.json();
  assert.ok(Array.isArray(payload.journeys));
  assert.ok(payload.journeys.length > 0);
  assert.ok(payload.recommended_id);
});
