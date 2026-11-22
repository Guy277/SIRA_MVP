import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PharmaciesDeGardeService, type PharmacieDeGardeRapprochee } from "./garde/pharmacies-de-garde.service";
import { ouvertureMaintenant } from "./horaires";
import { LieuxConfirmations } from "./lieux-confirmations";
import { LieuxRepository, type Categorie, type Lieu } from "./lieux.repository";
import {
  CATEGORIES_VOYAGEURS, ETIQUETTES, LIBELLE_STATUT, LieuxVoyageurs, MOMENTS, RAISONS_CONTENU, RAYON_ARRIVEE_M,
  type EntreeSignalement, type StatutVoyageurs,
} from "./lieux-voyageurs";
import { distanceM, normaliserNom } from "./texte";

// Rangée de la carte, dans l'ordre affiché. Icônes : MaterialCommunityIcons (@expo/vector-icons).
// Les sous-filtres de « Saveurs du coin » sont les clés de scripts/lieux/categories.json (« specialites »).
export const CATEGORIES_CARTE = [
  { id: "autour", libelle: "Autour de moi", icone: "crosshairs-gps", sousFiltres: [] },
  {
    id: "saveurs", libelle: "Saveurs du coin", icone: "food", sousFiltres: [
      { id: "choukouya", libelle: "Choukouya" }, { id: "banane_braisee", libelle: "Banane braisée" },
      { id: "alloco", libelle: "Alloco" }, { id: "garba", libelle: "Garba" }, { id: "gbofloto", libelle: "Gbofloto" },
      { id: "crecre", libelle: "Crécré" }, { id: "placali", libelle: "Placali" }, { id: "maquis", libelle: "Maquis" },
      { id: "autre", libelle: "Autre" },
    ],
  },
  {
    id: "pharmacie", libelle: "Pharmacies de garde", icone: "medical-bag", sousFiltres: [
      { id: "garde", libelle: "De garde" }, { id: "toutes", libelle: "Toutes les pharmacies" },
    ],
  },
  { id: "point_orange", libelle: "Points Orange", icone: "cellphone", sousFiltres: [] },
  { id: "marche", libelle: "Marchés", icone: "basket", sousFiltres: [] },
  { id: "ecole", libelle: "Écoles", icone: "school", sousFiltres: [] },
  { id: "mosquee", libelle: "Mosquées", icone: "mosque", sousFiltres: [] },
  { id: "eglise", libelle: "Églises", icone: "church", sousFiltres: [] },
  { id: "sante", libelle: "Santé", icone: "hospital-building", sousFiltres: [] },
] as const;
export const SPECIALITES = CATEGORIES_CARTE[1].sousFiltres.map((filtre) => filtre.id) as string[];

export const RAYON_PAR_DEFAUT_M = 1500;
export const RAYON_ELARGI_M = 3000;
export const MIN_RESULTATS = 3;
export const MAX_POINTS = 30;

export type RechercheProches = {
  lat: number;
  lon: number;
  categorie: Categorie | "autour";
  specialite?: string | null;
  q?: string | null;
  rayonM?: number | null; // donné par l'appli : respecté tel quel, sans élargissement
  garde?: boolean;
};

export type LieuProche = {
  id: string;
  nom: string;
  categorie: Categorie;
  specialite: string | null;
  lat: number;
  lon: number;
  distanceM: number;
  commune: string | null;
  repere: string | null;
  nbSources: number;
  deGarde: boolean;
  derniereConfirmation: string | null;
  // Lieu signalé par les voyageurs (sinon null) : où en sont les preuves.
  voyageurs: { statut: StatutVoyageurs; libelleStatut: string } | null;
};

@Injectable()
export class LieuxService {
  constructor(
    private readonly lieux: LieuxRepository,
    private readonly garde: PharmaciesDeGardeService,
    @Inject(LieuxConfirmations) private readonly confirmations: LieuxConfirmations,
    @Inject(LieuxVoyageurs) private readonly voyageurs: LieuxVoyageurs,
  ) {}

  categories() {
    return {
      categories: CATEGORIES_CARTE,
      attribution: this.lieux.attribution(),
      // Ce qu'un voyageur peut signaler, et comment le décrire (« Signaler un lieu »).
      signalement: { categories: CATEGORIES_VOYAGEURS, etiquettes: ETIQUETTES, moments: MOMENTS, raisonsContenu: RAISONS_CONTENU },
    };
  }

  // Lieux des sources extérieures et lieux visibles signalés par les voyageurs.
  private tous(): Lieu[] {
    return [...this.lieux.tous(), ...this.voyageurs.visibles()];
  }

