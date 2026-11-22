import { BadRequestException, Logger, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Categorie, Lieu } from "./lieux.repository";
import { distanceM, normaliserNom } from "./texte";

// Lieux signalés par les voyageurs (la vendeuse d'alloco du carrefour, absente de toutes les cartes).
// SIRA n'affirme jamais qu'un tel lieu existe : il montre les preuves (combien de personnes, quand, ce
// qu'elles en disent) et chacun juge. Règles détaillées dans docs/lieux.md, « Lieux signalés par les voyageurs ».

// Pharmacies et santé exclues : un « médicament par terre » signalé comme pharmacie mettrait des gens en danger.
export const CATEGORIES_VOYAGEURS = ["saveurs", "point_orange", "marche", "ecole", "mosquee", "eglise"] as const satisfies readonly Categorie[];
export type CategorieVoyageurs = (typeof CATEGORIES_VOYAGEURS)[number];

// Étiquettes factuelles, à la place des étoiles (pas de note sur 5 : moins de disputes, plus utile).
export const ETIQUETTES = [
  { id: "bien_fait", libelle: "Bien fait", categories: ["saveurs"] },
  { id: "copieux", libelle: "Copieux", categories: ["saveurs"] },
  { id: "pas_cher", libelle: "Pas cher", categories: ["saveurs", "marche"] },
  { id: "propre", libelle: "Propre", categories: null },
  { id: "accueillant", libelle: "Accueillant", categories: null },
  { id: "rapide", libelle: "Rapide", categories: null },
] as const satisfies readonly { id: string; libelle: string; categories: readonly CategorieVoyageurs[] | null }[];
export type Etiquette = (typeof ETIQUETTES)[number]["id"];

// Moments où le voyageur a vu le lieu ouvert (un vendeur de rue n'a pas d'horaires écrits).
export const MOMENTS = [
  { id: "matin", libelle: "Le matin" }, { id: "midi", libelle: "À midi" },
  { id: "soir", libelle: "Le soir" }, { id: "nuit", libelle: "La nuit" },
] as const;
export type MomentVu = (typeof MOMENTS)[number]["id"];

// Raisons de « Signaler ce contenu ». « commercant » : le commerçant demande à être retiré.
export const RAISONS_CONTENU = ["faux", "choquant", "publicite", "commercant"] as const;
export type RaisonContenu = (typeof RAISONS_CONTENU)[number];

// Seuils (proposition, à valider par l'équipe ; tous réglables ici) :
export const RAYON_DOUBLON_M = 50; // même catégorie à moins de 50 m : « C'est bien celui-ci ? »
export const JOURS_RECENT = 7; // « cette semaine »
export const JOURS_EFFACEMENT = 30; // sans aucune preuve positive pendant 30 jours, le lieu s'efface
export const PLUS_LA_MIN = 2; // « plus là » : au moins 2 personnes cette semaine…
export const PLUS_LA_ECART = 2; // … et 2 de plus que les « encore là » de la semaine
export const MASQUE_CONTENU = 3; // 3 personnes signalent le contenu : masqué en attendant l'équipe
export const RAYON_ARRIVEE_M = 150; // « trouvé avec SIRA » : le voyageur doit être à moins de 150 m
const MAX_LIEUX = 5_000;
const MAX_COMMENTAIRES_AFFICHES = 10;

export type StatutVoyageurs = "signale" | "confirme" | "verifie_recemment" | "plus_la" | "efface" | "masque";
export const LIBELLE_STATUT: Record<StatutVoyageurs, string> = {
  signale: "Signalé",
  confirme: "Confirmé par plusieurs voyageurs",
  verifie_recemment: "Vérifié récemment",
  plus_la: "Plus là, d'après les voyageurs",
  efface: "Effacé faute de confirmation",
  masque: "Masqué après signalement",
};
const VISIBLES: StatutVoyageurs[] = ["signale", "confirme", "verifie_recemment"];

