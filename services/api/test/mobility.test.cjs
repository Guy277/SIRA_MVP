const test = require("node:test");
const assert = require("node:assert/strict");

const {
  estimateFare,
  estimateRideDuration,
  estimateWait,
  estimateWalkingDuration,
  isServiceOpen,
  parseHeadwayMinutes,
  resolveHeadwayMinutes,
} = require("../dist/mobility/estimators.js");
const { routePedestrian } = require("../dist/mobility/pedestrian-router.js");
const { TransportGraph } = require("../dist/mobility/transport-graph.js");
const { classifyTransferDistance } = require("../dist/mobility/walk-config.js");

test("normalise les fréquences historiques en minutes", () => {
  assert.equal(parseHeadwayMinutes("00:10"), 10);
  assert.equal(parseHeadwayMinutes("01:00"), 60);
  assert.equal(parseHeadwayMinutes("5"), 5);
  assert.equal(parseHeadwayMinutes("inconnu"), null);
});

test("calcule l'attente h/2 et expose un P90", () => {
  const estimate = estimateWait("sotra", "20");
  assert.equal(estimate.value, 10);
  assert.equal(estimate.p90, 18);
  assert.equal(estimate.method, "historical_published_headway");
  assert.ok(estimate.confidence < 1);
});

test("applique la tranche horaire historique et ferme une ligne hors service", () => {
  const morning = new Date("2026-08-26T06:00:00Z");
  assert.deepEqual(resolveHeadwayMinutes("60", "10 @ (Mo-Su 05:00-07:00); 30 @ (Mo-Su 07:00-20:00)", morning), { headway: 10, method: "historical_timeband_headway" });
  assert.equal(estimateWait("sotra", "60", "10 @ (Mo-Su 05:00-07:00)", morning).value, 5);
  assert.equal(isServiceOpen("Mo-Su 05:00-22:00", morning), true);
  assert.equal(isServiceOpen("Mo-Su 07:00-22:00", morning), false);
});

test("les durées de marche et de transport restent des estimations bornées", () => {
  assert.equal(estimateWalkingDuration(4.5).value, 60);
  assert.equal(estimateRideDuration("sotra", 18).value, 60);
  const fare = estimateFare("gbaka", 10);
  assert.equal(fare.value, 500);
  assert.ok(fare.p90 >= fare.value);
});

test("Valhalla fournit la géométrie piétonne réellement affichable", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      trip: {
        summary: { length: 0.13, time: 110 },
        legs: [{ shape: { coordinates: [[-4.01, 5.33], [-4.0097, 5.3304], [-4.009, 5.331]] } }],
      },
    }),
  });
  try {
    const route = await routePedestrian("http://valhalla", { lon: -4.01, lat: 5.33 }, { lon: -4.009, lat: 5.331 }, { maxDistanceM: 500, connectorKind: "access" });
    assert.equal(route.method, "valhalla_pedestrian");
    assert.equal(route.guidanceAvailable, true);
    assert.equal(route.source, "valhalla_osm");
    assert.equal(route.connectorKind, "access");
    assert.equal(route.coordinates.length, 3);
  } finally {
    global.fetch = originalFetch;
  }
});

test("un raccordement non routé est strictement rejeté", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => { throw new Error("offline"); };
  try {
    const rejected = await routePedestrian("http://valhalla", { lon: -4, lat: 5 }, { lon: -4, lat: 5.001 }, { maxDistanceM: 500, connectorKind: "transfer" });
    assert.equal(rejected, null);
  } finally {
    global.fetch = originalFetch;
  }
});

