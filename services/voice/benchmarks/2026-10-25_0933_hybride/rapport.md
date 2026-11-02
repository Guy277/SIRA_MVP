# Parakeet d'abord, Whisper en secours

- **Machine :** 11th Gen Intel(R) Core(TM) i7-1185G7 @ 3.00GHz · 2026-10-25 09:33
- **Whisper :** small, beam 5, int8 · **Parakeet :** TDT 0.6B v3 int8

| Voix | Circuit | Temps moyen | Pire | Repasse par Whisper | WER | Bon lieu |
|---|---|---|---|---|---|---|
| 2026-10-19 | whisper seul | 3.35 s | 6.33 s | 40/40 | 20.2 % | 26/32 |
| 2026-10-19 | parakeet + secours | 2.74 s | 5.27 s | 22/40 | 19.3 % | 28/32 |
| FRANCK_2026-10-24 | whisper seul | 3.30 s | 4.23 s | 40/40 | 40.7 % | 24/32 |
| FRANCK_2026-10-24 | parakeet + secours | 3.10 s | 5.17 s | 27/40 | 37.9 % | 23/32 |
| Marie_2026-10-24 | whisper seul | 3.46 s | 4.75 s | 40/40 | 22.3 % | 26/32 |
| Marie_2026-10-24 | parakeet + secours | 3.29 s | 23.41 s | 21/40 | 23.3 % | 27/32 |
