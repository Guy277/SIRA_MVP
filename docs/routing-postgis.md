# Routing progressif avec PostGIS

## Flux actuel

`POST /api/v1/mobility/journeys` continue d'utiliser `transport-lines-normalized.geojson` pour construire le `TransportGraph`. Valhalla et OSRM servent les trajets routiers et pietons. Cette logique reste intacte.

La nouvelle couche ajoute des preuves backend sans remplacer ce flux :

- `GET /api/v1/mobility/transport/stops/nearby?lat=...&lon=...&radiusM=...`
- `POST /api/v1/mobility/transport/segment`
- `POST /api/v1/mobility/transport/walk`
- `POST /api/v1/mobility/transport/walk-access`
- `POST /api/v1/mobility/transport/walk-egress`
- `POST /api/v1/mobility/transport/multimodal`

## Couche PostGIS

`TransportRepository` interroge les tables `transport_gtfs_*` avec `ST_DWithin` et `ST_Distance`. La recherche spatiale est effectuee par PostgreSQL, avec l'index GIST existant sur les arrets.

Le segment suit les relations reelles :

`stop -> stop_times -> trip -> route`

Il ne retourne une ligne que si le meme trip dessert l'arret d'origine puis l'arret de destination dans cet ordre. La geometrie est extraite du shape GTFS (`transport_gtfs_shapes.geometry`) lorsque le trip possède un `shape_id`. Elle est clippee via `ST_LineSubstring` entre les projections des deux arrets sur ce shape.

## Endpoints

| Methode | Chemin | Role |
| --- | --- | --- |
| `GET` | `/api/v1/mobility/transport/stops/nearby?lat=&lon=&radiusM=` | Arrets proches via `ST_DWithin` / `ST_Distance` |
| `POST` | `/api/v1/mobility/transport/segment` | Premier segment `stop -> stop_times -> trip -> route` |
| `POST` | `/api/v1/mobility/transport/walk` | Routing piéton Valhalla entre deux points |
| `POST` | `/api/v1/mobility/transport/walk-access` | Meilleur arrêt accessible à pied depuis une origine |
| `POST` | `/api/v1/mobility/transport/walk-egress` | Marche d'un arrêt PostGIS vers une destination |
| `POST` | `/api/v1/mobility/transport/multimodal` | Composition `marche + transport PostGIS + marche` (1 candidat) |
| `POST` | `/api/v1/mobility/transport/candidates` | Génération de N candidats multipse `marche + transport + marche` |

Repository NestJS : `TransportRepository` (`findNearbyStops`, `findFirstTransitSegment`, `findTransitSegments`).

Tests :

- unitaires mockes : `services/api/test/transport.repository.test.cjs`
- unitaires mockes : `services/api/test/mobility.test.cjs`
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

## Intégration dans `/mobility/journeys`

`POST /api/v1/mobility/journeys` tente désormais en priorité un trajet multimodal PostGIS via `buildPostgisMultimodalJourney()` :

1. **Accès piéton** : `findAccessibleStop()` + Valhalla ;
2. **Segment transport** : `findFirstTransitSegment()` avec géométrie clippée via `ST_LineSubstring` sur `transport_gtfs_shapes.geometry`, puis validation des extrémités ;
3. **Sortie piétonne** : `findEgressWalk()` + Valhalla.

Si PostGIS est indisponible, ou ne trouve aucun arrêt / segment / sortie valide, le moteur bascule automatiquement vers le routing GeoJSON historique (`local_geojson`). Le fallback est explicite dans la réponse :

```json
{
  "source": "postgis_multimodal"
}
```

ou :

```json
{
  "source": "local_geojson"
}
```

Le GeoJSON historique n'est jamais supprimé. Le `TransportGraph` et le fallback restent fonctionnels.

## Géométrie du segment transport

La géométrie du leg transport est extraite du shape GTFS (`transport_gtfs_shapes.geometry`) lorsque le trip possède un `shape_id`. Elle est clippée entre `fromStop` et `toStop` grâce à :

```sql
ST_LineSubstring(
  s.geometry,
  LEAST(
    ST_LineLocatePoint(s.geometry, ...fromStop...),
    ST_LineLocatePoint(s.geometry, ...toStop...)
  ),
  GREATEST(
    ST_LineLocatePoint(s.geometry, ...fromStop...),
    ST_LineLocatePoint(s.geometry, ...toStop...)
  )
)
```

Le résultat est un GeoJSON `LineString` `[lon, lat]` SRID 4326 qui ne contient que les points entre les deux arrêts. Aucune ligne droite artificielle n'est ajoutée.

Si le trip n'a pas de shape, ou si la géométrie clippée ne passe pas à moins de 200 m de chaque extrémité, le segment est rejeté et le moteur bascule vers le fallback GeoJSON.

## Génération de candidats multiples (Phase B)

`generatePostgisCandidates()` étend `buildPostgisMultimodalJourney()` pour produire **jusqu'à `maxCandidates`** itinéraires complets, chacun validant la chaîne complète `marche d'accès → segment transport → marche de sortie` :

1. **Accès** : `findNearbyStops()` (PostGIS, `ST_DWithin`) retourne jusqu'à `maxAccessStops` arrêts autour de l'origine.
2. **Transit** : pour chaque arrêt d'accès, `findTransitSegments()` (PostGIS) retourne jusqu'à `maxTransitOptions` segments vers la zone de destination.
3. **Marche d'accès** : Valhalla depuis l'origine piétonne vers `fromStop` de chaque segment.
4. **Marche de sortie** : Valhalla depuis `toStop` vers la destination.
5. **Validation** : `validateTransitGeometry()` rejette les segments dont les extrémités s'éloignent de plus de 200 m du `fromStop`/`toStop`.
6. **Déduplication** : les segments partageant la même clé `from_stop : route : to_stop` sont éliminés (le premier gagnant est conservé).
7. **Limitation** : seuls les `maxCandidates` premiers candidats (par durée, puis par tarif) sont renvoyés.

| Paramètre | Défaut | Plage | Rôle |
| --- | --- | --- | --- |
| `radiusM` | 1500 | 1–10 000 | Rayon de recherche d'arrêts autour de l'origine et de la destination |
| `maxWalkingDistanceM` | `SIRA_WALK.maxAccessOrEgressDistanceM` | 1–10 000 | Distance piétonne maximale d'accès/égress |
| `maxCandidates` | 5 | 1–8 | Nombre maximum de candidats complets renvoyés |

Chaque candidat est un `MultimodalJourney` complet avec 3 jambes (`WALK → transit → WALK`), géométrie, durées P90 et tarif. Aucun scoring SIRA-MORE n'est appliqué : l'ordre est déterminé par la durée totale puis par le tarif.

## Limites actuelles

- Dataset historique GTFS importé dans PostGIS ;
- Durée de transport estimée (`durationStatus: estimated`) ;
- Zéro correspondance ;
- Pas de temps réel ;
- Pas de SIRA-MORE spécifique PostGIS ;
- Pas de GraphHopper.
