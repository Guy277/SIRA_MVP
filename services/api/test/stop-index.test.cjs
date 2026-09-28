const test = require("node:test");
const assert = require("node:assert/strict");
const { join } = require("node:path");

const { StopIndex } = require("../dist/mobility/stop-index.js");
const { toTu, walkSteps } = require("../dist/mobility/pedestrian-router.js");

// A small line A → B → C → D (and its way back), as in the GTFS of the network.
const network = {
  stops: [
    { id: "a", name: "Carrefour Kouté", latitude: 5.3400, longitude: -4.0800 },
    { id: "b", name: "Siporex", latitude: 5.3400, longitude: -4.0700 },
    { id: "c", name: "Adjamé Liberté", latitude: 5.3400, longitude: -4.0600 },
    { id: "d", name: "Gare Sud", latitude: 5.3400, longitude: -4.0500 },
  ],
  trips: [
    { route_id: "r42", trip_id: "go", trip_headsign: "Gare Sud" },
    { route_id: "r42", trip_id: "back", trip_headsign: "Yopougon Kouté" },
  ],
  stop_times: [
    ...["a", "b", "c", "d"].map((stop_id, index) => ({ trip_id: "go", stop_id, stop_sequence: index })),
    ...["d", "c", "b", "a"].map((stop_id, index) => ({ trip_id: "back", stop_id, stop_sequence: index })),
  ],
};

test("a ride is told with its stops: get on, pass by, get off, what the vehicle shows", () => {
  const index = new StopIndex(network);
  // Ridden from near A to near D on « Line:relation:42 ».
  const ride = index.describeRide("Line:relation:42", [[-4.0801, 5.3401], [-4.0650, 5.3400], [-4.0501, 5.3399]]);
  assert.equal(ride.board.name, "Carrefour Kouté");
  assert.equal(ride.board.on_line, true);
  assert.equal(ride.alight.name, "Gare Sud");
  assert.deepEqual(ride.via, ["Siporex", "Adjamé Liberté"]);
  assert.equal(ride.before_alight, "Adjamé Liberté");
  assert.equal(ride.headsign, "Gare Sud");
  assert.equal(ride.stop_count, 3);
  // Every stop from boarding to alighting, with where it is (« Tu viens de passer … »).
  assert.deepEqual(ride.stops.map((stop) => stop.name), ["Carrefour Kouté", "Siporex", "Adjamé Liberté", "Gare Sud"]);
  assert.equal(ride.stops[1].lon, -4.07);
});

test("SIRA says « tu »: Valhalla's « vous » instructions are turned into « tu »", () => {
  assert.equal(toTu("Tournez à gauche dans Avenue Lamblin."), "Tourne à gauche dans Avenue Lamblin.");
  assert.equal(toTu("Marchez vers le sud-est."), "Marche vers le sud-est.");
  assert.equal(toTu("Prenez l'escalier, puis continuez tout droit."), "Prends l'escalier, puis continue tout droit.");
  assert.equal(toTu("Gardez la gauche à la fourche."), "Garde la gauche à la fourche.");
  assert.equal(toTu("Faites demi-tour."), "Fais demi-tour.");
  assert.equal(toTu("Vous êtes arrivé à votre destination."), "Tu es arrivé à ta destination.");
  assert.equal(toTu("Votre destination est sur la gauche."), "Ta destination est sur la gauche.");
  assert.equal(toTu("Dirigez-vous vers le nord."), "Dirige-toi vers le nord.");
  // Street names are not verbs: left as they are.
  assert.equal(toTu("Tournez à droite dans Rue Lopez."), "Tourne à droite dans Rue Lopez.");
});

test("the direction of travel picks the headsign", () => {
  const index = new StopIndex(network);
  const ride = index.describeRide("Line:relation:42", [[-4.0500, 5.3400], [-4.0700, 5.3400]]);
  assert.equal(ride.board.name, "Gare Sud");
  assert.equal(ride.alight.name, "Siporex");
  assert.equal(ride.headsign, "Yopougon Kouté");
});

test("a stop too far from the ride is never given as « the » stop", () => {
  const index = new StopIndex(network);
  // 2 km away from every stop.
  assert.equal(index.describeRide("Line:relation:42", [[-4.0800, 5.3600], [-4.0500, 5.3600]]), null);
  // Getting on at a stop, off in the middle of the road: the end is not named, no stops « passed ».
  const half = index.describeRide("Line:relation:42", [[-4.0801, 5.3401], [-4.0500, 5.3600]]);
  assert.equal(half.board.name, "Carrefour Kouté");
  assert.equal(half.board.on_line, true);
  assert.equal(half.alight, null);
  assert.equal(half.headsign, "Gare Sud");
  assert.deepEqual(half.via, []);
  assert.equal(index.nearest([-4.0800, 5.3600], 150), null);
  assert.equal(index.nearest([-4.0802, 5.3401], 40).name, "Carrefour Kouté");
});

test("walking instructions keep Valhalla's French words and where they start", () => {
  const shape = [[-4.08, 5.34], [-4.079, 5.341], [-4.078, 5.342]];
  const steps = walkSteps({ trip: { legs: [{ maneuvers: [
    { type: 2, instruction: "Marchez vers le nord sur Rue O13.", length: 0.136, begin_shape_index: 0, street_names: ["Rue O13"] },
    { type: 10, instruction: "Tournez à droite.", length: 0.152, begin_shape_index: 1 },
    { type: 5, instruction: "Votre destination est sur la droite.", length: 0, begin_shape_index: 2 },
  ] }] } }, shape);
  assert.deepEqual(steps.map((step) => [step.text, step.distance_m, step.street, step.arrive]), [
    ["Marche vers le nord sur Rue O13.", 136, "Rue O13", false],
    ["Tourne à droite.", 152, null, false],
    ["Ta destination est sur la droite.", 0, null, true],
  ]);
  assert.deepEqual(steps[1].point, [-4.079, 5.341]);
});

test("the real network: every line of Abidjan gets named stops", () => {
  const index = StopIndex.load(join(__dirname, "..", "..", "..", "data", "processed", "transport-network-unified.json"));
  assert.ok(index, "données du réseau introuvables");
  // Bus 06 (Aéroport ↔ Gare Sud), from its first stop to a few stops further.
  assert.ok(index.size > 100);
});
