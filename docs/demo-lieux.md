# Démo « Lieux du quotidien » : 2 minutes depuis Abobo

Position de démo : Abobo (5.4410, -4.0090). Tout ce qui s'affiche vient des vraies données importées
(OpenStreetMap, Overture, tour de garde UNPPCI) et des vrais trajets de SIRA-MORE : rien n'est préparé à la main.
Les lieux et durées ci-dessous ont été relevés le 7 novembre 2026 ; ils peuvent changer avec un nouvel import
ou la semaine de garde : **répéter la démo la veille**.

## Avant (15 minutes)

1. Données à jour (la veille) :
   ```bash
   npm run data:lieux -- --fetch
   ```
2. La copie de secours des gardes couvre la semaine de la démo (`weeks` dans
   `services/api/secours/pharmacies-de-garde.json`) ; sinon la remplacer (`services/api/secours/LISEZMOI.md`).
3. Lancer la stack avec la position de démo et un cache long (PowerShell) :
   ```powershell
   $env:EXPO_PUBLIC_SIRA_POSITION_DEMO="5.4410,-4.0090"; $env:SIRA_LIEUX_CACHE_TRAJETS_MIN="180"; npm run dev:stack
   ```
   Si l'appli ne se place pas à Abobo, relancer Expo cache vidé (`npx expo start -c` dans `mobile/`) : la variable
   est lue à la construction de l'appli.
4. Calculer les listes à l'avance (moins de 3 heures avant, durée du cache ci-dessus) :
   ```bash
   npm run lieux:prechauffer
   ```
   Chaque ligne doit finir par « 5/5 trajets prêts ».
5. Ouvrir l'appli, se connecter avec le compte de démo, rester sur l'accueil.

## Déroulé

| Temps | Geste | À dire |
| --- | --- | --- |
| 0:00 | Accueil : la rangée de catégories au-dessus de la carte | « Max it dit *quoi* — une pharmacie de garde, un maquis. SIRA dit *comment y aller*. » |
| 0:10 | Toucher **Autour de moi** | « Tous les lieux autour de moi : 124 à moins de 1,5 km. » |
| 0:25 | Toucher **Saveurs du coin** | « La nourriture de rue et les maquis du quartier. Chaque lieu a déjà son trajet : durée, prix, mode. » |
| 0:35 | Puce **Maquis**, puis **Maquis restaurant** (~1,4 km) | « Je choisis un maquis un peu plus loin. » |
| 0:45 | Fiche : « Confirmé par 1 source : OpenStreetMap » ; toucher **Y aller** | « Pas de note ni d'avis : seulement d'où vient l'information. » |
| 0:55 | Propositions : **Coulé** (marche + gbaka, ~20 min, ~300 F) et **Suspendu** (taxi, ~11 min, ~900 F) ; Debout : « Pas d'option intermédiaire » | « Le moins cher ou le plus confortable : à moi de choisir. » |
| 1:10 | Toucher **Coulé**, puis le trajet : décomposition marche, attente, gbaka, prix | « Où monter, où descendre, combien payer. » |
| 1:25 | Retour à l'accueil ; toucher **Pharmacies de garde** | « Les pharmacies de garde de la semaine, d'après le tour de garde de l'UNPPCI. » |
| 1:35 | Montrer le badge **De garde**, puis **Pharmacie Saint François Xavier** (~1,1 km) | « La plus proche. Celles qu'on ne sait pas encore placer sur la carte restent joignables : Appeler. » |
| 1:45 | **Y aller** → propositions : **Coulé** (marche + wôrô-wôrô, ~13 min, ~200 F) | « Et SIRA m'y emmène, pour 200 F. » |
| 2:00 | Fin | « Demain, la liste vient de Max it ; SIRA reste le trajet. » |

## Mots à employer, et à éviter

- Dire « confirmé par N sources » (à Abobo, les lieux de la démo n'en ont qu'une : OpenStreetMap), jamais
  « les plus fréquentés » : aucune source ne mesure la fréquentation.
- Dire « tour de garde de l'UNPPCI (repris par un dépôt public) », pas « service officiel en direct ».
- Ne pas montrer les lieux à moins de 300 m : SIRA-MORE y propose un wôrô-wôrô ou un taxi au lieu de la marche
  (limite connue du moteur, voir `docs/lieux.md`).

## Si quelque chose lâche

- **« Calcul du trajet… » qui dure** : le cache a expiré. Attendre quelques secondes (la liste se complète seule)
  ou relancer `npm run lieux:prechauffer`.
- **Pas de réseau** : la liste de garde vient de la copie de secours (même semaine) ; les lieux sont lus sur le PC ;
  les trajets déjà calculés restent dans le cache. Les fonds de carte, eux, demandent Internet.
- **GPS** : sans position de démo, le panneau propose « Choisir un point sur la carte ».
