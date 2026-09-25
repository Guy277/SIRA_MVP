const test = require("node:test");
const assert = require("node:assert/strict");

const { ReportsService, distanceToLineM } = require("../dist/reports/reports.service.js");
const { TransportGraph } = require("../dist/mobility/transport-graph.js");

const PLATEAU = { lat: 5.3196, lon: -4.0201 };
const author = "author-client-01";
const create = (service, overrides = {}) => service.add({ type: "accident", ...PLATEAU, location: "Plateau", clientId: author, ...overrides });

test("un signalement démarre à l'état SIGNALÉ avec expiration et sévérité par type", () => {
  const report = create(new ReportsService());
  assert.equal(report.status, "reported");
  assert.equal(report.severity, "high");
  assert.equal(report.title, "Accident");
  assert.ok(Date.parse(report.expiresAt) > Date.parse(report.createdAt));
});

test("rejette un type inconnu, une position hors Grand Abidjan ou un client invalide", () => {
  const service = new ReportsService();
  assert.throws(() => create(service, { type: "meteor" }), /Type de signalement/);
  assert.throws(() => create(service, { lat: 48.85, lon: 2.35 }), /Grand Abidjan/);
  assert.throws(() => create(service, { clientId: "x" }), /Identifiant client/);
});

test("cycle SIGNALÉ → CONFIRMÉ → FIABLE par confirmations d'autres utilisateurs", () => {
  const service = new ReportsService();
  const report = create(service);
  assert.equal(service.vote(report.id, "witness-client-1", "confirm").status, "confirmed");
  assert.equal(service.vote(report.id, "witness-client-2", "confirm").status, "reliable");
});

test("l'auteur ne peut pas confirmer son propre signalement et un utilisateur ne vote qu'une fois", () => {
  const service = new ReportsService();
  const report = create(service);
  assert.throws(() => service.vote(report.id, author, "confirm"), /déjà donné/);
  service.vote(report.id, "witness-client-1", "confirm");
  assert.throws(() => service.vote(report.id, "witness-client-1", "contest"), /déjà donné/);
});

test("des contestations majoritaires passent le signalement à RÉSOLU et le retirent de la liste", () => {
  const service = new ReportsService();
  const report = create(service);
  service.vote(report.id, "passer-client-1", "contest");
  assert.equal(service.vote(report.id, "passer-client-2", "contest").status, "resolved");
  assert.equal(service.list().length, 0);
});

test("un signalement expiré disparaît de la liste", () => {
  const service = new ReportsService();
  const report = create(service);
  report.expiresAt = new Date(Date.now() - 1000).toISOString();
  assert.equal(service.list().length, 0);
});

test("distanceToLineM mesure la distance au segment le plus proche", () => {
  const line = [[-4.03, 5.32], [-4.01, 5.32]];
  assert.ok(distanceToLineM([-4.02, 5.32], line) < 1);
  const offset = distanceToLineM([-4.02, 5.321], line);
  assert.ok(offset > 100 && offset < 120, `≈111 m attendus, reçu ${offset}`);
});

test("impact : seul un événement confirmé sur un tronçon motorisé déclenche le recalcul", () => {
  const service = new ReportsService();
  const legs = [
    { mode: "walk", geometry: [[-4.025, 5.3196], [-4.022, 5.3196]] },
    { mode: "sotra", geometry: [[-4.022, 5.3196], [-4.015, 5.3196]] },
  ];
  const report = create(service);
  let impact = service.impact(legs);
  assert.equal(impact.requiresReroute, false);
  assert.equal(impact.unconfirmed.length, 1);

  service.vote(report.id, "witness-client-1", "confirm");
  impact = service.impact(legs);
  assert.equal(impact.requiresReroute, true);
  assert.equal(impact.affected[0].legIndex, 1);
  assert.equal(impact.delayMinutes, 23); // accident 15 min × sévérité haute 1,5
});

test("impact : un accident n'affecte pas la marche, une inondation si", () => {
  const service = new ReportsService();
  const walkOnly = [{ mode: "walk", geometry: [[-4.025, 5.3196], [-4.015, 5.3196]] }];
  const accident = create(service);
  const flood = create(service, { type: "flood" });
  service.vote(accident.id, "witness-client-1", "confirm");
  service.vote(flood.id, "witness-client-1", "confirm");
  const impact = service.impact(walkOnly);
  assert.deepEqual(impact.affected.map((item) => item.report.type), ["flood"]);
  assert.equal(impact.blocking, true);
});

test("le graphe contourne une zone à éviter et échoue si tout est bloqué", () => {
  const feature = (lineId, coordinates) => ({
    properties: { line_id: lineId, name: lineId, operator: "test", network: "test", sira_mode: "SOTRA_BUS", frequency: "10" },
    geometry: { type: "LineString", coordinates },
  });
  const graph = new TransportGraph([
    feature("NORD", [[-4, 5], [-3.99, 5.004], [-3.98, 5]]),
    feature("SUD", [[-4, 5], [-3.99, 4.996], [-3.98, 5]]),
  ]);
  const options = { maxAccessDistanceM: 100, serviceDate: new Date("2026-09-01T12:00:00Z") };
  const avoidNorth = { lat: 5.004, lon: -3.99, radiusM: 150 };
  const avoidSouth = { lat: 4.996, lon: -3.99, radiusM: 150 };
  const route = graph.route({ lon: -4, lat: 5 }, { lon: -3.98, lat: 5 }, "balanced", { ...options, avoidAreas: [avoidNorth] });
  assert.ok(route);
  assert.deepEqual(route.legs.map((leg) => leg.lineId), ["SUD"]);
  assert.equal(graph.route({ lon: -4, lat: 5 }, { lon: -3.98, lat: 5 }, "balanced", { ...options, avoidAreas: [avoidNorth, avoidSouth] }), null);
});
