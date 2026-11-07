const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { lireRecherche } = require("../dist/lieux/lieux.controller.js");
const { LieuxService, CATEGORIES_CARTE, MAX_POINTS } = require("../dist/lieux/lieux.service.js");
const { LieuxConfirmations } = require("../dist/lieux/lieux-confirmations.js");

// Lieux FICTIFS autour de la position de démo (Abobo) ; 0,001° de latitude ≈ 111 m.
const DEMO = { lat: 5.441, lon: -4.009 };
const lieu = (id, nom, categorie, nordM, champs = {}) => ({
  id, nom, nom_normalise: nom.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
  categorie, specialite: null, lat: DEMO.lat + nordM / 111_195, lon: DEMO.lon, commune: "Abobo", repere: null, telephones: [],
  horaires: null, prix_indicatif: null, prix_maj_le: null, photo_url: null, sources: ["osm"], nb_sources: 1, ids_externes: {},
  confiance: null, statut: "valide", consentement_vendeur: false, consentement_photo: false, derniere_confirmation: null, ...champs,
});
const LIEUX = [
  lieu("l_garba", "Garbadrome FICTIF", "saveurs", 300, { specialite: "garba" }),
  lieu("l_cafe", "Café d'Abobo FICTIF", "saveurs", 500),
  lieu("l_maquis", "Maquis FICTIF", "saveurs", 2000, { specialite: "maquis" }),
  lieu("l_attente", "Saveur en attente FICTIF", "saveurs", 100, { statut: "en_attente" }),
  lieu("l_sansgps", "Saveur sans GPS FICTIF", "saveurs", 0, { lat: null, lon: null, statut: "en_attente" }),
  lieu("l_ph_garde", "Pharmacie de garde FICTIVE", "pharmacie", 800, { telephones: ["27 00 00 00 01"] }),
  lieu("l_ph_autre", "Pharmacie FICTIVE", "pharmacie", 200, { photo_url: "https://exemple.invalid/photo.jpg" }),
  lieu("l_ph_retiree", "Pharmacie retirée FICTIVE", "pharmacie", 250, { statut: "retire" }),
  lieu("l_ecole", "École FICTIVE", "ecole", 1200),
];
const semaine = {
  source: "source FICTIVE", origine: "reseau", debut: "2026-11-07", fin: "2026-11-13",
  pharmacies: [
    { nom: "Pharmacie de garde FICTIVE", commune: "Abobo", adresse: "Carrefour FICTIF", telephones: ["07 00 00 00 02"], debutSemaine: "2026-11-07", finSemaine: "2026-11-13", lieuId: "l_ph_garde", rapprochement: "rapprochee" },
    { nom: "Pharmacie sans position FICTIVE", commune: "Abobo", adresse: "Rue FICTIVE", telephones: ["07 00 00 00 03"], debutSemaine: "2026-11-07", finSemaine: "2026-11-13", lieuId: null, rapprochement: "non_rapprochee" },
    { nom: "Pharmacie de Cocody FICTIVE", commune: "Cocody", adresse: null, telephones: [], debutSemaine: "2026-11-07", finSemaine: "2026-11-13", lieuId: null, rapprochement: "non_rapprochee" },
  ],
};
const depot = { tous: () => LIEUX, parId: (id) => LIEUX.find((l) => l.id === id) ?? null, attribution: () => "© sources FICTIVES" };
const garde = { lieuxDeGarde: async () => new Set(["l_ph_garde"]), semaineCourante: async () => semaine };
const service = (confirmations = new LieuxConfirmations(null)) => new LieuxService(depot, garde, confirmations);
const recherche = (champs) => ({ ...DEMO, categorie: "autour", ...champs });

test("paramètres : position dans le Grand Abidjan, catégorie et sous-filtre connus, rayon borné", () => {
  assert.deepEqual(lireRecherche({ lat: "5.441", lng: "-4.009" }), { lat: 5.441, lon: -4.009, categorie: "autour", specialite: null, q: null, rayonM: null, garde: false });
  assert.equal(lireRecherche({ lat: "5.441", lon: "-4.009", categorie: "pharmacie", garde: "true" }).garde, true);
  assert.throws(() => lireRecherche({ lng: "-4.009" }), /Grand Abidjan/);
  assert.throws(() => lireRecherche({ lat: "48.85", lng: "2.35" }), /Grand Abidjan/);
  assert.throws(() => lireRecherche({ lat: "5.441", lng: "-4.009", categorie: "bars" }), /Catégorie inconnue/);
  assert.throws(() => lireRecherche({ lat: "5.441", lng: "-4.009", categorie: "ecole", specialite: "garba" }), /Spécialité/);
  assert.throws(() => lireRecherche({ lat: "5.441", lng: "-4.009", rayon: "50" }), /rayon/);
  assert.throws(() => lireRecherche({ lat: "5.441", lng: "-4.009", categorie: "ecole", garde: "true" }), /pharmacie/);
  assert.throws(() => lireRecherche({ lat: "5.441", lng: "-4.009", q: "x".repeat(61) }), /trop longue/);
});

test("catégories : dans l'ordre de la carte, avec sous-filtres et attribution", () => {
  const { categories, attribution } = service().categories();
  assert.deepEqual(categories.map((c) => c.id), ["autour", "saveurs", "pharmacie", "point_orange", "marche", "ecole", "mosquee", "eglise", "sante"]);
  assert.equal(categories[2].libelle, "Pharmacies de garde");
  assert.deepEqual(categories[2].sousFiltres.map((f) => f.id), ["garde", "toutes"]);
  assert.equal(CATEGORIES_CARTE[1].sousFiltres.at(-1).id, "autre");
  assert.equal(attribution, "© sources FICTIVES");
});

