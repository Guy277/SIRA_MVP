"""SIRA-MORE Phase 1: deterministic multimodal recommendation engine.

Candidate generation stays in the mobility service. This framework-free module
owns constraints, Pareto filtering, diversity, scoring and explanations.
"""

from __future__ import annotations

from copy import deepcopy
from math import isfinite
from typing import Any


IGNORED_MODES = {"walk", "wait", "transfer"}
DEFAULT_CONSTRAINTS = {
    "max_budget_fcfa": 1500,
    "max_walking_distance_m": 1500,
    "max_transfers": 3,
    "max_boardings": 4,
    "max_bus_boardings": 3,
    "max_gbaka_boardings": 2,
    "max_boat_boardings": 1,
    "max_duration_minutes": 150,
    "excluded_modes": [],
    "max_overlap": 0.80,
}

# Supplied SIRA weights, extended with discomfort while keeping a total of 1.
WEIGHTS = {
    "balanced": {"duration": .27, "price": .23, "walking_distance_m": .10, "transfer_count": .10, "risk": .09, "uncertainty": .05, "unreliability": .10, "discomfort": .06},
    "fast": {"duration": .51, "price": .10, "walking_distance_m": .08, "transfer_count": .07, "risk": .07, "uncertainty": .04, "unreliability": .08, "discomfort": .05},
    "cheap": {"duration": .14, "price": .51, "walking_distance_m": .10, "transfer_count": .05, "risk": .05, "uncertainty": .05, "unreliability": .05, "discomfort": .05},
    "comfort": {"duration": .17, "price": .11, "walking_distance_m": .11, "transfer_count": .10, "risk": .08, "uncertainty": .06, "unreliability": .12, "discomfort": .25},
}
PARETO_KEYS = ("duration", "price", "walking_distance_m", "transfer_count", "risk", "uncertainty", "unreliability", "discomfort")


def _number(value: Any, default: float = 0.0) -> float:
    try:
        parsed = float(value)
        return parsed if isfinite(parsed) else default
    except (TypeError, ValueError):
        return default


def _motorized_legs(journey: dict[str, Any]) -> list[dict[str, Any]]:
    return [leg for leg in journey.get("legs", []) if str(leg.get("mode", "")).lower() not in IGNORED_MODES]


def enrich_metrics(candidate: dict[str, Any]) -> dict[str, Any]:
    """Compute canonical SIRA metrics once; the frontend only displays them."""
    journey = deepcopy(candidate)
    legs = journey.get("legs", [])
    motorized = _motorized_legs(journey)
    modes = [str(leg.get("mode", "")).lower() for leg in motorized]
    component_duration = sum(_number(leg.get("duration")) for leg in legs)
    component_price = sum(_number(leg.get("price")) for leg in legs)
    boardings = int(_number(journey.get("boarding_count"), len(motorized)))
    explicit_transfers = sum(1 for leg in legs if leg.get("mode") == "transfer")
    transfer_count = int(_number(journey.get("transfer_count"), max(explicit_transfers, boardings - 1)))
    walking_from_legs = sum(_number(leg.get("duration")) for leg in legs if leg.get("mode") == "walk")
    walking_minutes = walking_from_legs if legs else _number(journey.get("walking_minutes"))
    walking_distance = _number(journey.get("walking_distance_m"), walking_minutes * 75)
    waiting_minutes = _number(journey.get("waiting_minutes"), sum(_number(leg.get("duration")) for leg in legs if leg.get("mode") == "wait"))
    in_vehicle_minutes = _number(journey.get("in_vehicle_minutes"), sum(_number(leg.get("duration")) for leg in motorized))
    reliability = min(100., max(0., _number(journey.get("reliability"), 65)))
    comfort = min(5., max(1., _number(journey.get("comfort"), 3)))
    estimated_legs = sum(1 for leg in legs if leg.get("dataStatus", leg.get("data_status")) != "live")
    uncertainty = min(1., max(0., _number(journey.get("uncertainty"), .15 + estimated_legs / max(len(legs), 1) * .20)))
    risk = min(1., max(0., _number(journey.get("incident_risk"), (100 - reliability) / 100)))
    line_ids = journey.get("line_ids") or [
        str(leg.get("line_id") or leg.get("source") or leg.get("label"))
        for leg in motorized if leg.get("line_id") or leg.get("source") or leg.get("label")
    ]
    journey.update({
        "duration": int(round(component_duration if legs else _number(journey.get("duration")))),
        "price": int(round(component_price if legs else _number(journey.get("price")))),
        "walking_minutes": int(round(walking_minutes)),
        "walking_distance_m": int(round(walking_distance)),
        "waiting_minutes": int(round(waiting_minutes)),
        "in_vehicle_minutes": int(round(in_vehicle_minutes)),
        "boarding_count": boardings,
        "transfer_count": transfer_count,
        "bus_boardings": int(_number(journey.get("bus_boardings"), modes.count("sotra"))),
        "gbaka_boardings": int(_number(journey.get("gbaka_boardings"), modes.count("gbaka"))),
        "boat_boardings": int(_number(journey.get("boat_boardings"), modes.count("boat"))),
        "modes": journey.get("modes") or list(dict.fromkeys(modes)),
        "line_ids": list(dict.fromkeys(line_ids)),
        "reliability": int(round(reliability)),
        "comfort": int(round(comfort)),
        "risk": round(risk, 4),
        "uncertainty": round(uncertainty, 4),
        "unreliability": round((100 - reliability) / 100, 4),
        "discomfort": round(1 - (comfort - 1) / 4, 4),
        "duration_components": {
            "walking": int(round(walking_minutes)),
            "waiting": int(round(waiting_minutes)),
            "in_vehicle": int(round(in_vehicle_minutes)),
            "transfer": int(round(sum(_number(leg.get("duration")) for leg in legs if leg.get("mode") == "transfer"))),
        },
    })
    journey["duration_p90"] = int(round(_number(candidate.get("duration_p90"), journey["duration"] * (1 + uncertainty * .35))))
    return journey


