# SIRA — MVP Smart Mobility Abidjan

SIRA est un MVP de mobilité multimodale pour Abidjan. Il permet de rechercher un trajet, comparer plusieurs options selon le temps et le coût, consulter les étapes détaillées, suivre un trajet et signaler un incident.

## Télécharger le code source

Téléchargez le fichier `SIRA_MVP_Source_Maquettes.zip` présent dans ce dépôt, puis décompressez-le.

## Lancer sur Windows

1. Installez Node.js 22 LTS.
2. Décompressez l’archive.
3. Ouvrez le dossier `sira-mobility-mvp`.
4. Double-cliquez sur `LANCER_SIRA_WINDOWS.bat`.
5. Ouvrez `http://localhost:3000`.

## Stack incluse

- Next.js, React et TypeScript
- MapLibre GL JS, OpenFreeMap et OpenStreetMap
- Photon et Valhalla
- NestJS et Socket.IO
- FastAPI
- PostgreSQL/PostGIS et Valkey
- GTFS pilote pour Abidjan
- Podman et Nginx

Les données GTFS incluses sont des données synthétiques de démonstration et non des données officielles SOTRA.
