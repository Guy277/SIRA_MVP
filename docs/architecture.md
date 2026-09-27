# Architecture technique de SIRA

Ce document regroupe les détails techniques. Pour démarrer, lire d'abord le [README](../README.md).

## Vue d'ensemble

```mermaid
flowchart LR
  U[Voyageur] --> MOB[Appli mobile Expo]
  U --> N[Nginx]
  N --> W[Site web]
  MOB --> A[API NestJS]
  N --> A
  A --> V[Valhalla]
  A --> P[(PostgreSQL + PostGIS)]
  A --> C[(Valkey)]
  A --> I[Moteur SIRA-MORE FastAPI]
  A --> CO[Comptes et tarifs FastAPI]
  A --> VO[Assistant vocal FastAPI]
  VO --> A
  CO --> P
  CO --> OR[API SMS Orange]
  A --> D[325 lignes data.gouv.ci]
  A <--> S[Socket.IO]
  MOB --> M[MapLibre / OpenStreetMap]
  A --> H[Photon]
```

## Services et ports

| Service | Port local | Rôle | Dossier |
| --- | ---: | --- | --- |
| Application mobile (web) | 8081 | écrans du voyageur (Expo) | `mobile/` |
| Site web | 3001 | version ordinateur, démos | `app/`, `components/` |
| API | 4000 | trajets, signalements, relais vers les comptes | `services/api/` |
| Moteur SIRA-MORE | 8000 | classement explicable des trajets | `services/ai/` |
| Comptes et tarifs | 8100 | connexion par code SMS, prix confirmés par les voyageurs | `services/community/` |
| Assistant vocal | 8200 | voix → texte → compréhension fr-CI → trajet → réponse vocale | `services/voice/` |
| Nginx | 8080 | point d'entrée de la stack Podman | `infra/nginx/` |
| Valhalla | 8002 | marche et route sur OpenStreetMap (profil `routing`) | `compose.yaml` |
| PostgreSQL/PostGIS | 5432 interne | données géospatiales | `infra/database/` |
| Valkey | 6379 interne | cache et état temps réel | `compose.yaml` |

## Endpoints principaux (API, préfixe `/api/v1`)

- `GET /health`
- `GET /mobility/search?q=plateau` : recherche de lieux (Photon)
- `GET /mobility/reverse?lat=…&lon=…` : nom du lieu le plus proche
- `POST /mobility/journeys` : calcul des trajets ; accepte `departureAt` et `avoid: [{ lat, lon, radiusM }]`
- `GET /reports`, `POST /reports` (`type`, `lat`, `lon`, `location`, `description`, `clientId`)
- `POST /reports/:id/confirm` et `POST /reports/:id/contest` (`clientId`)
- `POST /reports/impact` : incidents confirmés à moins de 150 m d'un trajet et retard estimé
- `POST /auth/request-otp`, `POST /auth/verify-otp`, `GET /auth/me`, `PATCH /users/me` : comptes (relayés vers le port 8100)
- `GET /fares?line_id=…`, `POST /fares/reports` : tarifs communautaires
- Socket.IO : namespace `/traffic`, événements `traffic.report.created` et `traffic.report.updated`
- Voix (relayées vers le port 8200) : `POST /voice/query` (audio multipart), `POST /voice/ask` et `POST /voice/understand` (texte), `POST /voice/tts`, `GET /voice/health`, page de test `GET /voice/page`
- Moteur : `POST /v1/recommendations/rank` ; documentation locale `http://localhost:8000/docs`

Exemple de calcul :

```json
{
  "origin": { "lat": 5.3467, "lon": -3.9951, "name": "Cocody Danga" },
  "destination": { "lat": 5.3196, "lon": -4.0201, "name": "Plateau Gare Sud" },
  "preference": "balanced",
  "constraints": { "maxWalkingDistanceM": 1500, "maxTransfers": 3, "excludedModes": [] }
}
```

## Moteur de trajets

- Graphe construit sur 325 lignes historiques (SOTRA, gbaka, wôrô-wôrô, bateaux-bus), environ 18 900 nœuds.
- Une correspondance entre deux lignes est admise jusqu'à 350 m, puis confirmée à pied par Valhalla.
- Une ligne fermée à l'heure demandée (horaires historiques) est exclue.
- Pour chaque tronçon, les autres lignes qui desservent les mêmes arrêts sont listées (« 15 / 203 »).
- Attente médiane = moitié de l'intervalle déclaré, P90 = 90 % ; durées et tarifs estimés avec leur méthode, leur P90 et leur confiance.
- SIRA-MORE : contraintes strictes, frontière de Pareto, diversité, score, explications, puis catégories **Coulé** (moins cher), **Debout** (juste milieu) et **Suspendu** (confort).
- SIRA-MORE est obligatoire : si le moteur est arrêté, l'API renvoie une erreur explicite. Secours volontaire seulement avec `SIRA_ALLOW_RANKING_FALLBACK=true`.
- Sans Valhalla, les accès et correspondances à pied ne peuvent pas être confirmés ; pour des essais seulement, `SIRA_ALLOW_ESTIMATED_WALK_CONNECTORS=true`.

## Données

- Source : `https://data.gouv.ci/datasets/abidjantransport-lignes` (licence ouverte), mise à jour d'octobre 2021.
- `data/processed/` : données prêtes pour le moteur ; `data/raw/` : source brute ; `data/pilot/` : jeux de non-régression ; `data/gtfs-demo/` : GTFS pilote.
- Horaires, attentes, durées et tarifs restent des estimations à valider avec les opérateurs.
- Voir aussi [l'audit des données](PHASE1_DATA_AUDIT.md), [le routage PostGIS](routing-postgis.md) et [l'import PostGIS](transport-postgis.md).

## Stack complète avec Podman

```bash
podman compose up --build                      # interface, API, moteur, PostGIS, Valkey, Nginx → http://localhost:8080
podman compose --profile routing up --build    # + Valhalla (télécharge l'OSM de Côte d'Ivoire)
npm run test:routing:live                      # contrôle réel des accès piétons une fois Valhalla prêt
```

## Sécurité

- Aucun secret dans le dépôt : `.env` n'est pas versionné, `.env.example` ne contient que les noms de variables.
- `COMMUNITY_JWT_SECRET` est obligatoire en production et le mode démo SMS y est refusé.
- Les branches `AKA` et `BANATOU` contiennent dans leur historique des identifiants et des données personnelles : les clés doivent être régénérées.

## Limites connues du MVP

- Signalements gardés en mémoire par l'API (perdus au redémarrage).
- Retards liés aux incidents : valeurs-types par catégorie.
- Données ouvertes de 2021 : le transport informel demande une collecte terrain.
- OpenFreeMap et le Valhalla public n'ont pas de garantie de service : prévoir un hébergement pour la production.

## Attributions

Carte MapLibre GL et OpenFreeMap, données OpenStreetMap, routage Valhalla, transports modélisés selon GTFS Schedule.