  private trouver(id: string): Lieu | null {
    return this.lieux.parId(id) ?? this.voyageurs.parId(id);
  }

  // Lieux valides autour d'un point, du plus proche au plus loin (le classement final est fait à part).
  async proches(recherche: RechercheProches) {
    const deGarde = await this.garde.lieuxDeGarde();
    const mots = normaliserNom(recherche.q).split(" ").filter(Boolean);
    const candidats = this.tous().filter((lieu): lieu is Lieu & { lat: number; lon: number } =>
      lieu.statut === "valide" && lieu.lat !== null && lieu.lon !== null
      && (recherche.categorie === "autour" || lieu.categorie === recherche.categorie)
      && (!recherche.specialite || (recherche.specialite === "autre" ? lieu.specialite === null : lieu.specialite === recherche.specialite))
      && (!recherche.garde || deGarde.has(lieu.id))
      && mots.every((mot) => lieu.nom_normalise.includes(mot)));
    const avecDistance = candidats
      .map((lieu) => ({ lieu, distance: distanceM(recherche, lieu) }))
      .sort((a, b) => a.distance - b.distance || a.lieu.id.localeCompare(b.lieu.id));

    const choisi = recherche.rayonM ?? RAYON_PAR_DEFAUT_M;
    let rayonM = choisi;
    let dansRayon = avecDistance.filter((item) => item.distance <= rayonM);
    if (!recherche.rayonM && dansRayon.length < MIN_RESULTATS) {
      rayonM = RAYON_ELARGI_M;
      dansRayon = avecDistance.filter((item) => item.distance <= rayonM);
    }

    const reponse = {
      rayonM,
      elargi: rayonM !== choisi,
      total: dansRayon.length,
      lieux: dansRayon.slice(0, MAX_POINTS).map(({ lieu, distance }) => this.resume(lieu, distance, deGarde)),
      attribution: this.lieux.attribution(),
    };
    if (!recherche.garde) return reponse;
    // Pharmacies de garde sans position connue : dans la liste de la commune du voyageur, avec « Appeler ».
    const semaine = await this.garde.semaineCourante();
    const commune = this.communeProche(recherche);
    return {
      ...reponse,
      garde: { source: semaine.source, origine: semaine.origine, debut: semaine.debut, fin: semaine.fin },
      sansPosition: commune
        ? semaine.pharmacies.filter((p) => !p.lieuId && normaliserNom(p.commune) === normaliserNom(commune) && this.contientMots(p.nom, mots))
        : [],
      commune,
    };
  }

  async fiche(id: string) {
    const lieu = this.trouver(id);
    if (!lieu || lieu.statut === "retire") throw new NotFoundException("Lieu introuvable.");
    const semaine = lieu.categorie === "pharmacie" ? await this.garde.semaineCourante() : null;
    const garde: PharmacieDeGardeRapprochee | undefined = semaine?.pharmacies.find((p) => p.lieuId === lieu.id);
    const voyageurs = this.voyageurs.preuves(lieu.id);
    // Lieu de voyageurs : « Encore là ? » compté sur la semaine (personnes distinctes), avec ses autres preuves.
    const confirmations = voyageurs ? this.confirmationsVoyageurs(voyageurs) : this.confirmations.resume(lieu.id);
    return {
      id: lieu.id,
      nom: lieu.nom,
      categorie: lieu.categorie,
      specialite: lieu.specialite,
      lat: lieu.lat,
      lon: lieu.lon,
      commune: lieu.commune,
      repere: lieu.repere ?? garde?.adresse ?? null,
      telephones: [...new Set([...lieu.telephones, ...(garde?.telephones ?? [])])],
      horaires: lieu.horaires,
      ouverture: ouvertureMaintenant(lieu.horaires),
      prixIndicatif: lieu.prix_indicatif,
      prixMajLe: lieu.prix_maj_le,
      photoUrl: lieu.consentement_photo ? lieu.photo_url : null, // jamais de photo sans l'accord du vendeur
      sources: lieu.sources,
      nbSources: lieu.nb_sources,
      statut: lieu.statut,
      deGarde: Boolean(garde),
      garde: garde && semaine ? { source: semaine.source, debut: garde.debutSemaine, fin: garde.finSemaine, adresse: garde.adresse } : null,
      ...confirmations,
      derniereConfirmation: confirmations.derniereConfirmation ?? lieu.derniere_confirmation,
      voyageurs,
      attribution: this.lieux.attribution(),
    };
  }

