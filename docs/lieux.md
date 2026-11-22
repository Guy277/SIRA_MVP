# Lieux du quotidien (catégories de la carte)

Sur la carte d'accueil, une rangée de boutons comme Google Maps : **Autour de moi**, **Saveurs du coin**,
**Pharmacies de garde**, **Points Orange**, **Marchés**, **Écoles**, **Mosquées**, **Églises**, **Santé**.
Le voyageur touche une catégorie, voit les lieux proches et le résumé du trajet pour les 5 premiers
(« 9 min · ≈ 200 F · marche + wôrô-wôrô »), ouvre la fiche, puis **Y aller** le mène aux écrans d'itinéraire
existants (propositions Coulé / Debout / Suspendu, puis décomposition).

SIRA est la couche « comment y aller » : la liste des lieux et des pharmacies de garde vient de sources
extérieures, chacune derrière un adaptateur (Max it pourra remplacer la source des gardes). Les voyageurs
peuvent aussi **signaler un lieu** absent des cartes (voir « Lieux signalés par les voyageurs »).

## Où se trouve quoi

| Partie | Fichiers |
| --- | --- |
| Import et fusion des sources | `scripts/import-lieux.mjs`, `scripts/lieux/fusion.mjs`, `scripts/lieux/categories.json` (correspondance des catégories) |
| Modèles de CSV (équipe, Points Orange) | `scripts/lieux/modeles/` |
| Table PostGIS (serveur) | `infra/database/init/004_lieux.sql` (pas encore testée sur une base) |
| API (module `lieux`) | `services/api/src/lieux/` |
| Pharmacies de garde | `services/api/src/lieux/garde/` ; copie de secours `services/api/secours/pharmacies-de-garde.json` |
| Lieux signalés par les voyageurs | `services/api/src/lieux/lieux-voyageurs.ts` (règles et seuils) ; appli `mobile/app/signaler-lieu.tsx`, `mobile/lib/lieu-vise.ts` |
| Ordre des Saveurs selon l'heure | `services/api/config/saveurs-moments.json` (proposition à valider par l'équipe) |
| Appli | `mobile/lib/lieux.ts`, `mobile/lib/use-lieux.ts`, `mobile/components/lieux-*.tsx`, `mobile/app/lieu.tsx`, `mobile/app/y-aller.tsx`, accueil `mobile/app/(tabs)/index.tsx` |
| Tests | `tests/lieux-fusion.test.mjs`, `services/api/test/lieux-*.test.cjs` (dont `lieux-voyageurs`) |

## Lancer

```bash
npm run data:lieux        # une fois : fabrique data/lieux/lieux.json (hors Git), ~1 min 30 la première fois
npm run dev:stack         # l'API lit data/lieux/lieux.json au démarrage
```

Sans `data/lieux/lieux.json`, l'API démarre quand même : les catégories restent vides et un message le dit.

## Importer chaque source

Tout est relu à chaque `npm run data:lieux` ; le même contenu redonne exactement les mêmes lieux et identifiants.
Emprise : Grand Abidjan (ouest -4.20, sud 5.20, est -3.80, nord 5.55), modifiable par `--bbox=ouest,sud,est,nord`.

| Source | Comment l'obtenir | Ce qui est gardé |
| --- | --- | --- |
| **OpenStreetMap** (pharmacies, santé, écoles, marchés, lieux de culte, restauration, Points Orange) | téléchargé tout seul par Overpass la première fois ; `npm run data:lieux -- --fetch` pour le rafraîchir | lieux nommés ; commune d'après les limites OSM des 13 communes |
| **Overture Maps** (restaurants, maquis, commerces) | une fois : `py -3 -m venv data/lieux/.venv-overture` puis `data/lieux/.venv-overture/Scripts/python -m pip install overturemaps` ; ensuite `npm run data:lieux -- --overture` | confiance ≥ 0,6, ni « fermé », catégories de `categories.json` |
| **HOTOSM (HDX)** | inutile : ce sont des extraits d'OpenStreetMap, déjà importé directement | — |
| **Foursquare** | pas importé (optionnel dans le cahier des charges) | — |
| **CSV de l'équipe** | copier `scripts/lieux/modeles/sira_lieux_depart.csv` dans `data/lieux/`, le remplir (mode d'emploi : `scripts/lieux/modeles/LISEZMOI.md`) | sans coordonnées ou « à vérifier » : en attente, jamais sur la carte ; photo seulement avec accord |
| **Points Orange** | même modèle, `data/lieux/points_orange.csv` | idem |

Fusion : deux lieux de même catégorie, à moins de 60 m, aux noms semblables (similarité de trigrammes ≥ 0,6,
calcul de `pg_trgm`) sont un seul lieu ; sources cumulées (« Confirmé par N sources »), nom le plus complet.
Rapport : `data/lieux/rapport-import.json` et la sortie de la commande.

## Pharmacies de garde

