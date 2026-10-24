# Assistant vocal SIRA (`services/voice`)

L'usager parle comme à Abidjan (« Je quitte Yop, je veux béou sur Adjamé 220, j'ai une barre ») et SIRA répond avec un trajet réel.

```
Micro → Silero VAD + Whisper (voix → texte)
      → CamemBERTv2 fr-CI : intention + entités (départ, destination, budget, mode, heure…)
      → correcteur de lieux : « adja mé vingt logement » → Adjamé 220 Logements (+ GPS)
      → décision : calculer, ou demander confirmation si c'est ambigu
      → API SIRA  POST /api/v1/mobility/journeys  (SIRA-MORE)
      → phrase de réponse (chiffres du moteur, jamais inventés) → Piper (texte → voix)
```

| Brique | Modèle | Licence | Entraînement |
|---|---|---|---|
| Détecter la parole | Silero VAD (intégré à faster-whisper) | MIT | aucun |
| Transcrire | Whisper `small` int8 (`turbo` possible) via faster-whisper | MIT | aucun pour l'instant |
| Comprendre | CamemBERTv2 fine-tuné sur le dataset SIRA fr-CI v0.4 | MIT | notebook Colab |
| Retrouver le lieu | règles phonétiques + RapidFuzz, 2 259 lieux (GTFS AbidjanTransport) + compléments | code SIRA / ODbL | aucun |
| Parler | Piper `fr_FR-siwis-medium` | CC BY 4.0 | aucun |

**Compléments du répertoire de lieux** (`knowledge/lieux_complements.json`, dans Git) : le répertoire du notebook
n'est pas modifié, ces corrections sont appliquées au chargement.

- `ajouts` : lieux absents du GTFS, avec coordonnées et source : quelques lieux connus (Danga, Black Market, Angré 8e
  Tranche…) et les quartiers et villages nommés dans OpenStreetMap (Mermoz, Wassakara, Sagbé Nord…) ;
- `coordonnees` : lieux connus sans GPS (Blockhaus, Zone 4…), sinon SIRA les reconnaît mais ne peut pas y aller ;
- `alias` : autres orthographes attestées d'un même lieu (Blockauss, Biétri…) ; un nom OSM presque identique à moins
  de 1,5 km d'un lieu existant devient une variante de ce lieu plutôt qu'un doublon ;
