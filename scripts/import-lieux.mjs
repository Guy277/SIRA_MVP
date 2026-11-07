// npm run data:lieux [-- --fetch] [-- --overture] [-- --bbox=ouest,sud,est,nord] : fabrique la liste des lieux
// du quotidien (catégories de la carte : saveurs, pharmacies, Points Orange, marchés, écoles, mosquées, églises, santé).
// Lancé une fois, jamais pendant une démo : l'API lit seulement le fichier produit.
//
// Entrées (data/lieux/, hors Git) :
//   raw/osm-lieux.json            export Overpass des lieux (--fetch le retélécharge ; téléchargé s'il manque)
//   raw/communes.json             limites des 13 communes du Grand Abidjan (OSM, même règle)
//   raw/overture-places.geojson   Overture Maps Places (--overture le télécharge avec l'outil officiel overturemaps)
//   sira_lieux_depart.csv         lieux recensés par l'équipe (facultatif, modèle : scripts/lieux/modeles/)
//   points_orange.csv             agences Orange et points Orange Money saisis à la main (facultatif, même modèle)
// Sorties :
//   lieux.json                    lieux fusionnés, lus par l'API (services/api, module lieux)
//   rapport-import.json           comptes par source et par catégorie, fusions, lieux écartés
//
// Méthode (rien d'inventé) : catégories d'après scripts/lieux/categories.json ; commune d'après les limites OSM ;
// spécialité de « Saveurs du coin » d'après le nom seul ; doublons fusionnés selon scripts/lieux/fusion.mjs
// (même catégorie, moins de 60 m, noms similaires à 0,6 ou plus). Lieu sans nom : écarté.
// Relançable : les mêmes fichiers d'entrée redonnent exactement les mêmes lieux et identifiants.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assemblerAnneaux, bboxAnneaux, communeDe, fusionner, normaliserNom, specialiteDepuisNom } from "./lieux/fusion.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "data", "lieux");
const rawDir = path.join(dir, "raw");
const config = JSON.parse(fs.readFileSync(path.join(root, "scripts", "lieux", "categories.json"), "utf8"));
const argBbox = process.argv.find((arg) => arg.startsWith("--bbox="))?.slice(7);
// Emprise du Grand Abidjan : ouest, sud, est, nord.
const [OUEST, SUD, EST, NORD] = (argBbox ?? process.env.SIRA_LIEUX_BBOX ?? "-4.20,5.20,-3.80,5.55").split(",").map(Number);
const BBOX_OVERPASS = `${SUD},${OUEST},${NORD},${EST}`;
// Les 13 communes du Grand Abidjan dans OSM (relations boundary=administrative, niveaux 7 et 8).
const COMMUNES_OSM = {
  3377895: "Abobo", 3377835: "Adjamé", 3377820: "Attécoubé", 3363950: "Cocody", 3377741: "Koumassi",
  3308780: "Marcory", 3308306: "Plateau", 3377873: "Port-Bouët", 3308305: "Treichville", 3377881: "Yopougon",
  3377922: "Bingerville", 3377941: "Anyama", 3377972: "Songon",
};
const ATTRIBUTION = "© contributeurs OpenStreetMap (ODbL), Overture Maps Foundation (CDLA-Permissive-2.0)";
const FETCH = process.argv.includes("--fetch");

const rapport = { sources: {}, categories: {}, fusions: 0 };
const compter = (source, motif) => {
  rapport.sources[source] ??= { lus: 0, gardes: 0, ecartes: {} };
  if (motif === "lu") rapport.sources[source].lus += 1;
  else if (motif === "garde") rapport.sources[source].gardes += 1;
  else rapport.sources[source].ecartes[motif] = (rapport.sources[source].ecartes[motif] ?? 0) + 1;
};
const dansEmprise = (lat, lon) => lat >= SUD && lat <= NORD && lon >= OUEST && lon <= EST;

async function overpass(query) {
  for (const url of ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter"]) {
    try {
      const response = await fetch(url, {
        method: "POST",
        body: new URLSearchParams({ data: query }),
        headers: { "User-Agent": "SIRA-dev/1.0 (+https://github.com/Guy277/SIRA_MVP)" },
      });
      if (response.ok) return response.json();
      console.warn(`[lieux] ${url} : HTTP ${response.status}`);
    } catch (error) {
      console.warn(`[lieux] ${url} : ${error.message}`);
    }
  }
  throw new Error("Overpass indisponible : réessaie plus tard.");
}

async function lireOuTelecharger(fichier, query) {
  const chemin = path.join(rawDir, fichier);
  if (FETCH || !fs.existsSync(chemin)) {
    console.log(`[lieux] téléchargement OSM : ${fichier}…`);
    fs.mkdirSync(rawDir, { recursive: true });
    fs.writeFileSync(chemin, JSON.stringify(await overpass(query)));
  }
  return JSON.parse(fs.readFileSync(chemin, "utf8"));
}

