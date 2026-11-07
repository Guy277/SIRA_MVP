import { Logger } from "@nestjs/common";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const CATEGORIES = ["saveurs", "pharmacie", "point_orange", "marche", "ecole", "mosquee", "eglise", "sante"] as const;
export type Categorie = (typeof CATEGORIES)[number];
export type StatutLieu = "valide" | "en_attente" | "retire";

// Un lieu tel que produit par scripts/import-lieux.mjs (mêmes champs que la table PostGIS « lieux »).
export type Lieu = {
  id: string;
  nom: string;
  nom_normalise: string;
  categorie: Categorie;
  specialite: string | null;
  lat: number | null;
  lon: number | null;
  commune: string | null;
  repere: string | null;
  telephones: string[];
  horaires: Record<string, string> | null;
  prix_indicatif: number | null;
  prix_maj_le: string | null;
  photo_url: string | null;
  sources: string[];
  nb_sources: number;
  ids_externes: Record<string, string[]>;
  confiance: number | null;
  statut: StatutLieu;
  consentement_vendeur: boolean;
  consentement_photo: boolean;
  derniere_confirmation: string | null;
};

// Accès aux lieux : un fichier en local et pour la démo ; une version PostGIS (table « lieux »,
// infra/database/init/004_lieux.sql) pourra prendre la place sans changer le reste de l'API.
export abstract class LieuxRepository {
  abstract tous(): Lieu[];
  abstract parId(id: string): Lieu | null;
  abstract attribution(): string;
}

export const lieuxFile = () =>
  process.env.SIRA_LIEUX_FILE || join(process.env.SIRA_DATA_ROOT ?? join(process.cwd(), "data"), "lieux", "lieux.json");

export class FichierLieuxRepository extends LieuxRepository {
  private readonly logger = new Logger(FichierLieuxRepository.name);
  private charge?: { lieux: Lieu[]; parId: Map<string, Lieu>; attribution: string };

  constructor(private readonly chemin: string) {
    super();
  }

  private donnees() {
    if (this.charge) return this.charge;
    if (!existsSync(this.chemin)) {
      // Sans fichier, les catégories restent vides plutôt que de bloquer l'API : npm run data:lieux le fabrique.
      this.logger.warn(`Lieux absents (${this.chemin}) : lancer npm run data:lieux.`);
      this.charge = { lieux: [], parId: new Map(), attribution: "" };
      return this.charge;
    }
    const fichier = JSON.parse(readFileSync(this.chemin, "utf8")) as { lieux: Lieu[]; attribution?: string };
    this.charge = { lieux: fichier.lieux, parId: new Map(fichier.lieux.map((lieu) => [lieu.id, lieu])), attribution: fichier.attribution ?? "" };
    this.logger.log(`${fichier.lieux.length} lieux chargés (${this.chemin}).`);
    return this.charge;
  }

  tous() {
    return this.donnees().lieux;
  }

  parId(id: string) {
    return this.donnees().parId.get(id) ?? null;
  }

  attribution() {
    return this.donnees().attribution;
  }
}
