"""Réponses sur le trajet en cours (« je descends où ? », « il y a des bouchons sur mon trajet ? »).

Tout vient du trajet calculé par SIRA-MORE (envoyé par l'application), d'un nouveau calcul depuis la position
de l'usager, des signalements des voyageurs (API /reports) et du répertoire de lieux : aucun chiffre inventé.
"""
from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

from . import normalize as nz
from .resolver import PlaceResolver

RIDE_MODES = {"sotra", "gbaka", "woro", "boat", "taxi"}
NEAR_PLACE_M = 400      # au-delà, on ne nomme pas l'arrêt (« à l'arrêt indiqué sur la carte »)
PLACE_REPORTS_M = 1500  # signalements « vers Adjamé »
MAX_LEGS, MAX_POINTS = 30, 400  # garde-fous sur ce que l'application envoie

NO_TRIP = "Tu n'as pas de trajet en cours. Dis-moi où tu veux aller et je t'en trouve un."


class LiveDataError(RuntimeError):
    """API SIRA injoignable (signalements ou calcul) : on le dit, sans deviner."""


def distance_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    """Distance entre deux points (lat, lon) en mètres."""
    lat1, lon1, lat2, lon2 = map(math.radians, (*a, *b))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * 6_371_000 * math.asin(math.sqrt(h))


def clean_trip(trip: Any) -> dict | None:
    """Garde ce qui sert du trajet envoyé par l'application ; None s'il est inutilisable."""
    if not isinstance(trip, dict):
        return None
    dest, journey = trip.get("destination"), trip.get("journey")
    if not isinstance(dest, dict) or not isinstance(journey, dict) or not isinstance(journey.get("legs"), list):
        return None
    try:
        destination = {"lat": float(dest["lat"]), "lon": float(dest["lon"]), "name": str(dest.get("name") or "ta destination")[:120]}
    except (KeyError, TypeError, ValueError):
        return None
    legs = []
    for leg in journey["legs"][:MAX_LEGS]:
        if not isinstance(leg, dict):
            continue
        geometry = leg.get("geometry") if isinstance(leg.get("geometry"), list) else []
        if len(geometry) > MAX_POINTS:  # on garde la forme du tracé, sans tout recevoir
            step = math.ceil(len(geometry) / MAX_POINTS)
            geometry = geometry[::step] + [geometry[-1]]
        legs.append({"mode": str(leg.get("mode", "")), "label": str(leg.get("label", ""))[:160],
                     "line_code": leg.get("line_code"), "price": _number(leg.get("price")),
                     "duration": _number(leg.get("duration")), "geometry": geometry})
    return {"destination": destination, "legs": legs, "duration": _number(journey.get("duration")),
            "price": _number(journey.get("price"))}


def _number(value) -> int | None:
    try:
        return None if value is None else int(round(float(value)))
    except (TypeError, ValueError):
        return None


def _rides(trip: dict) -> list[dict]:
    return [leg for leg in trip["legs"] if leg["mode"] in RIDE_MODES]


def ride_name(leg: dict) -> str:
    """« le gbaka », « le bus SOTRA 52 », « un taxi »."""
    if leg["mode"] == "taxi":
        return "un taxi"
    code = f" {leg['line_code']}" if leg.get("line_code") and leg["mode"] == "sotra" else ""
    return f"le {nz.MODE_LABELS.get(leg['mode'], leg['mode'])}{code}"


def _clock(date: datetime) -> str:
    return f"{date.hour} h {date.minute:02d}"


def _francs(value: int | None) -> str:
    return "prix à confirmer" if value is None else f"environ {value} francs"


