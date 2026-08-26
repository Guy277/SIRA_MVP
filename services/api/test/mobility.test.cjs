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
    const route = await routePedestrian("http://valhalla", { lon: -4.01, lat: 5.33 }, { lon: -4.009, lat: 5.331 }, { maxDistanceM: 500 });
    assert.equal(route.method, "valhalla_pedestrian");
    assert.equal(route.guidanceAvailable, true);
    assert.equal(route.coordinates.length, 3);
  } finally {
    global.fetch = originalFetch;
  }
});

test("un raccordement non routé n'est accepté que s'il est court et sans faux tracé", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => { throw new Error("offline"); };
  try {
    const rejected = await routePedestrian("http://valhalla", { lon: -4, lat: 5 }, { lon: -4, lat: 5.001 }, { maxDistanceM: 500 });
    assert.equal(rejected, null);
    const fallback = await routePedestrian("http://valhalla", { lon: -4, lat: 5 }, { lon: -4, lat: 5.001 }, { maxDistanceM: 500, allowEstimatedShortConnector: true });
    assert.equal(fallback.method, "estimated_short_connector");
    assert.equal(fallback.guidanceAvailable, false);
    assert.deepEqual(fallback.coordinates, []);
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
  const route = graph.route({ lon: -4, lat: 5 }, { lon: -3.98, lat: 5 }, "balanced", { maxAccessDistanceM: 100, maxTransferDistanceM: 200 });
  assert.ok(route);
  assert.equal(route.legs.length, 2);
  assert.equal(route.transfers.length, 1);
  assert.ok(route.transfers[0].distanceKm > 0);
});
