"""SIRA compagnon : « Discuter avec SIRA » (plan : docs/assistant-compagnon.md).

Le micro de l'accueil répond à « On va où ? » ; ici on CONVERSE. Chaque message passe par quatre étapes :

1. Comprendre et agir comme le micro de l'accueil (VoiceDialog.ask) : CamemBERT, FAQ, trajet suivi, SIRA-MORE,
   signalements, LLM-outil si besoin. Le résultat est la « réponse sûre » : chaque chiffre y vient d'une source.
2. Compléter : la suite d'une question déjà posée (« et le moins cher ? » reprend la dernière destination), les
   signalements vers la destination d'un trajet.
3. Répondre en compagnon : une phrase d'empathie quand le voyageur dit une émotion (fatigue, stress, retard, se
   perdre), puis les faits, puis une relance. Rédaction libre par le LLM seulement si COMPANION_COMPOSE est activé :
   mesuré le 2026-11-09, Ministral 3B mettait 35 à 110 s et inventait (« taxis partagés via Uber », Coulé = « les
   bus ») malgré ses consignes. Il reste donc coupé par défaut, prêt pour une machine avec carte graphique.
4. Vérifier : un chiffre ou un nom propre absent des faits fait rejeter la rédaction du LLM (la réponse sûre reste).

Les boutons (actions) et les relances sont décidés par les règles, à partir des données, jamais par le LLM.
Rien n'est gardé ici : l'application envoie les derniers échanges à chaque message.
"""
from __future__ import annotations

import hashlib
import re
import time
from datetime import datetime, timedelta, timezone
from typing import Callable

from . import normalize as nz
from .dialog import ROUTE_INTENTS, STEP_LISTENER, TRIP_INTENT_MIN_CONFIDENCE, VoiceDialog, step
from .llm import LocalLLM, clean_reply
from .resolver import norm

MAX_HISTORY = 6  # échanges relus pour comprendre la suite (« et le moins cher ? »)

# Libellés des sources montrés sous la réponse (les identifiants viennent de VoiceDialog et de TripAnswers).
SOURCE_LABELS = {"sira-more": "Calcul SIRA-MORE", "sira-more:trajet": "Ton trajet (SIRA-MORE)",
                 "signalements": "Signalements des voyageurs", "lieux": "Répertoire des lieux de SIRA"}

# Émotions dites par le voyageur → une phrase d'empathie (plusieurs, pour ne pas répéter toujours la même).
# Les mots sont cherchés dans la phrase normalisée (minuscules, sans accents).
EMOTIONS: list[tuple[str, tuple[str, ...], tuple[str, ...]]] = [
    ("fatigue", ("fatigue", "epuise", "creve", "a bout", "plus de force", "ko"),
     ("Je comprends, la journée a été longue.", "Courage, tu as bien travaillé aujourd'hui.",
      "Je vois, tu es fatigué : on va faire simple.")),
    ("retard", ("en retard", "retard", "presse", "rendez-vous", "rdv", "entretien", "examen", "vite"),
     ("Pas de panique, on va trouver le plus efficace.", "Je comprends, chaque minute compte.",
      "Respire, on regarde ça ensemble.")),
    ("peur", ("peur", "stress", "angoiss", "inquiet", "panique", "j'ose pas", "pas rassure"),
     ("C'est normal d'être un peu inquiet, je suis là pour t'aider.", "Je comprends ton inquiétude, on y va pas à pas.",
      "Ne t'en fais pas, je t'accompagne.")),
    ("perdu", ("perdu", "je connais pas", "je ne connais pas", "premiere fois", "je sais pas comment", "je ne sais pas comment"),
     ("Pas de souci, je connais le chemin : suis-moi.", "Ce n'est pas grave d'être perdu, je t'explique.",
      "On va s'en sortir ensemble, je te guide.")),
    ("colere", ("marre", "galere", "enerve", "agace", "ras le bol", "fatigue de"),
     ("Je comprends que ce soit pénible.", "Je vois, les transports peuvent être une vraie galère.",
      "Je t'entends, on va essayer de te simplifier la route.")),
]

