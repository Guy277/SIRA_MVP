# SIRA — On trace, sans stress

SIRA aide les voyageurs du Grand Abidjan à choisir leur trajet en combinant **bus SOTRA, gbaka, wôrô-wôrô, bateau-bus, taxi et marche**, selon le prix, le temps et le confort. Les trajets sont rangés en trois catégories : **Coulé** (le moins cher), **Debout** (le juste milieu) et **Suspendu** (le plus confortable). Les voyageurs signalent les incidents en direct, comme sur Waze.

Références produit : **Bonjour RATP** (recherche, comparaison, détail) et **Orange Max it** (connexion par numéro Orange 07 et code SMS).

## Où se trouve quoi

```text
SIRA/
├── mobile/              L'APPLI : Expo / React Native (Android, iPhone, web)      → port 8081
├── services/            CE QUI TOURNE DERRIÈRE L'APPLI
│   ├── api/             porte d'entrée : trajets, signalements, comptes, voix      → port 4000
│   ├── engine/          SIRA-MORE : classe les trajets Coulé / Debout / Suspendu   → port 8000
│   ├── community/       comptes (code SMS Orange) et prix des voyageurs            → port 8100
│   ├── voice/           assistant vocal fr-CI (Whisper, CamemBERT, Piper) + FAQ    → port 8200
│   └── models/          modèles d'IA des services (hors Git, voir models/README.md)
├── data/                données de transport (325 lignes du Grand Abidjan)
├── infra/               serveur : compose.yaml (Podman), Nginx, base PostGIS
├── scripts/             lancer la stack, installer la voix, outils de données
├── tests/               tests des données de transport
└── docs/                documentation, cahier des charges, travail sur la voix
```

Règles : l'appli ne parle qu'à `services/api` ; rien de lourd ni de secret dans Git (modèles, données, `.env`, bases).

## Lancer SIRA sur son ordinateur

Prérequis : **Node.js 22** et **Python 3**. Une seule commande lance tout (SIRA-MORE, comptes, voix, API et appli) :

```bash
npm install
npm install --prefix mobile   # la première fois seulement
npm run dev:stack
```

Sous Windows, on peut aussi double-cliquer sur `LANCER_SIRA_WINDOWS.bat`.

- **Navigateur** : `http://localhost:8081`.
- **Téléphone** : scanner le QR code affiché avec **Expo Go** (téléphone et ordinateur sur le même Wi-Fi ;
  la première fois, accepter la demande du pare-feu Windows pour Node).
- L'appli déjà lancée à part (`npx expo start` dans `mobile/`) ? La stack la détecte et ne la relance pas
  (`SIRA_MOBILE=false` pour ne jamais la lancer).
- L'assistant vocal démarre s'il est installé (`npm run voice:setup`, une fois).

**Connexion** : numéro **Orange (07)** puis code à 4 chiffres. En développement, le code s'affiche à l'écran, sans SMS.

**Sur un serveur** : `podman compose -f infra/compose.yaml up -d` (voir [docs/architecture.md](docs/architecture.md)).

## Où modifier quoi

| Je veux changer… | Fichier(s) |
| --- | --- |
| Un écran de l'appli | `mobile/app/` (un fichier par écran) |
| L'appel à l'API depuis l'appli | `mobile/lib/sira-api.ts` (seul point d'accès) |
| La connexion, la session | `mobile/lib/session.ts`, `mobile/lib/use-otp-login.ts`, `services/community/` |
| Le calcul des trajets | `services/api/src/mobility/` (graphe : `transport-graph.ts`) |
| Le classement Coulé / Debout / Suspendu | `services/engine/app/engine.py` (SIRA-MORE) |
| Les signalements | `services/api/src/reports/`, `mobile/lib/reports.ts` |
| L'assistant vocal (compréhension, réponses) | `services/voice/app/` (`dialog.py` pour les phrases de réponse) |
| Les réponses de la FAQ de SIRA | `services/voice/knowledge/*.md` (une fiche par question, voir `knowledge/README.md`) |
| L'écran « Discuter avec SIRA » | `mobile/app/chat.tsx` |
| L'écran « Confidentialité », la suppression de compte | `mobile/app/privacy.tsx`, `services/community/app/main.py` |
| Les modèles d'IA (voix) | `services/models/voice/` (hors Git, voir `services/models/README.md`) |
| Les lieux, « Ma position », la carte | `mobile/lib/places.ts`, `mobile/components/osm-map-view*.tsx` |

## Vérifier que tout marche

```bash
npm test                                   # données de transport
npm --prefix services/api test             # API (trajets, signalements, comptes)
npm run test:ai                            # SIRA-MORE (services/engine)
npm run test:community                     # comptes, suppression de compte, codes SMS
npm run test:voice                         # assistant vocal (sans les gros modèles)
npm run test:runtime                       # l'API appelle bien SIRA-MORE, de bout en bout
npx --prefix mobile tsc --noEmit -p mobile # typage de l'appli mobile
```

## Équipe

| Partie | Auteur | Dossier |
| --- | --- | --- |
| Application mobile (maquette validée) | Banatou | `mobile/` |
| Moteur de trajets, signalements | Achille | `services/api`, `services/engine` |
| Comptes SMS Orange, tarifs communautaires | Abraham (logique reprise sans ses secrets) | `services/community` |
| Assistant vocal (dataset fr-CI, modèles, service) | Achille | `services/voice` |

## Pour aller plus loin

- [Architecture technique](docs/architecture.md) : ports, API, moteur, données, sécurité, limites
- [Assistant vocal](services/voice/README.md) : installation, modèles, API, limites
- [Documentation](docs/README.md) : cahier des charges, audits de données, PostGIS, voix
- [Application mobile](mobile/README.md)
- [Modèles d'IA](services/models/README.md) : lesquels, où, comment les changer
- Ancien site web (port 3001) et dossier `archive/` : retirés, toujours consultables dans l'historique Git

Les données de transport proviennent de data.gouv.ci (2021) : durées, attentes et tarifs restent des **estimations** à valider avec les opérateurs.
