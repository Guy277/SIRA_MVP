"""Correcteur de lieux : retrouve un lieu du répertoire même si le nom est mal prononcé ou mal transcrit.

Même logique que le notebook d'entraînement (mesurée sur le test v0.4) :
similarité de texte (RapidFuzz) + « clé sonore » phonétique, pénalité quand le candidat est
bien plus court que ce qui a été dit, et règle de marge entre les deux meilleurs candidats.
"""
from __future__ import annotations

import json
import math
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path

from rapidfuzz import fuzz, process

# L'ordre compte : les nombres composés avant « vingt » seul. « vingt » → 20 : sans lui, « adja mé vingt logement »
# hésitait entre Adjamé 220 Logements et Pharmacie la Mé (seule la syllabe « mé » en commun) ; 0 régression sur 867 noms.
NUMS = {"deux cent vingt": "220", "deux cents": "200", "vingt sept": "27", "dix huit": "18", "deux": "2", "trois": "3",
        "quatre": "4", "cinq": "5", "premier": "1er", "deuxieme": "2e", "vingt": "20"}

PHON = [(r"dj", "j"), (r"gb", "b"), (r"kp", "p"), (r"ph", "f"), (r"qu", "k"), (r"c(?=[eiy])", "s"), (r"ck", "k"), (r"c", "k"),
        (r"x", "ks"), (r"y", "i"), (r"eau|au", "o"), (r"ou", "u"), (r"ai|ei", "e"), (r"(er|ez|et)\b", "e"),
        (r"[ae]n(?=[^aeiou]|\b)", "an"), (r"om(?=[^aeiou]|\b)", "on"), (r"h", ""), (r"w", "u"), (r"(\w)\1", r"\1"),
        (r"(?<=\w)[stdx]\b", ""), (r"(?<=\w{3})e\b", ""), (r"r(?=[^aeiou ])", "")]

KIND_BONUS = {"commune": 3, "quartier": 2, "poi": 1}
GENERIC_PENALTY = 8