// Ce qu'une personne a dit du lieu : à la création, puis chaque fois qu'elle complète (une seule voix par personne,
// sa dernière version remplace la précédente).
type Temoignage = { le: string; etiquettes: Etiquette[]; moments: MomentVu[]; prixF: number | null; commentaire: string | null };
type Vote = { jour: string; encoreLa: boolean; trouveAvecSira?: string };
type Stocke = {
  id: string;
  nom: string;
  categorie: CategorieVoyageurs;
  specialite: string | null;
  lat: number;
  lon: number;
  repere: string | null;
  creeLe: string;
  auteur: string;
  temoignages: Record<string, Temoignage>; // par voyageur
  votes: Record<string, Vote>; // « Encore là ? » par voyageur, la dernière réponse
  contenu: Record<string, { raison: RaisonContenu; le: string }>; // « Signaler ce contenu » par voyageur
  retireParCommercant: boolean;
};

export type EntreeSignalement = {
  nom?: unknown; categorie?: unknown; specialite?: unknown; lat?: unknown; lon?: unknown; lng?: unknown;
  repere?: unknown; etiquettes?: unknown; moments?: unknown; prixF?: unknown; commentaire?: unknown; forcer?: unknown;
};

export type Doublon = { id: string; nom: string; distanceM: number; voyageurs: boolean };

export type PreuvesVoyageurs = {
  statut: StatutVoyageurs;
  libelleStatut: string;
  personnes: number; // personnes qui disent que le lieu existe (auteurs et « encore là »), une voix chacune
  signalements: number;
  encoreLaSemaine: number;
  plusLaSemaine: number;
  trouvesAvecSira: number;
  derniereConfirmation: string | null;
  etiquettes: { id: Etiquette; libelle: string; nb: number }[];
  moments: { id: MomentVu; libelle: string; nb: number }[];
  prix: { medianeF: number; nb: number; majLe: string } | null;
  commentaires: { texte: string; le: string }[];
};

export function lieuxVoyageursFile(env: Record<string, string | undefined> = process.env): string | null {
  const configure = env.SIRA_LIEUX_VOYAGEURS_FILE?.trim();
  if (configure === "memoire") return null;
  return configure || resolve(__dirname, "..", "..", "runtime", "lieux-voyageurs.json");
}

const GRAND_ABIDJAN = { minLat: 5.1, maxLat: 5.65, minLon: -4.35, maxLon: -3.7 };
// Pas de lien ni d'adresse web : SIRA n'est pas un panneau publicitaire.
const LIEN = /(https?:\/\/|www\.|\.(com|ci|net|org)\b)/i;
const jourDe = (date: Date) => date.toISOString().slice(0, 10);
const ilYa = (maintenant: Date, jours: number) => jourDe(new Date(maintenant.getTime() - jours * 86_400_000));

function texte(valeur: unknown, champ: string, max: number, min = 0): string | null {
  if (valeur === undefined || valeur === null || valeur === "") {
    if (min > 0) throw new BadRequestException(`${champ} est obligatoire.`);
    return null;
  }
  if (typeof valeur !== "string") throw new BadRequestException(`${champ} doit être un texte.`);
  const propre = valeur.replace(/\s+/g, " ").trim();
  if (propre.length < min) throw new BadRequestException(`${champ} : ${min} caractères au moins.`);
  if (propre.length > max) throw new BadRequestException(`${champ} : ${max} caractères au plus.`);
  if (LIEN.test(propre)) throw new BadRequestException(`${champ} : pas de lien ni d'adresse web.`);
  return propre || null;
}

function liste<T extends string>(valeur: unknown, permis: readonly T[], champ: string): T[] {
  if (valeur === undefined || valeur === null) return [];
  if (!Array.isArray(valeur) || valeur.some((v) => typeof v !== "string" || !permis.includes(v as T))) {
    throw new BadRequestException(`${champ} : valeurs permises ${permis.join(", ")}.`);
  }
  return [...new Set(valeur as T[])];
}

function prix(valeur: unknown): number | null {
  if (valeur === undefined || valeur === null || valeur === "") return null;
  const nombre = Number(valeur);
  if (!Number.isInteger(nombre) || nombre < 25 || nombre > 100_000) throw new BadRequestException("Le prix va de 25 à 100 000 F.");
  return nombre;
}