| Variable | Rôle |
| --- | --- |
| `PHARMACIE_GARDE_SOURCE` | `unppci` (défaut) : tour de garde UNPPCI, lu en ligne ; `maxit` : à brancher (`services/api/src/lieux/garde/maxit.source.ts`, TODO) |
| `PHARMACIE_GARDE_URL` | adresse du fichier en ligne (défaut : dépôt public `zoumana84/pharmacie-de-garde-data`, tiré du PDF mensuel de l'UNPPCI) |
| `PHARMACIE_GARDE_SIMILARITE_MIN` | ressemblance des noms pour placer une pharmacie de garde sur la carte (défaut 0,6) |

- Lecture côté serveur seulement, gardée 6 heures ; si la liste en ligne échoue ou ne couvre pas la semaine,
  la copie de secours prend le relais. **La remplacer chaque mois** (commande dans `services/api/secours/LISEZMOI.md`).
- Rapprochement avec les lieux : même commune et nom semblable, sans le mot « Pharmacie » ni les petits mots.
  Deux pharmacies de même nom dans une commune : pas de badge (on ne sait pas laquelle est de garde).
- Les pharmacies de garde non placées sont listées dans les logs de l'API (« Non placées : … ») : leur
  ajouter une position dans le CSV de l'équipe les fait apparaître sur la carte. Sans position, l'appli les
  affiche avec leur adresse et **Appeler**.

## Liste sous la carte : classement et trajets

`GET /api/v1/lieux/classement` : les 5 lieux les plus proches à vol d'oiseau, avec le trajet que SIRA-MORE
recommande, dans cet ordre : un lieu seulement « Signalé » par un voyageur toujours après les autres ; ouvert maintenant (puis horaires inconnus, puis fermé) ; spécialités du moment pour
« Saveurs du coin » ; trajet le plus court ; nombre de sources ; confirmation récente ; distance.
Aucun lieu ne remonte parce qu'il est partenaire, Points Orange compris. Jamais de note sur 5 : les lieux
signalés par les voyageurs portent des étiquettes factuelles et des commentaires courts, sans effet sur l'ordre.

Le moteur calcule un trajet à la fois (1 à 3 s chacun) : une liste prend jusqu'à 20 s la première fois, puis
s'affiche tout de suite (cache par zone d'environ 100 m).

| Variable | Rôle |
| --- | --- |
| `SIRA_LIEUX_DELAI_TRAJETS_MS` | délai de la liste (défaut 20 000) ; au-delà, « Calcul du trajet… » et l'appli redemande |
| `SIRA_LIEUX_CACHE_TRAJETS_MIN` | durée du cache des trajets (défaut 10 min) |

`npm run lieux:prechauffer` calcule à l'avance les listes de la position de démo (voir `docs/demo-lieux.md`).

## Routes de l'API (`/api/v1/lieux`)

| Route | Rôle |
| --- | --- |
| `GET /categories` | catégories, libellés, icônes, sous-filtres, attribution des sources |
| `GET /proches?lat=&lng=&categorie=&specialite=&q=&rayon=&garde=true` | points de la carte (30 au plus), 1 500 m élargis à 3 000 m s'il y a moins de 3 résultats |
| `GET /classement?…` (mêmes paramètres) | liste des 5 avec leur trajet ; `complet: false` tant que des trajets se calculent |
| `GET /pharmacies-de-garde` | semaine de garde, chaque pharmacie avec son lieu ou sans position |
| `GET /:id` | fiche |
| `POST /:id/confirmation` `{ "encoreLa": true, "arrivee"?: { "lat", "lng" } }` | « Encore là ? », voyageur connecté, une réponse par jour ; avec `arrivee` (à moins de 150 m) : « trouvé avec SIRA » |
| `POST /signalements` | « Signaler un lieu » (voir ci-dessous) ; `{ cree: false, doublons }` s'il existe un lieu semblable à moins de 50 m |
| `POST /:id/temoignage` | « Moi aussi je l'ai vu » : étiquettes, moments, prix vu, commentaire |
| `POST /:id/contenu` `{ "raison": "faux" \| "choquant" \| "publicite" \| "commercant" }` | « Signaler ce contenu » |

## Lieux signalés par les voyageurs

La vendeuse d'alloco du carrefour n'est sur aucune carte : un voyageur connecté la signale (« Tu connais un
bon coin qui manque ? » sous la liste), d'autres la confirment, et **Y aller** y mène. SIRA n'affirme jamais
qu'un tel lieu existe : la fiche montre les preuves et chacun juge.

- **Ce qu'on signale** : position (épingle à déplacer), catégorie (Saveurs, Points Orange, marchés, écoles,
  mosquées, églises ; **jamais pharmacie ni santé**, un faux « médicament par terre » mettrait des gens en
  danger), nom, repère, moments où il est ouvert, étiquettes (« Bien fait », « Copieux », « Pas cher »,
  « Propre », « Accueillant », « Rapide »), prix vu (Saveurs et marchés), commentaire de 200 caractères.
  Pas de lien ni d'adresse web. Pas de photo dans cette première version.