test("le graphe peut proposer une correspondance piétonne entre deux lignes proches", () => {
  const feature = (lineId, coordinates) => ({
    properties: { line_id: lineId, name: lineId, operator: "test", network: "test", sira_mode: "SOTRA_BUS", frequency: "10" },
    geometry: { type: "LineString", coordinates },
  });
  const graph = new TransportGraph([
    feature("A", [[-4, 5], [-3.99, 5]]),
    feature("B", [[-3.9895, 5], [-3.98, 5]]),
  ]);
  const route = graph.route({ lon: -4, lat: 5 }, { lon: -3.98, lat: 5 }, "balanced", { maxAccessDistanceM: 100, maxTransferDistanceM: 200, serviceDate: new Date("2026-09-01T12:00:00Z") });
  assert.ok(route);
  assert.equal(route.legs.length, 2);
  assert.equal(route.transfers.length, 1);
  assert.ok(route.transfers[0].distanceKm > 0);
  assert.equal(route.legs.length, 2);
  assert.equal(route.price, route.legs.reduce((sum, leg) => sum + leg.price, 0));
  const computedDuration = route.access.durationMinutes + route.egress.durationMinutes
    + route.legs.reduce((sum, leg) => sum + leg.waitMinutes + leg.durationMinutes, 0)
    + route.transfers.reduce((sum, transfer) => sum + transfer.durationMinutes + transfer.interchangeBufferMinutes, 0);
  assert.equal(route.durationMinutes, computedDuration);
});

test("classe les correspondances selon les distances SIRA-TRANSFER", () => {
  assert.equal(classifyTransferDistance(114), "FACILE");
  assert.equal(classifyTransferDistance(400), "NORMALE");
  assert.equal(classifyTransferDistance(800), "DIFFICILE");
  assert.equal(classifyTransferDistance(801), "IMPOSSIBLE");
});

test("le graphe compte trois embarquements et deux correspondances", () => {
  const feature = (lineId, coordinates) => ({
    properties: { line_id: lineId, name: lineId, operator: "test", network: "test", sira_mode: "SOTRA_BUS", frequency: "10" },
    geometry: { type: "LineString", coordinates },
  });
  const graph = new TransportGraph([
    feature("A", [[-4, 5], [-3.99, 5]]),
    feature("B", [[-3.9895, 5], [-3.98, 5]]),
    feature("C", [[-3.9795, 5], [-3.97, 5]]),
  ]);
  const route = graph.route({ lon: -4, lat: 5 }, { lon: -3.97, lat: 5 }, "balanced", { maxAccessDistanceM: 100, maxTransferDistanceM: 800, maxTransfers: 2, serviceDate: new Date("2026-09-02T12:00:00Z") });
  assert.ok(route);
  assert.equal(route.legs.length, 3);
  assert.equal(route.transfers.length, 2);
  assert.equal(route.price, route.legs.reduce((sum, leg) => sum + leg.price, 0));
});

test("rejette une correspondance au-delà de 800 mètres", () => {
  const feature = (lineId, coordinates) => ({
    properties: { line_id: lineId, name: lineId, operator: "test", network: "test", sira_mode: "SOTRA_BUS", frequency: "10" },
    geometry: { type: "LineString", coordinates },
  });
  const graph = new TransportGraph([
    feature("A", [[-4, 5], [-3.99, 5]]),
    feature("B", [[-3.98, 5], [-3.97, 5]]),
  ]);
  const route = graph.route({ lon: -4, lat: 5 }, { lon: -3.97, lat: 5 }, "balanced", { maxAccessDistanceM: 100, maxTransferDistanceM: 800, maxTransfers: 1, serviceDate: new Date("2026-09-02T12:00:00Z") });
  assert.equal(route, null);
});

