# Parakeet d'abord, Whisper en secours

- **Machine :** 11th Gen Intel(R) Core(TM) i7-1185G7 @ 3.00GHz · 2026-11-02 11:47
- **Whisper :** small, beam 5, int8, température 0, au plus 8 jetons/s (+ 16) · **Parakeet :** TDT 0.6B v3 int8
- **Conditions : temps NON comparables au 2026-10-25.** PC sur batterie, pile SIRA lancée (LLM, voix, Expo), Chrome
  et Teams ouverts, et une autre mesure lancée en même temps (`2026-11-02_1150_hybride`) : toutes les étapes environ 3 fois plus lentes (Parakeet 2,5 s au lieu de 0,5 s sur T27, contrôlé à
  part). WER, bons lieux et boucles restent valables : ils ne dépendent pas de la vitesse de la machine.

| Voix | Circuit | Temps moyen | Pire | Repasse par Whisper | Whisper boucle | WER | Bon lieu |
|---|---|---|---|---|---|---|---|
| Marie_2026-10-24 | whisper seul | 11.55 s | 36.26 s | 40/40 | 0 | 22.3 % | 26/32 |
| Marie_2026-10-24 | parakeet + secours | 9.56 s | 32.25 s | 21/40 | 0 | 23.3 % | 27/32 |
