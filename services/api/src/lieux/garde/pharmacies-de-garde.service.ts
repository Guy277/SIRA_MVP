import { Inject, Injectable, Logger } from "@nestjs/common";
import { LieuxRepository, type Lieu } from "../lieux.repository";
import { cleNomPharmacie, normaliserNom, similarite } from "../texte";
import { MaxItSource } from "./maxit.source";
import { jourAbidjan, SOURCE_PHARMACIES_DE_GARDE, type OrigineGarde, type PharmacieDeGarde, type SourcePharmaciesDeGarde } from "./source";
import { UnppciGithubSource } from "./unppci-github.source";

const CACHE_MS = 6 * 60 * 60_000;
// Seuil sur la partie distinctive des noms (cleNomPharmacie). Mesuré sur la liste du 7 au 13 novembre 2026 :
// à 0,5, « Sainte Agnès » rejoignait « Sainte Agathe » et « Notre-Dame de la Nativité » « Notre-Dame de la Piété ».
const SIMILARITE_MIN = Number(process.env.PHARMACIE_GARDE_SIMILARITE_MIN || 0.6);

export type Rapprochement = "rapprochee" | "ambigue" | "non_rapprochee";
export type PharmacieDeGardeRapprochee = PharmacieDeGarde & { lieuId: string | null; rapprochement: Rapprochement };
export type SemaineDeGarde = {
  source: string;
  origine: OrigineGarde | "indisponible";
  debut: string | null;
  fin: string | null;
  pharmacies: PharmacieDeGardeRapprochee[];
};

// Source choisie par PHARMACIE_GARDE_SOURCE (unppci par défaut, maxit plus tard).
export function sourcePharmaciesDeGarde(nom = process.env.PHARMACIE_GARDE_SOURCE || "unppci"): SourcePharmaciesDeGarde {
  if (nom === "maxit") return new MaxItSource();
  if (nom !== "unppci") throw new Error(`PHARMACIE_GARDE_SOURCE inconnue : ${nom} (unppci | maxit)`);
  return new UnppciGithubSource();
}

// Une pharmacie de garde reçoit le badge d'un lieu de la carte si elle est dans la même commune et que
// leurs noms se ressemblent (>= seuil). Deux lieux à égalité : on ne sait pas lequel est de garde, pas de badge.
export function rapprocher(garde: PharmacieDeGarde, pharmacies: Lieu[], seuil = SIMILARITE_MIN): { lieuId: string | null; rapprochement: Rapprochement } {
  const commune = normaliserNom(garde.commune);
  const cle = cleNomPharmacie(garde.nom);
  const scores = pharmacies
    .filter((lieu) => normaliserNom(lieu.commune) === commune)
    .map((lieu) => ({ lieu, score: similarite(cle, cleNomPharmacie(lieu.nom)) }))
    .sort((a, b) => b.score - a.score);
  const [premier, second] = scores;
  if (!premier || premier.score < seuil) return { lieuId: null, rapprochement: "non_rapprochee" };
  if (second && second.score === premier.score) return { lieuId: null, rapprochement: "ambigue" };
  return { lieuId: premier.lieu.id, rapprochement: "rapprochee" };
}

@Injectable()
export class PharmaciesDeGardeService {
  private readonly logger = new Logger(PharmaciesDeGardeService.name);
  private cache?: { le: number; jour: string; semaine: SemaineDeGarde; lieuxDeGarde: Set<string> };

  constructor(
    @Inject(SOURCE_PHARMACIES_DE_GARDE) private readonly source: SourcePharmaciesDeGarde,
    private readonly lieux: LieuxRepository,
  ) {}

  // Semaine de garde rapprochée des lieux, gardée 6 heures (et jamais au-delà du jour où elle a été lue).
  async semaineCourante(maintenant = new Date()): Promise<SemaineDeGarde> {
    return (await this.lire(maintenant)).semaine;
  }

  // Identifiants des lieux de la carte qui sont de garde (badge « De garde »).
  async lieuxDeGarde(maintenant = new Date()): Promise<Set<string>> {
    return (await this.lire(maintenant)).lieuxDeGarde;
  }

  private async lire(maintenant: Date) {
    const jour = jourAbidjan(maintenant);
    if (this.cache && this.cache.jour === jour && maintenant.getTime() - this.cache.le < CACHE_MS) return this.cache;
    let lue: { pharmacies: PharmacieDeGarde[]; origine: OrigineGarde | "indisponible" };
    try {
      lue = await this.source.getSemaineCourante(maintenant);
    } catch (error) {
      this.logger.warn(`Pharmacies de garde indisponibles (${this.source.libelle}) : ${error instanceof Error ? error.message : error}`);
      lue = { pharmacies: [], origine: "indisponible" };
    }
    const pharmacies = this.lieux.tous().filter((lieu) => lieu.categorie === "pharmacie" && lieu.statut === "valide");
    const rapprochees = lue.pharmacies.map((garde) => ({ ...garde, ...rapprocher(garde, pharmacies) }));
    const semaine: SemaineDeGarde = {
      source: this.source.libelle,
      origine: lue.origine,
      debut: rapprochees[0]?.debutSemaine ?? null,
      fin: rapprochees[0]?.finSemaine ?? null,
      pharmacies: rapprochees,
    };
    const aPlacer = rapprochees.filter((p) => p.rapprochement !== "rapprochee");
    this.logger.log(`Pharmacies de garde du ${semaine.debut ?? "?"} au ${semaine.fin ?? "?"} (${semaine.origine}) : `
      + `${rapprochees.length - aPlacer.length} sur ${rapprochees.length} placées sur la carte.`);
    if (aPlacer.length) {
      // À placer à la main (CSV de l'équipe) : sans position, elles restent dans la liste avec « Appeler ».
      this.logger.log(`Non placées : ${aPlacer.map((p) => `${p.nom} (${p.commune}${p.rapprochement === "ambigue" ? ", plusieurs lieux possibles" : ""})`).join(" ; ")}`);
    }
    this.cache = { le: maintenant.getTime(), jour, semaine, lieuxDeGarde: new Set(rapprochees.flatMap((p) => (p.lieuId ? [p.lieuId] : []))) };
    return this.cache;
  }
}
