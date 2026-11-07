const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { cleNomPharmacie, similarite } = require("../dist/lieux/texte.js");
const { semaineDuJour, UnppciGithubSource } = require("../dist/lieux/garde/unppci-github.source.js");
const { MaxItSource } = require("../dist/lieux/garde/maxit.source.js");
const { PharmaciesDeGardeService, rapprocher, sourcePharmaciesDeGarde } = require("../dist/lieux/garde/pharmacies-de-garde.service.js");

// Données FICTIVES, au format du tour de garde (semaines du samedi au vendredi).
const liste = {
  weeks: [{ start: "2026-11-07", end: "2026-11-13" }, { start: "2026-11-14", end: "2026-11-20" }],
  pharmacies: [
    { name: "Pharmacie Du Phare (Nouvelle)", commune: "Port-Bouët", zone: "Port-Bouët", phones: [" 27 21 00 00 00 "], address: "Rue FICTIVE", weekStart: "2026-11-07" },
    { name: "Pharmacie Ste Agnes", commune: "Cocody", zone: "Riviera", phones: [], address: "", weekStart: "2026-11-07" },
    { name: "Pharmacie De La Semaine Suivante", commune: "Abobo", phones: [], weekStart: "2026-11-14" },
  ],
};
const lieu = (id, nom, commune) => ({ id, nom, commune, categorie: "pharmacie", statut: "valide", lat: 5.3, lon: -4.0 });
const lieuxFictifs = [
  lieu("l_phare", "Pharmacie du Phare", "Port-Bouët"),
  lieu("l_agathe", "Pharmacie Sainte-Agathe", "Cocody"),
  lieu("l_joseph1", "Pharmacie Saint Joseph", "Cocody"),
  lieu("l_joseph2", "Pharmacie St Joseph", "Cocody"),
];
const depot = (lieux) => ({ tous: () => lieux, parId: () => null, attribution: () => "" });

test("la partie distinctive d'un nom de pharmacie ignore « Pharmacie », les petits mots et les abréviations", () => {
  assert.equal(cleNomPharmacie("Pharmacie Ste Agnès (Nouvelle)"), "sainte agnes");
  assert.equal(cleNomPharmacie("PHARMACIE DE LA CITE VERTE SARL"), "cite verte");
  // Sans ce nettoyage, le mot commun suffit à rapprocher deux pharmacies différentes.
  assert.ok(similarite("Pharmacie Du Triomphe", "Pharmacie du marché") >= 0.5);
  assert.ok(similarite(cleNomPharmacie("Pharmacie Du Triomphe"), cleNomPharmacie("Pharmacie du marché")) < 0.6);
});

test("garde la semaine qui contient le jour, sinon rien", () => {
  const semaine = semaineDuJour(liste, "2026-11-10");
  assert.equal(semaine.length, 2);
  assert.deepEqual(semaine[0], {
    nom: "Pharmacie Du Phare (Nouvelle)", commune: "Port-Bouët", zone: "Port-Bouët", adresse: "Rue FICTIVE",
    telephones: ["27 21 00 00 00"], debutSemaine: "2026-11-07", finSemaine: "2026-11-13",
  });
  assert.equal(semaine[1].adresse, null);
  assert.equal(semaineDuJour(liste, "2026-11-14")[0].nom, "Pharmacie De La Semaine Suivante");
  assert.deepEqual(semaineDuJour(liste, "2026-12-25"), []);
});

test("lit la liste en ligne, et la copie de secours si le réseau échoue ou ne couvre pas le jour", async () => {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), "sira-garde-"));
  const secours = path.join(dossier, "secours.json");
  fs.writeFileSync(secours, JSON.stringify(liste));
  const jour = new Date("2026-11-10T12:00:00Z");

  const enLigne = new UnppciGithubSource("http://fictif", secours, async () => liste);
  assert.equal((await enLigne.getSemaineCourante(jour)).origine, "reseau");

  const enPanne = new UnppciGithubSource("http://fictif", secours, async () => { throw new Error("hors ligne"); });
  const deSecours = await enPanne.getSemaineCourante(jour);
  assert.equal(deSecours.origine, "secours");
  assert.equal(deSecours.pharmacies.length, 2);

  const perimee = new UnppciGithubSource("http://fictif", secours, async () => ({ weeks: [{ start: "2026-10-03", end: "2026-10-09" }], pharmacies: [] }));
  assert.equal((await perimee.getSemaineCourante(jour)).origine, "secours");

  const sansSecours = new UnppciGithubSource("http://fictif", path.join(dossier, "absent.json"), async () => { throw new Error("hors ligne"); });
  assert.deepEqual(await sansSecours.getSemaineCourante(jour), { pharmacies: [], origine: "secours" });
});

test("rapproche par commune et par nom ; pas de badge si deux lieux sont possibles", () => {
  const [phare, agnes] = semaineDuJour(liste, "2026-11-10");
  assert.deepEqual(rapprocher(phare, lieuxFictifs), { lieuId: "l_phare", rapprochement: "rapprochee" });
  // Erreur relevée sur la vraie liste : « Sainte Agnès » ne doit pas devenir « Sainte Agathe ».
  assert.deepEqual(rapprocher(agnes, lieuxFictifs), { lieuId: null, rapprochement: "non_rapprochee" });
  assert.deepEqual(rapprocher({ ...phare, commune: "Abobo" }, lieuxFictifs), { lieuId: null, rapprochement: "non_rapprochee" });
  assert.deepEqual(rapprocher({ ...phare, nom: "Pharmacie Saint-Joseph", commune: "Cocody" }, lieuxFictifs), { lieuId: null, rapprochement: "ambigue" });
});

test("garde la semaine 6 heures, la relit le lendemain, donne les lieux de garde", async () => {
  let appels = 0;
  const source = { libelle: "source FICTIVE", getSemaineCourante: async (maintenant) => {
    appels += 1;
    return { pharmacies: semaineDuJour(liste, maintenant.toISOString().slice(0, 10)), origine: "reseau" };
  } };
  const service = new PharmaciesDeGardeService(source, depot(lieuxFictifs));
  const semaine = await service.semaineCourante(new Date("2026-11-10T08:00:00Z"));
  assert.equal(semaine.source, "source FICTIVE");
  assert.deepEqual([semaine.debut, semaine.fin], ["2026-11-07", "2026-11-13"]);
  assert.deepEqual([...(await service.lieuxDeGarde(new Date("2026-11-10T13:00:00Z")))], ["l_phare"]);
  assert.equal(appels, 1);
  await service.semaineCourante(new Date("2026-11-10T14:30:00Z")); // plus de 6 heures
  assert.equal(appels, 2);
  await service.semaineCourante(new Date("2026-11-11T00:30:00Z")); // nouveau jour
  assert.equal(appels, 3);
});

test("source Max it pas encore branchée : liste vide, l'API continue", async () => {
  assert.ok(sourcePharmaciesDeGarde("maxit") instanceof MaxItSource);
  assert.ok(sourcePharmaciesDeGarde("unppci") instanceof UnppciGithubSource);
  assert.throws(() => sourcePharmaciesDeGarde("autre"), /PHARMACIE_GARDE_SOURCE inconnue/);
  const semaine = await new PharmaciesDeGardeService(new MaxItSource(), depot(lieuxFictifs)).semaineCourante(new Date("2026-11-10T08:00:00Z"));
  assert.deepEqual(semaine, { source: "Max it", origine: "indisponible", debut: null, fin: null, pharmacies: [] });
});