# Danger : les numéros d'urgence passent avant tout le reste (fiche « urgence.numeros », sourcée dans
# knowledge/compagnon.md), même quand la phrase parle aussi d'un lieu ou d'un signalement.
DANGER_WORDS = ("blesse", "agress", "en danger", "au secours", "accident grave", "m'a vole", "on m'a vole", "attaque",
                "il saigne", "evanoui", "inconscient")
URGENCE_ID = "urgence.numeros"


def danger(text: str) -> bool:
    said = f" {norm(text)} "
    return any(w in said for w in DANGER_WORDS)


# Mots qui commencent souvent une phrase : en majuscule sans être un nom propre (vérification de la rédaction LLM).
_STARTERS = {norm(w) for w in (
    "je tu il elle on nous vous ils elles le la les un une des du de d'après pour avec sans oui non ah oh voilà voila "
    "bonne bon désolé courage pas ne c'est cest ce cela ça ca et mais donc alors si quand comme prends compte "
    "attention bien merci respire suis tes ton ta mon ma mes dis demande regarde essaie aujourd'hui ce soir ici "
    "là la-bas d'accord daccord super parfait au aux en à a").split()}
# Noms propres que SIRA peut toujours dire.
_KNOWN = {norm(w) for w in ("SIRA", "SIRA-MORE", "Abidjan", "Coulé", "Debout", "Suspendu", "Akwaba", "FAQ",
                            "OpenStreetMap", "SOTRA", "Orange")}

COMPOSE_SYSTEM = """Tu es SIRA, le compagnon de route des voyageurs d'Abidjan. Tu parles comme un ami ivoirien bienveillant :
tu tutoies, tu es chaleureux et rassurant, sans caricature.
Tu réponds au MESSAGE en 2 ou 3 phrases courtes, à partir des FAITS uniquement.
Règles absolues :
- Chaque information vient des FAITS. N'ajoute rien qui n'y est pas : aucun prix, durée, heure, ligne, application,
  service, entreprise ou lieu.
- Recopie les chiffres exactement comme dans les FAITS.
- Si le voyageur exprime une émotion (fatigue, stress, peur, retard), commence par une phrase d'empathie.
- Attribue chaque fait à SA source entre crochets : [SIRA-MORE] = « d'après mes calculs », [Signalements] =
  « d'après les voyageurs », [FAQ] = « comme je l'explique souvent ». Jamais une autre attribution.
- Termine par une question courte qui aide pour la suite.
- Texte simple, sans liste, sans émoji, sans gras."""


REPORT_INTENTS = ("report_incident", "report_road_condition")


def _sure_report(payload: dict) -> bool:
    """Un vrai signalement : intention sûre, et pas une réponse de la FAQ (vu le 2026-11-09 : « le coulé là c'est
    quoi » classé signalement à 0,36 affichait un bouton « Signaler »)."""
    u = payload.get("understanding") or {}
    from_faq = any("." in s for s in payload.get("sources") or [])
    return u.get("intent") in REPORT_INTENTS and u.get("intent_confidence", 0) >= TRIP_INTENT_MIN_CONFIDENCE and not from_faq


def _now_abidjan() -> datetime:
    return datetime.now(timezone.utc) + timedelta(hours=0)  # Abidjan : UTC+0, sans heure d'été


def _pick(options: tuple[str, ...], seed: str) -> str:
    """Une formule parmi plusieurs, toujours la même pour la même phrase (réponses reproductibles, tests stables)."""
    return options[int(hashlib.sha1(seed.encode("utf-8")).hexdigest(), 16) % len(options)]


def emotion(text: str) -> str | None:
    said = f" {norm(text)} "
    for name, words, _ in EMOTIONS:
        if any(f" {w} " in said or (len(w) > 4 and w in said) for w in words):
            return name
    return None


def empathy(text: str) -> str | None:
    name = emotion(text)
    if not name:
        return None
    phrases = next(p for n, _, p in EMOTIONS if n == name)
    return _pick(phrases, text)


_NUMBER = re.compile(r"\d[\d   .]*\d|\d")


def numbers(text: str) -> set[str]:
    """Les nombres d'un texte, écrits sans séparateur : « 3 900 », « 3.900 » et « 3900 » donnent tous « 3900 »."""
    return {re.sub(r"[^\d]", "", m.group(0)) for m in _NUMBER.finditer(text or "")}


