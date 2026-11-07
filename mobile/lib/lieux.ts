// Lieux du quotidien sur la carte d'accueil (rangée de catégories, comme Google Maps) : client de
// l'API /lieux et mise en forme. Les lieux, les trajets et leur ordre viennent du serveur ; ici on
// ne fait qu'afficher.
import { apiJson, type Coordinates } from '@/lib/sira-api';
import { formatDuration, formatPrice } from '@/lib/journey-format';

export type CategorieLieu = 'saveurs' | 'pharmacie' | 'point_orange' | 'marche' | 'ecole' | 'mosquee' | 'eglise' | 'sante';
export type IdCategorie = CategorieLieu | 'autour';
export type SousFiltre = { id: string; libelle: string };
// icone : nom MaterialCommunityIcons (@expo/vector-icons).
export type CategorieCarte = { id: IdCategorie; libelle: string; icone: string; sousFiltres: SousFiltre[] };

export type LieuProche = {
  id: string;
  nom: string;
  categorie: CategorieLieu;
  specialite: string | null;
  lat: number;
  lon: number;
  distanceM: number;
  commune: string | null;
  repere: string | null;
  nbSources: number;
  deGarde: boolean;
  derniereConfirmation: string | null;
};
export type Ouverture = 'ouvert' | 'ferme' | 'inconnu';
export type ResumeTrajet = { dureeMin: number; prixF: number | null; modes: string[] };
export type LieuClasse = LieuProche & { ouverture: Ouverture; duMoment: boolean } & (
  | { etat: 'calcule'; trajet: ResumeTrajet }
  | { etat: 'en_cours' }
  | { etat: 'echec' }
);
export type PharmacieSansPosition = { nom: string; commune: string; adresse: string | null; telephones: string[] };
type InfosGarde = { source: string; origine: string; debut: string | null; fin: string | null };

export type ReponseProches = { rayonM: number; elargi: boolean; total: number; lieux: LieuProche[]; attribution: string; garde?: InfosGarde; sansPosition?: PharmacieSansPosition[]; commune?: string | null };
export type ReponseClassement = Omit<ReponseProches, 'lieux'> & { lieux: LieuClasse[]; complet: boolean };

export type FicheLieu = {
  id: string;
  nom: string;
  categorie: CategorieLieu;
  specialite: string | null;
  lat: number | null;
  lon: number | null;
  commune: string | null;
  repere: string | null;
  telephones: string[];
  horaires: Record<string, string> | null;
  ouverture: Ouverture;
  prixIndicatif: number | null;
  prixMajLe: string | null;
  photoUrl: string | null;
  sources: string[];
  nbSources: number;
  deGarde: boolean;
  garde: { source: string; debut: string; fin: string; adresse: string | null } | null;
  encoreLaOui: number;
  encoreLaNon: number;
  derniereConfirmation: string | null;
  attribution: string;
};

export type RechercheLieux = { position: Coordinates; categorie: IdCategorie; specialite?: string | null; q?: string; rayonM?: number | null; garde?: boolean };

function parametres(recherche: RechercheLieux) {
  const params = new URLSearchParams({ lat: String(recherche.position.latitude), lng: String(recherche.position.longitude), categorie: recherche.categorie });
  if (recherche.specialite) params.set('specialite', recherche.specialite);
  if (recherche.q?.trim()) params.set('q', recherche.q.trim());
  if (recherche.rayonM) params.set('rayon', String(recherche.rayonM));
  if (recherche.garde) params.set('garde', 'true');
  return params.toString();
}

