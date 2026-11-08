"""Comprendre une phrase, décider (calculer ou confirmer) et formuler la réponse de SIRA.

Les chiffres des réponses (prix, durées) viennent UNIQUEMENT du moteur SIRA-MORE : rien n'est inventé.
Le nouchi reste hors des consignes critiques (politique de voix SIRA v0.3).
"""
from __future__ import annotations

import re
from contextvars import ContextVar
from dataclasses import dataclass, field, replace
from typing import Any, Callable

from . import normalize as nz
from .knowledge import Retriever
from .llm import LocalLLM
from .nlu import NLUModel
from .personal import clean_places, find_place
from .resolver import Match, PlaceResolver, norm, same_name
from .short_answer import yes_no
from .trip import NO_TRIP, TripAnswers, clean_trip

ROUTE_INTENTS = {"navigate_to", "ask_fastest", "ask_cheapest", "ask_eta", "ask_fare", "ask_mode", "avoid_traffic",
                 "find_stop", "ask_transfer"}
NEEDS_DESTINATION = {"navigate_to", "ask_fastest", "ask_cheapest", "ask_eta", "ask_fare", "ask_mode", "avoid_traffic"}

QUESTIONS = {
    "missing_destination": "Tu veux aller où ?",
    "missing_origin": "D'où est-ce que tu pars ?",
    "unresolvable_place": "Pardon, je ne connais pas « {text} ». Tu peux répéter, ou me donner un quartier ou un repère proche ?",
    "low_place_confidence": "Je n'ai pas bien compris le lieu. Tu veux dire {cand} ?",
    "ambiguous_place": "Tu veux dire {cand} ?",
    "place_without_coordinates": "Je connais {cand}, mais je n'ai pas encore sa position exacte. Tu peux me donner un repère proche ?",
    "low_intent_confidence": "Pardon, je n'ai pas bien compris. Tu peux répéter un peu plus fort, s'il te plaît ?",
}
# Réponses où l'app doit faire répéter (et proposer d'écrire ou la carte au 2e échec).
RETRY_REASONS = {"low_intent_confidence", "unresolvable_place"}

NOTHING_HEARD = "Pardon, je n'ai rien entendu. Tu peux répéter un peu plus fort, s'il te plaît ?"
# Question écrite (« Discuter avec SIRA ») : « répète plus fort » n'a pas de sens, on demande de reformuler.
TYPED_AGAIN = "Pardon, je n'ai pas bien compris. Tu peux reformuler, ou me dire où tu veux aller ?"
# « J'ai besoin d'aide », « tu sers à quoi ? » : ce que SIRA sait faire, tout de suite (sans attendre le LLM).
_HELP = re.compile(r"\b(aide|aider|aidez|help|secours|tu sers a quoi|tu fais quoi|que sais tu faire|"
                   r"qu'est ce que tu (?:sais|peux) faire|comment ca marche|comment tu marches?)\b")
PLACE_AGAIN = "Pardon, je n'ai pas bien compris le lieu. Tu peux le redire ?"
WHERE_TO = "D'accord. Dis-moi où tu veux aller."
STOP_NEEDS_DESTINATION = "Dis-moi ta destination, je te montre où prendre ton transport."
NO_MATCHING_TRIP = "Je n'ai pas trouvé de trajet qui respecte ta demande. Essaie avec un autre budget ou un autre point de départ."
DEFAULT_REPLY = "Je n'ai pas bien compris. Dis-moi où tu veux aller."
# Réponses toujours identiques (les autres dépendent du lieu dit).
OTHER_REPLIES = {
    "traffic_status": "Dis-moi l'endroit, par exemple « ça bouche à Adjamé ? », et je regarde les signalements des voyageurs.",
    "reroute": "D'accord, je recalcule un autre passage depuis ta position.",
    "ask_nearby_landmark": "Je te montre les repères autour de toi sur la carte.",
    "voice_help": "Je peux te trouver un trajet, te dire le prix, la durée, ou où prendre ton gbaka, ton wôrô-wôrô ou ton bus. Dis par exemple : je vais au Plateau.",
    "confirm": "C'est noté.",
    "out_of_scope": "Je suis SIRA, je t'aide pour tes déplacements à Abidjan. Dis-moi où tu veux aller.",
}
# Ce que SIRA dit souvent, mot pour mot : sa voix est préparée au démarrage du service (main.py).
FIXED_REPLIES = (NOTHING_HEARD, PLACE_AGAIN, WHERE_TO, STOP_NEEDS_DESTINATION, NO_MATCHING_TRIP, DEFAULT_REPLY,
                 *(q for q in QUESTIONS.values() if "{" not in q), *OTHER_REPLIES.values())