function etiquettesPermises(categorie: CategorieVoyageurs): Etiquette[] {
  return ETIQUETTES.filter((e) => e.categories === null || (e.categories as readonly string[]).includes(categorie)).map((e) => e.id);
}

function temoignage(entree: EntreeSignalement, categorie: CategorieVoyageurs, maintenant: Date): Temoignage {
  return {
    le: maintenant.toISOString(),
    etiquettes: liste(entree.etiquettes, etiquettesPermises(categorie), "Étiquettes"),
    moments: liste(entree.moments, MOMENTS.map((m) => m.id), "Moments"),
    prixF: categorie === "saveurs" || categorie === "marche" ? prix(entree.prixF) : null,
    commentaire: texte(entree.commentaire, "Le commentaire", 200),
  };
}

export class LieuxVoyageurs {
  private readonly logger = new Logger("Lieux des voyageurs");
  private readonly lieux = new Map<string, Stocke>();

  constructor(private readonly fichier: string | null = null, private readonly specialites: readonly string[] = []) {
    if (fichier) this.charger(fichier);
  }

  // ---------- lecture ----------

  // Lieux visibles, au format des autres lieux (source « utilisateur ») pour les listes et la carte.
  visibles(maintenant = new Date()): (Lieu & { lat: number; lon: number })[] {
    return [...this.lieux.values()].filter((s) => VISIBLES.includes(this.statut(s, maintenant))).map((s) => this.enLieu(s));
  }

  // null : pas un lieu de voyageurs.
  statutDe(id: string, maintenant = new Date()): StatutVoyageurs | null {
    const stocke = this.lieux.get(id);
    return stocke ? this.statut(stocke, maintenant) : null;
  }

  // null : pas un lieu de voyageurs. Les lieux effacés ou masqués restent introuvables pour l'appli.
  parId(id: string, maintenant = new Date()): (Lieu & { lat: number; lon: number }) | null {
    const stocke = this.lieux.get(id);
    if (!stocke || !VISIBLES.includes(this.statut(stocke, maintenant))) return null;
    return this.enLieu(stocke);
  }

  // Lieux de la même catégorie à moins de 50 m (voyageurs et sources extérieures), du plus proche au plus loin.
  doublons(point: { lat: number; lon: number }, categorie: Categorie, autres: Lieu[], maintenant = new Date()): Doublon[] {
    const candidats: Doublon[] = [];
    for (const lieu of [...autres, ...this.visibles(maintenant)]) {
      if (lieu.categorie !== categorie || lieu.lat === null || lieu.lon === null || lieu.statut !== "valide") continue;
      const distance = distanceM(point, { lat: lieu.lat, lon: lieu.lon });
      if (distance <= RAYON_DOUBLON_M) candidats.push({ id: lieu.id, nom: lieu.nom, distanceM: Math.round(distance), voyageurs: this.lieux.has(lieu.id) });
    }
    return candidats.sort((a, b) => a.distanceM - b.distanceM).slice(0, 5);
  }

