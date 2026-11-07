import { BadRequestException, Body, Controller, Get, Headers, HttpException, Param, Post, Query } from "@nestjs/common";
import { Travellers } from "../community/travellers";
import { RateLimiter } from "../rate-limit";
import { ClassementService } from "./classement.service";
import { PharmaciesDeGardeService } from "./garde/pharmacies-de-garde.service";
import { CATEGORIES, type Categorie } from "./lieux.repository";
import { LieuxService, SPECIALITES, type RechercheProches } from "./lieux.service";

// Même emprise que les signalements (reports.service.ts).
const GRAND_ABIDJAN = { minLat: 5.1, maxLat: 5.65, minLon: -4.35, maxLon: -3.7 };
// Une réponse « Encore là ? » change l'ordre des lieux pour les autres : un compte, un nombre limité de réponses.
const reponsesParVoyageur = new RateLimiter(Number(process.env.SIRA_LIEUX_CONFIRMATIONS_PAR_HEURE ?? 30), 60 * 60_000);

// Paramètres de GET /lieux/proches, vérifiés un par un (messages en français pour l'appli).
export function lireRecherche(query: Record<string, string | undefined>): RechercheProches {
  const lat = Number(query.lat);
  const lon = Number(query.lng ?? query.lon);
  if (!query.lat || !(query.lng ?? query.lon) || !Number.isFinite(lat) || !Number.isFinite(lon)
    || lat < GRAND_ABIDJAN.minLat || lat > GRAND_ABIDJAN.maxLat || lon < GRAND_ABIDJAN.minLon || lon > GRAND_ABIDJAN.maxLon) {
    throw new BadRequestException("La position (lat, lng) doit se trouver dans le Grand Abidjan.");
  }
  const categorie = query.categorie || "autour";
  if (categorie !== "autour" && !(CATEGORIES as readonly string[]).includes(categorie)) {
    throw new BadRequestException(`Catégorie inconnue : ${categorie}.`);
  }
  const specialite = query.specialite || null;
  if (specialite && (categorie !== "saveurs" || !SPECIALITES.includes(specialite))) {
    throw new BadRequestException(`Spécialité inconnue pour cette catégorie : ${specialite}.`);
  }
  let rayonM: number | null = null;
  if (query.rayon) {
    rayonM = Number(query.rayon);
    if (!Number.isInteger(rayonM) || rayonM < 100 || rayonM > 10_000) throw new BadRequestException("Le rayon va de 100 à 10 000 mètres.");
  }
  const q = (query.q ?? "").trim();
  if (q.length > 60) throw new BadRequestException("Recherche trop longue (60 caractères au plus).");
  if (query.garde && !["true", "false"].includes(query.garde)) throw new BadRequestException("garde vaut true ou false.");
  const garde = query.garde === "true";
  if (garde && categorie !== "pharmacie") throw new BadRequestException("garde=true ne concerne que categorie=pharmacie.");
  return { lat, lon, categorie: categorie as Categorie | "autour", specialite, q: q || null, rayonM, garde };
}

@Controller("lieux")
export class LieuxController {
  constructor(
    private readonly lieux: LieuxService,
    private readonly classementService: ClassementService,
    private readonly garde: PharmaciesDeGardeService,
    private readonly travellers: Travellers,
  ) {}

  // Rangée de la carte : catégories, libellés, icônes, sous-filtres ; et l'attribution des sources.
  @Get("categories")
  categories() {
    return this.lieux.categories();
  }

  // Lieux autour d'une position : ?lat=&lng=&categorie=&specialite=&q=&rayon=&garde=true
  @Get("proches")
  proches(@Query() query: Record<string, string | undefined>) {
    return this.lieux.proches(lireRecherche(query));
  }

  // Liste sous la carte : les 5 plus proches à vol d'oiseau, avec le résumé de leur vrai trajet, classés
  // (ouvert, moment de la journée, durée, sources, confirmation). Mêmes paramètres que /proches.
  // complet=false : des trajets se calculent encore, un nouvel appel les donnera.
  @Get("classement")
  classement(@Query() query: Record<string, string | undefined>) {
    return this.classementService.classement(lireRecherche(query));
  }

  // Semaine de garde : chaque pharmacie avec son lieu sur la carte (lieuId), ou sans position
  // (adresse et téléphones seulement, bouton « Appeler » dans l'appli).
  @Get("pharmacies-de-garde")
  pharmaciesDeGarde() {
    return this.garde.semaineCourante();
  }

  @Get(":id")
  fiche(@Param("id") id: string) {
    return this.lieux.fiche(id);
  }

  // « Encore là ? » : { encoreLa: true | false }, voyageur connecté.
  @Post(":id/confirmation")
  async confirmation(@Headers("authorization") authorization: string | undefined, @Param("id") id: string, @Body() corps: { encoreLa?: unknown }) {
    if (typeof corps?.encoreLa !== "boolean") throw new BadRequestException("encoreLa vaut true ou false.");
    const voyageurId = await this.travellers.idFrom(authorization);
    if (!reponsesParVoyageur.allow(voyageurId)) throw new HttpException("Tu as déjà beaucoup répondu. Réessaie plus tard.", 429);
    return this.lieux.repondreEncoreLa(id, voyageurId, corps.encoreLa);
  }
}
