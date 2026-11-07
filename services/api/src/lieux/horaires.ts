// « Ouvert maintenant ? » d'après la balise OSM opening_hours (seulement ~3 % des lieux en ont une).
// Sous-ensemble lu : « 24/7 » ; règles séparées par « ; » ; jours « Mo-Fr », « Sa,Su », « Su-Fr » ;
// plages « 08:00-12:00, 14:00-17:00 », y compris après minuit (« 16:00-01:00 ») ; « off » / « closed ».
// Une règle plus loin remplace la précédente pour les jours qu'elle cite (règle d'OSM).
// Les jours fériés (PH) ne sont pas connus : leurs règles sont ignorées. Toute autre forme : « inconnu »,
// jamais une supposition.

export type Ouverture = "ouvert" | "ferme" | "inconnu";

const JOURS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]; // indice = Date.getUTCDay()
type Plage = [number, number]; // minutes depuis minuit ; fin > 1 440 si la plage passe minuit
type Regle = { jours: Set<number> | null; plages: Plage[] }; // jours null = tous les jours

function lireJours(selecteur: string): Set<number> | null | "ignore" {
  const jours = new Set<number>();
  let fériesSeulement = true;
  for (const morceau of selecteur.split(",").map((m) => m.trim())) {
    if (morceau === "PH") continue;
    fériesSeulement = false;
    const [debut, fin] = morceau.split("-");
    const a = JOURS.indexOf(debut);
    const b = fin === undefined ? a : JOURS.indexOf(fin);
    if (a < 0 || b < 0) return null;
    for (let jour = a; ; jour = (jour + 1) % 7) {
      jours.add(jour);
      if (jour === b) break;
    }
  }
  return fériesSeulement ? "ignore" : jours;
}

function lirePlages(texte: string): Plage[] | null {
  if (/^(off|closed)$/i.test(texte)) return [];
  const plages: Plage[] = [];
  for (const morceau of texte.split(",").map((m) => m.trim())) {
    const trouve = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/.exec(morceau);
    if (!trouve) return null;
    const debut = Number(trouve[1]) * 60 + Number(trouve[2]);
    let fin = Number(trouve[3]) * 60 + Number(trouve[4]);
    if (debut > 1_440 || fin > 1_440) return null;
    if (fin <= debut) fin += 1_440; // passe minuit (« 00:00-00:00 » : toute la journée)
    plages.push([debut, fin]);
  }
  return plages;
}

function lireRegles(texte: string): Regle[] | null {
  const regles: Regle[] = [];
  for (const brute of texte.split(";").map((r) => r.trim()).filter(Boolean)) {
    const trouve = /^((?:(?:Mo|Tu|We|Th|Fr|Sa|Su|PH)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?\s*,?\s*)+)?\s*(.*)$/.exec(brute);
    if (!trouve) return null;
    const selecteur = (trouve[1] ?? "").replace(/\s+/g, "").replace(/,$/, "");
    const reste = trouve[2].trim();
    const jours = selecteur ? lireJours(selecteur) : null;
    if (jours === "ignore") continue;
    if (selecteur && jours === null) return null;
    const plages = reste ? lirePlages(reste) : [[0, 1_440] as Plage]; // « Mo-Su » seul : toute la journée
    if (!plages) return null;
    regles.push({ jours, plages });
  }
  return regles.length ? regles : null;
}

// Plages d'un jour donné après application des règles dans l'ordre.
function plagesDuJour(regles: Regle[], jour: number): Plage[] {
  let plages: Plage[] = [];
  for (const regle of regles) if (!regle.jours || regle.jours.has(jour)) plages = regle.plages;
  return plages;
}

export function ouvertureMaintenant(horaires: Record<string, string> | null | undefined, maintenant = new Date()): Ouverture {
  const texte = horaires?.osm?.trim();
  if (!texte) return "inconnu";
  if (texte === "24/7") return "ouvert";
  const regles = lireRegles(texte);
  if (!regles) return "inconnu";
  // Abidjan est en UTC toute l'année.
  const jour = maintenant.getUTCDay();
  const minute = maintenant.getUTCHours() * 60 + maintenant.getUTCMinutes();
  if (plagesDuJour(regles, jour).some(([debut, fin]) => minute >= debut && minute < fin)) return "ouvert";
  // Plage de la veille qui déborde après minuit.
  if (plagesDuJour(regles, (jour + 6) % 7).some(([, fin]) => fin > 1_440 && minute < fin - 1_440)) return "ouvert";
  return "ferme";
}
