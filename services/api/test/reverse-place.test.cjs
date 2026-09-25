const test = require("node:test");
const assert = require("node:assert/strict");

const { pickLandmark } = require("../dist/mobility/mobility.service.js");

const feature = (properties) => ({ properties: { city: "Abidjan", ...properties } });

test("un carrefour ou une gare nommés passent avant tout le reste", () => {
  const place = pickLandmark([
    feature({ name: "NSIA Banque", osm_value: "bank", district: "Le Plateau" }),
    feature({ name: "Carrefour de la Vie", osm_value: "crossing", district: "Cocody" }),
  ], 5.35, -3.98);
  assert.deepEqual([place.title, place.subtitle, place.kind], ["Carrefour de la Vie", "Cocody, Abidjan", "landmark"]);
});

test("un arrêt de bus devient « Arrêt … », un numéro de maison est ignoré", () => {
  const place = pickLandmark([
    feature({ name: "5", osm_value: "yes" }),
    feature({ name: "Commissariat du 1er Arrondissement", osm_value: "bus_stop", district: "Le Plateau" }),
  ], 5.326, -4.0198);
  assert.equal(place.title, "Arrêt Commissariat du 1er Arrondissement");
});

test("sans repère, on prend la rue puis le quartier", () => {
  assert.equal(pickLandmark([feature({ osm_value: "house", street: "Rue Kablan Désiré Brou", district: "Cocody" })], 5.358, -3.972).title, "Rue Kablan Désiré Brou");
  assert.equal(pickLandmark([feature({ osm_value: "house", district: "Adjamé" })], 5.36, -4.025).title, "Adjamé, Abidjan");
  assert.equal(pickLandmark([], 5.36, -4.025).title, "Ma position");
});