- **Un seul lieu pour plusieurs signalements** : même catégorie à moins de 50 m, l'appli demande « C'est bien
  celui-ci ? » ; oui, le témoignage s'ajoute au lieu existant (sur un lieu des sources extérieures, il compte
  comme « encore là ») ; non, un autre lieu est créé.
- **On compte des personnes, pas des clics** : un compte = une voix par lieu ; un nouveau témoignage de la même
  personne remplace l'ancien ; sa dernière réponse à « Encore là ? » compte.
- **Preuves affichées** : « 7 voyageurs le confirment · 4 « encore là » cette semaine · 1 « plus là » ·
  dernière confirmation le 20 novembre », les voyageurs arrivés avec SIRA, les étiquettes comptées, les moments,
  le prix médian et les commentaires, toujours sans nom (« un voyageur SIRA »).
- **« Tu l'as trouvé ? »** : arrivé avec **Y aller** depuis la fiche, le voyageur répond ; un oui à moins de
  150 m du lieu compte à part, comme « trouvé avec SIRA » (le plus fort : il y est vraiment allé). Plus loin
  (arrivée au toucher, GPS imprécis), le oui compte comme un simple « encore là ». Vaut aussi pour les autres lieux.

| Étiquette | Règle |
| --- | --- |
| Signalé | une seule personne dit qu'il existe ; après tous les autres dans la liste |
| Confirmé par plusieurs voyageurs | au moins 2 personnes distinctes |
| Vérifié récemment | quelqu'un d'autre que l'auteur l'a confirmé ces 7 derniers jours, sans plus de « plus là » que de « encore là » |
| Plus là (caché) | au moins 2 « plus là » cette semaine, et 2 de plus que les « encore là » |
| Effacé (caché) | aucune preuve positive depuis 30 jours |
| Masqué (caché) | 3 personnes ont signalé le contenu, ou le commerçant a demandé à être retiré (tout de suite) |

**Ces seuils sont une proposition** (`lieux-voyageurs.ts`), à valider par l'équipe. Les lieux masqués restent
dans `services/api/runtime/lieux-voyageurs.json` pour que l'équipe les revoie ; il n'y a pas encore d'écran
pour les rétablir.

| Variable | Rôle |
| --- | --- |
| `SIRA_LIEUX_VOYAGEURS_FILE` | fichier des lieux des voyageurs (défaut `services/api/runtime/lieux-voyageurs.json`) ; `memoire` : rien sur disque |
| `SIRA_LIEUX_SIGNALEMENTS_PAR_JOUR` | lieux et témoignages par compte et par jour (défaut 10) |
| `SIRA_LIEUX_CONTENUS_PAR_JOUR` | « Signaler ce contenu » par compte et par jour (défaut 20) |

## Appli

- **Position de démo** : `EXPO_PUBLIC_SIRA_POSITION_DEMO="5.4410,-4.0090"` (Abobo) au lancement d'Expo fixe la
  position du voyageur pour toute l'appli.
- **Lien pour Max it ou un autre service** : `siraproj://y-aller?lat=5.4327&lng=-4.0147&nom=Pharmacie%20Saint%20François%20Xavier`
  ouvre directement les itinéraires vers ce lieu (schéma `siraproj`, celui de `mobile/app.json`).
- GPS refusé : le panneau le dit et propose « Choisir un point sur la carte ».

## Tester

```bash
npm test                                   # dont tests/lieux-fusion.test.mjs
npm --prefix services/api test             # dont lieux-garde, lieux-api, lieux-classement
npx --prefix mobile tsc --noEmit -p mobile
```

## Limites connues

- **Lieux des voyageurs** : dans un fichier JSON comme les confirmations (pas encore dans la table PostGIS) ;
  un seul processus d'API. Plusieurs comptes sur un même téléphone ou des amis du vendeur peuvent gonfler les
  chiffres : « trouvé avec SIRA » et le compte par personne limitent ce risque, sans anti-fraude plus poussé.
  Le retrait « Je suis le commerçant » n'est pas vérifié : un concurrent pourrait l'utiliser (choix : la vie
  privée du commerçant passe avant ; l'équipe peut rétablir le lieu dans le fichier).

- **SIRA-MORE ne propose jamais la marche pour un lieu tout proche** : à 130 m, il conseille un wôrô-wôrô
  (10 min, 200 F) ou un taxi. Le résumé de la liste l'affiche tel quel ; la correction relève du moteur.
- Horaires connus pour ~3 % des lieux seulement : « ouvert maintenant » est le plus souvent « inconnu ».
- Spécialités de « Saveurs du coin » déduites du nom seul : beaucoup de « garba » (OSM compte des centaines de
  « Garbadrome »), rien pour banane braisée, gbofloto ou crécré sans le CSV de l'équipe.
- Liste de garde : dépôt tiers, pas un service de l'UNPPCI ; 56 pharmacies sur 117 placées sur la carte
  (semaine du 7 au 13 novembre 2026), les autres seulement avec « Appeler ».
- Lieux lus depuis un fichier ; la table PostGIS est prête mais pas branchée ni testée.
- Appli vérifiée dans le navigateur (format téléphone) ; pas encore sur un téléphone avec Expo Go.
