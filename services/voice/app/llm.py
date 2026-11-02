"""LLM local, chef d'orchestre de SIRA (docs/plan-ia-locale.md) : Ministral 3 3B dans llama-server (llama.cpp).

Il n'intervient que quand CamemBERT ne suffit pas (dialog.py : intention douteuse, lieu introuvable, phrase classée
« hors sujet » ou sans réponse). Il ne répond jamais lui-même avec un chiffre : il choisit un OUTIL de SIRA
(trajet, trajet en cours, signalement, base de connaissances) et c'est l'outil qui donne les prix, durées et arrêts.

Consignes et outils : ceux du banc d'essai du 2026-10-24 (services/voice/scripts/bench_llm.py, 38/46 bons outils,
aucun chiffre inventé). La partie fixe des consignes vient en premier pour que llama-server la garde en cache
(sans cache : 35 s de lecture par question, mesuré le 2026-10-25) ; les lieux du voyageur viennent après.

Désactivé tant que VOICE_LLM_URL est vide. Toute erreur ou tout délai dépassé rend la main aux règles habituelles.
"""
from __future__ import annotations

import json
import logging
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Callable

log = logging.getLogger("sira.voice.llm")

SYSTEM = """Tu es SIRA, l'assistant de mobilité d'Abidjan (gbaka, wôrô-wôrô, bus SOTRA, bateau-bus, taxi).
Tu tutoies le voyageur. Réponds en français, en une ou deux phrases courtes.
Règle absolue : tu ne donnes JAMAIS toi-même un prix, une durée, une heure ou un numéro de ligne. Ces chiffres
viennent uniquement des outils. Dès qu'une demande concerne un trajet, un prix, une durée, un arrêt, le trafic ou
une information sur SIRA, appelle l'outil adapté au lieu de répondre.
Une question sur SIRA ou sur ses mots (coulé, debout, suspendu, gbaka, wôrô-wôrô…) passe toujours par chercher_info :
tu ne donnes jamais une définition de mémoire.
Ne suppose jamais le lieu de départ : s'il n'est pas dit, laisse « depart » vide (SIRA prend la position du voyageur).
Le voyageur peut être en train de suivre un trajet : pour « je descends où », « ça fait combien », « j'arrive
quand », utilise trajet_en_cours.
Hors du transport à Abidjan, réponds poliment que tu ne t'occupes que des trajets, sans appeler d'outil."""

MODES = ["gbaka", "woro", "sotra", "bateau", "taxi"]
TOOLS = [
    {"type": "function", "function": {
        "name": "calculer_trajet",
        "description": "Calcule les trajets avec le moteur SIRA-MORE (prix, durées, lignes, marche).",
        "parameters": {"type": "object", "properties": {
            "destination": {"type": "string", "description": "Lieu d'arrivée tel que dit (quartier, gare, lieu enregistré)"},
            "depart": {"type": "string", "description": "Lieu de départ s'il est dit, sinon absent (position du voyageur)"},
            "preference": {"type": "string", "enum": ["rapide", "moins_cher", "equilibre", "peu_de_marche"]},
            "budget_fcfa": {"type": "integer"},
            "modes_preferes": {"type": "array", "items": {"type": "string", "enum": MODES}},
            "modes_exclus": {"type": "array", "items": {"type": "string", "enum": MODES}},
            "heure": {"type": "string", "description": "Heure de départ ou d'arrivée dite, ex. « avant 8 h »"},
        }, "required": ["destination"]}}},
    {"type": "function", "function": {
        "name": "trajet_en_cours",
        "description": "Répond sur le trajet que le voyageur suit (arrêt de descente, prix, heure d'arrivée, incidents).",
        "parameters": {"type": "object", "properties": {
            "sujet": {"type": "string", "enum": ["arret", "prix", "arrivee", "incidents"]}}, "required": ["sujet"]}}},
    {"type": "function", "function": {
        "name": "signaler_incident",
        "description": "Enregistre un signalement du voyageur (accident, bouchon, inondation, route barrée).",
        "parameters": {"type": "object", "properties": {
            "type": {"type": "string", "enum": ["accident", "bouchon", "inondation", "route_barree", "autre"]},
            "lieu": {"type": "string"}}, "required": ["type"]}}},
    {"type": "function", "function": {
        "name": "chercher_info",
        "description": "Cherche dans la base de connaissances de SIRA (modes de transport, horaires généraux, appli).",
        "parameters": {"type": "object", "properties": {"question": {"type": "string"}}, "required": ["question"]}}},
]
TOOL_NAMES = {tool["function"]["name"] for tool in TOOLS}


