"""FAQ de SIRA : fiches Markdown (services/voice/knowledge/) et recherche de la fiche qui répond à une phrase.

Recherche en mémoire, sans base vectorielle : chaque façon de poser la question est comparée à la phrase
entendue, mot à mot (tolérant aux fautes de transcription), les mots rares pesant plus que les mots courants.
Une autre recherche (pgvector…) pourra remplacer KnowledgeBase tant qu'elle respecte `Retriever`.
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol

from rapidfuzz import fuzz

from .resolver import strip_accents

# Mots sans information pour reconnaître une question. Les mots interrogatifs (où, quoi, combien…) restent :
# « je descends où ? » et « je descends quand ? » ne sont pas la même question.
STOPWORDS = set("""
a au aux avec c ca ce ces cet cette d de des du elle en est et il ils j je l la le les leur lui m ma me mes moi mon
n ne nous on par pas pour qu que s sa se ses si son sur t ta te tes toi ton tu un une vous y
dis sira stp svp pardon hein deh eh bon alors bah ben euh donc meme veux voudrais aimerais savoir
""".split())
# « c'est quoi », « ça veut dire » : trop fréquents dans les fiches pour départager deux réponses.
COMMON = {"quoi", "veut", "dire"}


def words(text: str) -> list[str]:
    s = strip_accents(text.lower()).replace("’", "'")
    s = re.sub(r"[^a-z0-9]+", " ", s)
    out = []
    for w in s.split():
        if w in STOPWORDS or len(w) < 2 and not w.isdigit():
            continue
        if len(w) > 4 and w.endswith("s"):  # trajets → trajet, bouchons → bouchon
            w = w[:-1]
        out.append(w)
    return out


@dataclass
class Passage:
    id: str
    questions: list[str]
    answer: str | None  # None : réponse calculée (action)
    action: str | None = None
    source: str = ""  # fichier d'origine


@dataclass
class Hit:
    passage: Passage
    score: float  # 0 à 1
    question: str = ""  # la formulation la plus proche


class Retriever(Protocol):
    def search(self, text: str, k: int = 4) -> list[Hit]: ...


def parse(path: Path) -> list[Passage]:
    passages, current = [], None
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if line.startswith("## "):
            current = {"id": line[3:].strip(), "questions": [], "answer": [], "action": None}
            passages.append(current)
        elif not line or line.startswith("#") or line.startswith("<!--") or line.endswith("-->") or current is None:
            continue
        elif line.startswith("? "):
            current["questions"].append(line[2:].strip())
        elif line.startswith("action:"):
            current["action"] = line.split(":", 1)[1].strip()
        else:
            current["answer"].append(line)
    out = []
    for p in passages:
        if not p["questions"] or not (p["answer"] or p["action"]):
            raise ValueError(f"Fiche incomplète {p['id']} dans {path.name} : il faut au moins une question « ? » et une réponse")
        out.append(Passage(p["id"], p["questions"], " ".join(p["answer"]) or None, p["action"], path.name))
    return out


@dataclass
class KnowledgeBase:
    passages: list[Passage]
    _variants: list[tuple[int, str, list[str]]] = field(default_factory=list, repr=False)
    _idf: dict[str, float] = field(default_factory=dict, repr=False)

    @classmethod
    def load(cls, directory: Path) -> "KnowledgeBase":
        passages: list[Passage] = []
        for path in sorted(Path(directory).glob("*.md")):
            if path.name.lower() != "readme.md":
                passages += parse(path)
        ids = [p.id for p in passages]
        duplicates = {i for i in ids if ids.count(i) > 1}
        if duplicates:
            raise ValueError(f"Identifiants en double dans la FAQ : {', '.join(sorted(duplicates))}")
        return cls(passages)

    def __post_init__(self):
        self._variants = [(i, q, words(q)) for i, p in enumerate(self.passages) for q in p.questions]
        df: dict[str, int] = {}
        for _, _, ws in self._variants:
            for w in set(ws):
                df[w] = df.get(w, 0) + 1
        n = len(self._variants) or 1
        self._idf = {w: math.log(1 + n / c) for w, c in df.items()}
        self._unknown = max(self._idf.values(), default=1.0)  # un mot jamais vu dans la FAQ compte comme un mot rare

    def __len__(self) -> int:
        return len(self.passages)

    def _weight(self, word: str) -> float:
        base = self._idf.get(word, self._unknown)
        return base * 0.3 if word in COMMON else base

    @staticmethod
    def _same(a: str, b: str) -> bool:
        return a == b or (min(len(a), len(b)) >= 5 and fuzz.ratio(a, b) >= 85)

    def _score(self, query: list[str], variant: list[str]) -> float:
        if not query or not variant:
            return 0.0
        found_q = sum(self._weight(w) for w in query if any(self._same(w, v) for v in variant))
        found_v = sum(self._weight(v) for v in variant if any(self._same(w, v) for w in query))
        precision = found_q / sum(self._weight(w) for w in query)
        recall = found_v / sum(self._weight(v) for v in variant)
        return 0.0 if precision + recall == 0 else 2 * precision * recall / (precision + recall)

    def search(self, text: str, k: int = 4) -> list[Hit]:
        query = words(text)
        best: dict[int, Hit] = {}
        for index, question, variant in self._variants:
            score = self._score(query, variant)
            if index not in best or score > best[index].score:
                best[index] = Hit(self.passages[index], score, question)
        return sorted(best.values(), key=lambda hit: -hit.score)[:k]
