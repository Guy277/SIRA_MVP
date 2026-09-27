"""Réponses courtes pendant le trajet : « oui / non » et le prix payé.

Le guidage pose des questions fermées (« Accident signalé, tu veux le contourner ? »,
« Combien as-tu payé le gbaka ? ») : pas besoin de CamemBERT ni de SIRA-MORE,
il suffit de lire la transcription. Aucun montant n'est deviné : si le nombre
n'est pas clairement dit, on renvoie None et l'application redemande à l'écran.
"""
from __future__ import annotations

import re

from .resolver import strip_accents

YES = {"oui", "ouais", "ok", "okay", "d accord", "vas y", "ya foye", "yafoye", "on y va", "c est bon", "bien sur",
       "prends le", "je prends", "voila", "exactement", "toujours la", "c est toujours la", "il est toujours la"}
NO = {"non", "pas besoin", "laisse", "laisse tomber", "non merci", "c est fini", "plus la", "il n y a plus rien",
      "garde le mien", "je garde", "y a plus"}

UNITS = {"zero": 0, "un": 1, "une": 1, "deux": 2, "trois": 3, "quatre": 4, "cinq": 5, "six": 6, "sept": 7, "huit": 8,
         "neuf": 9, "dix": 10, "onze": 11, "douze": 12, "treize": 13, "quatorze": 14, "quinze": 15, "seize": 16,
         "vingt": 20, "trente": 30, "quarante": 40, "cinquante": 50, "soixante": 60}
# Aucun transport d'Abidjan ne coûte moins de 25 F : « un gbaka à 200 » vaut 200, pas 1.
MIN_FARE = 25
# Au-delà d'un trajet en taxi compteur à travers Abidjan, c'est une erreur d'écoute.
MAX_FARE = 20_000


def _plain(text: str) -> str:
    """Minuscules sans accents ni ponctuation (« D'accord ! » → « d accord »), chiffres intacts."""
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]+", " ", strip_accents(text.lower()))).strip()


def yes_no(text: str) -> str | None:
    """'yes', 'no' ou None quand c'est flou (« non… il est toujours là ») : l'écran reprend la main."""
    words = f" {_plain(text)} "
    no = any(f" {phrase} " in words for phrase in NO)
    yes = any(f" {phrase} " in words for phrase in YES)
    return None if yes == no else "yes" if yes else "no"


def _words_to_number(words: list[str]) -> int | None:
    total, current, seen = 0, 0, False
    for word in words:
        if word == "vingt" and current % 100 == 4:
            current += 76  # quatre-vingt
        elif word in UNITS:
            current += UNITS[word]
        elif word in ("cent", "cents"):
            current = (current or 1) * 100
        elif word == "mille":
            total += (current or 1) * 1000
            current = 0
        elif word == "et" and seen:
            continue
        else:
            break
        seen = True
    return total + current if seen else None


def parse_amount(text: str) -> int | None:
    """« 500 », « 1 000 francs », « cinq cents », « deux mille cinq cents F » → montant en FCFA."""
    clean = _plain(text)
    candidates = []
    for digits in re.finditer(r"\d{1,3}(?: \d{3})+|\d+", clean):
        value = int(digits.group(0).replace(" ", ""))
        if clean[digits.end():].lstrip().startswith("mille"):
            value *= 1000
        candidates.append(value)
    words = clean.split()
    candidates += [number for i in range(len(words)) if (number := _words_to_number(words[i:])) is not None]
    return next((value for value in candidates if MIN_FARE <= value <= MAX_FARE), None)
