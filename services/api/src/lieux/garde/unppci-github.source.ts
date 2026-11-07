import { Logger } from "@nestjs/common";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { jourAbidjan, type OrigineGarde, type PharmacieDeGarde, type SourcePharmaciesDeGarde } from "./source";

// Tour de garde de l'UNPPCI (PDF mensuel), mis en JSON chaque jour par le dépôt public zoumana84/pharmacie-de-garde-data.
// Format : { generatedAt, sources, weeks: [{ start, end }], pharmacies: [{ name, commune, zone, phones, address, weekStart }] }.
// Semaines du samedi au vendredi. Ce n'est pas un service de l'UNPPCI : la copie de secours prend le relais s'il échoue.
export const UNPPCI_URL = "https://raw.githubusercontent.com/zoumana84/pharmacie-de-garde-data/main/garde.json";

type FichierUnppci = {
  weeks?: Array<{ start: string; end: string }>;
  pharmacies?: Array<{ name?: string; commune?: string; zone?: string; phones?: string[]; address?: string; weekStart?: string }>;
};

// Copie embarquée (services/api/secours/), prise quand le réseau échoue.
export const fichierSecoursGarde = () =>
  process.env.PHARMACIE_GARDE_SECOURS || resolve(__dirname, "..", "..", "..", "secours", "pharmacies-de-garde.json");

// Pharmacies de la semaine qui contient le jour donné ; vide si la liste ne couvre pas ce jour.
export function semaineDuJour(fichier: FichierUnppci, jour: string): PharmacieDeGarde[] {
  const semaine = (fichier.weeks ?? []).find((week) => week.start <= jour && jour <= week.end);
  if (!semaine) return [];
  return (fichier.pharmacies ?? [])
    .filter((p) => p.weekStart === semaine.start && p.name && p.commune)
    .map((p) => ({
      nom: p.name!.trim(),
      commune: p.commune!.trim(),
      zone: p.zone?.trim() || null,
      adresse: p.address?.trim() || null,
      telephones: (p.phones ?? []).map((tel) => tel.trim()).filter(Boolean),
      debutSemaine: semaine.start,
      finSemaine: semaine.end,
    }));
}

export class UnppciGithubSource implements SourcePharmaciesDeGarde {
  readonly libelle = "tour de garde UNPPCI";
  private readonly logger = new Logger(UnppciGithubSource.name);

  constructor(
    private readonly url = process.env.PHARMACIE_GARDE_URL || UNPPCI_URL,
    private readonly secours = fichierSecoursGarde(),
    private readonly telecharger: (url: string) => Promise<unknown> = async (adresse) => {
      const response = await fetch(adresse, { signal: AbortSignal.timeout(8_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    },
  ) {}

  async getSemaineCourante(maintenant = new Date()): Promise<{ pharmacies: PharmacieDeGarde[]; origine: OrigineGarde }> {
    const jour = jourAbidjan(maintenant);
    try {
      const pharmacies = semaineDuJour((await this.telecharger(this.url)) as FichierUnppci, jour);
      if (pharmacies.length) return { pharmacies, origine: "reseau" };
      this.logger.warn(`Liste de garde en ligne sans la semaine du ${jour} : copie de secours.`);
    } catch (error) {
      this.logger.warn(`Liste de garde en ligne indisponible (${error instanceof Error ? error.message : error}) : copie de secours.`);
    }
    if (!existsSync(this.secours)) return { pharmacies: [], origine: "secours" };
    return { pharmacies: semaineDuJour(JSON.parse(readFileSync(this.secours, "utf8")) as FichierUnppci, jour), origine: "secours" };
  }
}
