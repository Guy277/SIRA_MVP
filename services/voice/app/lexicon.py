"""Dictionnaire SIRA (knowledge/dictionnaire.csv) : article et prononciation des lieux, modes et mots d'Abidjan.

Une seule source, modifiable dans Excel (séparateur « ; ») et relue dès qu'elle change, sans redémarrer :
- les phrases de SIRA y prennent l'article des lieux : « au Plateau », « vers la Gare Nord », « jusqu'à Adjamé » ;
- Piper y prend la façon de dire un mot avant de parler : `dire_comme` (écrit en lettres, « Adjamé » → « Adjaméé »)
  ou `phonemes` (alphabet de espeak, comme le sort `/voice/dictionnaire`), lu tel quel par Piper.
Un nom de lieu sans ligne à lui prend l'article de son premier mot (« Gare Nord » → « gare » → « la »).
"""
from __future__ import annotations

import csv
import re
import threading
from dataclasses import dataclass, field
from pathlib import Path

ARTICLES = {"le", "la", "les", "l'"}
# Un nom qui commence par une préposition se dit tel quel : « Au carrefour X », « Chez Tantie ».
_PREPOSITIONS = {"au", "aux", "à", "a", "après", "avant", "derrière", "devant", "près", "face", "en", "chez", "vers"}
_FIRST_WORD = re.compile(r"[\w-]+'?", re.UNICODE)


def _first_word(name: str) -> str:
    match = _FIRST_WORD.match(name.strip().replace("’", "'"))
    return match.group(0).lower() if match else ""


@dataclass
class Lexicon:
    names: dict[str, str] = field(default_factory=dict)  # nom de lieu, mode ou mot (en minuscules) -> article
    common: dict[str, str] = field(default_factory=dict)  # nom commun en tête d'un nom de lieu -> article
    spoken: dict[str, str] = field(default_factory=dict)  # mot (en minuscules) -> ce que Piper doit lire
    _pattern: re.Pattern | None = None

    @classmethod
    def from_rows(cls, rows) -> "Lexicon":
        lexicon = cls()
        for row in rows:
            word = (row.get("mot") or "").strip()
            if not word:
                continue
            key, article = word.lower(), (row.get("article") or "").strip().lower().replace("’", "'")
            if article in ARTICLES:
                (lexicon.common if row.get("categorie") == "nom_commun" else lexicon.names)[key] = article
            phonemes, respelled = (row.get("phonemes") or "").strip(), (row.get("dire_comme") or "").strip()
            if phonemes:
                lexicon.spoken[key] = f"[[ {phonemes} ]]"
            elif respelled:
                lexicon.spoken[key] = respelled
        if lexicon.spoken:  # les mots les plus longs d'abord : « wôrô-wôrô » avant « wôrô »
            words = sorted(lexicon.spoken, key=len, reverse=True)
            lexicon._pattern = re.compile(r"(?<![\w-])(" + "|".join(map(re.escape, words)) + r")(?![\w-])", re.IGNORECASE)
        return lexicon

    @classmethod
    def load(cls, path: Path) -> "Lexicon":
        if not Path(path).exists():
            return cls()
        with open(path, encoding="utf-8-sig", newline="") as file:
            return cls.from_rows(csv.DictReader(file, delimiter=";"))

    def article(self, name: str) -> str:
        """« le », « la », « les », « l' » ou « » (aucun article : « Adjamé »)."""
        key = name.strip().lower()
        if key in self.names:
            return self.names[key]
        return self.common.get(_first_word(name), "")

    def _split(self, name: str) -> tuple[str, str]:
        """(article, nom sans article) ; un nom qui a déjà son article (« Le Réservoir ») le garde."""
        name = name.strip()
        first = _first_word(name)
        if first in ARTICLES and name[len(first):][:1] in (" ", ""):
            return first, name[len(first):].strip()
        if first.endswith("'") and first in ARTICLES:
            return "l'", name[2:].strip()
        return self.article(name), name

    def _with(self, preposition: str, name: str) -> str:
        if not name or _first_word(name) in _PREPOSITIONS:  # « pour aller au carrefour Siporex », « chez Tantie »
            return name[:1].lower() + name[1:]
        article, rest = self._split(name)
        if preposition == "à":
            return {"le": f"au {rest}", "les": f"aux {rest}", "la": f"à la {rest}", "l'": f"à l'{rest}"}.get(article, f"à {rest}")
        if preposition == "jusqu'à":
            return {"le": f"jusqu'au {rest}", "les": f"jusqu'aux {rest}", "la": f"jusqu'à la {rest}",
                    "l'": f"jusqu'à l'{rest}"}.get(article, f"jusqu'à {rest}")
        if article == "l'":
            return f"{preposition} l'{rest}"
        return f"{preposition} {article} {rest}" if article else f"{preposition} {rest}"

    def a(self, name: str) -> str:
        """« au Plateau », « à la Riviera », « à l'Aéroport », « aux Deux-Plateaux », « à Adjamé »."""
        return self._with("à", name)

    def vers(self, name: str) -> str:
        """« vers le Plateau », « vers la Gare Nord », « vers Adjamé »."""
        return self._with("vers", name)

    def jusqu_a(self, name: str) -> str:
        """« jusqu'au Plateau », « jusqu'à Adjamé »."""
        return self._with("jusqu'à", name)

    def for_speech(self, text: str) -> str:
        """Le texte que Piper lit : chaque mot du dictionnaire remplacé par sa prononciation."""
        if not self._pattern:
            return text
        return self._pattern.sub(lambda m: self.spoken[m.group(1).lower()], text)


_SIRA = None


def sira() -> Lexicon:
    """Le dictionnaire de SIRA (config.DICTIONARY_PATH), tel qu'il est sur le disque."""
    global _SIRA
    if _SIRA is None:
        from . import config
        _SIRA = LexiconFile(config.DICTIONARY_PATH)
    return _SIRA.get()


class LexiconFile:
    """Le dictionnaire tel qu'il est sur le disque : relu quand le fichier change (on le corrige pendant l'écoute)."""

    def __init__(self, path: Path):
        self.path = Path(path)
        self._stamp: float | None = None
        self._lexicon = Lexicon()
        self._lock = threading.Lock()

    def get(self) -> Lexicon:
        try:
            stamp = self.path.stat().st_mtime
        except OSError:
            return Lexicon()
        with self._lock:
            if stamp != self._stamp:
                self._lexicon, self._stamp = Lexicon.load(self.path), stamp
            return self._lexicon
