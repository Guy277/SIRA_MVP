import type { OrigineGarde, PharmacieDeGarde, SourcePharmaciesDeGarde } from "./source";

// Service « pharmacie de garde » de Max it (Orange), choisi par PHARMACIE_GARDE_SOURCE=maxit.
// TODO(Max it) : brancher l'API d'Orange quand ses accès et son format seront connus. Il suffit de
// remplir getSemaineCourante avec la même forme de réponse : le reste de SIRA (rapprochement avec les
// lieux, badge « De garde », fiche, « Y aller ») ne change pas.
export class MaxItSource implements SourcePharmaciesDeGarde {
  readonly libelle = "Max it";

  async getSemaineCourante(): Promise<{ pharmacies: PharmacieDeGarde[]; origine: OrigineGarde }> {
    throw new Error("Source Max it pas encore branchée : utiliser PHARMACIE_GARDE_SOURCE=unppci.");
  }
}