test("walk() expose un contrat stable: status, distance, duree, geometrie [lon,lat], provider", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      trip: {
        summary: { length: 0.463, time: 351 },
        legs: [{ shape: { coordinates: [[-4.0201, 5.3196], [-4.0199, 5.3197], [-4.0196, 5.3206]] } }],
      },
    }),
  });
  try {
    const { MobilityService } = require("../dist/mobility/mobility.service.js");
    const TransportRepository = require("../dist/mobility/transport.repository.js").TransportRepository;
    process.env.DATABASE_URL = "postgresql://mock/mock/mock";
    const svc = new MobilityService(new TransportRepository());
    const result = await svc.walk(
      { lat: 5.3196, lon: -4.0201 },
      { lat: 5.3206, lon: -4.0196 },
      { maxDistanceM: 1000, connectorKind: "access" },
    );
    assert.equal(result.status, "found");
    assert.equal(result.provider, "valhalla_osm");
    assert.equal(result.distanceM, 463);
    assert.equal(result.durationSeconds, 351);
    assert.equal(result.geometry.type, "LineString");
    assert.ok(Array.isArray(result.geometry.coordinates[0]));
    assert.equal(typeof result.geometry.coordinates[0][0], "number");
    assert.equal(typeof result.geometry.coordinates[0][1], "number");
    assert.ok(result.durationMinutes >= 1);
    assert.ok(result.guidanceAvailable === true);
  } finally {
    global.fetch = originalFetch;
  }
});

test("walk() retourne no_walk_path_found quand Valhalla ne trouve pas de route (reponse vide)", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: true, json: async () => ({}) });
  try {
    const { MobilityService } = require("../dist/mobility/mobility.service.js");
    const TransportRepository = require("../dist/mobility/transport.repository.js").TransportRepository;
    process.env.DATABASE_URL = "postgresql://mock/mock/mock";
    const svc = new MobilityService(new TransportRepository());
    const result = await svc.walk(
      { lat: 5.3196, lon: -4.0201 },
      { lat: 5.3206, lon: -4.0196 },
      { maxDistanceM: 1000, connectorKind: "egress" },
    );
    assert.equal(result.status, "no_walk_path_found");
    assert.equal(result.provider, "valhalla");
  } finally {
    global.fetch = originalFetch;
  }
});

test("walk() respecte maxDistanceM via haversine pre-filtre (retour direct sans appel reseau trop grand)", async () => {
  let fetchCalled = false;
  const originalFetch = global.fetch;
  global.fetch = async () => { fetchCalled = true; return { ok: true, json: async () => ({}) }; };
  try {
    const { MobilityService } = require("../dist/mobility/mobility.service.js");
    const TransportRepository = require("../dist/mobility/transport.repository.js").TransportRepository;
    process.env.DATABASE_URL = "postgresql://mock/mock/mock";
    const svc = new MobilityService(new TransportRepository());
    const result = await svc.walk(
      { lat: 5.0, lon: -4.0 },
      { lat: 6.0, lon: -4.0 },
      { maxDistanceM: 50, connectorKind: "access" },
    );
    assert.equal(result.status, "no_walk_path_found");
    assert.equal(fetchCalled, false);
  } finally {
    global.fetch = originalFetch;
  }
});

