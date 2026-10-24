# Banc d'essai des LLM locaux (chef d'orchestre)

- **Machine :** DESKTOP-FJCLIQK · Intel64 Family 6 Model 140 Stepping 1, GenuineIntel · 2026-10-24 21:27
- **Moteur :** llama.cpp (b11868), température 0, sans réflexion
- **Questions :** 46 (40 phrases de test réelles + 6 écrites pour le banc)

| Modèle | Chargement | Réponse moy. | P90 | Bon outil | Bon lieu | Chiffres inventés | Illisibles |
|---|---|---|---|---|---|---|---|
| Qwen3.5-2B-Q4_K_M.gguf | 9.7 s | 5.4 s | 7.1 s | 31/46 | 26/26 | 0 | 0 |
| Ministral-3-3B-Instruct-2512-Q4_K_M.gguf | 14.6 s | 7.4 s | 10.1 s | 38/46 | 30/31 | 0 | 0 |

Bon outil : l'outil attendu est appelé (ou aucun pour les questions hors sujet). Bon lieu : la destination
donnée à calculer_trajet contient le lieu attendu. Chiffre inventé : un chiffre écrit sans appel d'outil.
