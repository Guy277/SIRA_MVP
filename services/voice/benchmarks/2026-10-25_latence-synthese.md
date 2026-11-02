# Temps de réponse de la voix : où passe le temps, et comment le réduire (2026-10-25)

PC de dev (i7-1185G7, 16 Go, sans GPU NVIDIA), pile SIRA arrêtée, aucune autre mesure en parallèle.
Enregistrements de test réels, 40 phrases par voix : Achille (`2026-10-19`), Franck et Marie (`test/*_2026-10-24`).
Détail Whisper : `2026-10-25_*_DESKTOP-FJCLIQK/` ; Parakeet mesuré avec les mêmes calculs (`benchmark_voice.py` :
taux d'erreur de mots, lieu trouvé par CamemBERT + répertoire de lieux).

## Ce que l'usager attend aujourd'hui

| Étape | Réglage | Temps |
|---|---|---|
| L'appli attend la fin de la phrase | 1,2 s de silence (`mobile/lib/use-microphone.ts`) | 1,2 s |
| Silero + Whisper `small` int8, beam 5 | prompt des communes | **3,1 à 4,6 s** |
| CamemBERT + lieux | — | 0,14 à 0,22 s |
| Voix pierre (MP3) | — | 0,4 à 0,7 s |
| Calcul du trajet (SIRA-MORE) | — | variable, non mesuré ici |

Whisper est l'étape la plus longue.

## Whisper : réglages

| Voix | Beam 5 : temps / WER / lieux | Beam 1 : temps / WER / lieux |
|---|---|---|
| Achille | 4,64 s / 20,2 % / 26/32 | 3,32 s / 21,9 % / 26/32 |
| Franck | 4,50 s / 40,7 % / 24/32 | 3,98 s (pire : **26,2 s**, boucle) / 40,2 % / 24/32 |
| Marie | 3,12 s / 22,3 % / 26/32 | 2,69 s / 26,1 % / 26/32 |

Beam 1 ne fait gagner que 0,4 à 1,3 s et Whisper peut s'emballer (26 s sur une phrase) : pas retenu.

## Parakeet TDT 0.6B v3 (NVIDIA, CC BY 4.0, int8 ONNX via `onnx-asr`, 670 Mo)

| Voix | Temps / phrase (pire) | WER | Lieux |
|---|---|---|---|
| Achille | **0,54 s** (0,75 s) | 24,5 % | 23/32 |
| Franck | **0,46 s** (0,71 s) | 36,2 % | 17/32 |
| Marie | **0,50 s** (0,72 s) | 25,5 % | 22/32 |

**8 fois plus rapide que Whisper**, mais moins bon sur les noms d'Abidjan (pas de prompt possible) :
« Yubogo », « Abobou », « Jami » (Adjamé), « Makuri » (Marcory), « 1G ville » / « 13 ville » (Treichville),
« Warwall » (wôrô-wôrô).

## Pistes, de la plus rapide à mettre en place à la plus longue

1. **Parakeet d'abord, Whisper seulement en secours** : quand Parakeet ne donne pas de lieu sûr, la même phrase
   repasse par Whisper. Rapide dans les cas clairs, aussi juste que Whisper dans les autres. À mesurer : part des
   phrases qui repasseraient par Whisper, et lieux faux mais sûrs.
2. **Apprendre au répertoire les mots de Parakeet** (« Jami », « Makuri »…) comme variantes, relevées sur les
   enregistrements d'entraînement (jamais sur ceux de test).
3. **Affiner Parakeet** sur les 41 min d'entraînement (Colab, NeMo) : la vraie solution pour les noms ivoiriens.
4. **Fin de phrase** : 1,2 s de silence avant l'envoi ; 0,8 s ferait gagner 0,4 s mais couperait les gens qui
   marquent une pause. À tester avec des usagers.
5. **CamemBERT en ONNX int8** : gain de l'ordre de 0,1 s, faible priorité.