def proper_names(text: str) -> set[str]:
    """Mots en majuscule qui ne sont ni un début de phrase courant ni un nom toujours permis (SIRA, Abidjan…)."""
    found = set()
    for sentence in re.split(r"(?<=[.!?])\s+", text or ""):
        for index, word in enumerate(re.findall(r"[A-ZÀ-Ý][\wÀ-ÿ'’-]*", sentence)):
            key = norm(word.strip("'’-"))
            if key in _KNOWN or (index == 0 and sentence.lstrip().startswith(word) and key in _STARTERS):
                continue
            found.add(key)
    return found


def checked(draft: str, facts: str) -> str | None:
    """La rédaction du LLM si chaque nombre et chaque nom propre viennent des faits ; sinon la raison du refus."""
    extra_numbers = numbers(draft) - numbers(facts)
    if extra_numbers:
        return f"chiffre absent des faits : {', '.join(sorted(extra_numbers))}"
    known = {norm(w) for w in re.findall(r"[\wÀ-ÿ'’-]+", facts)}
    extra_names = {n for n in proper_names(draft) if n not in known}
    if extra_names:
        return f"nom absent des faits : {', '.join(sorted(extra_names))}"
    if "voyageur" in norm(draft) and "[Signalements]" not in facts:
        return "attribue aux voyageurs un fait qui ne vient pas d'eux"
    return None