class TripAnswers:
    def __init__(self, resolver: PlaceResolver, plan: Callable[[dict], dict] | None = None,
                 impact: Callable[[list], dict] | None = None, reports: Callable[[], list] | None = None,
                 now: Callable[[], datetime] = lambda: datetime.now(timezone.utc)):
        self.resolver, self.plan, self.impact, self.reports, self.now = resolver, plan, impact, reports, now

    # ------------------------------------------------------------------ lieux
    def _near(self, point) -> str | None:
        """Nom du lieu connu le plus proche d'un point [lon, lat] du tracé."""
        try:
            lon, lat = float(point[0]), float(point[1])
        except (TypeError, ValueError, IndexError):
            return None
        match = self.resolver.nearest(lat, lon, NEAR_PLACE_M)
        return match.canonical if match else None

    def _where(self, point) -> str:
        name = self._near(point)
        return f"vers {name}" if name else "à l'arrêt indiqué sur la carte"

    # ------------------------------------------------------------------ réponses
    def answer(self, action: str, trip: dict | None, position: dict | None) -> tuple[str, list[str]]:
        if trip is None:
            return NO_TRIP, []
        handler = {"trip_summary": self.summary, "trip_eta": self.eta, "trip_price": self.price, "trip_stops": self.stops,
                   "trip_transfer": self.transfer, "trip_incidents": self.incidents}.get(action, self.summary)
        return handler(trip, position)

    def summary(self, trip: dict, position: dict | None) -> tuple[str, list[str]]:
        rides = _rides(trip)
        route = ", puis ".join(ride_name(leg) for leg in rides) if rides else "à pied"
        dest = trip["destination"]["name"]
        figures = [f"{trip['duration']} minutes" if trip["duration"] is not None else None,
                   _francs(trip["price"]) if rides else None]
        first = f"Ton trajet vers {dest} : {route}" + (f", {' et '.join(f for f in figures if f)}." if any(figures) else ".")
        incidents, sources = self._incident_sentence(trip, short=True)
        return f"{first} {incidents}".strip(), ["sira-more:trajet", *sources]

    def eta(self, trip: dict, position: dict | None) -> tuple[str, list[str]]:
        dest = trip["destination"]
        if position and self.plan:
            try:
                result = self.plan({"origin": {"lat": position["lat"], "lon": position["lon"], "name": "Ma position"},
                                    "destination": dest, "preference": "balanced", "constraints": {"excludedModes": []}})
            except Exception:  # calcul indisponible : on donne la durée prévue au départ
                result = None
            journeys = (result or {}).get("journeys") or []
            if journeys:
                by_id = {j.get("id"): j for j in journeys}
                best = by_id.get(result.get("recommended_id")) or journeys[0]
                minutes = _number(best.get("duration"))
                if minutes is not None:
                    arrival = self.now() + timedelta(minutes=minutes)
                    return (f"D'ici, compte environ {minutes} minutes jusqu'à {dest['name']}, arrivée vers {_clock(arrival)}. "
                            "C'est le calcul de SIRA depuis ta position actuelle."), ["sira-more:calcul-depuis-ma-position"]
        if trip["duration"] is None:
            return "Je n'ai pas la durée de ce trajet. Relance la recherche pour la voir.", []
        return f"Ton trajet vers {dest['name']} dure environ {trip['duration']} minutes au total, d'après SIRA.", ["sira-more:trajet"]

    def price(self, trip: dict, position: dict | None) -> tuple[str, list[str]]:
        rides = _rides(trip)
        if not rides:
            return "Ton trajet se fait à pied : il ne coûte rien.", ["sira-more:trajet"]
        if trip["price"] is None:
            return "Je n'ai pas encore le prix de ce trajet. Demande-le au chauffeur, et dis-moi ensuite combien tu as payé.", ["sira-more:trajet"]
        parts = [f"{leg['price']} pour {ride_name(leg)}" for leg in rides if leg["price"]]
        detail = f" : {', '.join(parts[:-1])} et {parts[-1]}" if len(parts) > 1 else ""
        return (f"Ton trajet coûte environ {trip['price']} francs{detail}. "
                "C'est une estimation : les prix peuvent changer."), ["sira-more:trajet"]

    def stops(self, trip: dict, position: dict | None) -> tuple[str, list[str]]:
        rides = [leg for leg in _rides(trip) if leg["geometry"]]
        if not rides:
            return (("Ton trajet se fait à pied, suis le tracé sur la carte." if not _rides(trip)
                     else "Je n'ai pas la position des arrêts pour ce trajet : regarde le tracé sur la carte."), ["sira-more:trajet"])
        sentences = []
        for index, leg in enumerate(rides[:2]):
            verb = "Monte dans" if index == 0 else "Ensuite, monte dans"
            sentences.append(f"{verb} {ride_name(leg)} {self._where(leg['geometry'][0])}, et descends {self._where(leg['geometry'][-1])}.")
        text = " ".join(sentences) + (" La suite est sur l'écran." if len(rides) > 2 else "")
        return text, ["sira-more:trajet", "lieux"]

    def transfer(self, trip: dict, position: dict | None) -> tuple[str, list[str]]:
        rides = _rides(trip)
        if len(rides) < 2:
            if not rides:
                return "Ton trajet se fait à pied : pas de changement.", ["sira-more:trajet"]
            return f"Pas de changement : {ride_name(rides[0])} t'emmène jusqu'au bout.", ["sira-more:trajet"]
        first, second = rides[0], rides[1]
        where = self._where(first["geometry"][-1]) if first["geometry"] else "à l'arrêt indiqué sur la carte"
        others = len(rides) - 2
        more = f" Il y a encore {others} changement{'s' if others > 1 else ''} après, sur l'écran." if others else ""
        return f"Tu changes {where} : tu quittes {ride_name(first)} pour prendre {ride_name(second)}.{more}", ["sira-more:trajet", "lieux"]

    def incidents(self, trip: dict, position: dict | None) -> tuple[str, list[str]]:
        return self._incident_sentence(trip, short=False)

    def _incident_sentence(self, trip: dict, short: bool) -> tuple[str, list[str]]:
        legs = [{"mode": leg["mode"], "geometry": leg["geometry"]} for leg in trip["legs"]]
        if not self.impact or not any(leg["geometry"] for leg in legs):
            return ("" if short else "Je ne peux pas vérifier les signalements pour ce trajet pour le moment."), []
        try:
            impact = self.impact(legs)
        except LiveDataError:
            return ("" if short else "Je n'arrive pas à vérifier les signalements pour le moment. Réessaie dans un instant."), []
        affected, unconfirmed = impact.get("affected") or [], impact.get("unconfirmed") or []
        if affected:
            report = affected[0].get("report") or {}
            what = str(report.get("title") or "un incident").lower()
            where = f" vers {report['location']}" if report.get("location") else ""
            delay = _number(impact.get("delayMinutes"))
            late = f", environ {delay} minutes de retard" if delay else ""
            first = f"Attention : {what} signalé{where} sur ton trajet{late}."
            if short:
                return first, ["signalements"]
            if impact.get("requiresReroute") or impact.get("blocking"):
                return f"{first} Je te conseille de demander un autre passage.", ["signalements"]
            others = len(affected) - 1
            return first + (f" Il y a {others} autre{'s' if others > 1 else ''} signalement{'s' if others > 1 else ''} sur l'écran." if others else ""), ["signalements"]
        if unconfirmed and not short:
            report = unconfirmed[0].get("report") or {}
            where = f" vers {report['location']}" if report.get("location") else ""
            return (f"Un voyageur a signalé {str(report.get('title') or 'un incident').lower()}{where}, sur ton trajet. "
                    "Ce n'est pas encore confirmé par d'autres voyageurs."), ["signalements"]
        return "Aucun incident signalé sur ton trajet pour le moment.", ["signalements"]

    # ------------------------------------------------------------------ « ça bouche à Adjamé ? »
    def place_status(self, place: dict) -> tuple[str, list[str]]:
        if not self.reports:
            return f"Je ne peux pas vérifier les signalements vers {place['name']} pour le moment.", []
        try:
            reports = self.reports()
        except LiveDataError:
            return "Je n'arrive pas à vérifier les signalements pour le moment. Réessaie dans un instant.", []
        near = [r for r in reports if isinstance(r, dict) and r.get("status") in ("reported", "confirmed", "reliable")
                and _close(r, place, PLACE_REPORTS_M)]
        if not near:
            return f"Aucun incident signalé vers {place['name']} pour le moment.", ["signalements"]
        first = near[0]
        more = f" Il y a {len(near) - 1} autre{'s' if len(near) > 2 else ''} signalement{'s' if len(near) > 2 else ''} dans le coin." if len(near) > 1 else ""
        confirmed = "" if first.get("status") != "reported" else ", pas encore confirmé"
        return f"Vers {place['name']} : {str(first.get('title') or 'un incident').lower()} signalé{confirmed}.{more}", ["signalements"]


def _close(report: dict, place: dict, limit_m: float) -> bool:
    try:
        return distance_m((float(report["lat"]), float(report["lon"])), (place["lat"], place["lon"])) <= limit_m
    except (KeyError, TypeError, ValueError):
        return False
