// Pharmacies de garde : une interface, plusieurs sources interchangeables (variable PHARMACIE_GARDE_SOURCE).
// SIRA dit comment y aller ; la liste elle-même vient d'ailleurs (tour de garde UNPPCI aujourd'hui, Max it demain).

export type PharmacieDeGarde = {
  nom: string;
  commune: string;
  zone: string | null;
  adresse: string | null;
  telephones: string[];
  debutSemaine: string; // AAAA-MM-JJ
  finSemaine: string;
};

// D'où vient la liste servie : du réseau, ou de la copie de secours embarquée quand le réseau échoue.
export type OrigineGarde = "reseau" | "secours";

export interface SourcePharmaciesDeGarde {
  // Libellé affiché dans la fiche (« Source : … »).
  readonly libelle: string;
  // Pharmacies de garde de la semaine qui contient « maintenant » (fuseau d'Abidjan = UTC).
  getSemaineCourante(maintenant?: Date): Promise<{ pharmacies: PharmacieDeGarde[]; origine: OrigineGarde }>;
}

export const SOURCE_PHARMACIES_DE_GARDE = Symbol("SOURCE_PHARMACIES_DE_GARDE");

// Date du jour à Abidjan (UTC toute l'année, sans heure d'été).
export const jourAbidjan = (maintenant: Date) => maintenant.toISOString().slice(0, 10);
