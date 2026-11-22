// Le lieu vers lequel le voyageur est parti avec « Y aller » (fiche d'un lieu). À l'arrivée, le guidage lui
// demande « Tu l'as trouvé ? » : sa réponse compte comme « trouvé avec SIRA », la preuve la plus forte.
import type { Coordinates } from '@/lib/sira-api';
import { distanceM } from '@/lib/places';

export type LieuVise = { id: string; nom: string; coordonnees: Coordinates };

let vise: LieuVise | null = null;

export const viserLieu = (lieu: LieuVise) => { vise = lieu; };
export const oublierLieuVise = () => { vise = null; };

// Le lieu visé, si la destination du trajet est bien ce lieu (à moins de 100 m) ; sinon le trajet va ailleurs.
export function lieuViseVers(destination: Coordinates | null | undefined): LieuVise | null {
  if (!vise || !destination) return null;
  return distanceM(destination, vise.coordonnees) <= 100 ? vise : null;
}
