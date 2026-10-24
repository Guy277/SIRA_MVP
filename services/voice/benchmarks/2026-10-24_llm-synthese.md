# LLM local, chef d'orchestre : synthèse du banc d'essai du 2026-10-24

Banc : `services/voice/scripts/bench_llm.py`. Détail par question : `2026-10-24_2127_llm/` (Qwen3.5-2B, Ministral 3 3B)
et `2026-10-24_2134_llm/` (Qwen3.5-4B).

- **Machine :** PC de dev, i7-1185G7 (4 cœurs), 16 Go, sans GPU NVIDIA ; pile SIRA arrêtée pendant les mesures.
- **Moteur :** llama.cpp b11868 (version processeur x64), modèles en Q4_K_M, température 0, sans réflexion.
- **Questions :** 46 = les 40 phrases de test réelles (`phrases_test_voix.csv`) + 6 écrites pour le banc
  (Mes lieux, hors sujet, piège sur un prix). Le modèle doit appeler le bon outil ; il ne doit jamais donner un
  chiffre lui-même.

| Modèle (licence) | Taille | Réponse moy. | P90 | Bon outil | Bon lieu | Chiffres inventés |
|---|---|---|---|---|---|---|
| **Ministral 3 3B** (Apache 2.0) | 2,1 Go | 7,4 s | 10,1 s | **38/46** | **30/31** | 0 |
| Qwen3.5-2B (Apache 2.0) | 1,3 Go | 5,4 s | 7,1 s | 31/46 | 26/26 | 0 |
| Qwen3.5-4B (Apache 2.0) | 2,7 Go | 7,5 s | 11,2 s | 12/46 | 5/5 | 4 |

## Ce que montrent les réponses

- **Qwen3.5-4B** annonce l'outil (« je calcule ton trajet ») sans l'appeler. Vérifié à part : **avec réflexion**, il
  appelle bien `calculer_trajet(destination="Adjamé")`, mais en **120 s** (contre 53 s sans réflexion pour la même
  question, modèle juste chargé ; 7,5 s en moyenne une fois lancé). Les petits Qwen3.5 semblent entraînés à réfléchir
  avant un outil : trop lent sur processeur.
- **Qwen3.5-2B** répond souvent lui-même au lieu d'appeler l'outil (« tu peux prendre le bus SOTRA ou le bateau-bus »
  pour Yopougon) ou se trompe d'outil (`chercher_info` pour un trajet). Rapide, mais pas assez fiable.
- **Ministral 3 3B** appelle le bon outil presque partout, avec le bon lieu. Ses erreurs :
  - **une définition inventée** : « un coulé = une route barrée ou inondée » (faux : c'est l'option la moins chère).
    Le compteur de chiffres ne voit pas ce genre d'erreur ; il faut forcer les questions sur SIRA vers `chercher_info` ;
  - un départ supposé (« Maison ») qu'on ne lui a pas donné (T18) ;
  - « je rentre à la maison » et « chez Tantie » : il redemande au lieu d'utiliser les lieux enregistrés ;
  - « Non, c'est Riviera Palmeraie » et « Ça fait combien ? » sans contexte : il redemande (comportement acceptable).

## Conclusion

- **Ministral 3 3B est retenu** pour la suite du prototype : meilleur choix d'outils, aucun chiffre inventé, licence
  Apache 2.0, 2,1 Go.
- **7,4 s par réponse** sur ce PC, en plus de la transcription (~6,5 s) : le LLM ne doit intervenir que quand
  CamemBERT ne suffit pas (demande complexe ou ambiguë). Le serveur de test AWS (t3.large, 2 vCPU) sera plus lent
  que ce PC : à mesurer avant tout usage en production, ou prévoir une machine avec GPU.
- À faire avant de l'utiliser : questions sur SIRA toujours via `chercher_info` (jamais de définition de mémoire),
  aucun départ supposé, lieux enregistrés utilisés directement ; puis refaire ce banc.