# Un lieu dit seul (« Cocody ! ») classé dans ces intentions veut dire « je vais là ».
PLACE_ALONE_INTENTS = {"confirm", "out_of_scope", "voice_help"}
# Raisons qui disent qu'une phrase a peut-être été mal entendue : elle repasse alors par Whisper (main.py).
UNSURE_HEARING = {"unresolvable_place", "ambiguous_place", "low_place_confidence", "place_without_coordinates",
                  "low_intent_confidence"}
# Lieux du voyageur (Maison, Travail…) de la question en cours. Le dialogue sert toutes les requêtes à la fois :
# ils sont propres à chaque appel de ask(), jamais gardés sur l'objet.
_PERSONAL: ContextVar[list[dict]] = ContextVar("personal_places", default=[])
YES_NO = {"oui", "ok", "d accord", "ya foye", "yafoye", "non", "voila", "c est ca", "merci"}
# FAQ (services/voice/knowledge) : une vraie demande de trajet (« je vais à Treichville en bateau-bus ») ne cède
# la place qu'à une fiche presque identique à la phrase (« le bateau-bus part d'où à Treichville ? »).
FAQ_STRONG = 0.9
# Question sur le trajet en cours reconnue par CamemBERT, sans lieu dit, quand aucune fiche ne correspond.
TRIP_ACTION_BY_INTENT = {"ask_eta": "trip_eta", "ask_fare": "trip_price", "ask_transfer": "trip_stops",
                         "find_stop": "trip_stops", "traffic_status": "trip_incidents"}
# … seulement si CamemBERT est sûr de lui (« il va pleuvoir demain ? » sort en traffic_status à 0,60).
TRIP_INTENT_MIN_CONFIDENCE = 0.8

# LLM local (llm.py) : appelé seulement quand les règles ne savent pas répondre. Ses outils sont traduits ici vers
# ce que SIRA sait déjà faire ; il ne fournit jamais lui-même un prix, une durée ou un arrêt.
LLM_ROUTE_REASONS = {"low_intent_confidence", "unresolvable_place", "missing_destination"}
LLM_PREFERENCES = {"rapide": "fast", "moins_cher": "cheap", "equilibre": "balanced", "peu_de_marche": "min_walking"}
LLM_INTENT_BY_PREFERENCE = {"fast": "ask_fastest", "cheap": "ask_cheapest"}
LLM_MODES = {"gbaka": "gbaka", "woro": "woro", "sotra": "sotra", "bateau": "boat", "taxi": "taxi"}
LLM_TRIP_SUBJECTS = {"arret": "trip_stops", "prix": "trip_price", "arrivee": "trip_eta", "incidents": "trip_incidents"}
TRIP_INTENT_BY_ACTION = {"trip_eta": "ask_eta", "trip_price": "ask_fare", "trip_stops": "ask_transfer",
                         "trip_incidents": "traffic_status"}
LLM_INCIDENTS = {"accident": "accident", "bouchon": "bouchon", "inondation": "inondation", "route_barree": "route barrée",
                 "autre": "incident"}
