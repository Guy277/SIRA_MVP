// Fonctions pures de l'import des lieux (scripts/import-lieux.mjs) : noms, communes, dédoublonnage.
// Sans accès disque ni réseau, pour être testées seules (tests/lieux-fusion.test.mjs).
import crypto from "node:crypto";

// Ordre de confiance des sources : la première d'un groupe de doublons donne la position et l'identifiant.
export const PRIORITE_SOURCES = ["equipe", "utilisateur", "osm", "hotosm", "overture", "foursquare", "uvci", "presse"];

// « Pharmacie Sainte-Thérèse » -> « pharmacie sainte therese » : minuscules, sans accents ni ponctuation.
export function normaliserNom(nom) {
  return String(nom ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Trigrammes à la manière de pg_trgm : chaque mot est entouré de deux espaces devant et d'un derrière.
export function trigrammes(nomNormalise) {
  const resultat = new Set();
  for (const mot of nomNormalise.split(" ").filter(Boolean)) {
    const entoure = `  ${mot} `;
    for (let i = 0; i + 3 <= entoure.length; i += 1) resultat.add(entoure.slice(i, i + 3));
  }
  return resultat;
}

// Similarité de pg_trgm (similarity) : trigrammes communs / trigrammes de l'un ou de l'autre, de 0 à 1.
export function similarite(a, b) {
  const ta = trigrammes(normaliserNom(a));
  const tb = trigrammes(normaliserNom(b));
  if (!ta.size || !tb.size) return 0;
  let communs = 0;
  for (const t of ta) if (tb.has(t)) communs += 1;
  return communs / (ta.size + tb.size - communs);
}

export function distanceM(a, b) {
  const rad = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * rad) / 2) ** 2
    + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lon - a.lon) * rad) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

// Spécialité de « Saveurs du coin » d'après le nom seul (aucune source ne la renseigne) : un mot-clé
// de scripts/lieux/categories.json doit apparaître en entier dans le nom.
export function specialiteDepuisNom(nom, specialites) {
  const texte = ` ${normaliserNom(nom)} `;
  for (const [specialite, mots] of Object.entries(specialites)) {
    if (specialite.startsWith("_")) continue;
    if (mots.some((mot) => texte.includes(` ${normaliserNom(mot)} `))) return specialite;
  }
  return null;
}

// Anneaux fermés d'une relation OSM « boundary » à partir des chemins de ses membres (out geom d'Overpass).
// Chaque chemin est une suite de points [lon, lat] ; on les met bout à bout jusqu'à revenir au départ.
export function assemblerAnneaux(chemins) {
  const restants = chemins.filter((chemin) => chemin.length > 1).map((chemin) => [...chemin]);
  const anneaux = [];
  const meme = (p, q) => p[0] === q[0] && p[1] === q[1];
  while (restants.length) {
    const anneau = restants.shift();
    let prolonge = true;
    while (!meme(anneau[0], anneau.at(-1)) && prolonge) {
      prolonge = false;
      for (let i = 0; i < restants.length; i += 1) {
        const chemin = restants[i];
        if (meme(anneau.at(-1), chemin[0])) anneau.push(...chemin.slice(1));
        else if (meme(anneau.at(-1), chemin.at(-1))) anneau.push(...chemin.slice(0, -1).reverse());
        else continue;
        restants.splice(i, 1);
        prolonge = true;
        break;
      }
    }
    if (anneau.length >= 4 && meme(anneau[0], anneau.at(-1))) anneaux.push(anneau);
  }
  return anneaux;
}

// Point dans un ensemble d'anneaux (règle pair-impair : les trous d'une commune sont exclus).
function dansAnneaux(lon, lat, anneaux) {
  let dedans = false;
  for (const anneau of anneaux) {
    for (let i = 0, j = anneau.length - 1; i < anneau.length; j = i, i += 1) {
      const [xi, yi] = anneau[i];
      const [xj, yj] = anneau[j];
      if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dedans = !dedans;
    }
  }
  return dedans;
}

// Commune d'un point. communes : [{ nom, anneaux, bbox: [ouest, sud, est, nord] }].
export function communeDe(point, communes) {
  for (const commune of communes) {
    const [ouest, sud, est, nord] = commune.bbox;
    if (point.lon < ouest || point.lon > est || point.lat < sud || point.lat > nord) continue;
    if (dansAnneaux(point.lon, point.lat, commune.anneaux)) return commune.nom;
  }
  return null;
}

export function bboxAnneaux(anneaux) {
  const points = anneaux.flat();
  return [
    Math.min(...points.map((p) => p[0])), Math.min(...points.map((p) => p[1])),
    Math.max(...points.map((p) => p[0])), Math.max(...points.map((p) => p[1])),
  ];
}

// Identifiant stable : il ne dépend que de l'identifiant externe du premier enregistrement du lieu,
// donc un nouvel import des mêmes fichiers redonne les mêmes identifiants.
export const idStable = (cle) => `l_${crypto.createHash("sha1").update(cle).digest("hex").slice(0, 12)}`;

