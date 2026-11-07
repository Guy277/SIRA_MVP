import assert from "node:assert/strict";
import test from "node:test";
import { assemblerAnneaux, bboxAnneaux, communeDe, fusionner, normaliserNom, similarite, specialiteDepuisNom } from "../scripts/lieux/fusion.mjs";
import { lireCsv } from "../scripts/import-lieux.mjs";

// Lieux FICTIFS, uniquement pour ces tests : jamais écrits dans data/lieux/lieux.json.
const pharmacie = (source, id, nom, lat, lon) => ({ source, id_externe: id, nom, categorie: "pharmacie", lat, lon });

test("normalise les noms : minuscules, sans accents ni ponctuation", () => {
  assert.equal(normaliserNom("  Pharmacie Sainte-Thérèse d'Abobo !"), "pharmacie sainte therese d abobo");
  assert.equal(normaliserNom(null), "");
});

test("similarité de trigrammes : 1 pour le même nom, faible pour deux noms différents", () => {
  assert.equal(similarite("Pharmacie du Centre", "PHARMACIE DU CENTRE"), 1);
  assert.ok(similarite("Pharmacie du Centre", "Pharmacie Centre") >= 0.6);
  assert.ok(similarite("Pharmacie du Centre", "Pharmacie Les Lauriers") < 0.6);
  assert.equal(similarite("", "Pharmacie"), 0);
});

test("fusionne deux sources du même lieu et garde le nom le plus complet", () => {
  const { lieux, fusions } = fusionner([
    { ...pharmacie("overture", "o1", "Pharmacie Centre FICTIF", 5.44101, -4.00901), confiance: 0.8, telephones: ["0700000000"] },
    { ...pharmacie("osm", "node/1", "Pharmacie du Centre FICTIF", 5.441, -4.009), confiance: null },
  ]);
  assert.equal(fusions, 1);
  assert.equal(lieux.length, 1);
  const [lieu] = lieux;
  assert.equal(lieu.nom, "Pharmacie du Centre FICTIF");
  assert.deepEqual(lieu.sources, ["osm", "overture"]); // OSM d'abord : il donne la position et l'identifiant
  assert.equal(lieu.nb_sources, 2);
  assert.deepEqual(lieu.ids_externes, { osm: ["node/1"], overture: ["o1"] });
  assert.equal(lieu.confiance, 0.8);
  assert.deepEqual(lieu.telephones, ["0700000000"]);
  assert.equal(lieu.lat, 5.441);
});

test("ne fusionne ni au-delà de 60 m, ni deux catégories, ni deux noms différents", () => {
  const { lieux, fusions } = fusionner([
    pharmacie("osm", "node/1", "Pharmacie du Centre FICTIF", 5.441, -4.009),
    pharmacie("osm", "node/2", "Pharmacie du Centre FICTIF", 5.4417, -4.009), // ~78 m au nord
    { ...pharmacie("osm", "node/3", "Pharmacie du Centre FICTIF", 5.441, -4.009), categorie: "sante" },
    pharmacie("osm", "node/4", "Pharmacie Les Lauriers FICTIF", 5.4411, -4.009),
  ]);
  assert.equal(fusions, 0);
  assert.equal(lieux.length, 4);
});

test("identifiants stables : le même import redonne les mêmes lieux, quel que soit l'ordre", () => {
  const entree = [
    pharmacie("overture", "o1", "Pharmacie A FICTIF", 5.441, -4.009),
    pharmacie("osm", "node/1", "Pharmacie A FICTIF", 5.441, -4.009),
    pharmacie("osm", "node/2", "Pharmacie B FICTIF", 5.45, -4.01),
  ];
  assert.deepEqual(fusionner(entree), fusionner([...entree].reverse()));
});

test("un lieu sans coordonnées n'est jamais fusionné", () => {
  const { lieux } = fusionner([
    pharmacie("equipe", "csv#2", "Pharmacie A FICTIF", null, null),
    pharmacie("osm", "node/1", "Pharmacie A FICTIF", 5.441, -4.009),
  ]);
  assert.equal(lieux.length, 2);
});

test("un lieu retiré par l'équipe reste retiré ; un lieu à valider confirmé ailleurs devient valide", () => {
  const retire = fusionner([
    { ...pharmacie("equipe", "csv#2", "Pharmacie A FICTIF", 5.441, -4.009), statut: "retire" },
    pharmacie("osm", "node/1", "Pharmacie A FICTIF", 5.441, -4.009),
  ]).lieux[0];
  assert.equal(retire.statut, "retire");
  const confirme = fusionner([
    { ...pharmacie("equipe", "csv#2", "Pharmacie A FICTIF", 5.441, -4.009), statut: "en_attente" },
    pharmacie("osm", "node/1", "Pharmacie A FICTIF", 5.441, -4.009),
  ]).lieux[0];
  assert.equal(confirme.statut, "valide");
});

test("spécialité d'après le nom seul, mot entier", () => {
  const specialites = { garba: ["garba", "garbadrome"], banane_braisee: ["banane braisee"], maquis: ["maquis"] };
  assert.equal(specialiteDepuisNom("GARBADROME", specialites), "garba");
  assert.equal(specialiteDepuisNom("Banane braisée de la gare", specialites), "banane_braisee");
  assert.equal(specialiteDepuisNom("Poulet braisé", specialites), null);
  assert.equal(specialiteDepuisNom("Maquisard", specialites), null);
});

test("commune : anneaux assemblés depuis les chemins OSM, point dedans ou dehors", () => {
  // Carré fictif découpé en deux chemins, dont un à l'envers.
  const anneaux = assemblerAnneaux([[[0, 0], [1, 0], [1, 1]], [[0, 0], [0, 1], [1, 1]]]);
  assert.equal(anneaux.length, 1);
  const communes = [{ nom: "Commune FICTIVE", anneaux, bbox: bboxAnneaux(anneaux) }];
  assert.equal(communeDe({ lat: 0.5, lon: 0.5 }, communes), "Commune FICTIVE");
  assert.equal(communeDe({ lat: 2, lon: 0.5 }, communes), null);
});

test("lit le CSV de l'équipe : guillemets, virgules et points-virgules", () => {
  const lignes = lireCsv('﻿nom,categorie,repere\r\n"Maquis ""Le Bon"" FICTIF",saveurs,"Carrefour, Abobo"\r\n\r\n');
  assert.deepEqual(lignes, [{ nom: 'Maquis "Le Bon" FICTIF', categorie: "saveurs", repere: "Carrefour, Abobo" }]);
  assert.deepEqual(lireCsv("nom;categorie\nGarba FICTIF;saveurs"), [{ nom: "Garba FICTIF", categorie: "saveurs" }]);
});
