# Parakeet d'abord, Whisper en secours

- **Machine :** 11th Gen Intel(R) Core(TM) i7-1185G7 @ 3.00GHz · 2026-11-02 12:03
- **Whisper :** small, beam 5, int8, température 0, au plus 8 jetons/s (+ 16) · **Parakeet :** TDT 0.6B v3 int8
- **Conditions : temps NON comparables au 2026-10-25.** Marie relancée seule après `2026-11-02_1147_hybride` et
  `2026-11-02_1150_hybride` (finies et commitées à 11:51), mais les temps restent environ 2 fois plus longs que le
  2026-10-25 : Whisper seul 7,76 s en moyenne au lieu de 3,46 s, Parakeet 2,05 s en médiane au lieu de 0,93 s. La cause
  n'a pas été relevée au moment de la mesure. Les 80 transcriptions sont identiques mot pour mot à celles du
  2026-10-25 et de `2026-11-02_1150_hybride` : WER, bons lieux et boucles restent valables.

| Voix | Circuit | Temps moyen | Pire | Repasse par Whisper | Whisper boucle | WER | Bon lieu |
|---|---|---|---|---|---|---|---|
| Marie_2026-10-24 | whisper seul | 7.76 s | 14.92 s | 40/40 | 0 | 22.3 % | 26/32 |
| Marie_2026-10-24 | parakeet + secours | 6.35 s | 18.77 s | 21/40 | 0 | 23.3 % | 27/32 |