export const categoriesLieux = () => apiJson<{ categories: CategorieCarte[]; attribution: string }>('/lieux/categories');
export const lieuxProches = (recherche: RechercheLieux) => apiJson<ReponseProches>(`/lieux/proches?${parametres(recherche)}`);
// Les trajets se calculent un par un sur le serveur : jusqu'à ~20 s à froid, instantané ensuite (cache).
export const classementLieux = (recherche: RechercheLieux) => apiJson<ReponseClassement>(`/lieux/classement?${parametres(recherche)}`, { timeoutMs: 30_000 });
export const ficheLieu = (id: string) => apiJson<FicheLieu>(`/lieux/${encodeURIComponent(id)}`);
// « Encore là ? » : il faut être connecté (un voyageur compte une fois par jour).
export const repondreEncoreLa = (id: string, encoreLa: boolean) =>
  apiJson<{ encoreLaOui: number; encoreLaNon: number; derniereConfirmation: string | null }>(`/lieux/${encodeURIComponent(id)}/confirmation`, { method: 'POST', body: JSON.stringify({ encoreLa }) });

// ---------- Mise en forme ----------
const MODES: Record<string, string> = { walk: 'marche', sotra: 'bus', gbaka: 'gbaka', woro: 'wôrô-wôrô', taxi: 'taxi', boat: 'bateau-bus' };
export const libelleModes = (modes: string[]) => modes.map((mode) => MODES[mode] ?? mode).join(' + ');

// « 9 min · ≈ 200 F · marche + wôrô-wôrô » (durée, prix et modes du trajet que SIRA-MORE recommande).
export const resumeTrajet = (trajet: ResumeTrajet) =>
  [formatDuration(trajet.dureeMin), formatPrice(trajet.prixF), libelleModes(trajet.modes)].filter(Boolean).join(' · ');

export const distanceVolOiseau = (metres: number) =>
  metres < 1000 ? `${Math.round(metres / 10) * 10} m` : `${(metres / 1000).toFixed(1).replace('.', ',')} km`;

export const OUVERTURE: Record<Ouverture, string | null> = { ouvert: 'Ouvert', ferme: 'Fermé', inconnu: null };

// « Confirmé par 2 sources » : jamais présenté comme une fréquentation.
export const confirmeParSources = (nb: number) => `Confirmé par ${nb} source${nb > 1 ? 's' : ''}`;

const NOMS_SOURCES: Record<string, string> = { osm: 'OpenStreetMap', hotosm: 'HOT OSM', overture: 'Overture Maps', foursquare: 'Foursquare', uvci: 'enquête UVCI', presse: 'presse', equipe: 'équipe SIRA', utilisateur: 'voyageurs SIRA' };
export const nomsSources = (sources: string[]) => sources.map((source) => NOMS_SOURCES[source] ?? source).join(', ');

// « 07 novembre » à partir de « 2026-11-07 ».
export function dateCourte(iso: string) {
  const date = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', timeZone: 'UTC' });
}

export const LIBELLE_CATEGORIE: Record<CategorieLieu, string> = {
  saveurs: 'Saveurs du coin', pharmacie: 'Pharmacie', point_orange: 'Point Orange', marche: 'Marché',
  ecole: 'École', mosquee: 'Mosquée', eglise: 'Église', sante: 'Santé',
};
export const LIBELLE_SPECIALITE: Record<string, string> = {
  choukouya: 'Choukouya', banane_braisee: 'Banane braisée', alloco: 'Alloco', garba: 'Garba',
  gbofloto: 'Gbofloto', crecre: 'Crécré', placali: 'Placali', maquis: 'Maquis',
};

// Couleur des marqueurs par catégorie (orange SIRA pour la nourriture, vert pour la santé…).
export const COULEUR_CATEGORIE: Record<CategorieLieu, string> = {
  saveurs: '#F26522', pharmacie: '#16A34A', point_orange: '#FF7900', marche: '#A16207',
  ecole: '#2563EB', mosquee: '#0F766E', eglise: '#7C3AED', sante: '#DC2626',
};
export const ICONE_CATEGORIE: Record<CategorieLieu, string> = {
  saveurs: 'food', pharmacie: 'medical-bag', point_orange: 'cellphone', marche: 'basket',
  ecole: 'school', mosquee: 'mosque', eglise: 'church', sante: 'hospital-building',
};
