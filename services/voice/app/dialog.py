"""Comprendre une phrase, décider (calculer ou confirmer) et formuler la réponse de SIRA.

Les chiffres des réponses (prix, durées) viennent UNIQUEMENT du moteur SIRA-MORE : rien n'est inventé.
Le nouchi reste hors des consignes critiques (politique de voix SIRA v0.3).
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Callable

from . import normalize as nz
from .knowledge import Retriever
from .nlu import NLUModel
from .resolver import Match, PlaceResolver, norm, same_name
from .short_answer import yes_no
from .trip import NO_TRIP, TripAnswers, clean_trip

ROUTE_INTENTS = {"navigate_to", "ask_fastest", "ask_cheapest", "ask_eta", "ask_fare", "ask_mode", "avoid_traffic",
                 "find_stop", "ask_transfer"}
NEEDS_DESTINATION = {"navigate_to", "ask_fastest", "ask_cheapest", "ask_eta", "ask_fare", "ask_mode", "avoid_traffic"}

QUESTIONS = {
    "missing_destination": "Vous voulez aller où ?",
    "missing_origin": "D'où partez-vous ?",
    "unresolvable_place": "Pardon, je ne connais pas « {text} ». Pouvez-vous répéter, ou me donner un quartier ou un repère proche ?",
    "low_place_confidence": "Je n'ai pas bien compris le lieu. Vous voulez dire {cand} ?",
    "ambiguous_place": "Vous voulez dire {cand} ?",
    "place_without_coordinates": "Je connais {cand}, mais je n'ai pas encore sa position exacte. Pouvez-vous me donner un repère proche ?",
    "low_intent_confidence": "Pardon, je n'ai pas bien compris. Pouvez-vous répéter un peu plus fort, s'il vous plaît ?",
}
# Réponses où l'app doit faire répéter (et proposer d'écrire ou la carte au 2e échec).
RETRY_REASONS = {"low_intent_confidence", "unresolvable_place"}
# Un lieu dit seul (« Cocody ! ») classé dans ces intentions veut dire « je vais là ».
PLACE_ALONE_INTENTS = {"confirm", "out_of_scope", "voice_help"}
YES_NO = {"oui", "ok", "d accord", "ya foye", "yafoye", "non", "voila", "c est ca", "merci"}
# FAQ (services/voice/knowledge) : une vraie demande de trajet (« je vais à Treichville en bateau-bus ») ne cède
# la place qu'à une fiche presque identique à la phrase (« le bateau-bus part d'où à Treichville ? »).
FAQ_STRONG = 0.9
# Question sur le trajet en cours reconnue par CamemBERT, sans lieu dit, quand aucune fiche ne correspond.
TRIP_ACTION_BY_INTENT = {"ask_eta": "trip_eta", "ask_fare": "trip_price", "ask_transfer": "trip_stops",
                         "find_stop": "trip_stops", "traffic_status": "trip_incidents"}
# … seulement si CamemBERT est sûr de lui (« il va pleuvoir demain ? » sort en traffic_status à 0,60).
TRIP_INTENT_MIN_CONFIDENCE = 0.8


@dataclass
class Understanding:
    text: str
    intent: str
    intent_confidence: float
    entities: list[dict]
    places: dict[str, dict] = field(default_factory=dict)
    reasons: list[str] = field(default_factory=list)
    question: str | None = None
    journey_request: dict | None = None

    @property
    def needs_confirmation(self) -> bool:
        return bool(self.reasons)

    def as_dict(self) -> dict:
        return {"text": self.text, "intent": self.intent, "intent_confidence": round(self.intent_confidence, 3),
                "entities": self.entities, "places": self.places, "needs_confirmation": self.needs_confirmation,
                "reasons": self.reasons, "question": self.question, "journey_request": self.journey_request}


class VoiceDialog:
    def __init__(self, nlu: NLUModel, resolver: PlaceResolver, place_threshold: float, place_margin: float,
                 intent_min_confidence: float, plan_journeys: Callable[[dict], dict] | None = None,
                 knowledge: Retriever | None = None, trips: TripAnswers | None = None, faq_threshold: float = 0.65):
        self.nlu = nlu
        self.resolver = resolver
        self.place_threshold = place_threshold
        self.place_margin = place_margin
        self.intent_min_confidence = intent_min_confidence
        self.plan_journeys = plan_journeys
        self.knowledge = knowledge
        self.trips = trips
        self.faq_threshold = faq_threshold

    # ------------------------------------------------------------------ comprendre
    def _place(self, entity: dict) -> tuple[dict, str | None]:
        matches = self.resolver.resolve(entity["text"])
        reason = self.resolver.decide(matches, self.place_threshold, self.place_margin)
        info = {"heard": entity["text"], "match": matches[0].as_dict() if matches else None,
                "alternatives": [m.as_dict() for m in matches[1:3]], "reason": reason}
        return info, reason

    def _place_in_text(self, text: str) -> dict | None:
        """Le texte entier est-il un lieu connu, sans hésitation ? (« Cocody ! », « Yopougon »)."""
        clean = text.strip(" .,!?;:")
        if not clean or norm(clean) in YES_NO:
            return None
        matches = self.resolver.resolve(clean)
        if matches and matches[0].score >= 95 and self.resolver.decide(matches, self.place_threshold, self.place_margin) is None:
            start = text.index(clean)
            return {"label": "DESTINATION", "start": start, "end": start + len(clean), "text": clean, "score": 1.0}
        return None

    def understand(self, text: str, position: dict | None = None, as_trip: bool = False) -> Understanding:
        intent, confidence, entities = self.nlu.predict(text)
        if as_trip:
            # Relu comme un trajet : le lieu entendu devient la destination.
            intent, confidence = "navigate_to", max(confidence, self.intent_min_confidence)
            entities = [dict(e, label="DESTINATION") if e["label"] == "PLACE" else e for e in entities]
            if not any(e["label"] == "DESTINATION" for e in entities):
                alone = self._place_in_text(text)
                entities = entities + ([alone] if alone else [])
        u = Understanding(text=text, intent=intent, intent_confidence=confidence, entities=entities)
        by_label: dict[str, list[dict]] = {}
        for e in entities:
            by_label.setdefault(e["label"], []).append(e)
            if e["label"] in ("MODE", "EXCLUDED_MODE"):
                e["value"] = nz.mode_code(e["text"])
            elif e["label"] == "BUDGET":
                e["value"] = nz.budget_fcfa(e["text"])
            elif e["label"] == "DEPARTURE_TIME":
                e["value"] = nz.departure_at(e["text"])
        for label, key in (("DESTINATION", "destination"), ("ORIGIN", "origin"), ("PLACE", "place")):
            if by_label.get(label):
                info, reason = self._place(by_label[label][0])
                u.places[key] = info
                if reason and (intent in ROUTE_INTENTS or key == "destination"):
                    u.reasons.append(reason)
        if confidence < self.intent_min_confidence:
            u.reasons.append("low_intent_confidence")
        if intent in ROUTE_INTENTS:
            if intent in NEEDS_DESTINATION and "destination" not in u.places:
                u.reasons.append("missing_destination")
            origin = self._point(u.places.get("origin")) or _position_point(position)
            if origin is None and intent in NEEDS_DESTINATION:
                u.reasons.append("missing_origin")
            u.journey_request = self._journey_request(intent, u.places, by_label, origin)
        u.question = self._question(u)
        return u

    @staticmethod
    def _point(info: dict | None) -> dict | None:
        if not info or not info.get("match") or info["match"].get("lat") is None:
            return None
        m = info["match"]
        return {"lat": m["lat"], "lon": m["lon"], "name": m["canonical"]}

    def _journey_request(self, intent: str, places: dict, by_label: dict, origin: dict | None) -> dict:
        budget = next((e["value"] for e in by_label.get("BUDGET", []) if e.get("value")), None)
        excluded = sorted({e["value"] for e in by_label.get("EXCLUDED_MODE", []) if e.get("value")})
        request: dict[str, Any] = {
            "origin": origin,
            "destination": self._point(places.get("destination")),
            "preference": nz.PREFERENCE_BY_INTENT.get(intent, "balanced"),
            "constraints": {"excludedModes": excluded},
        }
        if budget:
            request["budget"] = budget
        departure = next((e.get("value") for e in by_label.get("DEPARTURE_TIME", [])), None)
        if departure:
            request["departureAt"] = departure
        preferred = sorted({e["value"] for e in by_label.get("MODE", []) if e.get("value")})
        if preferred:
            request["preferredModes"] = preferred  # indicatif : utilisé pour formuler la réponse
        return request

    def _question(self, u: Understanding) -> str | None:
        if not u.reasons:
            return None
        order = ["low_intent_confidence", "missing_destination", "unresolvable_place", "place_without_coordinates",
                 "ambiguous_place", "low_place_confidence", "missing_origin"]
        reason = sorted(u.reasons, key=lambda r: order.index(r) if r in order else 99)[0]
        info = u.places.get("destination") or u.places.get("origin") or u.places.get("place") or {}
        cand = (info.get("match") or {}).get("canonical", "ce lieu")
        alts = [a["canonical"] for a in info.get("alternatives", []) if not same_name(a["canonical"], cand)][:1]
        if reason == "ambiguous_place" and alts:
            cand = f"{cand} ou {alts[0]}"
        return QUESTIONS[reason].format(text=info.get("heard", ""), cand=cand)

    # ------------------------------------------------------------------ dialoguer
    def _answered_place(self, u: Understanding, text: str, keys: tuple[str, ...]) -> dict | None:
        """Lieu sûr donné en réponse à une question (entité reconnue, ou phrase qui n'est qu'un lieu)."""
        for key in keys:
            info = u.places.get(key)
            if info and not info.get("reason") and self._point(info):
                return self._point(info)
        alone = self._place_in_text(text)
        if alone:
            info, reason = self._place(alone)
            return None if reason else self._point(info)
        return None

    def ask(self, text: str, position: dict | None = None, context: dict | None = None, trip: dict | None = None) -> dict:
        """trip : le trajet suivi dans l'application (calculé par SIRA-MORE), pour « je descends où ? »."""
        u = self.understand(text, position)
        pending = (context or {}).get("pending_request")
        trip = clean_trip(trip)

        # Réponse à « D'où est-ce que tu pars ? » / « Tu veux aller où ? » : on complète la demande en attente.
        # Le vrai modèle classe souvent un lieu dit seul (« Adjamé ») en « confirm » : on regarde quand même si c'est un lieu.
        if pending and u.intent != "deny":
            if pending.get("destination") and not pending.get("origin"):
                origin = self._answered_place(u, text, ("origin", "place", "destination"))
                if origin:
                    return self._plan(u, dict(pending, origin=origin), prefix="D'accord. ")
            if not pending.get("destination") and u.intent not in ROUTE_INTENTS:
                destination = self._answered_place(u, text, ("destination", "place"))
                if destination:
                    fixed = dict(pending, destination=destination)
                    fixed["origin"] = fixed.get("origin") or _position_point(position)
                    if fixed["origin"]:
                        return self._plan(u, fixed, prefix="D'accord. ")
        # « Tu veux dire Gare Sud ou Gare Nord ? » → « Gare Nord » : c'est ce lieu-là, pas un « oui ».
        if pending and pending.get("destination") and pending.get("origin") and u.intent not in ROUTE_INTENTS | {"deny"}:
            chosen = self._answered_place(u, text, ("destination", "place"))
            if chosen and not _same_point(chosen, pending["destination"]):
                return self._plan(u, dict(pending, destination=chosen), prefix="D'accord. ")
        # « Cocody ! » sans question en attente : c'est une destination, pas un « oui ».
        if not pending and u.intent in PLACE_ALONE_INTENTS and (u.places.get("destination") or u.places.get("place") or self._place_in_text(text)):
            u = self.understand(text, position, as_trip=True)

        # « Ya foye » / « oui » après une question : on reprend la demande en attente,
        # sauf si un autre lieu a été dit sans qu'on soit sûr de lui (on ne part pas au mauvais endroit).
        if u.intent == "confirm" and pending and pending.get("destination") and pending.get("origin"):
            if yes_no(text) == "yes" or not any(e["label"] in ("DESTINATION", "ORIGIN", "PLACE") for e in u.entities):
                return self._plan(u, pending, prefix="Ya foye. ")
            return self._reply(u, "Pardon, je n'ai pas bien compris le lieu. Pouvez-vous le redire ?", context={"pending_request": pending})
        # « Non, c'est Riviera Palmeraie » : on corrige la destination de la demande en attente
        if u.intent == "deny":
            if pending and "destination" in u.places and not u.places["destination"]["reason"]:
                fixed = dict(pending, destination=self._point(u.places["destination"]))
                return self._plan(u, fixed, prefix="D'accord. ")
            return self._reply(u, "D'accord. Dites-moi où vous voulez aller.", context={"pending_request": pending} if pending else None)

        # FAQ et questions sur le trajet en cours (« c'est quoi un gbaka ? », « je descends où ? »)
        answered = self._knowledge_reply(u, text, position, trip)
        if answered:
            return answered

        if u.intent in ROUTE_INTENTS:
            if u.needs_confirmation:
                pending_request = dict(u.journey_request or {})
                dest = u.places.get("destination")
                if dest and dest.get("match") and not pending_request.get("destination") and dest["match"].get("lat") is not None:
                    pending_request["destination"] = {"lat": dest["match"]["lat"], "lon": dest["match"]["lon"],
                                                      "name": dest["match"]["canonical"]}
                return self._reply(u, u.question, context={"pending_request": pending_request})
            if u.intent in ("find_stop", "ask_transfer") and not u.journey_request.get("destination"):
                return self._reply(u, "Dites-moi votre destination, je vous montre où prendre votre transport.")
            return self._plan(u, u.journey_request)

        if u.intent == "out_of_scope":  # hors sujet : refus poli, sans faire répéter
            return self._reply(u, self._other_intent_reply(u), kind="info")
        if "low_intent_confidence" in u.reasons:  # « euh », phrase mal transcrite : on fait répéter poliment
            return self._reply(u, u.question)
        return self._reply(u, self._other_intent_reply(u))

    def _knowledge_reply(self, u: Understanding, text: str, position: dict | None, trip: dict | None) -> dict | None:
        """Réponse de la FAQ, ou calculée sur le trajet en cours ; None si la phrase ne leur est pas destinée."""
        route_request = u.intent in ROUTE_INTENTS and bool(u.places.get("destination"))
        hits = self.knowledge.search(text, 1) if self.knowledge else []
        hit = hits[0] if hits and hits[0].score >= (FAQ_STRONG if route_request else self.faq_threshold) else None
        action = hit.passage.action if hit else None
        if not hit and trip and not u.places and u.intent_confidence >= TRIP_INTENT_MIN_CONFIDENCE:
            action = TRIP_ACTION_BY_INTENT.get(u.intent)
        sources = [hit.passage.id] if hit else []
        if action:
            if trip is None:
                # « Ça fait combien ? » sans trajet : la question habituelle « Tu veux aller où ? » s'en charge.
                return None if u.intent in ROUTE_INTENTS else self._reply(u, NO_TRIP, sources=sources, kind="info")
            if self.trips is None:
                return None
            reply, live = self.trips.answer(action, trip, position)
            return self._reply(u, reply, sources=sources + live, kind="info")
        if hit:
            return self._reply(u, hit.passage.answer, sources=sources, kind="info")
        # « Ça bouche à Adjamé ? » : les signalements des voyageurs autour de ce lieu.
        place = self._point(u.places.get("place") or u.places.get("destination"))
        if u.intent == "traffic_status" and place and self.trips:
            reply, live = self.trips.place_status(place)
            return self._reply(u, reply, sources=live, kind="info")
        return None

    def _plan(self, u: Understanding, request: dict, prefix: str = "") -> dict:
        if self.plan_journeys is None:
            return self._reply(u, prefix + "J'ai compris votre demande, mais le calcul des trajets n'est pas branché.", request=request)
        api_request = {k: v for k, v in request.items() if k != "preferredModes"}
        try:
            result = self.plan_journeys(api_request)
        except JourneyServiceError as error:
            return self._reply(u, prefix + error.spoken, request=request, error=str(error))
        chosen = _choose(result, result.get("journeys") or [], request)[0] if result.get("journeys") else None
        payload = self._reply(u, prefix + describe_journeys(result, request, u.intent), request=request, journeys=result,
                              sources=["sira-more"])
        payload["chosen_id"] = chosen.get("id") if chosen else None
        return payload

    @staticmethod
    def _reply(u: Understanding, text: str, context: dict | None = None, request: dict | None = None,
               journeys: dict | None = None, error: str | None = None, sources: list[str] | None = None,
               kind: str | None = None) -> dict:
        # kind : ce que l'app doit faire — partir (journeys), attendre une réponse (question), faire répéter (retry), ou rien (info).
        kind = kind or ("journeys" if journeys and journeys.get("journeys") else
                        "retry" if RETRY_REASONS & set(u.reasons) else "question" if context else "info")
        # sources : d'où vient la réponse (fiche de la FAQ, SIRA-MORE, signalements des voyageurs, lieux).
        return {"understanding": u.as_dict(), "reply_text": text, "context": context, "journey_request": request,
                "journeys": journeys, "error": error, "kind": kind, "chosen_id": None, "sources": sources or []}

    def _other_intent_reply(self, u: Understanding) -> str:
        place = (u.places.get("place") or {}).get("match") or {}
        name = place.get("canonical", "cet endroit")
        incident = next((e["text"] for e in u.entities if e["label"] == "INCIDENT_TYPE"), None)
        return {
            "report_incident": f"Merci. Je prépare le signalement{f' « {incident} »' if incident else ''} vers {name}. Confirmez-le sur l'écran pour prévenir les autres voyageurs.",
            "report_road_condition": f"Merci. Je prépare le signalement de l'état de la route vers {name}. Confirmez-le sur l'écran.",
            "traffic_status": "Dites-moi l'endroit, par exemple « ça bouche à Adjamé ? », et je regarde les signalements des voyageurs.",
            "reroute": "D'accord, je recalcule un autre passage depuis votre position.",
            "ask_nearby_landmark": "Je vous montre les repères autour de vous sur la carte.",
            "voice_help": "Je peux vous trouver un trajet, vous dire le prix, la durée, ou où prendre votre gbaka, votre wôrô-wôrô ou votre bus. Dites par exemple : je vais au Plateau.",
            "confirm": "C'est noté.",
            "out_of_scope": "Je suis SIRA, je vous aide pour vos déplacements à Abidjan. Dites-moi où vous voulez aller.",
        }.get(u.intent, "Je n'ai pas bien compris. Dites-moi où vous voulez aller.")


