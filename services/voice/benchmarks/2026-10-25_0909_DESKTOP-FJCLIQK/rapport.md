# Mesure de l'assistant vocal SIRA

- **Machine :** DESKTOP-FJCLIQK · Windows 11 (AMD64)
- **Processeur :** 11th Gen Intel(R) Core(TM) i7-1185G7 @ 3.00GHz (8 cœurs logiques)
- **Mémoire :** 15.7 Go
- **Carte graphique :** aucun GPU NVIDIA détecté
- **Date :** 2026-10-25T09:04:32
- **Phrases :** 40 (enregistrements fournis)

## Transcription (Whisper)

| Modèle | Beam | Appareil | Temps moyen / phrase | Pire phrase | Vitesse (× temps réel) | Erreur de mots (WER) | Bon lieu trouvé |
|---|---|---|---|---|---|---|---|
| small | 5 | cpu/int8 | 3.12 s | 3.64 s | 1.4 × | 22.3 % | 26/32 |
| small | 1 | cpu/int8 | 2.69 s | 3.12 s | 1.6 × | 26.1 % | 26/32 |

Vitesse × temps réel : au-dessus de 1, la phrase est transcrite plus vite qu'elle n'a été dite.

| Modèle | Origine | Chargement |
|---|---|---|
| small | local | 2.2 s |

## Compréhension (CamemBERT + répertoire de lieux)

- Chargement : 10.9 s · temps moyen par phrase : 126 ms

## Voix de SIRA (Piper)

| Réponse | Temps de synthèse | Durée de la voix |
|---|---|---|
| D'accord, je cherche ton trajet pour Cocody.… | 0.21 s | 2.6 s |
| Prends le gbaka à Adjamé Liberté, descends à Abobo Gare. Ça … | 0.48 s | 5.8 s |
| Il y a un embouteillage signalé sur ton trajet. Je te propos… | 0.39 s | 5.0 s |

## Attente estimée d'un usager (hors calcul du trajet)

Réglage le plus rapide : **small, beam 1** → transcription 2.69 s + compréhension 0.13 s + voix 0.36 s ≈ **3.2 s**.

Détail phrase par phrase : `resultats.csv`. Fiche de la machine : `machine.json`.
