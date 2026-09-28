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
| Retrouver le lieu | règles phonétiques + RapidFuzz, 2 259 lieux (GTFS AbidjanTransport) | code SIRA / ODbL | aucun |
| Parler | Piper `fr_FR-siwis-medium` | CC BY 4.0 | aucun |

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
| `VOICE_PIPER_MODEL` | `services/models/voice/piper/fr_FR-siwis-medium.onnx` | voix de SIRA (future voix ivoirienne : remplacer ce fichier) |
| `SIRA_API_URL` | `http://127.0.0.1:4000/api/v1` | API de calcul des trajets |
| `VOICE_PLACE_THRESHOLD` / `VOICE_PLACE_MARGIN` | `60` / `3` | seuils du correcteur de lieux |

## Scores mesurés (test v0.4 — phrases synthétiques jamais vues)

| Mesure | Texte propre | Texte bruité (ASR simulé) |
|---|---|---|
| Intention (macro-F1) | 88,1 % | 84,9 % |
| Entités (F1) | 97,1 % | 94,6 % |
| Lieux : exact → correcteur | 99,1 % | 46,2 % → 97,5 % |
| Destination juste, de bout en bout | 92,8 % | 91,0 % |

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
- Sans trajet en cours : « Tu n'as pas de trajet en cours… » ; API des signalements injoignable : SIRA le dit.
- Hors sujet (« raconte-moi une blague ») : refus poli, sans rien inventer.
- Côté app : écran **Discuter avec SIRA** (`mobile/app/chat.tsx`), depuis le profil.

## Limites à connaître

- Données d'entraînement **100 % synthétiques** ; bruit ASR **simulé** : scores à re-mesurer sur de vraies voix.
- Intentions encore fragiles : `find_stop`, `ask_nearby_landmark`, `avoid_traffic`, `out_of_scope` (dataset v0.5).
- Voix française (Piper siwis) en attendant une voix ivoirienne enregistrée avec consentement.
- **Aucun audio n'est conservé** : la collecte de voix demandera un consentement explicite (loi n° 2013-450, ARTCI).
- Signalements (« y a accident vers Koumassi ») : le service prépare le signalement, l'app le fait confirmer à l'usager.

## Tests

```bash
npm run test:voice                         # 58 tests (dont FAQ et trajet en cours), sans les gros modèles
npm --prefix services/api test             # dont le relais /api/v1/voice
```