test("findAccessibleStop choisit l'arret avec la PLUS PETITE distance PIETONNE (pas vol d'oiseau)", async () => {
  const poolConnectMock = {
    query: async (sql) => {
      if (sql.includes("ST_DWithin")) {
        return {
          rows: [
            { id: "near_crow_far_walk", name: "A", code: null, latitude: 5.3201, longitude: -4.0200, distance_m: "55" },
            { id: "far_crow_near_walk", name: "B", code: null, latitude: 5.3208, longitude: -4.0194, distance_m: "110" },
          ],
        };
      }
      return { rows: [] };
    },
    release: () => undefined,
  };
  const originalDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "postgresql://mock/mock/mock";
  const { TransportRepository } = require("../dist/mobility/transport.repository.js");
  const repo = new TransportRepository();
  repo.pool.connect = async () => poolConnectMock;
  const { MobilityService } = require("../dist/mobility/mobility.service.js");
  const svc = new MobilityService(repo);

  const originalFetch = global.fetch;
  const fetchByKey = (from, to) => {
    const key = `${from[0].lat},${from[0].lon}|${from[1].lat},${from[1].lon}`;
    const routes = {
      "5.3201,-4.02|5.3201,-4.02": { length: 0.8, time: 640, coords: [[-4.02, 5.3201], [-4.02, 5.3201]] },
      "5.3201,-4.02|5.3208,-4.0194": { length: 0.12, time: 96, coords: [[-4.02, 5.3201], [-4.0194, 5.3208]] },
    };
    const match = routes[key] ?? routes["5.3201,-4.02|5.3208,-4.0194"];
    return global.fetchBackupResponse(match);
  };
  global.fetchBackupResponse = (payload) => Promise.resolve({
    ok: true,
    json: async () => ({
      trip: {
        summary: { length: payload.length, time: payload.time },
        legs: [{ shape: { coordinates: payload.coords } }],
      },
    }),
  });
  global.fetch = async (_u, opts) => {
    const body = JSON.parse(opts.body);
    const from = body.locations[0]; const to = body.locations[1];
    if (from.lat === 5.3201 && from.lon === -4.02 && to.lat === 5.3201 && to.lon === -4.02) {
      return global.fetchBackupResponse({ length: 0.8, time: 640, coords: [[-4.02, 5.3201], [-4.02, 5.3201]] });
    }
    return global.fetchBackupResponse({ length: 0.12, time: 96, coords: [[-4.02, 5.3201], [-4.0194, 5.3208]] });
  };
  try {
    const result = await svc.findAccessibleStop(
      { lat: 5.3201, lon: -4.02 },
      { radiusM: 300, maxWalkingDistanceM: 1000, maxCandidates: 5 },
    );
    assert.equal(result.status, "found");
    assert.equal(result.stop.id, "far_crow_near_walk");
    assert.equal(result.stop.name, "B");
    assert.ok(result.walk.distanceM < 500);
    assert.ok(result.candidatesEvaluated === 2);
  } finally {
    global.fetch = originalFetch;
    delete global.fetchBackupResponse;
    process.env.DATABASE_URL = originalDatabaseUrl;
  }
});

test("findAccessibleStop retourne no_accessible_stop_found quand aucun candidat dans le rayon", async () => {
  const poolConnectMock = {
    query: async () => ({ rows: [] }),
    release: () => undefined,
  };
  const originalDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "postgresql://mock/mock/mock";
  const { TransportRepository } = require("../dist/mobility/transport.repository.js");
  const repo = new TransportRepository();
  repo.pool.connect = async () => poolConnectMock;
  const { MobilityService } = require("../dist/mobility/mobility.service.js");
  const svc = new MobilityService(repo);
  const originalFetch = global.fetch;
  try {
    const result = await svc.findAccessibleStop(
      { lat: 5.0, lon: -4.0 },
      { radiusM: 10, maxWalkingDistanceM: 500, maxCandidates: 3 },
    );
    assert.equal(result.status, "no_accessible_stop_found");
    assert.equal(result.candidatesEvaluated, 0);
  } finally {
    global.fetch = originalFetch;
    process.env.DATABASE_URL = originalDatabaseUrl;
  }
});

test("findEgressWalk expose fromStop + contrat walk", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      trip: {
        summary: { length: 0.52, time: 416 },
        legs: [{ shape: { coordinates: [[-4.0196, 5.3206], [-4.0201, 5.3196]] } }],
      },
    }),
  });
  try {
    const { MobilityService } = require("../dist/mobility/mobility.service.js");
    const TransportRepository = require("../dist/mobility/transport.repository.js").TransportRepository;
    process.env.DATABASE_URL = "postgresql://mock/mock/mock";
    const svc = new MobilityService(new TransportRepository());
    const result = await svc.findEgressWalk(
      { lat: 5.3206, lon: -4.0196, id: "n6904171076", name: "Cash Center Plateau" },
      { lat: 5.3196, lon: -4.0201, name: "Plateau Gare Sud" },
      { maxWalkingDistanceM: 1000 },
    );
    assert.equal(result.status, "found");
    assert.equal(result.fromStop.id, "n6904171076");
    assert.equal(result.fromStop.name, "Cash Center Plateau");
    assert.equal(result.distanceM, 520);
    assert.equal(result.durationSeconds, 416);
    assert.equal(result.geometry.type, "LineString");
  } finally {
    global.fetch = originalFetch;
  }
});

