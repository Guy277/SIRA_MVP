const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { LieuxVoyageurs, JOURS_EFFACEMENT } = require("../dist/lieux/lieux-voyageurs.js");
const { LieuxService, SPECIALITES } = require("../dist/lieux/lieux.service.js");
const { LieuxConfirmations } = require("../dist/lieux/lieux-confirmations.js");
const { classer } = require("../dist/lieux/classement.service.js");
const { lireArrivee } = require("../dist/lieux/lieux.controller.js");

// Lieux et voyageurs FICTIFS, autour d'un carrefour de Treichville ; 0,0001° de latitude ≈ 11 m.
const CARREFOUR = { lat: 5.2955, lon: -4.0062 };
const nord = (metres) => CARREFOUR.lat + metres / 111_195;
const JOUR = (n) => new Date(Date.UTC(2026, 10, 10 + n, 18, 0, 0)); // 10 novembre 2026 + n jours, 18 h
const alloco = (champs = {}) => ({ nom: "Vendeuse d'alloco FICTIVE", categorie: "saveurs", specialite: "alloco", lat: CARREFOUR.lat, lon: CARREFOUR.lon, ...champs });
const officiel = { id: "l_maquis", nom: "Maquis FICTIF", nom_normalise: "maquis fictif", categorie: "saveurs", specialite: "maquis", lat: nord(30), lon: CARREFOUR.lon, commune: "Treichville", repere: null, telephones: [], horaires: null, prix_indicatif: null, prix_maj_le: null, photo_url: null, sources: ["osm"], nb_sources: 1, ids_externes: {}, confiance: null, statut: "valide", consentement_vendeur: false, consentement_photo: false, derniere_confirmation: null };
const nouveau = () => new LieuxVoyageurs(null, SPECIALITES);

test("signaler : nom, catégorie et position vérifiés ; pas de pharmacie ni de lien", () => {
  const v = nouveau();
  assert.throws(() => v.signaler(alloco({ categorie: "pharmacie" }), "a", []), /non signalable/);
  assert.throws(() => v.signaler(alloco({ lat: 48.85, lon: 2.35 }), "a", []), /Grand Abidjan/);
  assert.throws(() => v.signaler(alloco({ nom: "ab" }), "a", []), /3 caractères/);
  assert.throws(() => v.signaler(alloco({ commentaire: "Commandez sur www.exemple.com" }), "a", []), /lien/);
  assert.throws(() => v.signaler(alloco({ etiquettes: ["delicieux"] }), "a", []), /Étiquettes/);
  assert.throws(() => v.signaler(alloco({ categorie: "ecole", specialite: null, etiquettes: ["bien_fait"] }), "a", []), /Étiquettes/); // « bien fait » : nourriture seulement
  assert.throws(() => v.signaler(alloco({ prixF: 5 }), "a", []), /prix/);
  const cree = v.signaler(alloco({ etiquettes: ["bien_fait", "pas_cher"], moments: ["soir"], prixF: 500, commentaire: "L'alloco est bien fait." }), "a", [], JOUR(0));
  assert.equal(cree.cree, true);
  assert.match(cree.id, /^v_/);
  assert.equal(cree.preuves.statut, "signale");
  assert.equal(cree.preuves.personnes, 1);
  assert.deepEqual(cree.preuves.prix, { medianeF: 500, nb: 1, majLe: JOUR(0).toISOString() });
  assert.deepEqual(cree.preuves.commentaires, [{ texte: "L'alloco est bien fait.", le: JOUR(0).toISOString() }]);
});

test("un seul lieu pour plusieurs signalements : « C'est bien celui-ci ? » à moins de 50 m", () => {
  const v = nouveau();
  const premier = v.signaler(alloco(), "a", [], JOUR(0));
  // Même catégorie à 20 m (le maquis à 10 m, la vendeuse à 20 m) : rien n'est créé, l'appli reçoit les lieux proches (voyageurs et sources extérieures).
  const proche = v.signaler(alloco({ nom: "Alloco du carrefour FICTIF", lat: nord(20) }), "b", [officiel], JOUR(0));
  assert.equal(proche.cree, false);
  assert.deepEqual(proche.doublons.map((d) => [d.id, d.voyageurs]), [["l_maquis", false], [premier.id, true]]);
  // La même personne ne peut pas créer un deuxième lieu au même endroit.
  assert.throws(() => v.signaler(alloco({ forcer: true }), "a", [], JOUR(0)), /déjà signalé/);
  // « Non, c'est un autre lieu » : forcer.
  assert.equal(v.signaler(alloco({ nom: "Autre vendeuse FICTIVE", lat: nord(20), forcer: true }), "b", [officiel], JOUR(0)).cree, true);
  // Autre catégorie ou plus de 50 m : pas un doublon.
  assert.equal(v.signaler(alloco({ categorie: "marche", specialite: null }), "c", [], JOUR(0)).cree, true);
  assert.equal(v.signaler(alloco({ lat: nord(80) }), "c", [], JOUR(0)).cree, true);
});

