// Comparaison de noms de lieux : même calcul que scripts/lieux/fusion.mjs (import des lieux) et que pg_trgm.

// « Pharmacie Sainte-Thérèse » -> « pharmacie sainte therese » : minuscules, sans accents ni ponctuation.
export function normaliserNom(nom: string | null | undefined): string {
  return String(nom ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Trigrammes à la manière de pg_trgm : chaque mot est entouré de deux espaces devant et d'un derrière.
function trigrammes(nomNormalise: string): Set<string> {
  const resultat = new Set<string>();
  for (const mot of nomNormalise.split(" ").filter(Boolean)) {
    const entoure = `  ${mot} `;
    for (let i = 0; i + 3 <= entoure.length; i += 1) resultat.add(entoure.slice(i, i + 3));
  }
  return resultat;
}

// Similarité de pg_trgm : trigrammes communs / trigrammes de l'un ou de l'autre, de 0 à 1.
export function similarite(a: string, b: string): number {
  const ta = trigrammes(normaliserNom(a));
  const tb = trigrammes(normaliserNom(b));
  if (!ta.size || !tb.size) return 0;
  let communs = 0;
  for (const t of ta) if (tb.has(t)) communs += 1;
  return communs / (ta.size + tb.size - communs);
}

// Partie distinctive d'un nom de pharmacie : sans « Pharmacie », sans petits mots ni mentions
// (« Nouvelle », « Sarl »), abréviations développées. Sinon, le mot « pharmacie » commun aux deux noms
// suffit à rapprocher « Pharmacie du Triomphe » de « Pharmacie du Marché » (mesuré sur la liste de garde).
const MOTS_VIDES = new Set(["pharmacie", "pharma", "de", "du", "des", "la", "le", "les", "d", "l", "et", "sarl", "nouvelle", "nlle"]);
const ABREVIATIONS: Record<string, string> = { st: "saint", ste: "sainte", nd: "notre dame" };
export function cleNomPharmacie(nom: string): string {
  return normaliserNom(nom)
    .split(" ")
    .map((mot) => ABREVIATIONS[mot] ?? mot)
    .join(" ")
    .split(" ")
    .filter((mot) => mot && !MOTS_VIDES.has(mot))
    .join(" ");
}

export function distanceM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * rad) / 2) ** 2
    + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lon - a.lon) * rad) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}
