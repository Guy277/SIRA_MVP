"""Lieux du voyageur (Maison, Travail, « Chez Maman »…) envoyés par l'application avec la question.

Ils restent sur le téléphone : le service vocal les lit pour cette question seulement, ne les garde pas
et ne les journalise pas. « Emmène-moi à la maison » part alors de l'adresse que le voyageur a choisie.
"""
from __future__ import annotations

from .resolver import norm

# Ce que l'on dit pour « Maison » et « Travail » (après norm : minuscules, sans accents).
HOME_WORDS = ("maison", "chez moi", "domicile")
WORK_WORDS = ("travail", "boulot", "bureau", "job")
MAX_PLACES = 12
# Grand Abidjan large (District, Dabou, Bonoua, Alépé…) : une adresse ailleurs est ignorée.
LAT_RANGE, LON_RANGE = (5.0, 5.9), (-4.6, -3.4)


def clean_places(raw) -> list[dict]:
    """Lieux valides de la requête ; un nom de moins de 3 lettres trouverait des lieux dans toutes les phrases."""
    places: list[dict] = []
    for item in raw if isinstance(raw, list) else []:
        if not isinstance(item, dict):
            continue
        try:
            lat, lon = float(item["lat"]), float(item["lon"])
        except (KeyError, TypeError, ValueError):
            continue
        kind = item.get("kind") if item.get("kind") in ("home", "work", "custom") else "custom"
        label = str(item.get("label") or "").strip()[:40]
        title = str(item.get("title") or label).strip()[:120]
        if not title or not (LAT_RANGE[0] < lat < LAT_RANGE[1] and LON_RANGE[0] < lon < LON_RANGE[1]):
            continue
        if kind == "custom" and len(norm(label)) < 3:
            continue
        places.append({"kind": kind, "label": label, "title": title, "lat": lat, "lon": lon})
        if len(places) >= MAX_PLACES:
            break
    return places


def _words(place: dict) -> tuple[str, ...]:
    if place["kind"] == "home":
        return HOME_WORDS
    if place["kind"] == "work":
        return WORK_WORDS
    return (norm(place["label"]),)


def find_place(text: str, places: list[dict], skip: str | None = None) -> dict | None:
    """Le lieu du voyageur nommé dans la phrase (le nom le plus long gagne), au format d'un lieu du répertoire.

    skip : titre d'un lieu déjà pris ailleurs dans la phrase (« de la maison à… » : la maison est le départ).
    """
    said = f" {norm(text)} "
    best: tuple[int, str, dict] | None = None
    for place in places:
        if skip and place["title"] == skip:
            continue
        for word in _words(place):
            if word and f" {word} " in said and (best is None or len(word) > best[0]):
                best = (len(word), word, place)
    if best is None:
        return None
    _, word, place = best
    return {"place_id": f"perso:{place['kind']}", "canonical": place["title"], "kind": "personnel", "commune": None,
            "lat": place["lat"], "lon": place["lon"], "score": 100.0, "heard": word}