test("on compte des personnes, pas des clics : une voix par compte", () => {
  const v = nouveau();
  const { id } = v.signaler(alloco({ etiquettes: ["bien_fait"] }), "a", [], JOUR(0));
  v.completer(id, { etiquettes: ["bien_fait", "copieux"] }, "b", JOUR(1));
  v.completer(id, { etiquettes: ["copieux"] }, "b", JOUR(1)); // b change d'avis : son témoignage remplace le précédent
  v.repondre(id, "a", true, false, JOUR(1)); // l'auteur dit « encore là » : toujours une seule voix
  const preuves = v.preuves(id, JOUR(1));
  assert.equal(preuves.personnes, 2);
  assert.equal(preuves.signalements, 2);
  assert.deepEqual(preuves.etiquettes.map((e) => [e.id, e.nb]), [["bien_fait", 1], ["copieux", 1]]);
});

test("étiquette simple : signalé → confirmé par plusieurs → vérifié récemment", () => {
  const v = nouveau();
  const { id } = v.signaler(alloco(), "a", [], JOUR(0));
  assert.equal(v.statutDe(id, JOUR(0)), "signale");
  v.repondre(id, "a", true, false, JOUR(2)); // l'auteur seul ne vérifie pas son propre lieu
  assert.equal(v.statutDe(id, JOUR(2)), "signale");
  v.repondre(id, "b", true, false, JOUR(2));
  assert.equal(v.statutDe(id, JOUR(2)), "verifie_recemment");
  // Dix jours plus tard, plus de confirmation récente : il reste confirmé par 2 personnes.
  assert.equal(v.statutDe(id, JOUR(12)), "confirme");
  assert.equal(v.preuves(id, JOUR(12)).encoreLaSemaine, 0);
});

test("la fraîcheur compte : sans preuve pendant 30 jours, le lieu s'efface", () => {
  const v = nouveau();
  const { id } = v.signaler(alloco(), "a", [], JOUR(0));
  v.repondre(id, "b", true, false, JOUR(1));
  assert.equal(v.statutDe(id, JOUR(1 + JOURS_EFFACEMENT - 1)), "confirme");
  assert.equal(v.statutDe(id, JOUR(1 + JOURS_EFFACEMENT + 1)), "efface");
  assert.equal(v.parId(id, JOUR(1 + JOURS_EFFACEMENT + 1)), null);
  assert.equal(v.visibles(JOUR(1 + JOURS_EFFACEMENT + 1)).length, 0);
});

test("« plus là » : 2 personnes cette semaine, et 2 de plus que les « encore là »", () => {
  const v = nouveau();
  const { id } = v.signaler(alloco(), "a", [], JOUR(0));
  v.repondre(id, "b", false, false, JOUR(1));
  assert.equal(v.statutDe(id, JOUR(1)), "signale");
  v.repondre(id, "c", false, false, JOUR(1));
  assert.equal(v.statutDe(id, JOUR(1)), "plus_la");
  assert.throws(() => v.repondre(id, "d", true, false, JOUR(1)), /introuvable/);
  // Les négatifs restent visibles dans les preuves, et l'auteur qui répond « plus là » ne compte plus pour.
  const autre = v.signaler(alloco({ lat: nord(200) }), "a", [], JOUR(0)).id;
  v.repondre(autre, "b", true, false, JOUR(1));
  v.repondre(autre, "c", false, false, JOUR(1));
  v.repondre(autre, "a", false, false, JOUR(1));
  const preuves = v.preuves(autre, JOUR(1));
  assert.deepEqual([preuves.personnes, preuves.encoreLaSemaine, preuves.plusLaSemaine], [1, 1, 2]);
});

test("« trouvé avec SIRA » : compté à part, et gardé tant que la personne ne dit pas « plus là »", () => {
  const v = nouveau();
  const { id } = v.signaler(alloco(), "a", [], JOUR(0));
  v.repondre(id, "b", true, true, JOUR(1));
  v.repondre(id, "b", true, false, JOUR(2));
  assert.equal(v.preuves(id, JOUR(2)).trouvesAvecSira, 1);
  v.repondre(id, "b", false, false, JOUR(3));
  assert.equal(v.preuves(id, JOUR(3)).trouvesAvecSira, 0);
});

