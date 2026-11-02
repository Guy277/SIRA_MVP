# Parakeet d'abord, Whisper en secours

- **Machine :** 11th Gen Intel(R) Core(TM) i7-1185G7 @ 3.00GHz · 2026-11-02 11:50
- **Whisper :** small, beam 5, int8, température 0, au plus 8 jetons/s (+ 16) · **Parakeet :** TDT 0.6B v3 int8
- **Conditions :** PC sur batterie, pile SIRA lancée. Pendant Franck et Marie, une autre mesure (`2026-11-02_1147_hybride`)
  tournait en même temps : leurs temps ne sont **pas comparables** au 2026-10-25. La voix 2026-10-19 (Achille), mesurée
  seule, l'est. WER, bons lieux et boucles restent valables pour les trois voix.

| Voix | Circuit | Temps moyen | Pire | Repasse par Whisper | Whisper boucle | WER | Bon lieu |
|---|---|---|---|---|---|---|---|
| 2026-10-19 | whisper seul | 3.20 s | 4.07 s | 40/40 | 0 | 20.2 % | 26/32 |
| 2026-10-19 | parakeet + secours | 2.76 s | 5.59 s | 22/40 | 0 | 19.3 % | 28/32 |
| FRANCK_2026-10-24 | whisper seul | 7.69 s | 28.11 s | 40/40 | 0 | 40.7 % | 24/32 |
| FRANCK_2026-10-24 | parakeet + secours | 6.41 s | 27.75 s | 27/40 | 0 | 37.9 % | 23/32 |
| Marie_2026-10-24 | whisper seul | 9.53 s | 22.33 s | 40/40 | 0 | 22.3 % | 26/32 |
| Marie_2026-10-24 | parakeet + secours | 7.53 s | 22.60 s | 21/40 | 0 | 23.3 % | 27/32 |