test("buildPostgisMultimodalJourney compose marche + transport PostGIS + marche", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      trip: {
        summary: { length: 0.12, time: 96 },
        legs: [{ shape: { coordinates: [[-4.02, 5.3201], [-4.0194, 5.3208]] } }],
      },
    }),
  });
  try {
    const { MobilityService } = require("../dist/mobility/mobility.service.js");
    const TransportRepository = require("../dist/mobility/transport.repository.js").TransportRepository;
    process.env.DATABASE_URL = "postgresql://mock/mock/mock";
    const repo = new TransportRepository();
    repo.pool.connect = async () => ({
      query: async (sql) => {
        if (sql.includes("ST_DWithin")) {
          return {
            rows: [
              { id: "n1", name: "A", code: null, latitude: 5.3202, longitude: -4.02, distance_m: "55" },
            ],
          };
        }
        return { rows: [] };
      },
      release: () => undefined,
    });
    repo.findFirstTransitSegment = async () => ({
      route_id: "r1",
      short_name: "L1",
      long_name: "Ligne Test",
      mode: "GBAKA",
      operator: "TestOp",
      historical_fare: 500,
      fare_status: "historical",
      data_status: "historical",
      confidence: 0.8,
      from_stop_id: "n1",
      from_stop_name: "A",
      from_stop_code: "A1",
      from_latitude: 5.3202,
      from_longitude: -4.02,
      from_distance_m: 0,
      to_stop_id: "n2",
      to_stop_name: "B",
      to_stop_code: "B1",
      to_latitude: 5.3208,
      to_longitude: -4.0194,
      to_distance_m: 0,
      geometry: { type: "LineString", coordinates: [[-4.02, 5.3202], [-4.0194, 5.3208]] },
    });
    const svc = new MobilityService(repo);
    const result = await svc.buildPostgisMultimodalJourney(
      { lat: 5.3201, lon: -4.02, name: "Origin" },
      { lat: 5.3209, lon: -4.0193, name: "Destination" },
      { radiusM: 500, maxWalkingDistanceM: 1000, maxCandidates: 5 }
    );
    assert.equal((result).source, "postgis");
    assert.equal((result).dataStatus, "historical");
    assert.equal((result).legs.length, 3);
    assert.equal((result).legs[0].mode, "WALK");
    assert.equal((result).legs[1].mode, "GBAKA");
    assert.equal((result).legs[2].mode, "WALK");
    assert.equal((result).legs[1].fare, 500);
    assert.equal((result).legs[1].fareStatus, "historical");
    assert.equal((result).summary.transfers, 0);
    assert.ok((result).summary.totalDistanceM > 0);
    assert.ok((result).summary.totalDurationSeconds > 0);
  } finally {
    global.fetch = originalFetch;
  }
});

test("buildPostgisMultimodalJourney retourne no_accessible_stop_found", async () => {
  const { MobilityService } = require("../dist/mobility/mobility.service.js");
  const TransportRepository = require("../dist/mobility/transport.repository.js").TransportRepository;
  process.env.DATABASE_URL = "postgresql://mock/mock/mock";
  const repo = new TransportRepository();
  repo.pool.connect = async () => ({
    query: async () => ({ rows: [] }),
    release: () => undefined,
  });
  const svc = new MobilityService(repo);
  const result = await svc.buildPostgisMultimodalJourney(
    { lat: 5.0, lon: -4.0 },
    { lat: 5.1, lon: -4.1 },
    { radiusM: 200, maxWalkingDistanceM: 500, maxCandidates: 3 }
  );
  assert.equal(result.status, "no_accessible_stop_found");
});