  // Les preuves telles que la fiche les montre ; votes : « Encore là ? » du lieu (lieux-confirmations.ts).
  preuves(id: string, maintenant = new Date()): PreuvesVoyageurs | null {
    const stocke = this.lieux.get(id);
    if (!stocke) return null;
    const statut = this.statut(stocke, maintenant);
    const recent = ilYa(maintenant, JOURS_RECENT);
    const temoignages = Object.values(stocke.temoignages);
    const votes = Object.values(stocke.votes);
    const compte = <T extends string>(ids: readonly { id: T; libelle: string }[], champ: "etiquettes" | "moments") =>
      ids.map(({ id: cle, libelle }) => ({ id: cle, libelle, nb: temoignages.filter((t) => (t[champ] as string[]).includes(cle)).length }))
        .filter((item) => item.nb > 0).sort((a, b) => b.nb - a.nb);
    const prixVus = temoignages.filter((t) => t.prixF !== null).sort((a, b) => a.le.localeCompare(b.le));
    const valeurs = prixVus.map((t) => t.prixF!).sort((a, b) => a - b);
    return {
      statut,
      libelleStatut: LIBELLE_STATUT[statut],
      personnes: this.personnesPour(stocke).size,
      signalements: temoignages.length,
      encoreLaSemaine: votes.filter((v) => v.encoreLa && v.jour >= recent).length,
      plusLaSemaine: votes.filter((v) => !v.encoreLa && v.jour >= recent).length,
      trouvesAvecSira: votes.filter((v) => v.trouveAvecSira).length,
      derniereConfirmation: this.dernierePreuve(stocke),
      etiquettes: compte(ETIQUETTES, "etiquettes"),
      moments: compte(MOMENTS, "moments"),
      // Médiane : un prix farfelu ne déplace pas le résultat.
      prix: valeurs.length ? { medianeF: valeurs[Math.floor((valeurs.length - 1) / 2)], nb: valeurs.length, majLe: prixVus.at(-1)!.le } : null,
      // Sans nom ni numéro : « un voyageur SIRA », du plus récent au plus ancien.
      commentaires: temoignages.filter((t) => t.commentaire).sort((a, b) => b.le.localeCompare(a.le))
        .slice(0, MAX_COMMENTAIRES_AFFICHES).map((t) => ({ texte: t.commentaire!, le: t.le })),
    };
  }

  // ---------- écriture (voyageur connecté, jamais un identifiant choisi par l'appelant) ----------

  signaler(entree: EntreeSignalement, voyageurId: string, autres: Lieu[], maintenant = new Date()) {
    const categorie = entree.categorie as CategorieVoyageurs;
    if (!CATEGORIES_VOYAGEURS.includes(categorie)) {
      throw new BadRequestException(`Catégorie non signalable par les voyageurs : ${String(entree.categorie)}.`);
    }
    const lat = Number(entree.lat);
    const lon = Number(entree.lon ?? entree.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < GRAND_ABIDJAN.minLat || lat > GRAND_ABIDJAN.maxLat
      || lon < GRAND_ABIDJAN.minLon || lon > GRAND_ABIDJAN.maxLon) {
      throw new BadRequestException("La position du lieu doit se trouver dans le Grand Abidjan.");
    }
    const nom = texte(entree.nom, "Le nom", 60, 3)!;
    let specialite: string | null = null;
    if (entree.specialite !== undefined && entree.specialite !== null && entree.specialite !== "") {
      if (categorie !== "saveurs" || typeof entree.specialite !== "string" || !this.specialites.includes(entree.specialite) || entree.specialite === "autre") {
        throw new BadRequestException(`Spécialité inconnue : ${String(entree.specialite)}.`);
      }
      specialite = entree.specialite;
    }
    const repere = texte(entree.repere, "Le repère", 120);
    const premier = temoignage(entree, categorie, maintenant);
    // Un seul lieu pour plusieurs signalements : s'il en existe un tout près, l'appli demande d'abord
    // « C'est bien celui-ci ? » ; forcer: true après un « Non, c'est un autre lieu ».
    const doublons = this.doublons({ lat, lon }, categorie, autres, maintenant);
    const dejaLeSien = doublons.find((d) => d.voyageurs && this.lieux.get(d.id)?.temoignages[voyageurId]);
    if (dejaLeSien) throw new BadRequestException("Tu as déjà signalé ce lieu. Tu peux compléter ton avis depuis sa fiche.");
    if (doublons.length && entree.forcer !== true) return { cree: false as const, doublons };

    const stocke: Stocke = {
      id: `v_${randomUUID()}`, nom, categorie, specialite, lat, lon, repere, creeLe: maintenant.toISOString(),
      auteur: voyageurId, temoignages: { [voyageurId]: premier }, votes: {}, contenu: {}, retireParCommercant: false,
    };
    this.lieux.set(stocke.id, stocke);
    this.oublierLesPlusAnciens();
    this.enregistrer();
    return { cree: true as const, id: stocke.id, preuves: this.preuves(stocke.id, maintenant)! };
  }

