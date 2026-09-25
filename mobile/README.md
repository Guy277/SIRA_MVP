# SIRA — application mobile

Application Expo / React Native de SIRA (maquette validée : Banatou). Elle affiche les trajets calculés par le moteur SIRA ; aucun trajet n’est écrit en dur.

## Lancer

Prérequis : la stack SIRA démarrée à la racine du dépôt (`npm run dev:stack`).

```bash
npm install
npm run web          # sur ordinateur : http://localhost:8081
npx expo start       # sur téléphone : scanner le QR code avec Expo Go
```

Adresse de l’API : déduite automatiquement de la machine qui fait tourner Expo (même Wi-Fi). Pour la forcer : `EXPO_PUBLIC_API_URL=http://192.168.x.x:4000/api/v1`.

## Organisation

| Dossier | Rôle |
| --- | --- |
| `app/` | écrans (expo-router) |
| `lib/sira-api.ts` | seul point d’accès à l’API (trajets, signalements, comptes, tarifs) |
| `lib/journey-store.ts` | recherche, trajet choisi et trajet suivi, partagés entre écrans |
| `lib/journey-format.ts` | textes, heures et prix affichés (français clair, pas de jargon) |
| `lib/places.ts` | coordonnées des lieux (recherche, raccourcis, GPS) |
| `lib/reports.ts` | signalements en direct (Socket.IO) |
| `lib/session.ts`, `lib/use-otp-login.ts` | connexion par code SMS, session sécurisée |
| `components/osm-map-view.tsx` / `.web.tsx` | carte native / carte web MapLibre |

## Reste à brancher

- favoris, historique, notifications et réglages : encore locaux ou fictifs ;
- assistant vocal : la bulle « SIRA VOCAL » affiche le texte, la voix viendra ensuite ;
- Yango et moto : aucune donnée, le filtre est marqué « bientôt ».
