# Mesure de l'assistant vocal SIRA

- **Machine :** DESKTOP-FJCLIQK · Windows 11 (AMD64)
- **Processeur :** 11th Gen Intel(R) Core(TM) i7-1185G7 @ 3.00GHz (8 cœurs logiques)
- **Mémoire :** 15.7 Go
- **Carte graphique :** aucun GPU NVIDIA détecté
- **Date :** 2026-10-25T08:46:20
- **Phrases :** 40 (enregistrements fournis)

## Transcription (Whisper)

| Modèle | Beam | Appareil | Temps moyen / phrase | Pire phrase | Vitesse (× temps réel) | Erreur de mots (WER) | Bon lieu trouvé |
|---|---|---|---|---|---|---|---|
| small | 5 | cpu/int8 | 5.50 s | 7.32 s | 0.7 × | 40.7 % | 24/32 |
| small | 1 | cpu/int8 | 6.27 s | 75.22 s | 0.9 × | 41.4 % | 24/32 |

Vitesse × temps réel : au-dessus de 1, la phrase est transcrite plus vite qu'elle n'a été dite.

| Modèle | Origine | Chargement |
|---|---|---|
| small | local | 3.6 s |

## Compréhension (CamemBERT + répertoire de lieux)

- Chargement : 21.8 s · temps moyen par phrase : 217 ms

## Voix de SIRA (Piper)

| Réponse | Temps de synthèse | Durée de la voix |
|---|---|---|
| D'accord, je cherche ton trajet pour Cocody.… | 0.86 s | 2.5 s |
| Prends le gbaka à Adjamé Liberté, descends à Abobo Gare. Ça … | 0.89 s | 5.8 s |
| Il y a un embouteillage signalé sur ton trajet. Je te propos… | 0.97 s | 5.3 s |

## Attente estimée d'un usager (hors calcul du trajet)

Réglage le plus rapide : **small, beam 5** → transcription 5.50 s + compréhension 0.21 s + voix 0.91 s ≈ **6.6 s**.

Détail phrase par phrase : `resultats.csv`. Fiche de la machine : `machine.json`.