def strip_accents(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", text) if unicodedata.category(c) != "Mn")


def norm(text: str) -> str:
    s = strip_accents(text.lower()).replace("’", "'")
    s = re.sub(r"[^a-z0-9' ]+", " ", s)
    for word, number in NUMS.items():
        s = re.sub(rf"\b{word}\b", number, s)
    s = re.sub(r"\b(lgts?|logement|logements)\b", "logements", s)
    s = re.sub(r"\bst\b", "saint", s)
    s = re.sub(r"\bgrd\b", "grand", s)
    s = re.sub(r"^(le|la|les|l') ", "", s)
    return re.sub(r"\s+", " ", s).strip()


def same_name(a: str, b: str) -> bool:
    """Mêmes mots, ordre libre : « Adjamé 220 Logements » et « 220 Lgts Adjamé » sont le même lieu, pas un choix à poser."""
    return sorted(norm(a).split()) == sorted(norm(b).split())


# « Terminus Williamsville », « Gare Gesco », « Arrêt Anador » : l'arrêt qui porte le nom du quartier.
STOP_PREFIX = re.compile(r"^(terminus|gare|arret|arrets)\s+")
SAME_PLACE_M = 1500


def same_place(a: "Match", b: "Match") -> bool:
    """« Williamsville » et « Terminus Williamsville » à moins de 1,5 km : le même endroit, pas un choix à poser.
    Sans cette règle, SIRA demandait « Williamsville ou Terminus Williamsville ? » pour les lieux les plus demandés."""
    if same_name(a.canonical, b.canonical):
        return True
    if None in (a.lat, a.lon, b.lat, b.lon):
        return False
    # « Akouédo (Cocody) » : la commune entre parenthèses ne change pas le nom ; la distance tranche ensuite.
    bare = lambda m: STOP_PREFIX.sub("", norm(re.sub(r"\s*\([^)]*\)$", "", m.canonical)))  # noqa: E731
    if bare(a) != bare(b):
        return False
    return 111_320 * math.hypot(a.lat - b.lat, (a.lon - b.lon) * math.cos(math.radians(a.lat))) <= SAME_PLACE_M


def phon(text: str) -> str:
    s = norm(text)
    for pattern, replacement in PHON:
        s = re.sub(pattern, replacement, s)
    return s.replace(" ", "").replace("'", "")


@dataclass
class Match:
    place_id: str
    canonical: str
    kind: str
    commune: str | None
    lat: float | None
    lon: float | None
    score: float

    def as_dict(self) -> dict:
        return {"place_id": self.place_id, "canonical": self.canonical, "kind": self.kind, "commune": self.commune,
                "lat": self.lat, "lon": self.lon, "score": round(self.score, 1)}


def apply_complements(places: list[dict], complements_path: Path | None) -> list[dict]:
    """Ajoute à la liste du notebook les corrections tenues dans Git (knowledge/lieux_complements.json) :
    lieux ajoutés, coordonnées manquantes, variantes d'orthographe, commune exacte (frontières OpenStreetMap)."""
    if not complements_path or not Path(complements_path).exists():
        return places
    extra = json.loads(Path(complements_path).read_text(encoding="utf-8"))
    added = extra.get("ajouts", []) + extra.get("arrets_osm", [])
    places = [dict(p) for p in places] + [dict(p, aliases=list(p.get("aliases", []))) for p in added]
    by_id = {p["place_id"]: p for p in places}
    for pid, point in extra.get("coordonnees", {}).items():
        if pid in by_id:
            by_id[pid]["lat"], by_id[pid]["lon"] = point["lat"], point["lon"]
    for pid, aliases in extra.get("alias", {}).items():
        if pid in by_id:
            by_id[pid]["aliases"] = [*by_id[pid].get("aliases", []), *aliases]
    for pid, commune in extra.get("communes", {}).items():
        if pid in by_id:
            by_id[pid]["commune"], by_id[pid]["needs_review"] = commune, False
    return places


class PlaceResolver:
    def __init__(self, gazetteer_path: Path, complements_path: Path | None = None):
        places = apply_complements(json.loads(Path(gazetteer_path).read_text(encoding="utf-8")), complements_path)
        self.places = {p["place_id"]: p for p in places}
        self._outside = {p["canonical"]: p for p in places if "hors_reseau" in p}
        self._txt, self._ph, self._pl = [], [], []
        for p in places:
            for alias in {p["canonical"], *p.get("aliases", [])}:
                n = norm(alias)
                if len(n) < 2:
                    continue
                self._txt.append(n)
                self._ph.append(phon(alias))
                self._pl.append(p["place_id"])

    def __len__(self) -> int:
        return len(self.places)

    def outside_network(self, name: str | None) -> dict | None:
        """Lieu du Grand Abidjan hors du réseau de transport de SIRA (Grand-Bassam, Dabou…) :
        {"place": le lieu, "depart": sa gare de départ dans le réseau si elle est attestée, sinon None}."""
        place = self._outside.get(name or "")
        if place is None:
            return None
        return {"place": place, "depart": self.places.get(place["hors_reseau"].get("depart") or "")}

    def resolve(self, text: str, k: int = 5) -> list[Match]:
        q, qp = norm(text), phon(text)
        if not q:
            return []
        cand: dict[int, float] = {}
        for t, s, i in process.extract(q, self._txt, scorer=fuzz.WRatio, limit=30):
            coverage = min(len(q), len(t)) / max(len(q), len(t))
            cand[i] = s * (0.8 + 0.2 * coverage)
        for _, s, i in process.extract(qp, self._ph, scorer=fuzz.ratio, limit=30):
            cand[i] = max(cand.get(i, 0.0), s)
        best: dict[str, float] = {}
        for i, s in cand.items():
            pid = self._pl[i]
            kind = self.places[pid]["kind"]
            score = s + KIND_BONUS.get(kind, 0) - (GENERIC_PENALTY if kind == "landmark_generic" else 0)
            best[pid] = max(best.get(pid, 0.0), score)
        ranked = sorted(best.items(), key=lambda item: -item[1])[:k]
        out = []
        for pid, score in ranked:
            p = self.places[pid]
            out.append(Match(pid, p["canonical"], p["kind"], p.get("commune"), p.get("lat"), p.get("lon"), score))
        return out

    def decide(self, matches: list[Match], threshold: float, margin: float) -> str | None:
        """Retourne None si le lieu est sûr, sinon la raison de demander confirmation."""
        if not matches:
            return "unresolvable_place"
        top = matches[0]
        if top.kind == "landmark_generic":
            return "ambiguous_place"
        if top.score < threshold:
            return "low_place_confidence"
        if top.lat is None or top.lon is None:
            return "place_without_coordinates"
        if len(matches) > 1 and top.score - matches[1].score < margin and not same_place(top, matches[1]):
            return "ambiguous_place"
        return None

    def nearest(self, lat: float, lon: float, max_m: float) -> Match | None:
        """Lieu nommé le plus proche d'un point (repère pour « descends vers … »), s'il est à moins de max_m mètres."""
        best, best_d = None, max_m
        cos_lat = math.cos(math.radians(lat))
        for p in self.places.values():
            if p.get("lat") is None or p.get("lon") is None or p["kind"] == "landmark_generic":
                continue
            # Distance plane : suffisante à l'échelle d'une ville.
            d = 111_320 * math.hypot(p["lat"] - lat, (p["lon"] - lon) * cos_lat)
            if d < best_d:
                best, best_d = p, d
        if best is None:
            return None
        return Match(best["place_id"], best["canonical"], best["kind"], best.get("commune"), best["lat"], best["lon"], 100.0)

    def place_names(self, kinds=("commune", "quartier"), limit: int = 80) -> list[str]:
        names = [p["canonical"] for p in self.places.values() if p["kind"] in kinds]
        return sorted(set(names))[:limit]
