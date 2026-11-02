# Latence de Piper et du LLM : mesures du 2026-10-25

- **Machine :** PC de dev, i7-1185G7 (4 cœurs), 16 Go, sans GPU NVIDIA, **sur batterie** (Windows le signale
  « en décharge », mode d'alimentation « Utilisation normale ») ; pile SIRA arrêtée. Branché sur secteur, les temps
  peuvent être meilleurs : à remesurer.
- **Piper :** voix upmc, pierre (locuteur 1), vitesse 1,1, intonation D (0,5 / 0,6), MP3 40 kbit/s.
- **LLM :** Ministral 3 3B Q4_K_M, llama.cpp b11868 (processeur x64), prompt et outils de `bench_llm.py`.

## Piper : il faut attendre toute la réponse avant le premier son

Médiane de 3 essais. « 1re phrase » = le texte jusqu'au premier `.`, `?`, `!` ou `:`.

| Réponse | Tout (Piper + MP3) | Voix produite | 1re phrase seule |
|---|---|---|---|
| Trajet (modèle de `_journey_reply`, valeurs d'exemple) | **3,40 s** (2,78 + 0,62) | 12,5 s | **0,51 s** |
| Aide (texte de `dialog.py`) | 2,25 s (1,80 + 0,45) | 8,7 s | 1,67 s |
| Relance courte (texte de `dialog.py`) | 0,93 s (0,74 + 0,18) | 3,1 s | 0,64 s |

Piper produit la voix 4 à 5 fois plus vite qu'elle ne se parle : en envoyant la première phrase dès qu'elle est
prête, puis les suivantes pendant qu'elle est jouée, le premier son d'un trajet arrive après ~0,5 s au lieu de 3,4 s.
Les phrases fixes (relances, aide, accueil) peuvent être produites une fois au démarrage : 0 s ensuite.

## LLM : presque tout le temps part dans l'écriture

6 questions de SIRA après une question de chauffe (`Bonjour`) ; `timings` renvoyés par llama-server.

| Réglage | Total moyen | Lecture du prompt | Écriture |
|---|---|---|---|
| Par défaut, cache du prompt | 8,3 s | 1,0 s (11 jetons nouveaux) | 7,2 s (34 jetons, 5,0 jetons/s) |
| **Sans cache du prompt** | **42,6 s** | **34,9 s (845 jetons)** | 7,7 s (36 jetons) |
| 4 fils (`-t 4`) | 8,1 s | 1,0 s | 7,0 s (4,9 jetons/s) |
| 8 fils (`-t 8`) | 7,2 s | 0,8 s | 6,4 s (5,6 jetons/s) |

Vitesse brute (`llama-bench`, 2 essais) : lecture 31 jetons/s (4 fils) et 36 jetons/s (8 fils) ; écriture
**7,6 jetons/s (4 fils)** et 5,8 ± 0,9 jetons/s (8 fils). L'écriture est limitée par la mémoire du PC : un réglage
ne la fera pas doubler.

À retenir :
- **le cache du prompt est indispensable** : sans lui, 35 s rien que pour relire les consignes et les outils. Tout ce
  qui change d'une demande à l'autre (Mes lieux, position, trajet en cours) doit venir *après* la partie fixe ;
- un appel d'outil fait ~34 jetons, soit 5 à 7 s d'écriture sur ce PC ;
- Qwen3.5-2B (banc du 2026-10-24) n'était que 27 % plus rapide (5,4 s contre 7,4 s) et appelait moins bien les outils.

## Après : SIRA parle phrase par phrase (mesuré le 2026-10-28, PC sur secteur)

Le service découpe la réponse (`reply_parts`), envoie la voix de la première phrase avec la réponse et prépare les
suivantes pendant qu'elle est jouée ; l'application les demande à `/voice/tts`. Les phrases fixes de `dialog.py`
(`FIXED_REPLIES`) sont produites au démarrage.

Vrai service (port 8200), position « Cocody Danga » des tests, calcul de trajet déjà à chaud. « Avant » = réponse
sans voix + voix de toute la réponse ; « maintenant » = réponse avec la voix de la première phrase.

| Question | Phrases | Avant | Maintenant |
|---|---|---|---|
| Je veux aller à Adjamé. | 3 | 2,42 s | **0,98 s** |
| Je vais au Plateau. | 2 | 1,64 s | 1,12 s |
| Je veux aller à Yopougon. | 2 | 1,39 s | 0,74 s |
| Le gbaka pour Abobo, c'est combien ? | 2 | 1,38 s | 0,63 s |
| Je veux aller à Treichville. | 2 | 1,25 s | 0,74 s |
| Je veux aller à Marcory. | 2 | 1,42 s | 0,72 s |
| Je vais à Koumassi. | 2 | 1,69 s | 1,05 s |
| Phrase fixe (« Pardon, je n'ai rien entendu… ») | — | — | **0,00 s** |

Le moteur ne proposait ce jour-là que des trajets en taxi (réponses de 2 ou 3 phrases) : sur une réponse longue en
gbaka, le gain mesuré plus haut sur Piper seul est plus grand (3,4 s → 0,5 s).

Dans l'appli web (assistant vocal, exemple « Je quitte Yopougon, je vais au Plateau ») : premier son 1,7 s après le
toucher (calcul du trajet compris, via l'API), puis les 3 phrases à la suite.