function telechargerOverture() {
  // Outil officiel (pip install overturemaps), installé hors Git dans data/lieux/.venv-overture.
  const outil = path.join(dir, ".venv-overture", process.platform === "win32" ? "Scripts/overturemaps.exe" : "bin/overturemaps");
  if (!fs.existsSync(outil)) throw new Error(`overturemaps absent : python -m venv data/lieux/.venv-overture puis pip install overturemaps`);
  console.log("[lieux] téléchargement Overture Maps Places…");
  execFileSync(outil, ["download", `--bbox=${OUEST},${SUD},${EST},${NORD}`, "-f", "geojson", "-t", "place",
    "-o", path.join(rawDir, "overture-places.geojson")], { stdio: "inherit" });
}

// ---------- Communes ----------
function communesDepuisOsm(donnees) {
  return donnees.elements.filter((e) => e.type === "relation" && COMMUNES_OSM[e.id]).map((relation) => {
    const chemins = relation.members
      .filter((m) => m.type === "way" && m.geometry && (m.role === "outer" || m.role === "inner" || m.role === ""))
      .map((m) => m.geometry.map((p) => [p.lon, p.lat]));
    const anneaux = assemblerAnneaux(chemins);
    return { nom: COMMUNES_OSM[relation.id], anneaux, bbox: bboxAnneaux(anneaux) };
  });
}

// ---------- OpenStreetMap ----------
const texteContient = (texte, mots) => mots.some((mot) => ` ${normaliserNom(texte)} `.includes(` ${normaliserNom(mot)} `));
const telephonesOsm = (tags) => ["phone", "contact:phone", "contact:mobile", "mobile"]
  .flatMap((cle) => (tags[cle] ?? "").split(/[;,]/)).map((t) => t.trim()).filter(Boolean);

function depuisOsm(element) {
  compter("osm", "lu");
  const tags = element.tags ?? {};
  const lat = element.lat ?? element.center?.lat;
  const lon = element.lon ?? element.center?.lon;
  const nom = tags.name ?? tags["name:fr"];
  const po = config.point_orange;
  const etiquetteOrange = [tags.name, tags.brand, tags.operator].filter(Boolean).some((t) => texteContient(t, po.mots));
  const marqueOrange = po.wikidata_orange.includes(tags["brand:wikidata"]) || po.wikidata_orange.includes(tags["operator:wikidata"]);
  let categorie = null;
  let statut = "valide";
  // Point Orange : marque Orange explicite, ou point cartographié comme transfert d'argent / boutique mobile
  // et nommé « Orange… » par un contributeur OSM. Les deux sont des relevés sur place : valides.
  if (marqueOrange || (etiquetteOrange && po.osm.some((cle) => { const [k, v] = cle.split("="); return tags[k] === v; }))) {
    categorie = "point_orange";
  } else if (tags.amenity === "place_of_worship") {
    categorie = config.osm[`religion=${tags.religion}`] ?? null;
  } else {
    categorie = config.osm[`amenity=${tags.amenity}`] ?? null;
  }
  if (!categorie) return compter("osm", "categorie non suivie");
  if (!nom) return compter("osm", "sans nom");
  if (!Number.isFinite(lat) || !dansEmprise(lat, lon)) return compter("osm", "hors emprise");
  compter("osm", "garde");
  const rue = [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ");
  return {
    source: "osm",
    id_externe: `${element.type}/${element.id}`,
    nom,
    categorie,
    specialite: categorie === "saveurs" ? specialiteDepuisNom(nom, config.specialites) : null,
    lat,
    lon,
    repere: tags["addr:full"] ?? (rue || null),
    telephones: telephonesOsm(tags),
    horaires: tags.opening_hours ? { osm: tags.opening_hours } : null,
    statut,
  };
}

// ---------- Overture ----------
const FERMES = new Set(["permanently_closed", "temporarily_closed"]);
function depuisOverture(feature) {
  compter("overture", "lu");
  const p = feature.properties ?? {};
  const [lon, lat] = feature.geometry?.coordinates ?? [];
  const nom = p.names?.primary;
  const types = [p.taxonomy?.primary, p.basic_category].filter(Boolean);
  const po = config.point_orange;
  const marqueOrange = po.wikidata_orange.includes(p.brand?.wikidata);
  const etiquetteOrange = [nom, p.brand?.names?.primary].filter(Boolean).some((t) => texteContient(t, po.mots));
  let categorie = types.map((type) => config.overture[type]).find(Boolean) ?? null;
  let statut = "valide";
  if (marqueOrange || (etiquetteOrange && types.some((type) => po.overture.includes(type)))) {
    categorie = "point_orange";
    statut = marqueOrange ? "valide" : "en_attente"; // à valider à la main (consigne)
  }
  if (!categorie) return compter("overture", "categorie non suivie");
  if (FERMES.has(p.operating_status)) return compter("overture", "ferme");
  if (!(p.confidence >= config.overture.confiance_min)) return compter("overture", `confiance < ${config.overture.confiance_min}`);
  if (!nom) return compter("overture", "sans nom");
  if (!Number.isFinite(lat) || !dansEmprise(lat, lon)) return compter("overture", "hors emprise");
  compter("overture", "garde");
  return {
    source: "overture",
    id_externe: feature.id ?? p.id,
    nom,
    categorie,
    specialite: categorie === "saveurs" ? specialiteDepuisNom(nom, config.specialites) : null,
    lat,
    lon,
    repere: p.addresses?.[0]?.freeform ?? null,
    telephones: (p.phones ?? []).filter(Boolean),
    confiance: Math.round(p.confidence * 1000) / 1000,
    statut,
  };
}

// ---------- CSV de l'équipe et des Points Orange ----------
export function lireCsv(texte) {
  const lignes = [];
  let ligne = [];
  let cellule = "";
  let guillemets = false;
  for (let i = 0; i < texte.length; i += 1) {
    const c = texte[i];
    if (guillemets) {
      if (c === '"' && texte[i + 1] === '"') { cellule += '"'; i += 1; }
      else if (c === '"') guillemets = false;
      else cellule += c;
    } else if (c === '"') guillemets = true;
    else if (c === "," || c === ";") { ligne.push(cellule); cellule = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && texte[i + 1] === "\n") i += 1;
      ligne.push(cellule); cellule = "";
      if (ligne.some((v) => v.trim())) lignes.push(ligne);
      ligne = [];
    } else cellule += c;
  }
  ligne.push(cellule);
  if (ligne.some((v) => v.trim())) lignes.push(ligne);
  const [entete, ...donnees] = lignes;
  if (!entete) return [];
  const cles = entete.map((cle) => cle.replace(/^﻿/, "").trim().toLowerCase());
  return donnees.map((valeurs) => Object.fromEntries(cles.map((cle, i) => [cle, (valeurs[i] ?? "").trim()])));
}