class JourneyServiceError(RuntimeError):
    def __init__(self, message: str, spoken: str):
        super().__init__(message)
        self.spoken = spoken


def _price(value) -> str:
    return "prix à confirmer" if value is None else f"environ {int(value)} francs"


def _rides(journey: dict) -> list[dict]:
    return [leg for leg in journey.get("legs") or [] if leg.get("mode") in nz.MODE_LABELS and leg.get("mode") != "walk"]


def _spoken_route(journey: dict) -> str:
    """« le bus SOTRA 52, puis le gbaka » : les lignes réellement prises, pas le libellé technique (« Option fast »)."""
    words: list[str] = []
    for leg in _rides(journey):
        code = f" {leg['line_code']}" if leg.get("line_code") else ""
        word = f"le {nz.MODE_LABELS[leg['mode']]}{code}"
        if not words or words[-1] != word:
            words.append(word)
    return ", puis ".join(words) if words else journey.get("label", "ce trajet")


def _first_ride(journey: dict) -> str | None:
    """Où monter, quand le moteur le précise (« Adjamé Liberté → Plateau ») ; rien pour un taxi."""
    for leg in _rides(journey):
        if leg["mode"] == "taxi":
            return None
        code = f" {leg['line_code']}" if leg.get("line_code") else ""
        where = _line_ends(leg.get("label") or "")
        return f"Prenez le {nz.MODE_LABELS[leg['mode']]}{code}{f', ligne {where}' if where else ''}."
    return None


