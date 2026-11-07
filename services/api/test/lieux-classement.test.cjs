const test = require("node:test");
const assert = require("node:assert/strict");

const { ouvertureMaintenant } = require("../dist/lieux/horaires.js");
const { resumer, TrajetsLieux } = require("../dist/lieux/trajets-lieux.js");
const { classer, specialitesDuMoment, ClassementService } = require("../dist/lieux/classement.service.js");

// Mardi 10 novembre 2026 (Abidjan = UTC).
const mardi = (heure) => new Date(`2026-11-10T${heure}:00Z`);
const osm = (texte) => ({ osm: texte });

test("ouvert maintenant d'après opening_hours ; toute forme inconnue reste « inconnu »", () => {
  assert.equal(ouvertureMaintenant(osm("24/7"), mardi("03:00")), "ouvert");
  assert.equal(ouvertureMaintenant(osm("Mo-Fr 08:00-12:00, 14:00-17:00"), mardi("13:00")), "ferme");
  assert.equal(ouvertureMaintenant(osm("Mo-Fr 08:00-12:00, 14:00-17:00"), mardi("15:00")), "ouvert");
  assert.equal(ouvertureMaintenant(osm("Mo-Fr 08:00-12:00, 14:00-17:00"), new Date("2026-11-14T10:00:00Z")), "ferme"); // samedi
  assert.equal(ouvertureMaintenant(osm("Mo-Su 16:00-01:00"), mardi("00:30")), "ouvert"); // plage de lundi soir
  assert.equal(ouvertureMaintenant(osm("Mo-Su 16:00-01:00"), mardi("01:30")), "ferme");
  assert.equal(ouvertureMaintenant(osm("Su-Fr 08:00-18:00"), new Date("2026-11-14T10:00:00Z")), "ferme"); // samedi exclu
  assert.equal(ouvertureMaintenant(osm("Su-Fr 08:00-18:00"), new Date("2026-11-15T10:00:00Z")), "ouvert"); // dimanche
  assert.equal(ouvertureMaintenant(osm("Mo-Fr 08:00-17:00; We off"), new Date("2026-11-11T10:00:00Z")), "ferme");
  assert.equal(ouvertureMaintenant(osm("Mo-Fr 06:30-22:00;Sa,Su,PH 06:30-23:00"), new Date("2026-11-15T22:30:00Z")), "ouvert");
  assert.equal(ouvertureMaintenant(osm("Mo-Fr 08:00-17:00; PH off"), mardi("10:00")), "ouvert");
  assert.equal(ouvertureMaintenant(osm("Mo-Su"), mardi("10:00")), "ouvert");
  assert.equal(ouvertureMaintenant(osm("0/7"), mardi("10:00")), "inconnu");
  assert.equal(ouvertureMaintenant(osm("Lundi au Samedi 12h à 03h"), mardi("13:00")), "inconnu");
  assert.equal(ouvertureMaintenant(null, mardi("10:00")), "inconnu");
});

test("résumé du trajet recommandé par le moteur : durée, prix, modes sans attente ni doublon", () => {
  const reponse = { recommended_id: "b", journeys: [
    { id: "a", duration: 4, price: 0, legs: [{ mode: "walk" }] },
    { id: "b", duration: 8.6, price: 150, legs: [{ mode: "walk" }, { mode: "wait" }, { mode: "woro" }, { mode: "walk" }] },
  ] };
  assert.deepEqual(resumer(reponse), { dureeMin: 9, prixF: 150, modes: ["walk", "woro"] });
  assert.deepEqual(resumer({ journeys: [{ id: "x", duration: 12, price: null, legs: [{ mode: "taxi" }] }] }), { dureeMin: 12, prixF: null, modes: ["taxi"] });
  assert.equal(resumer({ journeys: [] }), null);
});

const LIEUX = ["a", "b", "c"].map((id, i) => ({ id, nom: `Lieu ${id} FICTIF`, lat: 5.44 + i / 1000, lon: -4.009 }));
const ORIGINE = { lat: 5.441, lon: -4.009 };

test("trajets calculés un par un, gardés en cache, échec et délai signalés", async () => {
  let enCours = 0;
  let maxSimultanes = 0;
  const demandes = [];
  const calcul = { buildJourneys: async (requete) => {
    demandes.push(requete.destination.name);
    enCours += 1;
    maxSimultanes = Math.max(maxSimultanes, enCours);
    await new Promise((r) => setTimeout(r, 20));
    enCours -= 1;
    if (requete.destination.name.includes("c")) throw new Error("aucun trajet");
    return { recommended_id: "j", journeys: [{ id: "j", duration: 7, price: 100, legs: [{ mode: "walk" }, { mode: "gbaka" }] }] };
  } };
  const trajets = new TrajetsLieux(calcul);
  const etats = await trajets.resumes(ORIGINE, LIEUX, 5_000);
  assert.equal(maxSimultanes, 1);
  assert.deepEqual(etats, [
    { etat: "calcule", trajet: { dureeMin: 7, prixF: 100, modes: ["walk", "gbaka"] } },
    { etat: "calcule", trajet: { dureeMin: 7, prixF: 100, modes: ["walk", "gbaka"] } },
    { etat: "echec" },
  ]);
  await trajets.resumes({ lat: 5.4412, lon: -4.0091 }, LIEUX, 5_000); // même zone d'environ 100 m : cache
  assert.equal(demandes.length, 3);
});