def constraint_violations(journey: dict[str, Any], constraints: dict[str, Any]) -> list[dict[str, str]]:
    checks = [
        ("budget", journey["price"] > constraints["max_budget_fcfa"], "Budget maximum dépassé"),
        ("walking", journey["walking_distance_m"] > constraints["max_walking_distance_m"], "Distance de marche maximale dépassée"),
        ("transfers", journey["transfer_count"] > constraints["max_transfers"], "Nombre maximal de correspondances dépassé"),
        ("boardings", journey["boarding_count"] > constraints["max_boardings"], "Nombre maximal d'embarquements dépassé"),
        ("bus_boardings", journey["bus_boardings"] > constraints["max_bus_boardings"], "Nombre maximal d'embarquements bus dépassé"),
        ("gbaka_boardings", journey["gbaka_boardings"] > constraints["max_gbaka_boardings"], "Nombre maximal d'embarquements gbaka dépassé"),
        ("boat_boardings", journey["boat_boardings"] > constraints["max_boat_boardings"], "Nombre maximal d'embarquements bateau dépassé"),
        ("duration", journey["duration"] > constraints["max_duration_minutes"], "Durée maximale dépassée"),
    ]
    excluded = {str(mode).lower() for mode in constraints.get("excluded_modes", [])}
    used = {str(mode).lower() for mode in journey.get("modes", [])}
    if excluded & used:
        checks.append(("excluded_modes", True, "Un mode de transport exclu est utilisé"))
    return [{"code": code, "message": message} for code, failed, message in checks if failed]


def dominates(left: dict[str, Any], right: dict[str, Any]) -> bool:
    return all(_number(left[key]) <= _number(right[key]) for key in PARETO_KEYS) and any(_number(left[key]) < _number(right[key]) for key in PARETO_KEYS)