NO_INFO = "Je n'ai pas encore cette information. Je peux te trouver un trajet : dis-moi où tu veux aller."
LLM_MAX_REPLY = 300


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
                 knowledge: Retriever | None = None, trips: TripAnswers | None = None, faq_threshold: float = 0.65,
                 llm: LocalLLM | None = None):
        self.nlu = nlu
        self.resolver = resolver
        self.place_threshold = place_threshold
        self.place_margin = place_margin
        self.intent_min_confidence = intent_min_confidence
        self.plan_journeys = plan_journeys
        self.knowledge = knowledge
        self.trips = trips
        self.faq_threshold = faq_threshold
        self.llm = llm

    # ------------------------------------------------------------------ comprendre
    def _place(self, entity: dict, sentence: str = "") -> tuple[dict, str | None]:
        # « à la maison », « au boulot », « chez Maman » : le lieu choisi par le voyageur passe avant le répertoire.
        # Le modèle n'entend souvent que « tantie » dans « chez tantie » : le nom dit en entier dans la phrase compte.
        mine = find_place(entity["text"], _PERSONAL.get())
        if not mine and sentence:
            in_sentence = find_place(sentence, _PERSONAL.get())
            if in_sentence and norm(entity["text"]) and f" {norm(entity['text'])} " in f" {in_sentence['heard']} ":
                mine = in_sentence
        if mine:
            return {"heard": entity["text"], "match": mine, "alternatives": [], "reason": None}, None
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
        if len(clean.split()) <= 4 and find_place(clean, _PERSONAL.get()):  # « À la maison ! »
            start = text.index(clean)
            return {"label": "DESTINATION", "start": start, "end": start + len(clean), "text": clean, "score": 1.0}
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
                info, reason = self._place(by_label[label][0], text)
                u.places[key] = info
                if reason and (intent in ROUTE_INTENTS or key == "destination"):
                    u.reasons.append(reason)
        # « Je rentre à la maison » sans lieu reconnu par le modèle : on cherche les lieux du voyageur dans la phrase.
        if "destination" not in u.places and intent in ROUTE_INTENTS:
            origin = ((u.places.get("origin") or {}).get("match") or {}).get("canonical")
            mine = find_place(text, _PERSONAL.get(), skip=origin)
            if mine:
                u.places["destination"] = {"heard": mine["heard"], "match": mine, "alternatives": [], "reason": None}
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

    def needs_better_hearing(self, text: str, position: dict | None = None, places: list | None = None) -> bool:
        """La transcription rapide (Parakeet) a-t-elle pu mal entendre ? Oui quand un lieu ou l'intention ne sont pas
        sûrs, ou qu'un trajet n'a pas de destination (« je vais à Jami ») : la phrase repasse alors par Whisper."""
        token = _PERSONAL.set(clean_places(places))
        try:
            u = self.understand(text, position)
        finally:
            _PERSONAL.reset(token)
        return bool(UNSURE_HEARING & set(u.reasons)) or (u.intent in NEEDS_DESTINATION and "missing_destination" in u.reasons)

    def ask(self, text: str, position: dict | None = None, context: dict | None = None, trip: dict | None = None,
            places: list | None = None, typed: bool = False) -> dict:
        """trip : le trajet suivi dans l'application (calculé par SIRA-MORE), pour « je descends où ? ».
        places : les lieux du voyageur (Maison, Travail…), lus pour cette question seulement.
        typed : question écrite, pas dite : SIRA demande de reformuler au lieu de « répéter plus fort »."""
        token = _PERSONAL.set(clean_places(places))
        try:
            payload = self._ask(text, position, context, trip)
        finally:
            _PERSONAL.reset(token)
        if typed:
            payload["reply_text"] = _for_typed(payload["reply_text"])
        return payload

    def _ask(self, text: str, position: dict | None, context: dict | None, trip: dict | None) -> dict:
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
            return self._reply(u, PLACE_AGAIN, context={"pending_request": pending})
        # « Non, c'est Riviera Palmeraie » : on corrige la destination de la demande en attente
        if u.intent == "deny":
            if pending and "destination" in u.places and not u.places["destination"]["reason"]:
                fixed = dict(pending, destination=self._point(u.places["destination"]))
                return self._plan(u, fixed, prefix="D'accord. ")
            return self._reply(u, WHERE_TO, context={"pending_request": pending} if pending else None)

        # FAQ et questions sur le trajet en cours (« c'est quoi un gbaka ? », « je descends où ? »)
        answered = self._knowledge_reply(u, text, position, trip)
        if answered:
            return answered

        if u.intent != "voice_help" and not u.places.get("destination") and _HELP.search(norm(text)):
            u = replace(u, intent="voice_help", reasons=[], question=None)

        # Les règles ne sauraient que faire répéter ou refuser : le LLM local tente sa chance (s'il est branché).
        if self.llm is not None and self._wants_llm(u):
            helped = self._llm_reply(u, text, position, trip)
            if helped:
                return helped

        if u.intent in ROUTE_INTENTS:
            if u.needs_confirmation:
                pending_request = dict(u.journey_request or {})
                dest = u.places.get("destination")
                if dest and dest.get("match") and not pending_request.get("destination") and dest["match"].get("lat") is not None:
                    pending_request["destination"] = {"lat": dest["match"]["lat"], "lon": dest["match"]["lon"],
                                                      "name": dest["match"]["canonical"]}
                return self._reply(u, u.question, context={"pending_request": pending_request})
            if u.intent in ("find_stop", "ask_transfer") and not u.journey_request.get("destination"):
                return self._reply(u, STOP_NEEDS_DESTINATION)
            return self._plan(u, u.journey_request)

        if u.intent == "out_of_scope":  # hors sujet : refus poli, sans faire répéter
            return self._reply(u, self._other_intent_reply(u), kind="info")
        if "low_intent_confidence" in u.reasons:  # « euh », phrase mal transcrite : on fait répéter poliment
            return self._reply(u, u.question)
        return self._reply(u, self._other_intent_reply(u))

    # ------------------------------------------------------------------ LLM local (chef d'orchestre)
    def _wants_llm(self, u: Understanding) -> bool:
        if u.intent in ROUTE_INTENTS:
            return bool(LLM_ROUTE_REASONS & set(u.reasons))
        if u.intent == "out_of_scope" or "low_intent_confidence" in u.reasons:
            return True
        # « Trafic » peu sûr et sans lieu sûr : les règles ne sauraient que dire « Dis-moi l'endroit » à une phrase
        # qui n'en parle peut-être pas (« les wôrô roulent jusqu'à quelle heure ? » → trafic à 0,63, vu le 2026-11-08).
        if u.intent == "traffic_status" and u.intent_confidence < TRIP_INTENT_MIN_CONFIDENCE:
            sure_place = self._point(u.places.get("place") or u.places.get("destination")) and not UNSURE_HEARING & set(u.reasons)
            return not sure_place
        # Intention sans réponse prévue : les règles diraient « Je n'ai pas bien compris ».
        return u.intent not in OTHER_REPLIES and u.intent not in ("report_incident", "report_road_condition", "confirm", "deny")

    def _said_place(self, said: str) -> tuple[dict | None, dict | None]:
        """Le lieu nommé par le LLM, vérifié comme les autres (lieux du voyageur, puis répertoire) : (point, info)."""
        said = (said or "").strip()[:120]
        if not said:
            return None, None
        mine = find_place(said, _PERSONAL.get())
        if mine:
            return {"lat": mine["lat"], "lon": mine["lon"], "name": mine["canonical"]}, \
                {"heard": said, "match": mine, "alternatives": [], "reason": None}
        info, reason = self._place({"text": said}, said)
        return (None if reason else self._point(info)), info

    def _llm_reply(self, u: Understanding, text: str, position: dict | None, trip: dict | None) -> dict | None:
        decision = self.llm.decide(text, _PERSONAL.get(), in_trip=trip is not None)
        if decision is None:
            return None
        args = decision.args
        payload = None
        if decision.tool == "calculer_trajet":
            payload = self._llm_trip(u, args, position)
        elif decision.tool == "trajet_en_cours":
            action = LLM_TRIP_SUBJECTS.get(str(args.get("sujet")), "trip_summary")
            if trip is None:
                payload = self._reply(u, NO_TRIP, kind="info")
            elif self.trips is not None:
                reply, live = self.trips.answer(action, trip, position)
                payload = self._reply(replace(u, intent=TRIP_INTENT_BY_ACTION.get(action, u.intent)), reply, sources=live, kind="info")
        elif decision.tool == "signaler_incident":
            word = LLM_INCIDENTS.get(str(args.get("type")), "incident")
            _, info = self._said_place(str(args.get("lieu") or ""))
            reported = replace(u, intent="report_incident", reasons=[], places=dict(u.places),
                               entities=[*u.entities, {"label": "INCIDENT_TYPE", "text": word, "start": 0, "end": 0, "score": 1.0}])
            if info and not info.get("reason"):
                reported.places["place"] = info
            payload = self._reply(reported, self._other_intent_reply(reported), kind="info")
        elif decision.tool == "chercher_info":
            question = str(args.get("question") or text)[:300]
            hits = self.knowledge.search(question, 1) if self.knowledge else []
            hit = hits[0] if hits and hits[0].score >= self.faq_threshold else None
            payload = self._reply(u, hit.passage.answer if hit else NO_INFO, sources=[hit.passage.id] if hit else [], kind="info")
        elif decision.text and not re.search(r"\d", decision.text) and len(decision.text) <= LLM_MAX_REPLY:
            # Sans outil : seulement une phrase sans aucun chiffre (refus poli, salutation). Un chiffre écrit sans
            # outil serait inventé : on garde alors la réponse des règles.
            payload = self._reply(u, decision.text, kind="info")
        if payload is None:
            return None
        payload["sources"] = [*payload.get("sources", []), "llm"]
        payload["llm"] = {"outil": decision.tool, "arguments": args, "secondes": decision.seconds}
        return payload

    def _llm_trip(self, u: Understanding, args: dict, position: dict | None) -> dict:
        destination, info = self._said_place(str(args.get("destination") or ""))
        route = replace(u, intent="navigate_to", reasons=[], places=dict(u.places))
        if destination is None:
            route.reasons = ["unresolvable_place" if info else "missing_destination"]
            if info:
                route.places["destination"] = info
            return self._reply(route, self._question(route))
        route.places["destination"] = info
        origin = _position_point(position)
        if str(args.get("depart") or "").strip():
            origin, origin_info = self._said_place(str(args["depart"]))
            if origin is None:
                route.reasons = ["unresolvable_place"]
                route.places = {"origin": origin_info} if origin_info else {}
                return self._reply(route, self._question(route))
            route.places["origin"] = origin_info
        preference = LLM_PREFERENCES.get(str(args.get("preference")), "balanced")
        route.intent = LLM_INTENT_BY_PREFERENCE.get(preference, "navigate_to")
        excluded = sorted({LLM_MODES[m] for m in args.get("modes_exclus") or [] if m in LLM_MODES})
        request: dict[str, Any] = {"origin": origin, "destination": destination, "preference": preference,
                                   "constraints": {"excludedModes": excluded}}
        budget = args.get("budget_fcfa")
        if isinstance(budget, (int, float)) and 0 < budget <= 100_000:
            request["budget"] = int(budget)
        preferred = sorted({LLM_MODES[m] for m in args.get("modes_preferes") or [] if m in LLM_MODES})
        if preferred:
            request["preferredModes"] = preferred
        departure = nz.departure_at(str(args.get("heure") or "")) if args.get("heure") else None
        if departure:
            request["departureAt"] = departure
        route.journey_request = request
        if origin is None:
            route.reasons = ["missing_origin"]
            return self._reply(route, self._question(route), context={"pending_request": request})
        return self._plan(route, request)

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
        # « Ça bouche à Adjamé ? » : les signalements des voyageurs autour de ce lieu, seulement si l'intention et le
        # lieu sont sûrs. Sinon (« ça marche comment votre affaire de coulé là » → trafic à 0,48 et « Adjamé » deviné,
        # vu le 2026-11-08), on ne répond pas sur le trafic d'un lieu que le voyageur n'a pas demandé : le LLM essaie.
        place = self._point(u.places.get("place") or u.places.get("destination"))
        if u.intent == "traffic_status" and place and self.trips and not UNSURE_HEARING & set(u.reasons):
            reply, live = self.trips.place_status(place)
            return self._reply(u, reply, sources=live, kind="info")
        return None

    def _plan(self, u: Understanding, request: dict, prefix: str = "") -> dict:
        # Grand-Bassam, Dabou… : dans le Grand Abidjan mais hors du réseau de SIRA. On va jusqu'à la gare de départ
        # quand elle est connue, en le disant ; sinon on le dit sans inventer de trajet.
        far = self.resolver.outside_network((request.get("destination") or {}).get("name"))
        if far:
            name, depart = far["place"]["canonical"], far["depart"]
            if not depart or depart.get("lat") is None:
                return self._reply(u, prefix + f"{name} fait partie du Grand Abidjan, mais ses transports ne sont pas encore "
                                   "dans SIRA : je ne peux pas encore calculer ce trajet.", request=request, sources=["lieux"])
            request = dict(request, destination={"lat": depart["lat"], "lon": depart["lon"], "name": depart["canonical"]})
            prefix += (f"{name} n'est pas encore dans le réseau de SIRA : je t'emmène à {depart['canonical']}, "
                       f"d'où partent les véhicules pour {name}. ")
        if self.plan_journeys is None:
            return self._reply(u, prefix + "J'ai compris ta demande, mais le calcul des trajets n'est pas branché.", request=request)
        api_request = {k: v for k, v in request.items() if k != "preferredModes"}
        try:
            result = self.plan_journeys(api_request)
        except JourneyServiceError as error:
            return self._reply(u, prefix + error.spoken, request=request, error=str(error))
        if not result.get("journeys") and request.get("budget"):
            cheaper = self._over_budget(u, api_request, request, prefix)
            if cheaper:
                return cheaper
        chosen = _choose(result, result.get("journeys") or [], request)[0] if result.get("journeys") else None
        payload = self._reply(u, prefix + describe_journeys(result, request, u.intent), request=request, journeys=result,
                              sources=["sira-more"])
        payload["chosen_id"] = chosen.get("id") if chosen else None
        return payload

    def _over_budget(self, u: Understanding, api_request: dict, request: dict, prefix: str) -> dict | None:
        """« Koumassi avec 100 francs » : aucun trajet dans ce budget. Plutôt que « rien trouvé », SIRA donne le moins
        cher sans budget, avec le prix calculé par SIRA-MORE (jamais un prix deviné). None si rien non plus."""
        try:
            wider = self.plan_journeys({k: v for k, v in api_request.items() if k != "budget"})
        except JourneyServiceError:
            return None
        priced = [j for j in wider.get("journeys") or [] if isinstance(j.get("price"), (int, float))]
        if not priced:
            return None
        cheapest = min(priced, key=lambda j: j["price"])
        dest = (request.get("destination") or {}).get("name", "ta destination")
        text = (f"{prefix}Avec {request['budget']} francs, je ne trouve pas de trajet pour aller à {dest}. "
                f"Le moins cher coûte {_price(cheapest['price'])} : {_spoken_route(cheapest)}. Il est sur l'écran.")
        payload = self._reply(u, text, request={k: v for k, v in request.items() if k != "budget"}, journeys=wider,
                              sources=["sira-more"])
        payload["chosen_id"] = cheapest.get("id")
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
            "report_incident": f"Merci. Je prépare le signalement{f' « {incident} »' if incident else ''} vers {name}. Confirme-le sur l'écran pour prévenir les autres voyageurs.",
            "report_road_condition": f"Merci. Je prépare le signalement de l'état de la route vers {name}. Confirme-le sur l'écran.",
            **OTHER_REPLIES,
        }.get(u.intent, DEFAULT_REPLY)


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
        return f"Prends le {nz.MODE_LABELS[leg['mode']]}{code}{f', ligne {where}' if where else ''}."
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


def _for_typed(text: str) -> str:
    """Une réponse prévue pour la voix, dite à quelqu'un qui a écrit sa question."""
    if text in (QUESTIONS["low_intent_confidence"], NOTHING_HEARD):
        return TYPED_AGAIN
    return text.replace("Tu peux répéter, ou", "Tu peux vérifier l'orthographe, ou").replace(
        "Tu peux le redire ?", "Tu peux le réécrire ?")


def describe_journeys(result: dict, request: dict, intent: str) -> str:
    journeys = result.get("journeys") or []
    if not journeys:
        return NO_MATCHING_TRIP
    chosen, note = _choose(result, journeys, request)
    dest = (request.get("destination") or {}).get("name", "ta destination")
    duration = chosen.get("duration")
    walking = chosen.get("walking_minutes") or 0
    route = _spoken_route(chosen)
    if intent == "ask_fare":
        return f"{note}Pour aller à {dest} : {_price(chosen.get('price'))}, avec {route}."
    if intent == "ask_eta":
        return f"{note}Pour aller à {dest}, compte environ {duration} minutes{_walking(walking)}."
    lead = {"fast": "Le plus rapide", "cheap": "Le moins cher"}.get(request.get("preference"), "Je te conseille")
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
