# Modèles d'IA des services SIRA (`services/models/`)

La réserve de modèles des services. **Les modèles ne sont pas dans Git** (trop lourds) : seul ce fichier l'est.
Un modèle utilisé par un service va dans `services/models/<usage>/`.

```
services/models/
├── voice/                      assistant vocal (services/voice) — ≈ 1,4 Go
│   ├── sira_models_v0.4/       CamemBERTv2 fine-tuné fr-CI (intention + entités) + 2 259 lieux
│   ├── whisper/small/          voix → texte (faster-whisper, int8)
│   └── piper/                  texte → voix (fr_FR-siwis-medium)
└── README.md
```

| Modèle | Usage | Licence | Comment l'obtenir |
|---|---|---|---|
| `voice/sira_models_v0.4/` | comprendre la demande (fr-CI) | MIT (CamemBERTv2) | sortie du notebook Colab de SIRA, copiée à la main |
| `voice/whisper/small/` | transcrire la voix | MIT | `npm run voice:setup` (une fois) |
| `voice/piper/fr_FR-siwis-medium.onnx` | lire la réponse | CC BY 4.0 | `npm run voice:setup` (une fois) |

Ensuite, tout fonctionne **sans Internet**. Pour un serveur (hébergement chez un opérateur), copier ce dossier tel quel :
Podman le monte dans le conteneur de la voix (`/models/voice`, voir `infra/compose.yaml`).

## Changer ou ajouter un modèle

- **Autre Whisper** (`turbo`, `large-v3`) : `VOICE_WHISPER_MODEL=turbo` puis `npm run voice:setup`.
- **Autre voix Piper** : poser le `.onnx` et son `.onnx.json` dans `voice/piper/`, puis `VOICE_PIPER_MODEL=…`.
- **Nouvelle version des modèles fr-CI** (`sira_models_v0.5`) : la poser à côté de la v0.4, puis `VOICE_MODELS_DIR=…`.
- **Grand modèle de langage (Qwen, Mistral…)** : il ne se range pas ici. Il est servi par **Ollama**, qui garde ses
  propres fichiers ; SIRA l'appelle par son adresse (`http://127.0.0.1:11434`), comme un service de plus.

Le dossier entier peut être déplacé ailleurs : `VOICE_MODELS_ROOT=<chemin>` (dans l'environnement du service vocal).