def _line_ends(label: str) -> str:
    """« gbaka : Adjamé Liberté ↔ Yopougon Palais » → « Adjamé Liberté – Yopougon Palais » (dit une fois, sans flèche)."""
    ends = label.split(":", 1)[1] if ":" in label else label
    return " – ".join(part.strip() for part in re.split(r"[↔→]|<->|->", ends) if part.strip())


def _walking(minutes) -> str:
    return f", dont {minutes} minutes à pied" if minutes else ", sans marche"


def _choose(result: dict, journeys: list[dict], request: dict) -> tuple[dict, str]:
    """Trajet à annoncer : celui de la préférence, parmi ceux qui utilisent le mode demandé (« le gbaka pour… »)."""
    by_id = {j.get("id"): j for j in journeys}
    key = {"fast": "fastest_id", "cheap": "cheapest_id"}.get(request.get("preference"), "recommended_id")
    default = by_id.get(result.get(key)) or by_id.get(result.get("recommended_id")) or journeys[0]
    wanted = set(request.get("preferredModes") or [])
    if not wanted:
        return default, ""
    with_mode = [j for j in journeys if wanted & {leg.get("mode") for leg in _rides(j)}]
    if not with_mode:
        names = " ou ".join(nz.MODE_LABELS.get(m, m) for m in sorted(wanted))
        return default, f"Je n'ai pas trouvé de trajet en {names}. "
    if default in with_mode:
        return default, ""
    if request.get("preference") == "fast":
        return min(with_mode, key=lambda j: j.get("duration") or 10**6), ""
    return min(with_mode, key=lambda j: j.get("price") if j.get("price") is not None else 10**9), ""