  // « Moi aussi je l'ai vu » : la personne ajoute (ou remplace) son témoignage. Elle ne compte qu'une fois.
  completer(id: string, entree: EntreeSignalement, voyageurId: string, maintenant = new Date()) {
    const stocke = this.visible(id, maintenant);
    stocke.temoignages[voyageurId] = temoignage(entree, stocke.categorie, maintenant);
    this.enregistrer();
    return this.preuves(id, maintenant)!;
  }

  // « Encore là ? » sur un lieu de voyageurs : une réponse par personne et par jour, la dernière compte.
  // trouveAvecSira : la personne est arrivée là avec « Y aller » (position vérifiée par l'appelant).
  repondre(id: string, voyageurId: string, encoreLa: boolean, trouveAvecSira: boolean, maintenant = new Date()) {
    const stocke = this.visible(id, maintenant);
    // Même règle que lieux-confirmations.ts : « trouvé avec SIRA » reste acquis tant qu'elle ne répond pas « plus là ».
    const trouve = encoreLa ? (trouveAvecSira ? maintenant.toISOString() : stocke.votes[voyageurId]?.trouveAvecSira) : undefined;
    stocke.votes[voyageurId] = { jour: jourDe(maintenant), encoreLa, ...(trouve ? { trouveAvecSira: trouve } : {}) };
    this.enregistrer();
    return this.preuves(id, maintenant)!;
  }

  // « Signaler ce contenu ». Le commerçant qui demande à être retiré l'est tout de suite (sa vie privée passe
  // avant) ; sinon le lieu est masqué à partir de 3 personnes. L'équipe revoit les lieux masqués dans le fichier.
  signalerContenu(id: string, voyageurId: string, raison: unknown, maintenant = new Date()) {
    const stocke = this.lieux.get(id);
    if (!stocke) throw new NotFoundException("Lieu introuvable.");
    if (!RAISONS_CONTENU.includes(raison as RaisonContenu)) throw new BadRequestException(`Raison : ${RAISONS_CONTENU.join(", ")}.`);
    stocke.contenu[voyageurId] = { raison: raison as RaisonContenu, le: maintenant.toISOString() };
    if (raison === "commercant") {
      stocke.retireParCommercant = true;
      this.logger.warn(`Lieu ${id} (« ${stocke.nom} ») retiré à la demande du commerçant.`);
    }
    this.enregistrer();
    const statut = this.statut(stocke, maintenant);
    return { statut, masque: !VISIBLES.includes(statut) };
  }

  // ---------- règles ----------

  // Personnes qui disent que le lieu existe : celles qui l'ont signalé ou complété, et celles dont la dernière
  // réponse à « Encore là ? » est oui. Un compte = une voix, quoi qu'il fasse.
  private personnesPour(stocke: Stocke) {
    const pour = new Set([...Object.keys(stocke.temoignages), ...Object.entries(stocke.votes).filter(([, v]) => v.encoreLa).map(([id]) => id)]);
    // Sa dernière réponse compte : un auteur qui répond ensuite « plus là » ne compte plus pour.
    for (const [voyageur, vote] of Object.entries(stocke.votes)) if (!vote.encoreLa) pour.delete(voyageur);
    return pour;
  }

  // Date de la dernière preuve positive : un témoignage, un « encore là » ou un « trouvé avec SIRA ».
  private dernierePreuve(stocke: Stocke): string | null {
    const dates = [
      ...Object.values(stocke.temoignages).map((t) => t.le),
      ...Object.values(stocke.votes).filter((v) => v.encoreLa).map((v) => v.trouveAvecSira ?? `${v.jour}T12:00:00.000Z`),
    ].sort();
    return dates.at(-1) ?? null;
  }