class Companion:
    def __init__(self, dialog: VoiceDialog, llm: LocalLLM | None = None, compose: bool = False,
                 compose_timeout_s: float = 30.0, now: Callable[[], datetime] = _now_abidjan):
        self.dialog, self.llm, self.compose_on = dialog, llm, compose and llm is not None
        self.compose_timeout_s, self.now = compose_timeout_s, now

    # ------------------------------------------------------------------ point d'entrée
    def chat(self, text: str, history: list[dict] | None = None, position: dict | None = None, context: dict | None = None,
             trip: dict | None = None, places: list | None = None, spoken: bool = False,
             on_step: Callable[[str], None] | None = None) -> dict:
        token = STEP_LISTENER.set(on_step)
        try:
            return self._chat(text, history or [], position, context or {}, trip, places, spoken)
        finally:
            STEP_LISTENER.reset(token)

    def _chat(self, text: str, history: list[dict], position: dict | None, context: dict, trip: dict | None,
              places: list | None, spoken: bool) -> dict:
        step("comprendre")
        safe = self._follow_up(text, position, context) or self.dialog.ask(
            text, position, context if context.get("pending_request") else None, trip, places, typed=not spoken)
        safe = self._sure_destination(text, position, safe) or safe
        request = safe.get("journey_request") if safe.get("kind") == "journeys" else None
        facts = [f"[{self._label(safe)}] {safe['reply_text']}"]
        extra = []
        # Signalements vers la destination d'un trajet trouvé : rassurer ou prévenir, d'après les voyageurs.
        destination = (request or {}).get("destination")
        if destination and self.dialog.trips is not None and "signalements" not in safe.get("sources", []):
            step("signalements")
            status, live = self.dialog.trips.place_status(destination)
            if live:
                extra.append(status)
                facts.append(f"[Signalements] {status}")
                safe["sources"] = [*safe.get("sources", []), *live]
        urgent = self._urgent(text, safe)
        reply = self._reply(text, safe, extra, urgent)
        payload = dict(safe, reply_text=reply, safe_reply_text=safe["reply_text"])
        payload["companion"] = {"composed": False, "seconds": None, "rejected": None, "emotion": emotion(text)}
        if self.compose_on and safe.get("kind") != "question":
            self._compose(payload, text, history, "\n".join(facts))
        if request:  # la suite de la conversation reprend ce trajet (« et le moins cher ? »)
            payload["context"] = {**(payload.get("context") or {}), "last_request": request}
        elif context.get("last_request") and not payload.get("context"):
            payload["context"] = {"last_request": context["last_request"]}
        payload["facts_sources"] = self._sources(payload)
        payload["actions"] = self._actions(payload, text)
        payload["suggestions"] = self._suggestions(payload, text, trip)
        return payload

    # ------------------------------------------------------------------ « et le moins cher ? »
    def _follow_up(self, text: str, position: dict | None, context: dict) -> dict | None:
        """Une question de trajet sans destination, juste après un trajet : on reprend sa destination."""
        last = context.get("last_request")
        if not last or not (last.get("destination") or {}).get("name") or context.get("pending_request"):
            return None
        u = self.dialog.understand(text, position)
        if u.intent not in ROUTE_INTENTS or u.places.get("destination") or u.reasons and "missing_destination" not in u.reasons:
            return None
        request = dict(last)
        preference = nz.PREFERENCE_BY_INTENT.get(u.intent)
        if preference:
            request["preference"] = preference
        departure = next((e.get("value") for e in u.entities if e["label"] == "DEPARTURE_TIME" and e.get("value")), None)
        if departure:
            request["departureAt"] = departure
        u.reasons = []
        return self.dialog._plan(u, request)

    def _sure_destination(self, text: str, position: dict | None, safe: dict) -> dict | None:
        """Une destination reconnue sans doute, mais pas de trajet calculé : on le calcule (vu le 2026-11-09 :
        « j'ai peur de me perdre, je vais à Marcory » → CamemBERT hésitant à cause de « peur », le LLM demandait
        « Où es-tu en ce moment ? » alors que la position était connue)."""
        # Seulement quand rien n'a été calculé ni trouvé (phrase du LLM, ou « je n'ai pas bien compris » quand le LLM
        # tarde) : un vrai « ça bouche à Adjamé ? » ou « il y a un accident à Adjamé » garde sa réponse.
        intent = (safe.get("understanding") or {}).get("intent")
        if (set(safe.get("sources") or []) - {"llm"} or safe.get("kind") not in ("info", "retry") or danger(text)
                or intent in ("traffic_status", *REPORT_INTENTS)):
            return None
        u = self.dialog.understand(text, position, as_trip=True)
        place = u.places.get("destination") or {}
        if place.get("reason") or not (place.get("match") or {}).get("lat") or not (u.journey_request or {}).get("origin"):
            return None
        u.reasons = []
        return self.dialog._plan(u, u.journey_request)

    # ------------------------------------------------------------------ réponse en compagnon (sans LLM)
    def _urgent(self, text: str, safe: dict) -> str | None:
        """Les numéros d'urgence (fiche sourcée), quand la phrase dit un danger et que la réponse ne les donne pas déjà."""
        if not danger(text) or URGENCE_ID in (safe.get("sources") or []):
            return None
        passages = getattr(self.dialog.knowledge, "passages", None) or []
        answer = next((p.answer for p in passages if p.id == URGENCE_ID and p.answer), None)
        if answer:
            safe["sources"] = [URGENCE_ID, *(safe.get("sources") or [])]
        return answer

    def _reply(self, text: str, safe: dict, extra: list[str], urgent: str | None = None) -> str:
        parts = []
        feel = empathy(text)
        # Une fiche de confidence ou d'urgence rassure déjà et finit par ce qu'il faut faire : rien à ajouter.
        confiding = any(s.startswith(("compagnon.", "urgence.")) for s in safe.get("sources") or [])
        if urgent:
            parts.append(urgent)
        elif feel and not confiding and safe.get("kind") != "retry":
            parts.append(feel)
        parts.append(safe["reply_text"])
        parts.extend(extra)
        closing = None if urgent or confiding else self._closing(safe, text)
        if closing and not safe["reply_text"].rstrip().endswith("?"):
            parts.append(closing)
        return " ".join(p.strip() for p in parts if p and p.strip())

    @staticmethod
    def _closing(safe: dict, text: str) -> str | None:
        kind = safe.get("kind")
        if kind == "journeys":
            return _pick(("Tu veux voir les trajets ?", "On regarde les options ensemble ?", "Je te montre les trajets ?"), text)
        if _sure_report(safe):
            return None  # la phrase demande déjà de confirmer sur l'écran
        if kind == "info" and any(not s.startswith(("sira-more", "signalements", "llm", "lieux")) for s in safe.get("sources", [])):
            return _pick(("Tu veux que je te trouve un trajet ?", "Je peux t'aider pour un trajet ?", "Tu vas où aujourd'hui ?"), text)
        return None

    # ------------------------------------------------------------------ rédaction libre par le LLM (si activée)
    def _compose(self, payload: dict, text: str, history: list[dict], facts: str) -> None:
        step("rediger")
        lines = []
        for turn in history[-MAX_HISTORY:]:
            who = "Voyageur" if turn.get("from") == "me" else "SIRA"
            said = str(turn.get("text") or "").strip()[:300]
            if said:
                lines.append(f"{who} : {said}")
        conversation = ("CONVERSATION RÉCENTE :\n" + "\n".join(lines) + "\n\n") if lines else ""
        hour = self.now().strftime("%H h %M")
        user = f"{conversation}FAITS :\n{facts}\n[Heure] {hour} à Abidjan.\n\nMESSAGE : {text}"
        start = time.perf_counter()
        draft = self.llm.write(COMPOSE_SYSTEM, user, max_tokens=120, timeout_s=self.compose_timeout_s)
        seconds = round(time.perf_counter() - start, 2)
        payload["companion"]["seconds"] = seconds
        if not draft:
            payload["companion"]["rejected"] = "délai dépassé ou LLM indisponible"
            return
        draft = clean_reply(draft)
        allowed = f"{facts}\n[Heure] {hour}\n{text}\n" + "\n".join(str(t.get("text") or "") for t in history[-MAX_HISTORY:])
        refused = checked(draft, allowed)
        if refused:
            payload["companion"]["rejected"] = refused
            return
        payload["reply_text"] = draft
        payload["companion"]["composed"] = True

    # ------------------------------------------------------------------ sources, actions, relances (règles)
    @staticmethod
    def _label(safe: dict) -> str:
        sources = safe.get("sources") or []
        if any(s.startswith("sira-more") for s in sources):
            return "SIRA-MORE"
        if "signalements" in sources:
            return "Signalements"
        if any("." in s for s in sources):
            return "FAQ"
        return "SIRA"

    @staticmethod
    def _sources(payload: dict) -> list[str]:
        labels = []
        for source in payload.get("sources") or []:
            label = SOURCE_LABELS.get(source) or ("FAQ de SIRA" if "." in source else None)
            if label and label not in labels:
                labels.append(label)
        return labels

    @staticmethod
    def _actions(payload: dict, text: str = "") -> list[dict]:
        actions = []
        if payload.get("kind") == "journeys" and ((payload.get("journey_request") or {}).get("destination")):
            actions.append({"id": "voir_trajets", "label": "Voir les trajets"})
        # Un danger avec un incident (« accident grave à Adjamé ») : après les secours, prévenir les autres voyageurs.
        incident = URGENCE_ID in (payload.get("sources") or []) and any(w in norm(text) for w in ("accident", "agress", "attaque"))
        if _sure_report(payload) or incident:
            actions.append({"id": "signaler", "label": "Signaler"})
        return actions

    @staticmethod
    def _suggestions(payload: dict, text: str, trip: dict | None) -> list[str]:
        kind = payload.get("kind")
        if kind == "journeys":
            request = payload.get("journey_request") or {}
            dest = (request.get("destination") or {}).get("name")
            options = []
            if request.get("preference") != "cheap":
                options.append("Et le moins cher ?")
            if request.get("preference") != "fast":
                options.append("Et le plus rapide ?")
            if dest:
                options.append(f"Ça bouche vers {dest} ?")
            if emotion(text) == "retard" and "Et le plus rapide ?" in options:
                options.remove("Et le plus rapide ?")
                options.insert(0, "Et le plus rapide ?")
            return options[:3]
        if trip:
            return ["Je descends où ?", "J'arrive à quelle heure ?", "Y a des bouchons sur mon trajet ?"]
        if kind in ("info", "retry"):
            asked = norm(text)
            pool = ["Je veux aller au Plateau", "C'est quoi Coulé, Debout, Suspendu ?", "Différence entre gbaka et wôrô ?",
                    "Comment signaler un accident ?"]
            return [q for q in pool if norm(q) != asked][:3]
        return []