test("lieux proches : valides et localisés seulement, du plus proche au plus loin, avec la distance", async () => {
  const reponse = await service().proches(recherche({ categorie: "saveurs" }));
  // 2 résultats à 1 500 m (moins de 3) : la zone est élargie à 3 000 m, le maquis à 2 km entre.
  assert.deepEqual(reponse.lieux.map((l) => l.id), ["l_garba", "l_cafe", "l_maquis"]);
  assert.equal(reponse.lieux[0].distanceM, 300);
  assert.equal(reponse.rayonM, 3000);
  assert.equal(reponse.elargi, true);
  assert.equal(reponse.total, 3);
  const autour = await service().proches(recherche({}));
  assert.deepEqual(autour.lieux.map((l) => l.id), ["l_ph_autre", "l_garba", "l_cafe", "l_ph_garde", "l_ecole"]);
  assert.equal(autour.elargi, false);
});

test("un rayon choisi par l'appli est respecté, sans élargissement", async () => {
  const reponse = await service().proches(recherche({ categorie: "saveurs", rayonM: 400 }));
  assert.deepEqual([reponse.rayonM, reponse.elargi, reponse.lieux.map((l) => l.id)], [400, false, ["l_garba"]]);
});

test("recherche par nom sans tenir compte des accents ni de la casse ; sous-filtre « autre »", async () => {
  assert.deepEqual((await service().proches(recherche({ q: "CAFE abobo" }))).lieux.map((l) => l.id), ["l_cafe"]);
  assert.deepEqual((await service().proches(recherche({ categorie: "saveurs", specialite: "garba" }))).lieux.map((l) => l.id), ["l_garba"]);
  assert.deepEqual((await service().proches(recherche({ categorie: "saveurs", specialite: "autre" }))).lieux.map((l) => l.id), ["l_cafe"]);
});

test("pharmacies de garde : badge, liste sans position de la commune du voyageur, semaine", async () => {
  const toutes = await service().proches(recherche({ categorie: "pharmacie" }));
  assert.deepEqual(toutes.lieux.map((l) => [l.id, l.deGarde]), [["l_ph_autre", false], ["l_ph_garde", true]]);
  assert.equal(toutes.sansPosition, undefined);
  const deGarde = await service().proches(recherche({ categorie: "pharmacie", garde: true }));
  assert.deepEqual(deGarde.lieux.map((l) => l.id), ["l_ph_garde"]);
  assert.equal(deGarde.commune, "Abobo");
  assert.deepEqual(deGarde.sansPosition.map((p) => p.nom), ["Pharmacie sans position FICTIVE"]);
  assert.deepEqual(deGarde.garde, { source: "source FICTIVE", origine: "reseau", debut: "2026-11-07", fin: "2026-11-13" });
});

test(`au plus ${MAX_POINTS} points sur la carte`, async () => {
  const beaucoup = Array.from({ length: 40 }, (_, i) => lieu(`l_${String(i).padStart(2, "0")}`, `Lieu ${i} FICTIF`, "marche", i * 10));
  const s = new LieuxService({ ...depot, tous: () => beaucoup }, garde, new LieuxConfirmations(null));
  const reponse = await s.proches(recherche({ categorie: "marche" }));
  assert.equal(reponse.lieux.length, MAX_POINTS);
  assert.equal(reponse.total, 40);
});

test("fiche : sources, garde, photo seulement avec l'accord du vendeur ; lieu retiré introuvable", async () => {
  const fiche = await service().fiche("l_ph_garde");
  assert.equal(fiche.deGarde, true);
  assert.deepEqual(fiche.garde, { source: "source FICTIVE", debut: "2026-11-07", fin: "2026-11-13", adresse: "Carrefour FICTIF" });
  assert.equal(fiche.repere, "Carrefour FICTIF");
  assert.deepEqual(fiche.telephones, ["27 00 00 00 01", "07 00 00 00 02"]);
  assert.equal(fiche.nbSources, 1);
  assert.equal((await service().fiche("l_ph_autre")).photoUrl, null);
  await assert.rejects(service().fiche("l_ph_retiree"), /introuvable/);
  await assert.rejects(service().fiche("l_inconnu"), /introuvable/);
});

test("« Encore là ? » : une réponse par voyageur, par lieu et par jour ; gardée après un redémarrage", async () => {
  const fichier = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sira-lieux-")), "confirmations.json");
  const confirmations = new LieuxConfirmations(fichier);
  const jour1 = new Date("2026-11-10T08:00:00Z");
  confirmations.repondre("l_garba", "voyageur-1", true, jour1);
  confirmations.repondre("l_garba", "voyageur-1", false, jour1); // change d'avis le même jour
  confirmations.repondre("l_garba", "voyageur-2", true, new Date("2026-11-10T09:00:00Z"));
  assert.deepEqual(confirmations.resume("l_garba"), { encoreLaOui: 1, encoreLaNon: 1, derniereConfirmation: "2026-11-10T09:00:00.000Z" });
  confirmations.repondre("l_garba", "voyageur-1", true, new Date("2026-11-11T08:00:00Z")); // le lendemain, compte de nouveau
  const relu = new LieuxConfirmations(fichier);
  assert.deepEqual(relu.resume("l_garba"), { encoreLaOui: 2, encoreLaNon: 1, derniereConfirmation: "2026-11-11T08:00:00.000Z" });
  const proche = (await service(relu).proches(recherche({ categorie: "saveurs", specialite: "garba" }))).lieux[0];
  assert.equal(proche.derniereConfirmation, "2026-11-11T08:00:00.000Z");
  assert.throws(() => service(relu).repondreEncoreLa("l_attente", "voyageur-1", true), /introuvable/);
});
