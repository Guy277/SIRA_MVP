# Mesure de l'assistant vocal SIRA

- **Machine :** DESKTOP-FJCLIQK · Windows 11 (AMD64)
- **Processeur :** 11th Gen Intel(R) Core(TM) i7-1185G7 @ 3.00GHz (8 cœurs logiques)
- **Mémoire :** 15.7 Go
- **Carte graphique :** aucun GPU NVIDIA détecté
- **Date :** 2026-11-02T13:59:59
- **Phrases :** 40 (enregistrements fournis)

## Transcription (Whisper)

| Modèle | Beam | Appareil | Temps moyen / phrase | Pire phrase | Vitesse (× temps réel) | Erreur de mots (WER) | Bon lieu trouvé |
|---|---|---|---|---|---|---|---|
| small | 5 | cpu/int8 | 2.98 s | 3.78 s | 1.4 × | 22.3 % | 26/32 |
| sira-small-ft | 5 | cpu/int8 | 3.13 s | 5.09 s | 1.4 × | 8.6 % | 31/32 |

Vitesse × temps réel : au-dessus de 1, la phrase est transcrite plus vite qu'elle n'a été dite.

| Modèle | Origine | Chargement |
|---|---|---|
| small | local | 2.3 s |
| sira-small-ft | local | 0.9 s |

## Compréhension (CamemBERT + répertoire de lieux)

- Chargement : 13.5 s · temps moyen par phrase : 137 ms

## Voix de SIRA (Piper)

| Réponse | Temps de synthèse | Durée de la voix |
|---|---|---|
| D'accord, je cherche ton trajet pour Cocody.… | 0.21 s | 2.6 s |
| Prends le gbaka à Adjamé Liberté, descends à Abobo Gare. Ça … | 0.42 s | 6.0 s |
| Il y a un embouteillage signalé sur ton trajet. Je te propos… | 0.44 s | 5.2 s |

## Attente estimée d'un usager (hors calcul du trajet)

Réglage le plus rapide : **small, beam 5** → transcription 2.98 s + compréhension 0.13 s + voix 0.36 s ≈ **3.5 s**.

Détail phrase par phrase : `resultats.csv`. Fiche de la machine : `machine.json`.
