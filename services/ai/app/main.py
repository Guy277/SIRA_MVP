from typing import Literal

from fastapi import FastAPI
from pydantic import BaseModel, Field


app = FastAPI(
    title="SIRA Intelligence API",
    version="0.1.0",
    description="Classement explicable des itinéraires multimodaux SIRA.",
)


class Journey(BaseModel):
    id: str
    label: str
    duration: int = Field(gt=0)
    price: int = Field(ge=0)
    walking_minutes: int = Field(ge=0)
    comfort: int = Field(ge=1, le=5)
    reliability: int = Field(ge=0, le=100)
    modes: list[str] = []
    profile: str | None = None
    distance_km: float | None = None
    shape: str | None = None


class RankingRequest(BaseModel):
    budget: int = Field(default=1500, ge=0)
    preference: Literal["balanced", "fast", "cheap", "comfort"] = "balanced"
    journeys: list[Journey] = Field(min_length=1)


class RankedJourney(Journey):
    sira_score: float
    reasons: list[str]


WEIGHTS = {
    "balanced": {"time": 0.32, "price": 0.28, "walk": 0.12, "comfort": 0.13, "reliability": 0.15},
    "fast": {"time": 0.58, "price": 0.12, "walk": 0.08, "comfort": 0.10, "reliability": 0.12},
    "cheap": {"time": 0.14, "price": 0.60, "walk": 0.08, "comfort": 0.06, "reliability": 0.12},
    "comfort": {"time": 0.18, "price": 0.12, "walk": 0.12, "comfort": 0.43, "reliability": 0.15},
}


def normalize(value: float, low: float, high: float, inverse: bool = False) -> float:
    if high == low:
        return 1.0
    score = (value - low) / (high - low)
    return 1 - score if inverse else score


@app.get("/health")
def health():
    return {"status": "ok", "service": "sira-ai"}


@app.post("/v1/recommendations/rank")
def rank_routes(request: RankingRequest):
    times = [route.duration for route in request.journeys]
    prices = [route.price for route in request.journeys]
    walks = [route.walking_minutes for route in request.journeys]
    weights = WEIGHTS[request.preference]
    ranked: list[RankedJourney] = []

    for route in request.journeys:
        score = (
            normalize(route.duration, min(times), max(times), inverse=True) * weights["time"]
            + normalize(route.price, min(prices), max(prices), inverse=True) * weights["price"]
            + normalize(route.walking_minutes, min(walks), max(walks), inverse=True) * weights["walk"]
            + ((route.comfort - 1) / 4) * weights["comfort"]
            + (route.reliability / 100) * weights["reliability"]
        )
        if route.price > request.budget:
            score -= min(0.35, (route.price - request.budget) / max(request.budget, 1) * 0.25)

        reasons: list[str] = []
        if route.price <= request.budget:
            reasons.append("Respecte votre budget")
        if route.duration == min(times):
            reasons.append("Option la plus rapide")
        if route.price == min(prices):
            reasons.append("Option la moins chère")
        if route.reliability >= 85:
            reasons.append("Bonne fiabilité observée")
        if route.walking_minutes <= 7:
            reasons.append("Peu de marche")

        ranked.append(RankedJourney(**route.model_dump(), sira_score=round(max(0, score) * 100, 1), reasons=reasons[:3]))

    ranked.sort(key=lambda item: item.sira_score, reverse=True)
    return {
        "recommended_id": ranked[0].id,
        "journeys": [item.model_dump() for item in ranked],
        "source": "sira-ranking-v1",
        "explanation": f"Classement optimisé pour la préférence « {request.preference} » et un budget de {request.budget} FCFA.",
    }
