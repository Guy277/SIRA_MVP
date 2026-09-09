# Couche transport PostgreSQL/PostGIS

Cette couche stocke le GTFS historique d'Abidjan dans des tables relationnelles et geospatiales. Elle est additive : les sources, `transport-lines-normalized.geojson` et `transport-network-unified.json` restent conserves et le routing actuel continue de lire le GeoJSON normalise.

## Tables

- `transport_gtfs_agencies` : agences GTFS.
- `transport_gtfs_routes` : lignes, modes, horaires textuels, tarifs disponibles et geometries.
- `transport_gtfs_stops` : arrets et points `geometry(Point, 4326)`.
- `transport_gtfs_trips` : trajets rattaches aux lignes.
- `transport_gtfs_stop_times` : horaires par arret.
- `transport_gtfs_frequencies` : plages de frequence.
- `transport_gtfs_fares` : tarifs issus de `osm:charge`, avec statut explicite.
- `transport_gtfs_shapes` : geometries GTFS `geometry(LineString, 4326)`.

Les tables utilisent les identifiants source comme cles et les relations `route -> trip -> stop_time -> stop` sont protegees par des foreign keys.

## Demarrage

PostgreSQL/PostGIS est deja configure dans `compose.yaml` avec `postgis/postgis:17-3.5-alpine`.

```bash
podman compose up -d postgres
```

Les fichiers SQL dans `infra/database/init/` sont executes lors de l'initialisation d'un volume PostgreSQL neuf. Pour une base deja initialisee, executer la migration additive `003_transport_gtfs.sql` avec `psql` ou recreer le volume de developpement selon votre procedure habituelle.

## Import reproductible

Generer d'abord le dataset derive, puis importer dans PostgreSQL :

```bash
npm run data:import
DATABASE_URL=postgresql://sira:sira_dev_password@localhost:5432/sira npm run data:import:postgis
```

L'import est transactionnel et reconstruit uniquement les tables `transport_gtfs_*` dans la transaction. Il ne modifie aucune source. Le relancer ne cree pas de doublons.

## Verification

```bash
DATABASE_URL=postgresql://sira:sira_dev_password@localhost:5432/sira npm run data:audit:postgis
npm run data:audit:network
```

L'audit verifie les comptages, les foreign keys, les geometries, les SRID, les statuts et l'absence de tarifs inventes.

## Statuts et limites

- `historical` : source GTFS/OSM historique, principalement 2021.
- `estimated` : valeur derivee ou estimee, si elle est justifiee.
- `validated` : validation operateur ou terrain explicite, non presente par defaut.
- `unknown` : information absente ou non justifiable.

Les 281 lignes sans tarif exploitable restent avec un montant `NULL` et le statut `unknown`. Aucun fichier GTFS de tarifs n'est fabrique. Le dataset ne constitue pas une source temps reel et ne garantit pas la disponibilite actuelle des lignes, horaires ou tarifs.

Le moteur actuel n'est pas bascule sur PostGIS dans cette etape : cette base prepare l'integration future du routing et du parcours multimodal sans modifier le comportement existant.