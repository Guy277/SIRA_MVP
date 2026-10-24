# Banc d'essai des LLM locaux (chef d'orchestre)

- **Machine :** DESKTOP-FJCLIQK · Intel64 Family 6 Model 140 Stepping 1, GenuineIntel · 2026-10-24 21:34
- **Moteur :** llama.cpp (b11868), température 0, sans réflexion
- **Questions :** 46 (40 phrases de test réelles + 6 écrites pour le banc)

| Modèle | Chargement | Réponse moy. | P90 | Bon outil | Bon lieu | Chiffres inventés | Illisibles |
|---|---|---|---|---|---|---|---|
| Qwen3.5-4B-Q4_K_M.gguf | 14.6 s | 7.5 s | 11.2 s | 12/46 | 5/5 | 4 | 0 |

Bon outil : l'outil attendu est appelé (ou aucun pour les questions hors sujet). Bon lieu : la destination
donnée à calculer_trajet contient le lieu attendu. Chiffre inventé : un chiffre écrit sans appel d'outil.