  // « Encore là ? ». arrivee : position du voyageur arrivé avec « Y aller » ; à moins de 150 m du lieu, sa
  // réponse compte comme « trouvé avec SIRA ».
  repondreEncoreLa(id: string, voyageurId: string, encoreLa: boolean, arrivee: { lat: number; lon: number } | null = null) {
    const lieu = this.trouver(id);
    if (!lieu || lieu.statut !== "valide") throw new NotFoundException("Lieu introuvable.");
    if (arrivee && (lieu.lat === null || lieu.lon === null || distanceM(arrivee, { lat: lieu.lat, lon: lieu.lon }) > RAYON_ARRIVEE_M)) {
      throw new BadRequestException("Tu n'es pas encore assez près de ce lieu pour dire que tu l'as trouvé.");
    }
    if (this.voyageurs.statutDe(lieu.id)) {
      const preuves = this.voyageurs.repondre(lieu.id, voyageurId, encoreLa, Boolean(arrivee));
      return { ...this.confirmationsVoyageurs(preuves), voyageurs: preuves };
    }
    return this.confirmations.repondre(lieu.id, voyageurId, encoreLa, new Date(), Boolean(arrivee));
  }

  // « Signaler un lieu ». S'il existe déjà un lieu de la même catégorie tout près, rien n'est créé : la réponse
  // donne les doublons et l'appli demande « C'est bien celui-ci ? » (forcer: true ensuite pour un autre lieu).
  signaler(entree: EntreeSignalement, voyageurId: string) {
    return this.voyageurs.signaler(entree, voyageurId, this.lieux.tous());
  }

  // « Moi aussi je l'ai vu » : sur un lieu de voyageurs, ajoute le témoignage ; sur un lieu des sources
  // extérieures, compte comme « encore là ».
  temoigner(id: string, entree: EntreeSignalement, voyageurId: string) {
    if (this.voyageurs.statutDe(id)) return { voyageurs: this.voyageurs.completer(id, entree, voyageurId) };
    return this.repondreEncoreLa(id, voyageurId, true);
  }

  signalerContenu(id: string, voyageurId: string, raison: unknown) {
    if (!this.voyageurs.statutDe(id)) throw new NotFoundException("Seuls les lieux signalés par les voyageurs se signalent ici.");
    return this.voyageurs.signalerContenu(id, voyageurId, raison);
  }

  private confirmationsVoyageurs(preuves: NonNullable<ReturnType<LieuxVoyageurs["preuves"]>>) {
    return { encoreLaOui: preuves.encoreLaSemaine, encoreLaNon: preuves.plusLaSemaine, derniereConfirmation: preuves.derniereConfirmation, trouvesAvecSira: preuves.trouvesAvecSira };
  }

  private resume(lieu: Lieu & { lat: number; lon: number }, distance: number, deGarde: Set<string>): LieuProche {
    return {
      id: lieu.id,
      nom: lieu.nom,
      categorie: lieu.categorie,
      specialite: lieu.specialite,
      lat: lieu.lat,
      lon: lieu.lon,
      distanceM: Math.round(distance),
      commune: lieu.commune,
      repere: lieu.repere,
      nbSources: lieu.nb_sources,
      deGarde: deGarde.has(lieu.id),
      derniereConfirmation: this.confirmations.resume(lieu.id).derniereConfirmation ?? lieu.derniere_confirmation,
      voyageurs: this.resumeVoyageurs(lieu.id),
    };
  }

  private resumeVoyageurs(id: string) {
    const statut = this.voyageurs.statutDe(id);
    return statut ? { statut, libelleStatut: LIBELLE_STATUT[statut] } : null;
  }

  // Commune du voyageur : celle du lieu connu le plus proche de lui (les limites des communes restent
  // dans l'import). Suffisant pour choisir les pharmacies de garde à lister sans position.
  private communeProche(point: { lat: number; lon: number }): string | null {
    let meilleur: { commune: string; distance: number } | null = null;
    for (const lieu of this.lieux.tous()) {
      if (!lieu.commune || lieu.lat === null || lieu.lon === null) continue;
      const distance = distanceM(point, { lat: lieu.lat, lon: lieu.lon });
      if (!meilleur || distance < meilleur.distance) meilleur = { commune: lieu.commune, distance };
    }
    return meilleur && meilleur.distance <= RAYON_ELARGI_M ? meilleur.commune : null;
  }

  private contientMots(nom: string, mots: string[]) {
    const normalise = normaliserNom(nom);
    return mots.every((mot) => normalise.includes(mot));
  }
}
