// État de la rangée de catégories de l'accueil : catégorie active, sous-filtre, recherche par nom,
// points de la carte (/lieux/proches) et liste des 5 lieux classés avec leur trajet (/lieux/classement).
import { useEffect, useRef, useState } from 'react';
import type { Coordinates } from '@/lib/sira-api';
import { categoriesLieux, classementLieux, lieuxProches, type CategorieCarte, type ReponseClassement, type ReponseProches, type RechercheLieux } from '@/lib/lieux';

export type EtatLieux = 'chargement' | 'pret' | 'erreur';

// Les trajets encore « en cours » sur le serveur sont redemandés toutes les 4 s, 6 fois au plus.
const RELANCE_MS = 4_000;
const RELANCES_MAX = 6;
const ATTENTE_RECHERCHE_MS = 400;
export const RAYON_ELARGI_M = 5_000;

export function useCategoriesLieux() {
  const [categories, setCategories] = useState<CategorieCarte[]>([]);
  const [attribution, setAttribution] = useState('');
  useEffect(() => {
    let annule = false;
    categoriesLieux()
      .then((reponse) => { if (!annule) { setCategories(reponse.categories); setAttribution(reponse.attribution); } })
      .catch(() => { /* API injoignable : pas de rangée de catégories, l'accueil reste comme avant */ });
    return () => { annule = true; };
  }, []);
  return { categories, attribution };
}

// Filtres d'une catégorie ; ils reviennent à leur valeur par défaut quand la catégorie change
// (« De garde » pour les pharmacies), sans qu'une requête parte avec ceux de l'ancienne.
type Filtres = { pour: string | null; sousFiltre: string | null; recherche: string; q: string; rayonM: number | null };
const parDefaut = (id: string | null): Filtres => ({ pour: id, sousFiltre: id === 'pharmacie' ? 'garde' : null, recherche: '', q: '', rayonM: null });

export function useLieux(categorie: CategorieCarte | null, position: Coordinates | null) {
  const id = categorie?.id ?? null;
  const [choix, setChoix] = useState<Filtres>(() => parDefaut(id));
  const filtres = choix.pour === id ? choix : parDefaut(id);
  const changer = (champs: Partial<Filtres>) => setChoix((avant) => ({ ...(avant.pour === id ? avant : parDefaut(id)), ...champs }));

  const [essai, setEssai] = useState(0);
  // Chaque réponse est rangée avec la demande qui l'a produite : une réponse d'une ancienne
  // catégorie ou d'un ancien filtre n'est jamais affichée.
  const [reponses, setReponses] = useState<{ cle: string; points?: ReponseProches; classement?: ReponseClassement; erreur?: boolean }>({ cle: '' });
  const demandeCourante = useRef('');

  // La recherche par nom part quand on s'arrête de taper.
  const { recherche } = filtres;
  useEffect(() => {
    const minuterie = setTimeout(() => setChoix((avant) => (avant.pour === id && avant.q !== avant.recherche ? { ...avant, q: avant.recherche } : avant)), ATTENTE_RECHERCHE_MS);
    return () => clearTimeout(minuterie);
  }, [id, recherche]);

  const { sousFiltre, q, rayonM } = filtres;
  const lat = position?.latitude;
  const lon = position?.longitude;
  const cle = id && lat !== undefined && lon !== undefined ? JSON.stringify([id, lat, lon, sousFiltre, q, rayonM, essai]) : '';
  useEffect(() => {
    demandeCourante.current = cle;
    if (!id || lat === undefined || lon === undefined) return;
    const requete: RechercheLieux = {
      position: { latitude: lat, longitude: lon },
      categorie: id,
      specialite: id === 'saveurs' ? sousFiltre : null,
      garde: id === 'pharmacie' && sousFiltre === 'garde',
      q,
      rayonM,
    };
    const ranger = (champs: Omit<typeof reponses, 'cle'>) => {
      if (demandeCourante.current !== cle) return;
      setReponses((avant) => ({ ...(avant.cle === cle ? avant : { cle }), ...champs }));
    };
    let minuterie: ReturnType<typeof setTimeout> | undefined;
    lieuxProches(requete).then((points) => ranger({ points }), () => ranger({ erreur: true }));
    const classer = (relances: number) => classementLieux(requete)
      .then((classement) => {
        ranger({ classement });
        if (!classement.complet && relances < RELANCES_MAX && demandeCourante.current === cle) {
          minuterie = setTimeout(() => void classer(relances + 1), RELANCE_MS);
        }
      })
      .catch(() => { /* la carte et la distance restent affichées ; seul le résumé du trajet manque */ });
    void classer(0);
    return () => { if (minuterie) clearTimeout(minuterie); };
  }, [cle, id, lat, lon, sousFiltre, q, rayonM]);

  const courantes = reponses.cle === cle ? reponses : { cle };
  const etat: EtatLieux = courantes.erreur ? 'erreur' : courantes.points ? 'pret' : 'chargement';

  return {
    sousFiltre,
    choisirSousFiltre: (valeur: string | null) => changer({ sousFiltre: valeur }),
    recherche,
    chercher: (texte: string) => changer({ recherche: texte }),
    elargi: rayonM !== null,
    elargir: () => changer({ rayonM: RAYON_ELARGI_M }),
    points: courantes.points ?? null,
    classement: courantes.classement ?? null,
    etat,
    reessayer: () => setEssai((n) => n + 1),
  };
}
