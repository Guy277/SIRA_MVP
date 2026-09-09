# Organisation des donnees SIRA

Ce dossier est organise par role. Aucun fichier source n'est supprime ou deplace.

## Sources principales

### `abidjan-master/`

Archive complete du projet Abidjan Transport / DigitalTransport4Africa.

- `abidjan-master/Donnees/abidjan.zip` : GTFS historique complet.
- `abidjan-master/Donnees/abidjantransport_lignes.csv` : lignes, frequences, heures d'ouverture et tarifs OSM.
- `abidjan-master/Donnees/abidjantransport_lignes.geojson` : geometries historiques des lignes.
- `abidjan-master/Donnees/abidjantransport_traces.csv` : references de traces GPS collectees.
- `abidjan-master/Donnees/README.md` : provenance et licence de la source.

Le GTFS contient notamment `stops`, `routes`, `trips`, `stop_times`, `frequencies`, `shapes`, `agency`, `calendar` et `feed_info`.

### `raw/`

Copie brute utilisee par les scripts SIRA. Le fichier `abidjantransport_lignes.geojson` doit rester inchange.

### `processed/`

Donnees derivees et normalisees par les scripts du projet. Elles peuvent etre regenerees depuis `raw/`.

- `transport-lines-normalized.geojson` : geometries de lignes normalisees.
- `transport-network-unified.json` : import GTFS + CSV avec agences, lignes, arrets, trajets, horaires, frequences, geometries et tarifs disponibles.

### `metadata/`

Provenance et resultats d'audit : source, date, volume, qualite et avertissements.

## Donnees de developpement

### `gtfs-demo/`

Petit GTFS synthetique pour les tests et la demonstration. Il ne remplace pas le GTFS historique complet.

### `LigneArete/`

Dataset synthetique de demonstration SIRA. Ses tarifs, horaires, arrets et temps de parcours sont des hypotheses MVP et ne doivent pas etre presentes comme des observations terrain.

### `pilot/`

Fixtures internes des corridors pilotes et tests de non-regression.

## Regles de provenance

- Les donnees historiques 2021 sont identifiees comme historiques et non temps reel.
- Les tarifs provenant de `osm:charge` doivent rester distingues des tarifs valides par un operateur.
- Les estimations SIRA doivent conserver leur methode et leur niveau de confiance.
- Les fichiers sources sont conserves ; les transformations sont produites dans `processed/`.

## Scripts associes

- `npm run data:audit`
- `npm run data:audit:network`
- `npm run data:normalize`
- `npm run data:import`

`npm run data:import` ne modifie jamais les sources dans `abidjan-master/`. Il regenere uniquement `processed/transport-network-unified.json`.

`npm run data:audit:network` controle les relations GTFS, les doublons, les coordonnees, la couverture des arrets, horaires, frequences, tarifs et geometries, puis ecrit `metadata/transport-network-audit.json`.