def pareto_frontier(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [candidate for candidate in candidates if not any(other["id"] != candidate["id"] and dominates(other, candidate) for other in candidates)]


def _geometry_edges(journey: dict[str, Any]) -> set[str]:
    points = [f"{round(_number(point[0]), 3):.3f},{round(_number(point[1]), 3):.3f}" for point in journey.get("geometry") or [] if isinstance(point, (list, tuple)) and len(point) >= 2]
    return {"|".join(sorted((a, b))) for a, b in zip(points, points[1:]) if a != b}


def route_similarity(left: dict[str, Any], right: dict[str, Any]) -> float:
    left_keys = set(left.get("line_ids") or []) or _geometry_edges(left)
    right_keys = set(right.get("line_ids") or []) or _geometry_edges(right)
    if not left_keys or not right_keys:
        return 0.
    return len(left_keys & right_keys) / len(left_keys | right_keys)


def _normalised_cost(value: float, values: list[float]) -> float:
    low, high = min(values), max(values)
    return 0. if high == low else (value - low) / (high - low)


def _reasons(journey: dict[str, Any], candidates: list[dict[str, Any]], constraints: dict[str, Any]) -> list[str]:
    reasons = [f"Respecte le budget de {constraints['max_budget_fcfa']} FCFA"]
    if journey["duration"] == min(item["duration"] for item in candidates): reasons.append("Durée totale la plus courte")
    if journey["price"] == min(item["price"] for item in candidates): reasons.append("Coût total le plus faible")
    if journey["walking_distance_m"] <= min(600, constraints["max_walking_distance_m"]): reasons.append(f"Marche limitée à {journey['walking_distance_m']} m")
    if journey["transfer_count"] == 0: reasons.append("Sans correspondance")
    elif journey["transfer_count"] == 1: reasons.append("Une seule correspondance")
    if journey["reliability"] >= 80: reasons.append(f"Fiabilité estimée à {journey['reliability']} %")
    reasons.append(f"{journey['walking_minutes']} min de marche · {journey['waiting_minutes']} min d’attente")
    return reasons[:4]


def recommend(candidates: list[dict[str, Any]], *, budget: int = 1500, preference: str = "balanced", constraints: dict[str, Any] | None = None, max_results: int = 3) -> dict[str, Any]:
    rules = {**DEFAULT_CONSTRAINTS, **(constraints or {})}
    rules["max_budget_fcfa"] = min(int(rules["max_budget_fcfa"]), int(budget)) if constraints and "max_budget_fcfa" in constraints else int(budget)
    profile = preference if preference in WEIGHTS else "balanced"
    enriched = [enrich_metrics(candidate) for candidate in candidates]
    feasible, rejected = [], []
    for journey in enriched:
        violations = constraint_violations(journey, rules)
        journey["conforming"] = not violations
        journey["constraint_violations"] = violations
        (feasible if not violations else rejected).append(journey)

    frontier = pareto_frontier(feasible)
    weights = WEIGHTS[profile]
    if frontier:
        values = {key: [_number(item[key]) for item in frontier] for key in weights}
        for journey in frontier:
            cost = sum(_normalised_cost(_number(journey[key]), values[key]) * weight for key, weight in weights.items())
            journey["sira_score"] = round((1 - cost) * 100, 1)
            journey["reasons"] = _reasons(journey, frontier, rules)
        frontier.sort(key=lambda item: (-item["sira_score"], item["duration"], item["price"]))

    diverse = []
    for candidate in frontier:
        if all(route_similarity(candidate, chosen) <= rules["max_overlap"] for chosen in diverse): diverse.append(candidate)
        if len(diverse) >= max_results: break

    recommended_id = diverse[0]["id"] if diverse else None
    fastest_id = min(feasible, key=lambda item: (item["duration"], item["price"]))["id"] if feasible else None
    cheapest_id = min(feasible, key=lambda item: (item["price"], item["duration"]))["id"] if feasible else None
    for journey in diverse:
        journey["recommended"] = journey["id"] == recommended_id
        journey["profile_tags"] = [label for label, matches in (("recommended", journey["id"] == recommended_id), ("fastest", journey["id"] == fastest_id), ("cheapest", journey["id"] == cheapest_id)) if matches]

    return {
        "recommended_id": recommended_id,
        "fastest_id": fastest_id,
        "cheapest_id": cheapest_id,
        "journeys": diverse,
        "rejected": [{"id": item["id"], "constraint_violations": item["constraint_violations"]} for item in rejected],
        "engine": {"name": "SIRA-MORE", "version": "1.1-phase-1", "pipeline": ["constraints", "pareto", "diversity", "scoring", "explanation"], "preference": profile, "constraints": rules, "candidate_count": len(enriched), "feasible_count": len(feasible), "pareto_count": len(frontier), "returned_count": len(diverse)},
        "source": "sira-more-v1.1-phase-1",
    }