const rangSource = (source) => {
  const rang = PRIORITE_SOURCES.indexOf(source);
  return rang === -1 ? PRIORITE_SOURCES.length : rang;
};
const cleExterne = (enregistrement) => `${enregistrement.source}:${enregistrement.id_externe}`;
const CELLULE = 0.001; // degrés, environ 110 m : plus grand que la distance de fusion

// Dédoublonnage. Deux enregistrements sont le même lieu s'ils ont la même catégorie, sont à moins de
// distanceMax mètres et ont des noms similaires (>= similariteMin). Enregistrement attendu :
// { source, id_externe, nom, categorie, lat, lon, ...champs du lieu }. Sans coordonnées : jamais fusionné.
export function fusionner(enregistrements, { distanceMax = 60, similariteMin = 0.6 } = {}) {
  const ordonnes = [...enregistrements].sort((a, b) =>
    rangSource(a.source) - rangSource(b.source) || cleExterne(a).localeCompare(cleExterne(b)));
  const lieux = [];
  const grille = new Map();
  let fusions = 0;
  const cellule = (lat, lon) => [Math.floor(lat / CELLULE), Math.floor(lon / CELLULE)];

  for (const enregistrement of ordonnes) {
    const localise = Number.isFinite(enregistrement.lat) && Number.isFinite(enregistrement.lon);
    let cible = null;
    if (localise) {
      const [cy, cx] = cellule(enregistrement.lat, enregistrement.lon);
      let meilleure = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          for (const lieu of grille.get(`${cy + dy}:${cx + dx}`) ?? []) {
            if (lieu.categorie !== enregistrement.categorie) continue;
            if (distanceM(lieu, enregistrement) > distanceMax) continue;
            const score = Math.max(...[...lieu._noms].map((nom) => similarite(nom, enregistrement.nom)));
            if (score >= similariteMin && score > meilleure) { meilleure = score; cible = lieu; }
          }
        }
      }
    }
    if (cible) {
      fusions += 1;
      absorber(cible, enregistrement);
      continue;
    }
    const lieu = nouveauLieu(enregistrement);
    lieux.push(lieu);
    if (localise) {
      const cle = cellule(lieu.lat, lieu.lon).join(":");
      grille.set(cle, [...(grille.get(cle) ?? []), lieu]);
    }
  }
  return {
    fusions,
    lieux: lieux
      .map(({ _noms, ...lieu }) => ({ ...lieu, nb_sources: lieu.sources.length }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
}

function nouveauLieu(e) {
  return {
    id: idStable(cleExterne(e)),
    nom: e.nom,
    nom_normalise: normaliserNom(e.nom),
    categorie: e.categorie,
    specialite: e.specialite ?? null,
    lat: e.lat ?? null,
    lon: e.lon ?? null,
    commune: e.commune ?? null,
    repere: e.repere ?? null,
    telephones: [...new Set(e.telephones ?? [])],
    horaires: e.horaires ?? null,
    prix_indicatif: e.prix_indicatif ?? null,
    prix_maj_le: e.prix_maj_le ?? null,
    photo_url: e.photo_url ?? null,
    sources: [e.source],
    ids_externes: { [e.source]: [String(e.id_externe)] },
    confiance: e.confiance ?? null,
    statut: e.statut ?? "valide",
    consentement_vendeur: e.consentement_vendeur ?? false,
    consentement_photo: e.consentement_photo ?? false,
    derniere_confirmation: null,
    _noms: new Set([e.nom]),
  };
}

// Fusion d'un doublon dans le lieu déjà retenu : nom le plus complet, sources et identifiants cumulés,
// confiance maximale ; les champs vides du lieu sont complétés par le doublon.
function absorber(lieu, e) {
  lieu._noms.add(e.nom);
  if (normaliserNom(e.nom).length > lieu.nom_normalise.length) {
    lieu.nom = e.nom;
    lieu.nom_normalise = normaliserNom(e.nom);
  }
  if (!lieu.sources.includes(e.source)) lieu.sources.push(e.source);
  lieu.ids_externes[e.source] = [...new Set([...(lieu.ids_externes[e.source] ?? []), String(e.id_externe)])];
  if (Number.isFinite(e.confiance)) lieu.confiance = Math.max(lieu.confiance ?? 0, e.confiance);
  lieu.telephones = [...new Set([...lieu.telephones, ...(e.telephones ?? [])])];
  for (const champ of ["specialite", "commune", "repere", "horaires", "prix_indicatif", "prix_maj_le", "photo_url"]) {
    if (lieu[champ] == null && e[champ] != null) lieu[champ] = e[champ];
  }
  // Un lieu à valider confirmé par une autre source devient valide ; un lieu retiré par l'équipe le reste.
  if ((e.statut ?? "valide") === "valide" && lieu.statut === "en_attente") lieu.statut = "valide";
}
