import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const pilot = JSON.parse(await readFile(new URL("data/pilot/corridors.json", root), "utf8"));
const source = JSON.parse(await readFile(new URL("data/raw/abidjantransport_lignes.geojson", root), "utf8"));
const sourceLineIds = new Set(source.features.map((feature) => feature.properties?.line_id));

const requiredSegments = [
  "yopougon_plateau_46",
  "plateau_adjame_91",
  "adjame_riviera_gbaka",
  "adjame_bingerville_gbaka",
  "treichville_adjame_gbaka",
  "abobo_adjame_gbaka",
  "abobo_plateau_15",
];

test("pilot routes are dense source-backed geometries", () => {
  assert.equal(pilot.metadata.geometryStatus, "historical_open_data");
  assert.equal(pilot.metadata.timetableStatus, "estimated_mvp");
  assert.equal(pilot.metadata.fareStatus, "estimated_mvp");
  assert.ok(Object.keys(pilot.routes).length >= 13);

  for (const segmentId of requiredSegments) {
    const route = pilot.routes[segmentId];
    assert.ok(route, `missing ${segmentId}`);
    assert.ok(route.coordinates.length >= 100, `${segmentId} must follow a dense route geometry`);
    assert.ok(sourceLineIds.has(route.sourceLineId), `${segmentId} must reference an official source feature`);
    for (const [lon, lat] of route.coordinates) {
      assert.ok(lon > -4.4 && lon < -3.6 && lat > 5.1 && lat < 5.7, `${segmentId} coordinate must stay in Greater Abidjan`);
    }
  }
});
