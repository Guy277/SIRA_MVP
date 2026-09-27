# SIRA — On trace, sans stress

SIRA aide les voyageurs du Grand Abidjan à choisir leur trajet en combinant **bus SOTRA, gbaka, wôrô-wôrô, bateau-bus, taxi et marche**, selon le prix, le temps et le confort. Les trajets sont rangés en trois catégories : **Coulé** (le moins cher), **Debout** (le juste milieu) et **Suspendu** (le plus confortable). Les voyageurs signalent les incidents en direct, comme sur Waze.

Références produit : **Bonjour RATP** (recherche, comparaison, détail) et **Orange Max it** (connexion par numéro Orange 07 et code SMS).

## Où se trouve quoi

```text
SIRA/
├── mobile/              Application mobile (Expo / React Native)        → http://localhost:8081
├── app/, components/,   Site web (version ordinateur, démos)            → http://localhost:3001
│   lib/, public/
├── services/
│   ├── api/             API NestJS : trajets, signalements, comptes     → port 4000
│   ├── ai/              Moteur SIRA-MORE (Python) : classe les trajets  → port 8000
│   ├── community/       Comptes (code SMS) et tarifs des voyageurs      → port 8100
│   └── voice/           Assistant vocal fr-CI (Whisper, CamemBERT, Piper) → port 8200
├── data/                Données de transport (325 lignes du Grand Abidjan)
├── scripts/             Lancement de la stack et outils de données
├── tests/               Tests du site web et des données
├── infra/               Base PostGIS et Nginx (stack Podman)
├── docs/                Documentation, cahier des charges, travail sur la voix
└── archive/             Anciens fichiers gardés pour référence (non utilisés)
```

Fichiers de configuration du site web à la racine : `package.json`, `vite.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `next.config.ts`, `postcss.config.mjs`, `build/`, `worker/`. Stack Podman : `compose.yaml`, `Containerfile`.

## Lancer SIRA sur son ordinateur

Prérequis : **Node.js 22** et **Python 3**.

**1. Les services** (API, moteur, comptes, site web) — laisser ce terminal ouvert :

```bash
npm install
npm run dev:stack
```

Sous Windows, on peut aussi double-cliquer sur `LANCER_SIRA_WINDOWS.bat`. Attendre « Application prête ».

**2. L'application mobile**, dans un second terminal :

```bash
cd mobile
npm install
npm run web -- --port 8081
```

Ouvrir `http://localhost:8081`. Sur téléphone : `npx expo start` dans `mobile/`, puis scanner le QR code avec **Expo Go** (téléphone et ordinateur sur le même Wi-Fi).

**Connexion** : numéro **Orange (07)** puis code à 4 chiffres. En développement, le code s'affiche à l'écran, sans SMS.

## Où modifier quoi

| Je veux changer… | Fichier(s) |
| --- | --- |
| Un écran de l'appli | `mobile/app/` (un fichier par écran) |
| L'appel à l'API depuis l'appli | `mobile/lib/sira-api.ts` (seul point d'accès) |
| La connexion, la session | `mobile/lib/session.ts`, `mobile/lib/use-otp-login.ts`, `services/community/` |
| Le calcul des trajets | `services/api/src/mobility/` (graphe : `transport-graph.ts`) |
| Le classement Coulé / Debout / Suspendu | `services/ai/app/engine.py` |
| Les signalements | `services/api/src/reports/`, `mobile/lib/reports.ts` |
| L'assistant vocal (compréhension, réponses) | `services/voice/app/` (`dialog.py` pour les phrases de réponse) |
| Les réponses de la FAQ de SIRA | `services/voice/knowledge/*.md` (une fiche par question, voir `knowledge/README.md`) |
| L'écran « Discuter avec SIRA » | `mobile/app/chat.tsx` |
| Les lieux, « Ma position », la carte | `mobile/lib/places.ts`, `mobile/components/osm-map-view*.tsx` |

## Vérifier que tout marche

```bash
npm test                                   # site web et données
npm --prefix services/api test             # API (trajets, signalements, comptes)
npm run test:ai                            # moteur SIRA-MORE
npm run test:voice                         # assistant vocal (sans les gros modèles)
npm run test:runtime                       # l'API appelle bien le moteur
npx --prefix mobile tsc --noEmit -p mobile # typage de l'appli mobile
```

## Équipe

| Partie | Auteur | Dossier |
| --- | --- | --- |
| Application mobile (maquette validée) | Banatou | `mobile/` |
| Moteur de trajets, signalements, site web | Achille | `services/api`, `services/ai`, `app/` |
| Comptes SMS Orange, tarifs communautaires | Abraham (logique reprise sans ses secrets) | `services/community` |
| Assistant vocal (dataset fr-CI, modèles, service) | Achille | `services/voice` |

## Pour aller plus loin

- [Architecture technique](docs/architecture.md) : ports, API, moteur, données, sécurité, limites
- [Assistant vocal](services/voice/README.md) : installation, modèles, API, limites
- [Documentation](docs/README.md) : cahier des charges, audits de données, PostGIS, voix
- [Application mobile](mobile/README.md)
- [Archive](archive/README.md) : ce qui a été mis de côté et pourquoi

Les données de transport proviennent de data.gouv.ci (2021) : durées, attentes et tarifs restent des **estimations** à valider avec les opérateurs.
