from pydantic import BaseModel, Field
from typing import List, Optional

class RoutingRequest(BaseModel):
    origin_lat: float = Field(..., example=5.3401)
    origin_lng: float = Field(..., example=-4.0812)
    origin_name: Optional[str] = Field("Yopougon Siporex", example="Yopougon Siporex")
    destination_lat: float = Field(..., example=5.3532)
    destination_lng: float = Field(..., example=-4.0267)
    destination_name: Optional[str] = Field("Adjamé Liberté", example="Adjamé Liberté")
    preferred_mode: Optional[str] = Field(None, example="GBAKA")

class RouteStep(BaseModel):
    step_order: int
    mode: str  # WALK, BUS_SOTRA, GBAKA, WORO_WORO, BOAT_BUS
    line_code: Optional[str] = None
    line_name: Optional[str] = None
    from_station_name: str
    to_station_name: str
    distance_km: float
    duration_min: int
    fare_amount: float
    instructions: str

class RouteOption(BaseModel):
    id: str
    title: str
    description: str
    type: str  # FASTEST, CHEAPEST, DIRECT_INFORMAL, SOTRA_ECO, ALTERNATIVE
    total_duration_min: int
    total_distance_km: float
    total_fare_amount: float
    currency: str = "FCFA"
    transfers_count: int
    steps: List[RouteStep]
    warnings: List[str] = []

class RoutingResponse(BaseModel):
    origin: dict
    destination: dict
    direct_distance_km: float
    routes: List[RouteOption]
    active_incidents_count: int