  private statut(stocke: Stocke, maintenant: Date): StatutVoyageurs {
    const signalementsContenu = Object.values(stocke.contenu).filter((c) => c.raison !== "commercant").length;
    if (stocke.retireParCommercant || signalementsContenu >= MASQUE_CONTENU) return "masque";
    const recent = ilYa(maintenant, JOURS_RECENT);
    const votes = Object.values(stocke.votes);
    const ouiSemaine = votes.filter((v) => v.encoreLa && v.jour >= recent).length;
    const nonSemaine = votes.filter((v) => !v.encoreLa && v.jour >= recent).length;
    if (nonSemaine >= PLUS_LA_MIN && nonSemaine >= ouiSemaine + PLUS_LA_ECART) return "plus_la";
    const derniere = this.dernierePreuve(stocke);
    if (!derniere || derniere < ilYa(maintenant, JOURS_EFFACEMENT)) return "efface";
    // Vérifié récemment : quelqu'un d'autre que l'auteur a confirmé cette semaine (témoignage, oui ou arrivée).
    const autreRecemment = Object.entries(stocke.temoignages).some(([v, t]) => v !== stocke.auteur && t.le.slice(0, 10) >= recent)
      || Object.entries(stocke.votes).some(([v, vote]) => v !== stocke.auteur && vote.encoreLa && vote.jour >= recent);
    if (autreRecemment && ouiSemaine >= nonSemaine) return "verifie_recemment";
    if (this.personnesPour(stocke).size >= 2) return "confirme";
    return "signale";
  }

  private visible(id: string, maintenant: Date) {
    const stocke = this.lieux.get(id);
    if (!stocke || !VISIBLES.includes(this.statut(stocke, maintenant))) throw new NotFoundException("Lieu introuvable.");
    return stocke;
  }

  private enLieu(stocke: Stocke): Lieu & { lat: number; lon: number } {
    return {
      id: stocke.id, nom: stocke.nom, nom_normalise: normaliserNom(stocke.nom), categorie: stocke.categorie,
      specialite: stocke.specialite, lat: stocke.lat, lon: stocke.lon, commune: null, repere: stocke.repere,
      telephones: [], horaires: null, prix_indicatif: null, prix_maj_le: null, photo_url: null,
      sources: ["utilisateur"], nb_sources: 1, ids_externes: {}, confiance: null, statut: "valide",
      consentement_vendeur: false, consentement_photo: false, derniere_confirmation: this.dernierePreuve(stocke),
    };
  }

  // ---------- fichier ----------

  private oublierLesPlusAnciens() {
    if (this.lieux.size <= MAX_LIEUX) return;
    const tries = [...this.lieux.values()].sort((a, b) => (this.dernierePreuve(a) ?? "").localeCompare(this.dernierePreuve(b) ?? ""));
    for (const stocke of tries.slice(0, this.lieux.size - MAX_LIEUX)) this.lieux.delete(stocke.id);
  }

  private charger(fichier: string) {
    try {
      const contenu = JSON.parse(readFileSync(fichier, "utf-8")) as { lieux?: Stocke[] };
      for (const stocke of contenu.lieux ?? []) {
        if (stocke && typeof stocke.id === "string" && Number.isFinite(stocke.lat) && Number.isFinite(stocke.lon)
          && CATEGORIES_VOYAGEURS.includes(stocke.categorie)) {
          this.lieux.set(stocke.id, { ...stocke, temoignages: stocke.temoignages ?? {}, votes: stocke.votes ?? {}, contenu: stocke.contenu ?? {} });
        }
      }
      this.logger.log(`${this.lieux.size} lieu(x) signalé(s) par les voyageurs repris de ${fichier}.`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        this.logger.warn(`Fichier des lieux des voyageurs illisible (${fichier}), on repart de zéro : ${(error as Error).message}`);
      }
    }
  }

  private enregistrer() {
    if (!this.fichier) return;
    const temporaire = `${this.fichier}.${process.pid}.tmp`;
    try {
      mkdirSync(dirname(this.fichier), { recursive: true });
      writeFileSync(temporaire, JSON.stringify({ version: 1, lieux: [...this.lieux.values()] }), "utf-8");
      renameSync(temporaire, this.fichier); // tout ou rien : un arrêt brutal ne laisse jamais un demi-fichier
    } catch (error) {
      this.logger.error(`Lieux des voyageurs non enregistrés dans ${this.fichier} : ${(error as Error).message}`);
    }
  }
}
