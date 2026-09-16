from pydantic import BaseModel, Field, ConfigDict
from typing import Optional
from datetime import datetime

class IncidentCreate(BaseModel):
    type: str = Field(..., example="TRAFFIC_JAM", description="TRAFFIC_JAM, FLOOD, ACCIDENT, ROADWORK, POLICE_CHECK")
    title: str = Field(..., example="Embouteillage monstre carrefour Siporex")
    description: Optional[str] = Field(None, example="Ralentissement de plus de 25 minutes")
    latitude: float = Field(..., example=5.3401)
    longitude: float = Field(..., example=-4.0812)
    commune: Optional[str] = Field("Yopougon", example="Yopougon")
    severity: Optional[str] = Field("MEDIUM", example="HIGH")
    duration_hours: Optional[int] = Field(3, example=3)

class IncidentVoteRequest(BaseModel):
    is_helpful: bool = Field(True, description="True pour confirmer (upvote), False pour infirmer (downvote)")

class IncidentResponse(BaseModel):
    id: str
    type: str
    title: str
    description: Optional[str]
    latitude: float
    longitude: float
    commune: Optional[str]
    severity: str
    status: str
    upvotes: int
    downvotes: int
    reported_by_id: str
    expires_at: datetime
    created_at: datetime
    distance_km: Optional[float] = None

    model_config = ConfigDict(from_attributes=True)
