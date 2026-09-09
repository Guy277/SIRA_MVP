import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { auditTransportNetwork } from "../scripts/audit-transport-network.mjs";
import { importTransportData } from "../scripts/import-transport-postgis.mjs";

const root = path.resolve();
const gtfsPath = path.join(root, "data", "abidjan-master", "abidjan-master", "Données", "abidjan.zip");
const linesPath = path.join(root, "data", "abidjan-master", "abidjan-master", "Données", "abidjantransport_lignes.csv");

test("importe le GTFS complet et ses metadonnees de lignes", () => {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "sira-transport-import-"));
  const result = importTransportData({
    gtfsPath,
    linesPath,
    outputPath: path.join(temporaryDirectory, "transport-network-unified.json"),
  });

  assert.equal(result.schema_version, "sira-transport-unified-v1");
  assert.equal(result.counts.routes, 398);
  assert.equal(result.counts.stops, 3820);
  assert.equal(result.counts.trips, 830);
  assert.equal(result.counts.stop_times, 11084);
  assert.equal(result.counts.frequencies, 1304);
  assert.equal(result.counts.routes_with_fares + result.counts.routes_without_fares, result.counts.routes);
  assert.ok(result.routes.every((route) => route.geometry.length > 1));
  assert.ok(result.stops.every((stop) => Number.isFinite(stop.latitude) && Number.isFinite(stop.longitude)));
  assert.ok(result.routes.every((route) => route.data_status === "historical"));
  assert.ok(result.routes.some((route) => route.fare_status === "unknown"));
  assert.ok(result.routes.every((route) => route.validation_status === "pending"));
});

test("audite la coherence du reseau unifie avant PostGIS", () => {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "sira-transport-audit-"));
  const report = auditTransportNetwork({
    outputPath: path.join(temporaryDirectory, "transport-network-audit.json"),
  });

  assert.equal(report.summary.routes, 398);
  assert.equal(report.summary.routes_without_stops, 0);
  assert.equal(report.summary.routes_without_stop_times, 0);
  assert.equal(report.summary.routes_without_geometry, 0);
  assert.equal(report.referential_integrity.invalid_trip_route_references, 0);
  assert.equal(report.referential_integrity.invalid_stop_time_trip_references, 0);
  assert.equal(report.referential_integrity.invalid_stop_time_stop_references, 0);
  assert.equal(report.referential_integrity.invalid_frequency_trip_references, 0);
  assert.equal(report.coordinate_bounds.stops_outside_greater_abidjan_bounds, 0);
  assert.deepEqual(report.duplicates.route_ids, []);
  assert.deepEqual(report.duplicates.stop_ids, []);
  assert.deepEqual(report.duplicates.trip_ids, []);
  assert.ok(report.quality_flags.includes("routes_without_fare"));
  assert.ok(report.quality_flags.includes("dataset_not_validated"));
});