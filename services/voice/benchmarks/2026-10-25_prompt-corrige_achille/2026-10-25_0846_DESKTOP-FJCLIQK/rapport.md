# Mesure de l'assistant vocal SIRA

- **Machine :** DESKTOP-FJCLIQK · Windows 11 (AMD64)
- **Processeur :** 11th Gen Intel(R) Core(TM) i7-1185G7 @ 3.00GHz (8 cœurs logiques)
- **Mémoire :** 15.7 Go
- **Carte graphique :** aucun GPU NVIDIA détecté
- **Date :** 2026-10-25T08:38:17
- **Phrases :** 40 (enregistrements fournis)

## Transcription (Whisper)

| Modèle | Beam | Appareil | Temps moyen / phrase | Pire phrase | Vitesse (× temps réel) | Erreur de mots (WER) | Bon lieu trouvé |
|---|---|---|---|---|---|---|---|
| small | 5 | cpu/int8 | 5.48 s | 6.72 s | 0.9 × | 20.2 % | 26/32 |
| small | 1 | cpu/int8 | 4.53 s | 5.13 s | 1.0 × | 21.9 % | 26/32 |

Vitesse × temps réel : au-dessus de 1, la phrase est transcrite plus vite qu'elle n'a été dite.

| Modèle | Origine | Chargement |
|---|---|---|
| small | local | 3.9 s |

## Compréhension (CamemBERT + répertoire de lieux)

- Chargement : 23.5 s · temps moyen par phrase : 217 ms

## Voix de SIRA (Piper)

| Réponse | Temps de synthèse | Durée de la voix |
|---|---|---|
| D'accord, je cherche ton trajet pour Cocody.… | 0.85 s | 2.6 s |
| Prends le gbaka à Adjamé Liberté, descends à Abobo Gare. Ça … | 0.87 s | 6.0 s |
| Il y a un embouteillage signalé sur ton trajet. Je te propos… | 0.83 s | 5.1 s |

## Attente estimée d'un usager (hors calcul du trajet)

Réglage le plus rapide : **small, beam 1** → transcription 4.53 s + compréhension 0.21 s + voix 0.85 s ≈ **5.6 s**.

Détail phrase par phrase : `resultats.csv`. Fiche de la machine : `machine.json`.
