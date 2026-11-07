import { Logger } from "@nestjs/common";
import type { JourneyRequest } from "../mobility/mobility.service";

// Résumé du meilleur trajet vers un lieu (celui que SIRA-MORE recommande), pour la liste sous la carte :
// « 9 min · 200 F · wôrô-wôrô + marche ». Rien n'est recalculé ici : durée, prix et modes viennent du moteur.
export type ResumeTrajet = { dureeMin: number; prixF: number | null; modes: string[] };
export type EtatTrajet =
  | { etat: "calcule"; trajet: ResumeTrajet }
  | { etat: "en_cours" } // pas fini dans le délai : continue en arrière-plan, prêt au prochain appel
  | { etat: "echec" }; // aucun trajet : l'appli affiche la distance à vol d'oiseau

// Ce dont ce service a besoin du calcul des trajets (MobilityService.buildJourneys).
export type CalculTrajets = {
  buildJourneys(request: JourneyRequest): Promise<{ journeys?: Array<{ id: string; duration: number; price: number | null; legs: Array<{ mode: string }> }>; recommended_id?: string | null }>;
};

// 10 minutes par défaut (l'heure de départ compte) ; plus long pour une démo préparée (npm run lieux:prechauffer).
const CACHE_MS = Number(process.env.SIRA_LIEUX_CACHE_TRAJETS_MIN || 10) * 60_000;
// Modes d'un trajet, dans l'ordre et sans doublon ; l'attente et les correspondances ne sont pas des modes.
const SANS_MODE = new Set(["wait", "transfer"]);

export function resumer(reponse: Awaited<ReturnType<CalculTrajets["buildJourneys"]>>): ResumeTrajet | null {
  const journeys = reponse.journeys ?? [];
  const meilleur = journeys.find((journey) => journey.id === reponse.recommended_id) ?? journeys[0];
  if (!meilleur) return null;
  const modes = [...new Set(meilleur.legs.map((leg) => leg.mode).filter((mode) => !SANS_MODE.has(mode)))];
  return { dureeMin: Math.round(meilleur.duration), prixF: meilleur.price ?? null, modes };
}

// Calculs un par un (le moteur n'en fait qu'un à la fois : 5 en parallèle prenaient 36 s, mesuré le 7 novembre),
// gardés 10 minutes par lieu et par zone d'environ 100 m autour du voyageur.
export class TrajetsLieux {
  private readonly logger = new Logger(TrajetsLieux.name);
  private readonly cache = new Map<string, { le: number; resultat: ResumeTrajet | null }>();
  private readonly enCours = new Map<string, Promise<ResumeTrajet | null>>();
  private file: Promise<unknown> = Promise.resolve();

  constructor(private readonly calcul: CalculTrajets, private readonly maintenant = () => Date.now()) {}

  // Résultat pour chaque lieu, dans le délai donné (le même pour tous, car les calculs se suivent).
  async resumes(origine: { lat: number; lon: number }, lieux: Array<{ id: string; nom: string; lat: number; lon: number }>, delaiMs: number) {
    const limite = new Promise<"delai">((resolve) => setTimeout(() => resolve("delai"), delaiMs).unref?.());
    return Promise.all(lieux.map(async (lieu): Promise<EtatTrajet> => {
      const resultat = await Promise.race([this.resume(origine, lieu), limite]);
      if (resultat === "delai") return { etat: "en_cours" };
      return resultat ? { etat: "calcule", trajet: resultat } : { etat: "echec" };
    }));
  }

  private resume(origine: { lat: number; lon: number }, lieu: { id: string; nom: string; lat: number; lon: number }): Promise<ResumeTrajet | null> {
    const cle = `${lieu.id}|${origine.lat.toFixed(3)}|${origine.lon.toFixed(3)}`;
    const garde = this.cache.get(cle);
    if (garde && this.maintenant() - garde.le < CACHE_MS) return Promise.resolve(garde.resultat);
    const deja = this.enCours.get(cle);
    if (deja) return deja;
    const travail = this.file.then(() => this.calcul.buildJourneys({
      origin: { lat: origine.lat, lon: origine.lon, name: "Ma position" },
      destination: { lat: lieu.lat, lon: lieu.lon, name: lieu.nom },
      preference: "balanced",
      constraints: { maxWalkingDistanceM: 1500, maxTransfers: 3, excludedModes: [] },
    })).then(resumer, (error: unknown) => {
      this.logger.warn(`Pas de trajet vers ${lieu.nom} : ${error instanceof Error ? error.message : error}`);
      return null;
    }).then((resultat) => {
      this.cache.set(cle, { le: this.maintenant(), resultat });
      this.enCours.delete(cle);
      if (this.cache.size > 2_000) this.cache.clear();
      return resultat;
    });
    this.enCours.set(cle, travail);
    this.file = travail;
    return travail;
  }
}
