import { Logger } from "@nestjs/common";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

// Réponses « Encore là ? » des voyageurs sur un lieu. Un voyageur compte une fois par lieu et par jour :
// répondre de nouveau le même jour remplace sa réponse. « Oui » met à jour la date de dernière confirmation.

export type ResumeConfirmations = { encoreLaOui: number; encoreLaNon: number; derniereConfirmation: string | null };
type Stocke = { oui: number; non: number; derniere: string | null; votes: Record<string, { jour: string; encoreLa: boolean }> };

// Où les réponses survivent à un redémarrage (même règle que les signalements, reports.service.ts).
// SIRA_LIEUX_CONFIRMATIONS_FILE la remplace ; « memoire » les garde seulement en mémoire.
export function confirmationsFile(env: Record<string, string | undefined> = process.env): string | null {
  const configure = env.SIRA_LIEUX_CONFIRMATIONS_FILE?.trim();
  if (configure === "memoire") return null;
  return configure || resolve(__dirname, "..", "..", "runtime", "lieux-confirmations.json");
}

export class LieuxConfirmations {
  private readonly logger = new Logger("Lieux");
  private readonly parLieu = new Map<string, Stocke>();

  constructor(private readonly fichier: string | null = null) {
    if (fichier) this.charger(fichier);
  }

  resume(lieuId: string): ResumeConfirmations {
    const stocke = this.parLieu.get(lieuId);
    return { encoreLaOui: stocke?.oui ?? 0, encoreLaNon: stocke?.non ?? 0, derniereConfirmation: stocke?.derniere ?? null };
  }

  repondre(lieuId: string, voyageurId: string, encoreLa: boolean, maintenant = new Date()): ResumeConfirmations {
    const jour = maintenant.toISOString().slice(0, 10);
    const stocke = this.parLieu.get(lieuId) ?? { oui: 0, non: 0, derniere: null, votes: {} };
    const precedent = stocke.votes[voyageurId];
    if (precedent?.jour === jour) {
      if (precedent.encoreLa) stocke.oui -= 1;
      else stocke.non -= 1;
    }
    if (encoreLa) {
      stocke.oui += 1;
      stocke.derniere = maintenant.toISOString();
    } else stocke.non += 1;
    stocke.votes[voyageurId] = { jour, encoreLa };
    this.parLieu.set(lieuId, stocke);
    this.enregistrer();
    return this.resume(lieuId);
  }

  private charger(fichier: string) {
    try {
      const contenu = JSON.parse(readFileSync(fichier, "utf-8")) as { lieux?: Record<string, Stocke> };
      for (const [id, stocke] of Object.entries(contenu.lieux ?? {})) {
        if (stocke && typeof stocke.oui === "number" && typeof stocke.non === "number") this.parLieu.set(id, { ...stocke, votes: stocke.votes ?? {} });
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        this.logger.warn(`Fichier des confirmations illisible (${fichier}), on repart de zéro : ${(error as Error).message}`);
      }
    }
  }

  private enregistrer() {
    if (!this.fichier) return;
    const temporaire = `${this.fichier}.${process.pid}.tmp`;
    try {
      mkdirSync(dirname(this.fichier), { recursive: true });
      writeFileSync(temporaire, JSON.stringify({ version: 1, lieux: Object.fromEntries(this.parLieu) }), "utf-8");
      renameSync(temporaire, this.fichier); // tout ou rien : un arrêt brutal ne laisse jamais un demi-fichier
    } catch (error) {
      this.logger.error(`Confirmations non enregistrées dans ${this.fichier} : ${(error as Error).message}`);
    }
  }
}
