const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

const { GraphWorkerClient } = require("../dist/mobility/graph-client.js");
const { TransportGraph } = require("../dist/mobility/transport-graph.js");

const feature = (lineId, coordinates) => ({
  properties: { line_id: lineId, name: lineId, operator: "test", network: "test", sira_mode: "SOTRA_BUS", frequency: "10" },
  geometry: { type: "LineString", coordinates },
});

test("le worker de graphe renvoie le même trajet que le calcul direct", async () => {
  const features = [feature("A", [[-4, 5], [-3.99, 5]]), feature("B", [[-3.9895, 5], [-3.98, 5]])];
  const datasetPath = join(mkdtempSync(join(tmpdir(), "sira-graph-")), "lines.geojson");
  writeFileSync(datasetPath, JSON.stringify({ type: "FeatureCollection", features }));
  const options = { maxAccessDistanceM: 100, maxTransferDistanceM: 200, serviceDate: new Date("2026-09-01T12:00:00Z") };

  const expected = new TransportGraph(features).route({ lon: -4, lat: 5 }, { lon: -3.98, lat: 5 }, "balanced", options);
  const client = new GraphWorkerClient(datasetPath, 0.2);
  test.after(() => client.close());
  const actual = await client.route({ lon: -4, lat: 5 }, { lon: -3.98, lat: 5 }, "balanced", options);

  assert.deepEqual(actual.legs.map((leg) => leg.lineId), expected.legs.map((leg) => leg.lineId));
  assert.equal(actual.durationMinutes, expected.durationMinutes);
  assert.ok(Number(client.stats.nodes) > 0);
});