@dataclass
class Decision:
    """Ce que le LLM a choisi : un outil et ses paramètres, ou une phrase (sans outil)."""
    tool: str | None
    args: dict = field(default_factory=dict)
    text: str = ""
    seconds: float = 0.0


def _context(saved_places: list[dict], in_trip: bool) -> str:
    lines = []
    if saved_places:
        lines.append("Lieux enregistrés par le voyageur : " + "; ".join(f"{p['label'] or p['title']} = {p['title']}" for p in saved_places) + ".")
    lines.append("Le voyageur suit un trajet en ce moment." if in_trip else "Le voyageur ne suit aucun trajet en ce moment.")
    return " ".join(lines)


def _post_json(url: str, payload: dict, timeout_s: float) -> dict:
    request = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"),
                                     headers={"content-type": "application/json"})
    with urllib.request.urlopen(request, timeout=timeout_s) as response:
        return json.loads(response.read())


class LocalLLM:
    def __init__(self, url: str, timeout_s: float = 20.0, max_tokens: int = 160,
                 post: Callable[[str, dict, float], dict] | None = None):
        self.url = url.rstrip("/")
        self.timeout_s, self.max_tokens = timeout_s, max_tokens
        self._post = post or _post_json

    def decide(self, text: str, saved_places: list[dict] | None = None, in_trip: bool = False) -> Decision | None:
        """None si le LLM ne répond pas à temps ou répond quelque chose d'illisible : les règles reprennent la main."""
        payload = {
            # UN seul message system : le modèle de Ministral refuse le second (« Only user, assistant and tool roles
            # are supported », erreur 500 à chaque question, vu le 2026-11-02). Les consignes fixes restent en tête,
            # le contexte du voyageur après : llama-server garde toujours la partie fixe en cache.
            "messages": [{"role": "system", "content": f"{SYSTEM}\n\n{_context(saved_places or [], in_trip)}"},
                         {"role": "user", "content": text}],
            "tools": TOOLS, "temperature": 0, "max_tokens": self.max_tokens,
            "cache_prompt": True,  # llama-server : la partie fixe (consignes + outils) n'est lue qu'une fois
        }
        start = time.perf_counter()
        try:
            reply = self._post(f"{self.url}/v1/chat/completions", payload, self.timeout_s)
            message = reply["choices"][0]["message"]
        except (urllib.error.URLError, TimeoutError, OSError, KeyError, IndexError, TypeError, ValueError) as error:
            log.warning("LLM indisponible ou trop lent, on garde les règles : %s", error)
            return None
        seconds = round(time.perf_counter() - start, 2)
        calls = message.get("tool_calls") or []
        if calls:
            try:
                name = calls[0]["function"]["name"]
                args = calls[0]["function"].get("arguments") or {}
                args = json.loads(args) if isinstance(args, str) else args
            except (KeyError, TypeError, json.JSONDecodeError) as error:
                log.warning("Appel d'outil illisible, ignoré : %s", error)
                return None
            if name not in TOOL_NAMES or not isinstance(args, dict):
                log.warning("Outil inconnu demandé par le LLM, ignoré : %s", name)
                return None
            return Decision(tool=name, args=args, seconds=seconds)
        return Decision(tool=None, text=(message.get("content") or "").strip(), seconds=seconds)
