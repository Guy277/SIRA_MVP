# Plan : voix ivoirienne, affinage des modèles et LLM local

Rédigé le 2026-10-24. Les chiffres sans source sont des ordres de grandeur à vérifier par une mesure, signalés « à mesurer ».

## Ce qu'on a aujourd'hui

| Brique | Modèle | Où il tourne | Mesure connue |
|---|---|---|---|
| Détecter la parole | Silero VAD (dans faster-whisper) | CPU | — |
| Transcrire | Whisper `small`, int8 | CPU | WER 19,1 %, bon lieu 26/32, 6,5 s/phrase (voix d'Achille, 19/10) |
| Comprendre | CamemBERTv2 affiné fr-CI (intention + entités), notebook Colab | CPU | — |
| Retrouver le lieu | règles phonétiques + RapidFuzz + répertoire de lieux | CPU | — |
| Répondre (FAQ) | recherche RapidFuzz sur `services/voice/knowledge/` (55 fiches) | CPU | — |
| Parler | Piper : « pierre » (homme, défaut), siwis (femme, masquée) | CPU | — |

**Enregistrements disponibles** (`services/voice/enregistrements/`, hors Git, voix de vraies personnes) :

| Lot | Contenu | Durée |
|---|---|---|
| Entraînement : Ange, Franck, Paul-Élie | 275 phrases chacun, 48 kHz mono | 12,9 + 13,2 + 14,7 min = **40,8 min** |
| Test : voix1 (Achille), Franck, Marie | 40 phrases chacun | 3,1 + 2,5 + 2,9 min |
| Voix de SIRA (onglet Piper de l'enregistreur) | aucun pour l'instant | 0 |

**Machine de dev** : i7-1185G7, 16 Go, pas de GPU NVIDIA. Les entraînements se font sur Colab (GPU), comme
CamemBERT ; le PC sert à préparer les données, mesurer et faire tourner les modèles.

## 1. Voix d'homme ivoirienne (Piper)

**Point de départ.** Piper ne s'affine qu'à partir d'un *checkpoint* d'entraînement. Il en existe trois en français
(`rhasspy/piper-checkpoints`) :

| Checkpoint | Voix | Licence | Pour nous |
|---|---|---|---|
| `fr_FR/upmc/medium` | pierre (homme) + jessica | CC BY-SA 4.0 | **choisi le 2026-10-24** (voix préférée à l'écoute) ; la voix affinée hérite du « SA » |
| `fr_FR/mls/medium` | 125 locuteurs, dont ~44 graves (F0 < 150 Hz, mesuré) | CC BY 4.0 | alternative si la licence « SA » gêne |
| `fr_FR/siwis/medium` | femme | CC BY 4.0 | pas pour une voix d'homme |

`tom` et `gilles` n'ont pas de checkpoint publié (et `tom` est sous AGPL) : on ne peut pas les affiner.
Écoute comparée le 2026-10-24 (pierre et les 5 voix les plus graves de mls) : **pierre** est retenue, comme voix
actuelle de SIRA et comme base de la voix ivoirienne. Licence CC BY-SA 4.0 : citer la source et publier la voix
affinée sous la même licence.

**Données à enregistrer.** Une seule personne, un homme ivoirien, au calme, même micro, même distance :
- le script existe : `services/voice/outils/script_voix.csv` (628 phrases), onglet « Voix de SIRA » de
  `enregistreur_simple.html`, rangé par `npm run voice:import`, préparé par `piper_dataset.py preparer` ;
- viser **environ 1 h** de phrases propres (à mesurer : un premier essai peut se faire avec ~15 min pour juger
  l'accent, mais la qualité monte avec la quantité) ;
- **consentement écrit** du locuteur pour que sa voix devienne celle de SIRA (usage différent de l'entraînement
  de la transcription, qui ne reproduit pas sa voix).

Les enregistrements d'entraînement actuels (3 personnes, phrases courtes) servent à Whisper, pas à Piper : mélanger
plusieurs voix donnerait une voix sans identité.

**Entraînement** sur Colab, à partir du checkpoint choisi, puis export `.onnx` → `VOICE_PIPER_MALE_MODEL`.
Validation à l'oreille par des Ivoiriens + intelligibilité mesurée (Whisper retranscrit la voix produite : WER).

## 2. Transcription (Whisper)

D'abord ce qui ne demande aucun entraînement (déjà en partie fait) : liste de lieux dans le prompt, correcteur
de lieux. Puis :
- **affinage LoRA** de Whisper `small` sur les 40,8 min d'entraînement (Colab), encodeur gelé : peu de données,
  donc on n'adapte qu'une petite partie du modèle pour éviter le surapprentissage ;
- **évaluation** uniquement sur les lots de test (d'autres personnes, jamais vues à l'entraînement) avec
  `npm run voice:bench`, comparée à la référence (WER 19,1 %, 26/32) ;
- plus de voix différentes (femmes, accents, bruit de rue) vaut mieux que plus de phrases d'une seule voix.

## 3. Détection de la parole (Silero VAD)

Réglage avant entraînement : seuil, durée minimale de silence, marge autour de la parole, mesurés sur les
enregistrements réels (phrases coupées ou bruit pris pour de la parole). Un ré-entraînement n'est utile que si
ces mesures montrent un problème que les réglages ne corrigent pas.

## 4. Compréhension (CamemBERT)

Ré-affiner sur le notebook Colab existant (dataset fr-CI v0.4) en ajoutant les **vraies phrases** : les
transcriptions corrigées des enregistrements, avec intention et lieux annotés. Garder un lot de test séparé ;
mesurer intention (exactitude) et entités (F1) avant / après.

## 5. LLM local, chef d'orchestre

**Rôle** : comprendre les demandes complexes ou ambiguës, choisir les outils et formuler la réponse. **Jamais**
produire un prix, une durée ou un arrêt lui-même : ils viennent des outils (règle « données jamais inventées »).

```
question ─► Whisper ─► CamemBERT (rapide, cas simples) ─┬─► réponse directe
                                                         └─► LLM local (cas complexes) ─► outils :
                                                               • SIRA-MORE (trajets, recommandation)
                                                               • RAG (fiches knowledge/, réseau OSM, lieux)
                                                               • signalements, prix communautaires
                                                               • lieux du voyageur (Mes lieux)
```

**Modèle** : **Ministral 3 3B** (Apache 2.0, Q4_K_M, 2,1 Go), retenu après le banc d'essai du 2026-10-24 sur les
40 phrases de test réelles : bon outil 38/46, bon lieu 30/31, aucun chiffre inventé
(`services/voice/benchmarks/2026-10-24_llm-synthese.md`). Qwen3.5-2B est plus rapide mais appelle trop peu les outils ;
Qwen3.5-4B n'appelle les outils qu'avec sa réflexion (120 s). Moteur : llama.cpp (`llama-server`, API compatible
OpenAI), modèles téléchargés dans `services/models/llm/` (hors Git). Banc : `services/voice/scripts/bench_llm.py`.

**Temps de réponse** : 7,4 s en moyenne par réponse sur ce PC sans GPU (mesuré) ; c'est pourquoi CamemBERT
garde les cas simples et le LLM n'intervient que quand il apporte quelque chose.

**RAG** : remplacer la recherche RapidFuzz par des embeddings multilingues légers seulement si une mesure montre
des questions manquées ; indexer les fiches, le réseau (lignes, gares) et le répertoire de lieux.

**Évaluation** : un jeu de questions réelles avec la bonne réponse attendue ; comparer le pipeline actuel et le
pipeline avec LLM (réponses justes, chiffres tous issus des outils, temps de réponse).

## Ordre conseillé

1. Enregistrer la voix de SIRA (1 locuteur homme, consentement, ~1 h) ; essai Piper dès ~15 min.
2. Whisper LoRA + mesure sur les lots de test.
3. CamemBERT ré-affiné avec les vraies phrases.
4. Prototype LLM local derrière un interrupteur, mesuré contre le pipeline actuel.
5. Silero : réglages, ré-entraînement seulement si nécessaire.