def describe_journeys(result: dict, request: dict, intent: str) -> str:
    journeys = result.get("journeys") or []
    if not journeys:
        return "Je n'ai pas trouvé de trajet qui respecte votre demande. Essayez avec un autre budget ou un autre point de départ."
    chosen, note = _choose(result, journeys, request)
    dest = (request.get("destination") or {}).get("name", "votre destination")
    duration = chosen.get("duration")
    walking = chosen.get("walking_minutes") or 0
    route = _spoken_route(chosen)
    if intent == "ask_fare":
        return f"{note}Pour aller à {dest} : {_price(chosen.get('price'))}, avec {route}."
    if intent == "ask_eta":
        return f"{note}Pour aller à {dest}, compte environ {duration} minutes{_walking(walking)}."
    lead = {"fast": "Le plus rapide", "cheap": "Le moins cher"}.get(request.get("preference"), "Je vous conseille")
    parts = [f"{note}{lead} pour aller à {dest} : {route}.",
             f"{_price(chosen.get('price')).capitalize()}, {duration} minutes{_walking(walking)}."]
    ride = _first_ride(chosen)
    if ride:
        parts.append(ride)
    if len(journeys) > 1:
        parts.append(f"Il y a {len(journeys) - 1} autre{'s' if len(journeys) > 2 else ''} option{'s' if len(journeys) > 2 else ''} sur l'écran.")
    return " ".join(parts)


def _same_point(a: dict, b: dict) -> bool:
    return abs(a["lat"] - b["lat"]) < 1e-5 and abs(a["lon"] - b["lon"]) < 1e-5


def _position_point(position: dict | None) -> dict | None:
    if not position:
        return None
    try:
        lat, lon = float(position["lat"]), float(position["lon"])
    except (KeyError, TypeError, ValueError):
        return None
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None
    return {"lat": lat, "lon": lon, "name": position.get("name") or "Ma position"}
