from typing import Any, Literal

from fastapi import FastAPI
from pydantic import BaseModel, ConfigDict, Field

from .engine import recommend


app = FastAPI(
    title="SIRA Intelligence API",
    version="1.1.0",
    description="Moteur SIRA-MORE : contraintes, Pareto, diversité et classement explicable.",
)


class Journey(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str
    label: str
    duration: int = Field(gt=0)
    price: int = Field(ge=0)
    walking_minutes: int = Field(default=0, ge=0)
    comfort: int = Field(default=3, ge=1, le=5)
    reliability: int = Field(default=65, ge=0, le=100)
    modes: list[str] = Field(default_factory=list)
    profile: str | None = None
    distance_km: float | None = None
    shape: str | None = None
    geometry: list[tuple[float, float]] | None = None
    description: str | None = None
    legs: list[dict[str, Any]] = Field(default_factory=list)
    data_notice: str | None = None


class Constraints(BaseModel):
    max_budget_fcfa: int = Field(default=1500, ge=0)
    max_walking_distance_m: int = Field(default=1500, ge=0)
    max_transfers: int = Field(default=3, ge=0)
    max_boardings: int = Field(default=4, ge=1)
    max_bus_boardings: int = Field(default=3, ge=0)
    max_gbaka_boardings: int = Field(default=2, ge=0)
    max_boat_boardings: int = Field(default=1, ge=0)
    max_duration_minutes: int = Field(default=150, ge=1)
    excluded_modes: list[str] = Field(default_factory=list)
    max_overlap: float = Field(default=0.80, ge=0, le=1)


class RankingRequest(BaseModel):
    budget: int = Field(default=1500, ge=0)
    preference: Literal["balanced", "fast", "cheap", "comfort"] = "balanced"
    constraints: Constraints | None = None
    max_results: int = Field(default=3, ge=1, le=5)
    journeys: list[Journey] = Field(min_length=1)


@app.get("/health")
def health():
    return {"status": "ok", "service": "sira-ai", "engine": "SIRA-MORE 1.1 Phase 1"}


@app.post("/v1/recommendations/rank")
def rank_routes(request: RankingRequest):
    return recommend(
        [journey.model_dump() for journey in request.journeys],
        budget=request.budget,
        preference=request.preference,
        constraints=request.constraints.model_dump() if request.constraints else None,
        max_results=request.max_results,
    )