test("buildPostgisMultimodalJourney retourne no_transport_path_found", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      trip: {
        summary: { length: 0.12, time: 96 },
        legs: [{ shape: { coordinates: [[-4.02, 5.3201], [-4.0194, 5.3208]] } }],
      },
    }),
  });
  try {
    const { MobilityService } = require("../dist/mobility/mobility.service.js");
    const TransportRepository = require("../dist/mobility/transport.repository.js").TransportRepository;
    process.env.DATABASE_URL = "postgresql://mock/mock/mock";
    const repo = new TransportRepository();
    repo.pool.connect = async () => ({
      query: async (sql) => {
        if (sql.includes("ST_DWithin")) {
          return {
            rows: [
              { id: "n1", name: "A", code: null, latitude: 5.3202, longitude: -4.02, distance_m: "55" },
            ],
          };
        }
        return { rows: [] };
      },
      release: () => undefined,
    });
    repo.findFirstTransitSegment = async () => null;
    const svc = new MobilityService(repo);
    const result = await svc.buildPostgisMultimodalJourney(
      { lat: 5.3201, lon: -4.02, name: "Origin" },
      { lat: 5.3208, lon: -4.0194, name: "Destination" },
      { radiusM: 500, maxWalkingDistanceM: 1000, maxCandidates: 5 }
    );
    assert.equal(result.status, "no_transport_path_found");
  } finally {
    global.fetch = originalFetch;
  }
});

test("buildPostgisMultimodalJourney retourne no_egress_walk_path_found", async () => {
  const originalFetch = global.fetch;
  global.fetch = async (_url, opts) => {
    const body = JSON.parse(opts.body);
    const from = body.locations[0];
    const to = body.locations[1];
    if (from.lat === 5.3208 && from.lon === -4.0194 && to.lat === 5.9 && to.lon === -4.0) {
      return { ok: true, json: async () => ({}) };
    }
    return {
      ok: true,
      json: async () => ({
        trip: {
          summary: { length: 0.12, time: 96 },
          legs: [{ shape: { coordinates: [[-4.02, 5.3201], [-4.0194, 5.3208]] } }],
        },
      }),
    };
  };
  try {
    const { MobilityService } = require("../dist/mobility/mobility.service.js");
    const TransportRepository = require("../dist/mobility/transport.repository.js").TransportRepository;
    process.env.DATABASE_URL = "postgresql://mock/mock/mock";
    const repo = new TransportRepository();
    repo.pool.connect = async () => ({
      query: async (sql) => {
        if (sql.includes("ST_DWithin")) {
          return {
            rows: [
              { id: "n1", name: "A", code: null, latitude: 5.3202, longitude: -4.02, distance_m: "55" },
            ],
          };
        }
        return { rows: [] };
      },
      release: () => undefined,
    });
    repo.findFirstTransitSegment = async () => ({
      route_id: "r1",
      short_name: "L1",
      long_name: "Ligne Test",
      mode: "GBAKA",
      operator: "TestOp",
      historical_fare: null,
      fare_status: "unknown",
      data_status: "historical",
      confidence: 0.8,
      from_stop_id: "n1",
      from_stop_name: "A",
      from_stop_code: "A1",
      from_latitude: 5.3202,
      from_longitude: -4.02,
      from_distance_m: 0,
      to_stop_id: "n2",
      to_stop_name: "B",
      to_stop_code: "B1",
      to_latitude: 5.3208,
      to_longitude: -4.0194,
      to_distance_m: 0,
      geometry: { type: "LineString", coordinates: [[-4.02, 5.3202], [-4.0194, 5.3208]] },
    });
    const svc = new MobilityService(repo);
    const result = await svc.buildPostgisMultimodalJourney(
      { lat: 5.3201, lon: -4.02, name: "Origin" },
      { lat: 5.9, lon: -4.0, name: "FarDestination" },
      { radiusM: 500, maxWalkingDistanceM: 1000, maxCandidates: 5 }
    );
    assert.equal(result.status, "no_egress_walk_path_found");
  } finally {
    global.fetch = originalFetch;
  }
});