- `hors_reseau` (sur un ajout) : commune du Grand Abidjan hors du réseau de transport de SIRA (communes périphériques
  de l'AMUGA sans ligne dans OSM : Bonoua, Alépé, Azaguié, Dabou, Jacqueville ; Grand-Bassam est desservi depuis
  l'extraction OSM de 2026). La voix emmène jusqu'à la gare de départ si elle est attestée (`depart`) et le dit ;
  sinon elle dit que le trajet n'est pas encore couvert, sans en inventer un ;
- `arrets_osm` (généré par `corriger_lieux.py`) : arrêts nommés du réseau actuel (`data/processed`, extraction
  OpenStreetMap) que le répertoire ne connaissait pas ; position = centre des quais du même nom ;
- `exclus` : lieux volontairement absents et pourquoi (introuvables, ou homophones qui feraient hésiter un lieu existant) ;
- `communes` : commune exacte de chaque lieu d'après les frontières OpenStreetMap, recalculée par
  `services/voice/scripts/corriger_lieux.py` (le notebook la devinait d'après le centre de commune le plus proche).

Un ajout se vérifie avec `npm run test:voice` (coordonnées dans le Grand Abidjan, identifiants `PL-C…` uniques).

**Règle : rien d'inventé.** Chaque position vient d'une source (OpenStreetMap, arrêts du GTFS) ou d'un calcul explicite
sur ces sources (ex. centre des arrêts qui portent le nom du quartier), écrit dans `source`. Une approximation est
acceptée si sa méthode est dite ; un lieu introuvable n'est pas ajouté mais noté dans `exclus` (ex. Roxy). Une variante
d'orthographe doit être attestée (nom OSM, nom d'arrêt) ou être la forme parlée d'un nombre écrit (« 8e » → « huitième »).

## Installation (une seule fois)

**1. Modèles entraînés** (≈ 900 Mo, jamais dans Git) : le dossier `sira_models_v0.4` produit par le notebook Colab
est cherché dans cet ordre :

1. `VOICE_MODELS_DIR` (dans `.env`) ;
2. `services\models\voice\sira_models_v0.4\` ;
3. `data\sira_models_v0.4\` (ancien emplacement, encore accepté).

**Emplacement retenu** : la réserve de modèles des services, `services\models\voice\` (voir [services/models/README.md](../models/README.md)) :

```
services/models/voice/
├── sira_models_v0.4/   CamemBERTv2 fine-tunés (intent + entités) + 2 259 lieux  (≈ 890 Mo)
├── whisper/small/      Whisper (faster-whisper)                                 (≈ 480 Mo)
└── piper/              voix française fr_FR-siwis-medium                        (≈ 63 Mo)
```

**2. Environnement Python + modèles prêts à l'emploi** :

```bash
npm run voice:setup
```

Installe PyTorch CPU, transformers, faster-whisper et Piper (≈ 2 Go), puis télécharge **une seule fois** dans
`services/models/voice/` : Whisper `small` (≈ 480 Mo) et la voix Piper (≈ 63 Mo). Silero VAD est inclus dans
faster-whisper. Ensuite, **tout fonctionne hors ligne** : aucun appel à Hugging Face ni à un service externe.
Pour Whisper `turbo` (plus précis, ≈ 1,6 Go) : `VOICE_WHISPER_MODEL=turbo` dans `.env` puis relancer `npm run voice:setup`.

**Hébergement chez un opérateur (serveurs internes)** : copier le seul dossier `services/models/voice/` sur le serveur
(clé USB, dépôt interne) ; aucun accès Internet n'est nécessaire à l'exécution.

## Lancer

```bash
npm run dev:stack      # toute la stack ; le service vocal démarre s'il est installé
# ou, seulement la voix (l'API SIRA doit tourner pour calculer les trajets) :
npm run dev:voice
```

- **Page de test avec micro** : http://localhost:8200 (ou via l'API : http://localhost:4000/api/v1/voice/page)
- Documentation interactive : http://localhost:8200/docs
- Santé : http://localhost:8200/health — indique si les modèles sont chargés et ce qui manque.

## API (relayée par NestJS sous `/api/v1/voice/…`)

| Méthode | Chemin | Entrée | Sortie |
|---|---|---|---|
| POST | `/voice/query` | multipart : `audio` (webm/ogg/m4a/wav, ≤ 30 s), `lat`, `lon`, `context`, `speak` | transcription + compréhension + trajets + phrase + audio |
| POST | `/voice/ask` | JSON `{text, position?, context?, trip?, speak?}` | pareil, à partir de texte |
| POST | `/voice/understand` | JSON `{text, position?}` | compréhension seule (intent, entités, lieux, `journey_request`) |
| POST | `/voice/answer` | multipart : `audio` | réponse courte pendant le trajet : `{transcript, answer: "yes"/"no"/null, amount}` (prix en FCFA, `null` s'il n'est pas clairement dit) — sans NLU ni calcul de trajet |
| POST | `/voice/tts` | JSON `{text}` | `audio/wav` |
| GET | `/voice/health` | — | état des composants |

**Trajet en cours** (`trip`, aussi en champ multipart de `/voice/query`) : le trajet suivi dans l'app
(`voiceTrip()` dans `mobile/lib/sira-api.ts`). Il permet de répondre à « je descends où ? », « ça fait combien ? »,
« j'arrive à quelle heure ? » ou « y a des bouchons sur mon trajet ? » avec les chiffres de SIRA-MORE et les signalements
des voyageurs. La réponse contient `sources` : fiche de la FAQ (`modes.gbaka`), `sira-more`, `signalements`, `lieux`.

**Dialogue de confirmation** : quand SIRA doute (lieu ambigu, destination manquante…), la réponse contient
`reply_text` (la question) et `context`. L'app renvoie ce `context` tel quel avec la phrase suivante :
« ya foye » → le trajet est calculé ; « non, c'est Riviera Palmeraie » → la destination est corrigée.

Exemple :

```bash
curl -X POST http://localhost:4000/api/v1/voice/ask -H "content-type: application/json" \
  -d '{"text":"je vais au plato","position":{"lat":5.3467,"lon":-3.9951},"speak":false}'
```

### Brancher l'app mobile (Expo) — à ajouter dans `mobile/lib/sira-api.ts`

```ts
export type VoiceReply = {
  transcript?: { text: string };
  reply_text: string;
  context: Record<string, unknown> | null;
  journeys: JourneysResponse | null;
  reply_audio: { mime: string; base64: string } | null;
  understanding: { intent: string; needs_confirmation: boolean; reasons: string[] } | null;
};

export async function askByVoice(audioUri: string, position: Coordinates | null, context: VoiceReply['context']) {
  const form = new FormData();
  form.append('audio', { uri: audioUri, name: 'voix.m4a', type: 'audio/m4a' } as unknown as Blob);
  if (position) { form.append('lat', String(position.latitude)); form.append('lon', String(position.longitude)); }
  if (context) form.append('context', JSON.stringify(context));
  form.append('speak', 'true');
  const response = await fetch(`${apiBaseUrl()}/voice/query`, { method: 'POST', body: form });
  if (!response.ok) throw new SiraApiError((await response.json()).detail ?? 'Assistant vocal indisponible');
  return (await response.json()) as VoiceReply;
}
```

Si `reply_audio` est vide (Piper non installé), lire `reply_text` avec la voix du téléphone (`expo-speech`).

## Réglages (`.env`)

| Variable | Défaut | Rôle |
|---|---|---|
| `VOICE_MODELS_ROOT` | `services/models/voice` | réserve des modèles de la voix (`/models/voice` dans le conteneur) |
| `VOICE_MODELS_DIR` | `services/models/voice/sira_models_v0.4` | modèles entraînés sur Colab |
| `VOICE_WHISPER_MODEL` | `small` | `small` (rapide, CPU), `turbo` (plus précis), `large-v3` (GPU) |
| `VOICE_WHISPER_DEVICE` / `VOICE_WHISPER_COMPUTE` | `cpu` / `int8` | `cuda` / `float16` avec un GPU |
| `VOICE_WHISPER_BEAM` | `5` | précision de la transcription ; `1` ≈ 20 % plus rapide mais déforme des lieux |
| `VOICE_SPEECH_RATE` | `1.1` | vitesse de la voix de SIRA (`1.0` = voix d'origine) |
| `VOICE_PRELOAD` | `1` | Whisper et Piper chargés dès le démarrage (sinon la 1re phrase attend 10 à 20 s) |
| `VOICE_PIPER_MODEL` | `services/models/voice/piper/fr_FR-siwis-medium.onnx` | voix de SIRA (future voix ivoirienne : remplacer ce fichier) |
| `SIRA_API_URL` | `http://127.0.0.1:4000/api/v1` | API de calcul des trajets |
| `VOICE_PLACE_THRESHOLD` / `VOICE_PLACE_MARGIN` | `90` / `3` | seuils du correcteur de lieux : en dessous de 90, SIRA demande « Tu veux dire … ? » |

## Scores mesurés (test v0.4 — phrases synthétiques jamais vues)

| Mesure | Texte propre | Texte bruité (ASR simulé) |
|---|---|---|
| Intention (macro-F1) | 88,1 % | 84,9 % |
| Entités (F1) | 97,1 % | 94,6 % |
| Lieux : exact → correcteur | 99,1 % | 46,2 % → 97,5 % |
| Destination juste, de bout en bout | 92,8 % | 91,0 % |

## Mesurer sur de vraies voix

Les 40 phrases de test (`outils/phrases_test_voix.csv`, colonnes `fichier;texte;lieu`) sont **l'examen** : elles ne
servent jamais à entraîner, sinon les progrès mesurés seraient faux.

1. Ouvrir `outils/enregistreur_simple.html` dans un navigateur (téléphone ou PC) : une phrase, un bouton ; tout reste
   dans le navigateur. Exporter le ZIP `SIRA_test_voix_<prénom>_<date>.zip` (T01.wav… + `attendu.csv`).
2. `npm run voice:import -- --bench` : range chaque nouveau ZIP (du dossier de dépôt `enregistrements/a_ranger/`, où
   l'on peut enregistrer ou glisser les ZIP, et de Téléchargements) dans `services/voice/enregistrements/`
   (**hors Git** : voix de vraies personnes), puis mesure Whisper dessus. Sans `--bench`, range seulement ; pour
   remesurer un dossier déjà importé : `npm run voice:bench -- --audio services/voice/enregistrements/<dossier>`.
3. Le rapport (`rapport.md`, `resultats.csv`, `machine.json`) est écrit dans `benchmarks/<date>_<machine>/`, dans Git,
   pour comparer les réglages et les machines sur les mêmes phrases.

**Référence du 2026-10-19** (`benchmarks/2026-10-19_1928_DESKTOP-FJCLIQK/`, une seule voix, PC sans carte NVIDIA) :
Whisper `small`, beam 5 → erreur de mots **19,1 %**, bon lieu **26/32**, ≈ 7,4 s d'attente par phrase. Les 6 lieux
ratés sont des mots mal entendus par Whisper (Angré → « engager », CHU → « au-dessus », Zone 4 → « Zonkat »,
aéroport → « la repos ») ou une phrase incompréhensible ; les compléments du répertoire de lieux n'y changent rien
(26/32 aussi en repassant les mêmes transcriptions). La marge de progrès est donc du côté de la transcription.

## Enregistrer pour entraîner

La liste d'entraînement (`outils/phrases_entrainement_voix.csv`, 275 phrases, ≈ 21 min par personne) est générée par
`outils/generer_phrases_entrainement.py` : les lieux ratés par Whisper et les grands lieux, les quartiers aux noms non
français, le vocabulaire du trajet, l'argent et le parler d'Abidjan, chaque lieu au moins 3 fois, avec l'article qu'on
dit (« au Plateau », « à l'aéroport »). Lieux vérifiés par le correcteur, mots tirés du lexique fr-CI ; aucune phrase
d'examen. Plus il y a de voix différentes (hommes, femmes, âges, accents, rue bruyante), mieux c'est, et **pas les
mêmes personnes que l'examen** (sinon l'examen mesure des voix déjà entendues). Minimum : 3 personnes pour l'examen,
10 autres pour l'entraînement.

**Une seule page, trois onglets** (`outils/enregistreur_simple.html`) :

| Onglet | Phrases | Pour | Qui | ZIP rangé par `npm run voice:import` dans |
|---|---|---|---|---|
| Examen | 40 | mesurer Whisper (`--bench`) | plusieurs personnes | `enregistrements/test/` |
| Entraînement | 275 | entraîner Whisper (puis CamemBERT) | d'autres personnes | `enregistrements/entrainement/` |
| Voix de SIRA | 628 (`script_voix.csv`) | entraîner Piper | **une seule** personne, au calme | `enregistrements/piper/` (wavs/ + metadata.csv) |

`generer_phrases_entrainement.py` recopie les listes d'entraînement et de Piper dans la page. Un dossier Piper se
prépare ensuite avec `outils/piper_dataset.py preparer --entree enregistrements/piper/<dossier> --sortie dataset_piper/`.

## FAQ et questions sur le trajet (`knowledge/`)

Les questions qui ne sont pas des demandes de trajet (« c'est quoi un gbaka ? », « vous gardez ma voix ? »,
« le bateau-bus part d'où à Treichville ? ») sont répondues par des **fiches Markdown** dans `services/voice/knowledge/`
(format décrit dans `knowledge/README.md`). Pour ajouter une réponse : écrire une fiche, puis relancer le service.

- Recherche en mémoire (`app/knowledge.py`) : mots en commun avec les façons de poser la question, mots rares pesant plus,
  tolérance aux fautes de transcription. Pas de base vectorielle : l'interface `Retriever` permettra d'en brancher une.
- Une fiche répond au-dessus de `VOICE_FAQ_THRESHOLD` (0,65). Une vraie demande de trajet (« je vais à Treichville en
  bateau-bus ») n'est remplacée que par une fiche presque identique (0,9).
- Fiches `action: trip_*` : réponse calculée (`app/trip.py`) sur le trajet en cours — SIRA-MORE, recalcul depuis la
  position, `/reports/impact` et `/reports` de l'API, lieu connu le plus proche. Aucun chiffre écrit à la main.
- Sans trajet en cours : « Vous n'avez pas de trajet en cours… » ; API des signalements injoignable : SIRA le dit.
- Hors sujet (« raconte-moi une blague ») : refus poli, sans rien inventer.
- Côté app : écran **Discuter avec SIRA** (`mobile/app/chat.tsx`), depuis le profil.

## Limites à connaître

- Données d'entraînement **100 % synthétiques** ; bruit ASR **simulé** : une seule vraie voix mesurée pour l'instant
  (voir « Mesurer sur de vraies voix »), à confirmer avec d'autres personnes.
- Intentions encore fragiles : `find_stop`, `ask_nearby_landmark`, `avoid_traffic`, `out_of_scope` (dataset v0.5).
- Voix française (Piper siwis) en attendant une voix ivoirienne enregistrée avec consentement.
- **Aucun audio n'est conservé** : la collecte de voix demandera un consentement explicite (loi n° 2013-450, ARTCI).
- Signalements (« y a accident vers Koumassi ») : le service prépare le signalement, l'app le fait confirmer à l'usager.

## Tests

```bash
npm run test:voice                         # 64 tests (dont FAQ, trajet en cours, compléments de lieux), sans les gros modèles
npm --prefix services/api test             # dont le relais /api/v1/voice
```