const oui = (valeur) => /^(1|oui|o|true|vrai|x)$/i.test(valeur ?? "");
const nombre = (valeur) => (valeur === "" || valeur == null ? null : Number(String(valeur).replace(",", ".")));

function depuisCsv(ligne, index, fichier, categorieParDefaut) {
  const source = ligne.source || "equipe";
  compter(source, "lu");
  const categorie = ligne.categorie || categorieParDefaut;
  if (!config.categories[categorie]) return compter(source, `categorie inconnue (${fichier})`);
  if (!ligne.nom) return compter(source, "sans nom");
  const lat = nombre(ligne.latitude);
  const lon = nombre(ligne.longitude);
  const localise = Number.isFinite(lat) && Number.isFinite(lon);
  if (localise && !dansEmprise(lat, lon)) return compter(source, "hors emprise");
  compter(source, "garde");
  let horaires = null;
  if (ligne.horaires) { try { horaires = JSON.parse(ligne.horaires); } catch { horaires = { texte: ligne.horaires }; } }
  const statutDemande = ["valide", "en_attente", "retire"].includes(ligne.statut) ? ligne.statut : "valide";
  return {
    source,
    id_externe: `${fichier}#${index + 2}`, // numéro de ligne du fichier (en-tête = ligne 1)
    nom: ligne.nom,
    categorie,
    specialite: ligne.specialite || (categorie === "saveurs" ? specialiteDepuisNom(ligne.nom, config.specialites) : null),
    lat: localise ? lat : null,
    lon: localise ? lon : null,
    repere: ligne.repere || null,
    telephones: (ligne.telephones ?? "").split(/[/|]/).map((t) => t.trim()).filter(Boolean),
    horaires,
    prix_indicatif: nombre(ligne.prix_indicatif),
    prix_maj_le: ligne.prix_maj_le || null,
    photo_url: oui(ligne.consentement_photo) ? ligne.photo || null : null, // jamais de photo sans accord
    // Sans coordonnées ou marqué « à vérifier » : en attente, jamais affiché sur la carte.
    statut: !localise || oui(ligne.a_verifier) ? (statutDemande === "retire" ? "retire" : "en_attente") : statutDemande,
    consentement_vendeur: oui(ligne.consentement_vendeur),
    consentement_photo: oui(ligne.consentement_photo),
  };
}

