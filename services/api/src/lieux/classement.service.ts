import { Inject, Injectable, Logger } from "@nestjs/common";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ouvertureMaintenant, type Ouverture } from "./horaires";
import { LieuxRepository } from "./lieux.repository";
import { LieuxService, type LieuProche, type RechercheProches } from "./lieux.service";
import { TrajetsLieux, type EtatTrajet } from "./trajets-lieux";

export const NB_CLASSES = 5;
// Délai de la liste : au-delà, les trajets pas encore calculés arrivent au prochain appel (cache).
const DELAI_TRAJETS_MS = Number(process.env.SIRA_LIEUX_DELAI_TRAJETS_MS || 20_000);

export type Moment = { nom: string; de: string; a: string; specialites: string[] };
export type LieuClasse = LieuProche & { ouverture: Ouverture; duMoment: boolean } & EtatTrajet;

// Réglage modifiable (services/api/config/saveurs-moments.json) : spécialités mises en tête selon l'heure.
export const fichierMoments = () => process.env.SIRA_SAVEURS_MOMENTS || resolve(__dirname, "..", "..", "config", "saveurs-moments.json");
export function lireMoments(fichier = fichierMoments()): Moment[] {
  if (!existsSync(fichier)) return [];
  return (JSON.parse(readFileSync(fichier, "utf8")) as { moments?: Moment[] }).moments ?? [];
}

// Spécialités du moment (heure d'Abidjan = UTC).
export function specialitesDuMoment(moments: Moment[], maintenant: Date): Set<string> {
  const heure = maintenant.toISOString().slice(11, 16);
  return new Set(moments.filter((m) => m.de <= heure && heure <= m.a).flatMap((m) => m.specialites));
}

const RANG_OUVERTURE: Record<Ouverture, number> = { ouvert: 0, inconnu: 1, ferme: 2 };

// Ordre de la liste, sans aucun avantage commercial (aucun lieu ne remonte parce qu'il est partenaire) :
// 1. ouvert maintenant, puis horaires inconnus, puis fermé ;
// 2. pour « Saveurs du coin », les spécialités du moment d'abord ;
// 3. trajet le plus court (un lieu sans trajet calculé vient après, par distance) ;
// 4. confirmé par le plus de sources ; 5. confirmé le plus récemment ; enfin la distance.
export function classer(lieux: LieuClasse[]): LieuClasse[] {
  const duree = (lieu: LieuClasse) => (lieu.etat === "calcule" ? lieu.trajet.dureeMin : Number.POSITIVE_INFINITY);
  return [...lieux].sort((a, b) =>
    RANG_OUVERTURE[a.ouverture] - RANG_OUVERTURE[b.ouverture]
    || Number(b.duMoment) - Number(a.duMoment)
    || duree(a) - duree(b)
    || b.nbSources - a.nbSources
    || (b.derniereConfirmation ?? "").localeCompare(a.derniereConfirmation ?? "")
    || a.distanceM - b.distanceM);
}

@Injectable()
export class ClassementService {
  private readonly logger = new Logger(ClassementService.name);

  constructor(
    private readonly lieux: LieuxService,
    private readonly depot: LieuxRepository,
    @Inject(TrajetsLieux) private readonly trajets: TrajetsLieux,
    @Inject("MOMENTS_SAVEURS") private readonly moments: Moment[],
  ) {}

  // Les 5 lieux les plus proches à vol d'oiseau, avec leur vrai trajet, dans l'ordre de classer().
  async classement(recherche: RechercheProches, maintenant = new Date()) {
    const proches = await this.lieux.proches(recherche);
    const retenus = proches.lieux.slice(0, NB_CLASSES);
    const etats = await this.trajets.resumes(recherche, retenus, DELAI_TRAJETS_MS);
    const duMoment = recherche.categorie === "saveurs" ? specialitesDuMoment(this.moments, maintenant) : new Set<string>();
    const lieux = classer(retenus.map((lieu, i) => ({
      ...lieu,
      ouverture: ouvertureMaintenant(this.depot.parId(lieu.id)?.horaires, maintenant),
      duMoment: lieu.specialite !== null && duMoment.has(lieu.specialite),
      ...etats[i],
    })));
    const { lieux: _points, ...reste } = proches;
    return { ...reste, lieux, complet: lieux.every((lieu) => lieu.etat !== "en_cours") };
  }
}
