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
| `components/voice-assistant-sheet.tsx`, `lib/use-voice-assistant.ts` | assistant vocal (micro de l'accueil) : parle → envoi tout seul quand tu te tais → service `services/voice` → réponse lue → « On y va ! » et départ automatique (5 s pour annuler ou voir les autres trajets). Question → micro rouvert tout seul ; pas compris → « répète un peu plus fort » puis, au 2ᵉ échec, écrire ou montrer sur la carte ; « il y a un accident à… » → signalement prérempli |
| `lib/voice.ts` | voix de SIRA partagée par tous les écrans (Piper, sinon voix du téléphone) et bouton son à 3 modes comme Google Maps : voix activée / alertes seulement / coupée |
| `lib/use-microphone.ts` | écoute avec détection de fin de phrase ; l'audio est supprimé du téléphone dès l'envoi |
| `lib/guidance.ts`, `lib/use-spoken-question.ts` | guidage parlé (`navigation-active`) : annonce de chaque étape, suivi GPS (étape suivante toute seule, « Prépare-toi, tu descends au prochain arrêt », arrivée), alertes façon Waze avec réponse « oui / non » à la voix (facultative), prix payé demandé à l'arrivée |
| `components/map-location-picker.tsx`, `pin-map.tsx` / `.web.tsx` | « Choisir sur la carte » : épingle fixe, carte qui bouge dessous |
| `components/` (autres) | éléments d'écran partagés : sélecteur de lieu, badges de lignes, animations |

## Reste à brancher

- favoris, historique, notifications et réglages : encore locaux ou fictifs ;
- Yango et moto : aucune donnée, le filtre est marqué « bientôt ».