// ---------- Programme ----------
async function main() {
  if (process.argv.includes("--overture")) telechargerOverture();

  const communes = communesDepuisOsm(await lireOuTelecharger("communes.json",
    `[out:json][timeout:180];rel(id:${Object.keys(COMMUNES_OSM).join(",")});out geom;`));
  const osm = await lireOuTelecharger("osm-lieux.json", `[out:json][timeout:300];
(
  nwr["amenity"~"^(pharmacy|hospital|clinic|school|college|university|marketplace|restaurant|fast_food|food_court|place_of_worship|money_transfer|payment_centre)$"](${BBOX_OVERPASS});
  nwr["shop"~"^(mobile_phone|telecommunication)$"](${BBOX_OVERPASS});
  nwr["office"="telecommunication"](${BBOX_OVERPASS});
  nwr["brand:wikidata"="Q1431486"](${BBOX_OVERPASS});
);
out center tags;`);

  const enregistrements = osm.elements.map(depuisOsm).filter(Boolean);
  const overturePath = path.join(rawDir, "overture-places.geojson");
  let overtureVersion = null;
  if (fs.existsSync(overturePath)) {
    const overture = JSON.parse(fs.readFileSync(overturePath, "utf8"));
    enregistrements.push(...overture.features.map(depuisOverture).filter(Boolean));
    const etat = path.join(rawDir, "overture-places.geojson.state");
    if (fs.existsSync(etat)) overtureVersion = JSON.parse(fs.readFileSync(etat, "utf8")).last_release ?? null;
  } else {
    console.warn("[lieux] Overture absent : npm run data:lieux -- --overture pour le télécharger.");
  }
  for (const [fichier, categorie] of [["sira_lieux_depart.csv", null], ["points_orange.csv", "point_orange"]]) {
    const chemin = path.join(dir, fichier);
    if (!fs.existsSync(chemin)) continue;
    enregistrements.push(...lireCsv(fs.readFileSync(chemin, "utf8")).map((ligne, i) => depuisCsv(ligne, i, fichier, categorie)).filter(Boolean));
  }
  for (const e of enregistrements) if (Number.isFinite(e.lat)) e.commune = communeDe(e, communes);

  const { lieux, fusions } = fusionner(enregistrements);
  rapport.fusions = fusions;
  for (const lieu of lieux) {
    rapport.categories[lieu.categorie] ??= { valide: 0, en_attente: 0, retire: 0, multi_sources: 0, sans_commune: 0 };
    const c = rapport.categories[lieu.categorie];
    c[lieu.statut] += 1;
    if (lieu.nb_sources > 1) c.multi_sources += 1;
    if (!lieu.commune) c.sans_commune += 1;
  }
  const specialites = {};
  for (const lieu of lieux) if (lieu.categorie === "saveurs") specialites[lieu.specialite ?? "autre"] = (specialites[lieu.specialite ?? "autre"] ?? 0) + 1;
  rapport.specialites_saveurs = specialites;

  const sortie = {
    schema: "sira-lieux-v1",
    genere_le: new Date().toISOString(),
    emprise: { ouest: OUEST, sud: SUD, est: EST, nord: NORD },
    attribution: ATTRIBUTION,
    sources: {
      osm: { date: osm.osm3s?.timestamp_osm_base ?? null, licence: "ODbL" },
      overture: overtureVersion ? { version: overtureVersion, licence: "CDLA-Permissive-2.0" } : null,
    },
    communes: communes.map((c) => c.nom).sort(),
    lieux,
  };
  fs.writeFileSync(path.join(dir, "lieux.json"), JSON.stringify(sortie));
  fs.writeFileSync(path.join(dir, "rapport-import.json"), JSON.stringify({ genere_le: sortie.genere_le, ...rapport }, null, 2));

  console.log(`[lieux] ${lieux.length} lieux, ${fusions} fusions -> data/lieux/lieux.json`);
  console.log("[lieux] par source :");
  for (const [source, s] of Object.entries(rapport.sources)) {
    const ecartes = Object.entries(s.ecartes).map(([motif, n]) => `${motif} ${n}`).join(", ");
    console.log(`  ${source.padEnd(10)} lus ${String(s.lus).padStart(6)}  gardés ${String(s.gardes).padStart(5)}  écartés : ${ecartes || "aucun"}`);
  }
  console.log("[lieux] par catégorie (valide / en attente / retiré · confirmés par 2 sources ou plus · sans commune) :");
  for (const [categorie, c] of Object.entries(rapport.categories).sort()) {
    console.log(`  ${categorie.padEnd(13)} ${String(c.valide).padStart(5)} / ${c.en_attente} / ${c.retire} · ${c.multi_sources} · ${c.sans_commune}`);
  }
  console.log(`[lieux] spécialités « Saveurs du coin » : ${Object.entries(specialites).map(([s, n]) => `${s} ${n}`).join(", ")}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => { console.error(`[lieux] ${error.message}`); process.exit(1); });
}