test("au-delà du délai : « en cours », puis le résultat au prochain appel", async () => {
  const calcul = { buildJourneys: async () => {
    await new Promise((r) => setTimeout(r, 60));
    return { journeys: [{ id: "j", duration: 5, price: 0, legs: [{ mode: "walk" }] }] };
  } };
  const trajets = new TrajetsLieux(calcul);
  assert.deepEqual(await trajets.resumes(ORIGINE, LIEUX.slice(0, 2), 10), [{ etat: "en_cours" }, { etat: "en_cours" }]);
  await new Promise((r) => setTimeout(r, 200));
  assert.deepEqual((await trajets.resumes(ORIGINE, LIEUX.slice(0, 2), 10)).map((e) => e.etat), ["calcule", "calcule"]);
});

const classe = (id, champs) => ({ id, nom: id, distanceM: 100, nbSources: 1, derniereConfirmation: null, ouverture: "inconnu", duMoment: false, etat: "calcule", trajet: { dureeMin: 10, prixF: 0, modes: ["walk"] }, ...champs });

test("ordre : ouvert, moment, durée, sources, confirmation, distance — rien d'autre", () => {
  const ordre = (lieux) => classer(lieux).map((l) => l.id);
  assert.deepEqual(ordre([classe("ferme", { ouverture: "ferme" }), classe("inconnu"), classe("ouvert", { ouverture: "ouvert" })]), ["ouvert", "inconnu", "ferme"]);
  assert.deepEqual(ordre([classe("rapide", { trajet: { dureeMin: 5, prixF: 0, modes: [] } }), classe("garba", { duMoment: true })]), ["garba", "rapide"]);
  assert.deepEqual(ordre([classe("sans", { etat: "echec", trajet: undefined }), classe("lent", { trajet: { dureeMin: 30, prixF: 0, modes: [] } })]), ["lent", "sans"]);
  assert.deepEqual(ordre([classe("une"), classe("deux", { nbSources: 2 })]), ["deux", "une"]);
  assert.deepEqual(ordre([classe("ancienne", { derniereConfirmation: "2026-11-01T00:00:00Z" }), classe("recente", { derniereConfirmation: "2026-11-09T00:00:00Z" })]), ["recente", "ancienne"]);
  assert.deepEqual(ordre([classe("loin", { distanceM: 900 }), classe("pres", { distanceM: 100 })]), ["pres", "loin"]);
});

test("spécialités du moment selon l'heure d'Abidjan", () => {
  const moments = [{ nom: "matin", de: "05:00", a: "10:59", specialites: ["gbofloto"] }, { nom: "soir", de: "16:00", a: "23:59", specialites: ["alloco"] }];
  assert.deepEqual([...specialitesDuMoment(moments, mardi("07:15"))], ["gbofloto"]);
  assert.deepEqual([...specialitesDuMoment(moments, mardi("19:00"))], ["alloco"]);
  assert.deepEqual([...specialitesDuMoment(moments, mardi("13:00"))], []);
});

test("classement : 5 plus proches à vol d'oiseau, trajets, ordre, et la carte garde ses points à part", async () => {
  const proches = Array.from({ length: 7 }, (_, i) => ({ id: `l${i}`, nom: `Lieu ${i} FICTIF`, categorie: "saveurs", specialite: i === 4 ? "alloco" : null, lat: 5.44, lon: -4.009 + i / 1000, distanceM: (i + 1) * 100, commune: "Abobo", repere: null, nbSources: 1, deGarde: false, derniereConfirmation: null }));
  const lieuxService = { proches: async () => ({ rayonM: 1500, elargi: false, total: 7, lieux: proches, attribution: "© FICTIF" }) };
  const depot = { parId: (id) => ({ horaires: id === "l3" ? osm("24/7") : null }) };
  const trajets = { resumes: async (_o, lieux) => lieux.map((l, i) => ({ etat: "calcule", trajet: { dureeMin: 20 - i, prixF: 100, modes: ["walk"] } })) };
  const moments = [{ nom: "soir", de: "16:00", a: "23:59", specialites: ["alloco"] }];
  const service = new ClassementService(lieuxService, depot, trajets, moments);
  const reponse = await service.classement({ lat: 5.44, lon: -4.009, categorie: "saveurs" }, mardi("19:00"));
  // l3 ouvert d'abord, puis l4 (alloco le soir), puis les autres du trajet le plus court au plus long.
  assert.deepEqual(reponse.lieux.map((l) => l.id), ["l3", "l4", "l2", "l1", "l0"]);
  assert.equal(reponse.complet, true);
  assert.equal(reponse.total, 7);
  assert.equal(reponse.attribution, "© FICTIF");
});
