# Audit des données transport - Phase 1

## 1. Sources

- Source officielle ouverte : https://data.gouv.ci/datasets/abidjantransport-lignes
- API source : https://data.gouv.ci/data-fair/api/v1/datasets/abidjantransport-lignes
- Donnée historique : 12 octobre 2021
- Licence : Licence Ouverte 2.0
- Attribution recommandée : `Source : data.gouv.ci / DigitalTransport4Africa — Jeu : « Lignes de transport à Abidjan » — Données du 12 octobre 2021 — Licence Ouverte 2.0`

## 2. Données déjà présentes dans le dépôt

Le dépôt contient déjà un fichier synthétique nommé `data/LigneArete/SIRA_Phase1_Dataset_Synthetique_Abidjan_v1.geojson`.

Ce fichier est clairement identifié comme :

- `dataset_kind: synthetic`
- `is_official_transport_data: false`
- `warning: aucune ligne... ne doit être présenté comme officiel ou observé sur le terrain.`

Il sert uniquement à la démonstration et à la phase pilote du MVP. Il ne remplace pas les données ouvertes historiques du réseau de transport d’Abidjan.

## 3. Classification des données

- Donnée officielle ouverte : source historique `data.gouv.ci`, enregistrée dans `data/metadata/transport-source.json`
- Donnée historique : 2021-10-12, non vérifiée sur le terrain, à considérer comme historique
- Donnée normalisée : à construire depuis le GeoJSON brut dans `data/processed/`
- Donnée synthétique : `data/LigneArete/...` et les jeux de démonstration internes
- Donnée validée terrain : non encore exploitable dans ce sprint ; le module `transport_observations` est préparé pour recevoir cette validation

## 4. Résumé technique

Le projet conserve le MVP fonctionnel et ajoute une première couche de données réelles dès l’étape 1.

- Le GeoJSON brut n’a pas été modifié directement.
- Le fichier source brut doit être déposé dans `data/raw/abidjantransport_lignes.geojson`.
- Une version plus propre est prévue dans `data/processed/transport-lines-normalized.geojson`.
- Les scripts d’audit et de normalisation restent reproductibles.

## 5. Blocages connus

- Le fichier officiel n’est pas encore présent dans le dépôt.
- L’accès réseau de téléchargement dépend de la disponibilité de `data.gouv.ci`.
- La base PostgreSQL/PostGIS est préparée par migration mais la vraie importation de lignes sera déclenchée dès que la source brute est disponible.

## 6. Prochaine étape fonctionnelle

La prochaine couche à mettre en place est la migration SQL + le service API GeoJSON, puis le filtrage visuel des lignes sur la carte.

## 7. Règle de prudence

L’ancienne donnée synthétique n’est pas un substitut à la donnée réelle. Elle est conservée uniquement pour démontrer le comportement du produit et maintenir le MVP stable.
