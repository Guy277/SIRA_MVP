# Routing progressif avec PostGIS

## Flux actuel

`POST /api/v1/mobility/journeys` continue d'utiliser `transport-lines-normalized.geojson` pour construire le `TransportGraph`. Valhalla et OSRM servent les trajets routiers et pietons. Cette logique reste intacte.

La nouvelle couche ajoute deux preuves backend sans remplacer ce flux :

- `GET /api/v1/mobility/transport/stops/nearby?lat=...&lon=...&radiusM=...`
- `POST /api/v1/mobility/transport/segment`

## Couche PostGIS

`TransportRepository` interroge les tables `transport_gtfs_*` avec `ST_DWithin` et `ST_Distance`. La recherche spatiale est effectuee par PostgreSQL, avec l'index GIST existant sur les arrets.

Le segment suit les relations reelles :

`stop -> stop_times -> trip -> route`

Il ne retourne une ligne que si le meme trip dessert l'arret d'origine puis l'arret de destination dans cet ordre. La geometrie vient de `transport_gtfs_routes.geometry`, donc pas du GeoJSON.

## Endpoints

| Methode | Chemin | Role |
| --- | --- | --- |
| `GET` | `/api/v1/mobility/transport/stops/nearby?lat=&lon=&radiusM=` | Arrets proches via `ST_DWithin` / `ST_Distance` |
| `POST` | `/api/v1/mobility/transport/segment` | Premier segment `stop -> stop_times -> trip -> route` |

Repository NestJS : `TransportRepository` (`findNearbyStops`, `findFirstTransitSegment`).

Tests :

- unitaires mockes : `services/api/test/transport.repository.test.cjs`
- integration Docker : `tests/transport-postgis.integration.test.mjs`

## Exemples verifies (2026-09-09)

La recherche autour de `Plateau Gare Sud` (`lat=5.3196`, `lon=-4.0201`, rayon 500 m) retourne notamment :

- Cash Center Plateau, environ 123 m ;
- PTT Plateau, environ 208 m ;
- Marche Plateau, environ 259 m.

Un exemple verifie utilise `Au 19` (`5.2560547, -3.9968066`) vers `Agripac` (`5.4436702, -4.048408`) :

- route `r13499675`, `gbaka : Agripac ↔ Treichville` ;
- arret de depart `Au 19` ;
- arret d'arrivee `Agripac` ;
- 652 points de geometrie issus de PostGIS ;
- `dataStatus: historical` ;
- `fare: null`, `fareStatus: unknown`.

Un deuxieme exemple reel valide couvre la zone Plateau → Yopougon
(`Cash Center Plateau 5.3206, -4.0196` → `Terminus Ecole Gandhi 5.3250, -4.0598`) :

- route `209`, `SOTRA_BUS : Gare Sud ↔ Yopougon Gandhi` ;
- arret de depart `Cash Center Plateau` ;
- arret d'arrivee `Terminus Ecole Gandhi` (ou Pharmacie Chigatha selon sequence) ;
- 375 points de geometrie LineString depuis PostGIS (SRID 4326) ;
- `dataStatus: historical` ;
- `fare: 500`, `fareStatus: historical`.

Un troisieme exemple autour du Plateau (`Plateau Gare Sud` → `Cite Admin`) confirme un tarif historique de 200 FCFA avec `fareStatus: historical`.

Un couple de points sans ligne commune retourne explicitement `no_transport_path_found`. Aucun trajet n'est invente.

## Performance

La recherche spatiale des arrets utilise des index GIST fonctionnels sur `CAST(geometry AS geography)`,
autant pour `transport_gtfs_stops` que pour `transport_gtfs_routes`. L'EXPLAIN ANALYZE confirme un
`Index Scan using transport_gtfs_stops_geography_gix` (≈ 11 ms) plutot qu'un Seq Scan. Les 3 820 arrets
ne sont JAMAIS charges en memoire JavaScript avant le calcul de distance : `ST_DWithin` et
`ST_Distance` s'executent entierement cote PostgreSQL.

## Fallback et limites

Le routing principal conserve le GeoJSON comme fallback de compatibilite. Les nouveaux endpoints PostGIS signalent une indisponibilite par une erreur `503` plutot que de masquer une panne de base.

OSRM/Valhalla ne sont pas utilises pour construire ce premier segment transport. Ils restent responsables de la marche et de la voirie dans le pipeline existant. La prochaine etape est donc la composition `marche -> transport -> marche`, avec des connecteurs pietons verifies.

Les donnees restent historiques et non temps reel. Un tarif historique ne devient pas automatiquement actuel ou valide.