test("signaler le contenu : masqué à 3 personnes ; le commerçant est retiré tout de suite", () => {
  const v = nouveau();
  const { id } = v.signaler(alloco(), "a", [], JOUR(0));
  assert.throws(() => v.signalerContenu(id, "b", "pas_beau", JOUR(0)), /Raison/);
  v.signalerContenu(id, "b", "faux", JOUR(0));
  v.signalerContenu(id, "b", "choquant", JOUR(0)); // la même personne compte une fois
  v.signalerContenu(id, "c", "publicite", JOUR(0));
  assert.equal(v.statutDe(id, JOUR(0)), "signale");
  assert.deepEqual(v.signalerContenu(id, "d", "faux", JOUR(0)), { statut: "masque", masque: true });
  const autre = v.signaler(alloco({ lat: nord(200) }), "a", [], JOUR(0)).id;
  assert.equal(v.signalerContenu(autre, "e", "commercant", JOUR(0)).statut, "masque");
});

test("gardés après un redémarrage", () => {
  const fichier = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sira-lieux-voyageurs-")), "lieux-voyageurs.json");
  const v = new LieuxVoyageurs(fichier, SPECIALITES);
  const { id } = v.signaler(alloco({ prixF: 300 }), "a", [], JOUR(0));
  v.completer(id, { prixF: 500 }, "b", JOUR(1));
  v.completer(id, { prixF: 400 }, "c", JOUR(1));
  const relu = new LieuxVoyageurs(fichier, SPECIALITES);
  assert.deepEqual(relu.preuves(id, JOUR(1)).prix, { medianeF: 400, nb: 3, majLe: JOUR(1).toISOString() });
  assert.equal(relu.statutDe(id, JOUR(1)), "verifie_recemment");
});

// ---------- avec le service des lieux ----------

const depot = { tous: () => [officiel], parId: (id) => (id === officiel.id ? officiel : null), attribution: () => "© FICTIF" };
const garde = { lieuxDeGarde: async () => new Set(), semaineCourante: async () => ({ pharmacies: [] }) };

test("service : les lieux des voyageurs dans les listes et la fiche, avec leurs preuves", async () => {
  const voyageurs = nouveau();
  const service = new LieuxService(depot, garde, new LieuxConfirmations(null), voyageurs);
  const { id } = service.signaler(alloco({ lat: nord(-200), moments: ["soir"] }), "a");
  const proches = await service.proches({ ...CARREFOUR, categorie: "saveurs" });
  const lieu = proches.lieux.find((l) => l.id === id);
  assert.deepEqual(lieu.voyageurs, { statut: "signale", libelleStatut: "Signalé" });
  assert.equal(proches.lieux.find((l) => l.id === "l_maquis").voyageurs, null);
  const fiche = await service.fiche(id);
  assert.deepEqual(fiche.sources, ["utilisateur"]);
  assert.equal(fiche.voyageurs.personnes, 1);
  assert.deepEqual(fiche.voyageurs.moments.map((m) => m.id), ["soir"]);
  assert.equal((await service.fiche("l_maquis")).voyageurs, null);
  assert.equal(service.categories().signalement.categories.includes("pharmacie"), false);
  await assert.rejects(Promise.resolve().then(() => service.signalerContenu("l_maquis", "b", "faux")), /voyageurs/);
});

test("service : « Tu l'as trouvé ? » seulement à moins de 150 m du lieu", () => {
  const service = new LieuxService(depot, garde, new LieuxConfirmations(null), nouveau());
  assert.throws(() => service.repondreEncoreLa("l_maquis", "b", true, { lat: nord(30 + 400), lon: CARREFOUR.lon }), /assez près/);
  const reponse = service.repondreEncoreLa("l_maquis", "b", true, { lat: nord(30 + 60), lon: CARREFOUR.lon });
  assert.equal(reponse.trouvesAvecSira, 1);
  // « Moi aussi je l'ai vu » sur un lieu des sources extérieures : un « encore là ».
  assert.equal(service.temoigner("l_maquis", {}, "c").encoreLaOui, 2);
  assert.deepEqual(lireArrivee({ lat: "5.3", lng: "-4.0" }), { lat: 5.3, lon: -4 });
  assert.equal(lireArrivee(undefined), null);
  assert.throws(() => lireArrivee({ lat: "x" }), /arrivee/);
});

test("classement : un lieu seulement « signalé » ne passe jamais devant les autres", () => {
  const classe = (id, champs) => ({ id, nom: id, distanceM: 100, nbSources: 1, derniereConfirmation: null, ouverture: "inconnu", duMoment: false, voyageurs: null, etat: "calcule", trajet: { dureeMin: 10, prixF: 0, modes: ["walk"] }, ...champs });
  const ordre = classer([
    classe("signale", { voyageurs: { statut: "signale" }, ouverture: "ouvert", trajet: { dureeMin: 2, prixF: 0, modes: ["walk"] } }),
    classe("ferme_loin", { ouverture: "ferme", trajet: { dureeMin: 30, prixF: 0, modes: ["walk"] } }),
    classe("verifie", { voyageurs: { statut: "verifie_recemment" }, trajet: { dureeMin: 5, prixF: 0, modes: ["walk"] } }),
  ]).map((l) => l.id);
  assert.deepEqual(ordre, ["verifie", "ferme_loin", "signale"]);
});
