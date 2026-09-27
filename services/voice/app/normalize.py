"""Conversion des entités extraites (texte parlé) en valeurs attendues par l'API SIRA."""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

from .resolver import norm, strip_accents

# Modes de l'API SIRA : sotra, gbaka, woro, boat, taxi, walk
_MODES = [
    (r"\bwo+ro\b|\bworo ?woro\b|\bworowo\b|\boro oro\b|\bvoro\b", "woro"),
    (r"\bg?baka\b|\bgbaca\b|\bgabaka\b", "gbaka"),
    (r"\bbateau\b|\bbateau ?bus\b|\bferry\b|\bpinasse\b", "boat"),
    (r"\btaxi\b|\bcompteur\b", "taxi"),
    (r"\bsotra\b|\bbus\b|\bautobus\b|\bsotrat\b", "sotra"),
    (r"\bpied\b|\bmarche\b", "walk"),
]

MODE_LABELS = {"sotra": "bus SOTRA", "gbaka": "gbaka", "woro": "wôrô-wôrô", "boat": "bateau-bus", "taxi": "taxi", "walk": "marche"}


def mode_code(text: str) -> str | None:
    n = norm(text)
    for pattern, code in _MODES:
        if re.search(pattern, n):
            return code
    return None


_NUMBER_WORDS = [
    ("deux mille cinq cents", 2500), ("mille cinq cents", 1500), ("deux cent cinquante", 250),
    ("cinq mille", 5000), ("trois mille", 3000), ("deux mille", 2000), ("mille", 1000),
    ("sept cents", 700), ("cinq cents", 500), ("trois cents", 300), ("deux cents", 200), ("cent", 100),
]
_BARRES = {"une": 1, "1": 1, "deux": 2, "2": 2, "trois": 3, "3": 3, "quatre": 4, "4": 4, "cinq": 5, "5": 5}


def budget_fcfa(text: str) -> int | None:
    """« une barre » -> 1000 ; « deux barres » -> 2000 ; « 1 500 F » -> 1500 ; « cinq cents francs » -> 500."""
    # normalisation propre au montant : pas celle des lieux (qui transforme « cinq » en « 5 »)
    n = re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]+", " ", strip_accents(text.lower()))).strip()
    m = re.search(r"\b(une|un|\d|deux|trois|quatre|cinq)\s+barres?\b", n)
    if m:
        return 1000 * _BARRES.get(m.group(1), 1)
    m = re.search(r"\d[\d ]*\d|\d", n)
    if m:
        return int(m.group(0).replace(" ", ""))
    for words, value in _NUMBER_WORDS:
        if re.search(rf"\b{words}\b", n):
            return value
    return None


ABIDJAN = timezone.utc  # Côte d'Ivoire : UTC+0 toute l'année


def departure_at(text: str, now: datetime | None = None) -> str | None:
    """Heure de départ parlée -> ISO 8601 ; None = maintenant."""
    now = now or datetime.now(ABIDJAN)
    n = norm(text)
    if re.search(r"maintenant|tout de suite|direct", n):
        return None
    m = re.search(r"dans (\d+) ?(min|minutes?)", n)
    if m:
        return (now + timedelta(minutes=int(m.group(1)))).isoformat()
    m = re.search(r"dans (\d+) ?(h|heures?)", n)
    if m:
        return (now + timedelta(hours=int(m.group(1)))).isoformat()
    day = now + timedelta(days=1) if "demain" in n else now
    m = re.search(r"\b(\d{1,2}) ?(?:h|heures?) ?(\d{2})?\b", n)
    if m:
        hour, minute = int(m.group(1)), int(m.group(2) or 0)
    elif "midi" in n:
        hour, minute = 12, 0
    elif "soir" in n:
        hour, minute = 19, 0
    elif "apres midi" in n:
        hour, minute = 15, 0
    elif "matin" in n:
        hour, minute = 7, 30
    else:
        return None
    if not (0 <= hour <= 23 and 0 <= minute <= 59):
        return None
    target = day.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if target < now and "demain" not in n:
        target += timedelta(days=1)
    return target.isoformat()


PREFERENCE_BY_INTENT = {"ask_fastest": "fast", "ask_cheapest": "cheap"}
