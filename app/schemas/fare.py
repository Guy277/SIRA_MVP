from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List
from datetime import datetime
from app.schemas.transport import StationResponse, LineResponse

class FareProposalCreate(BaseModel):
    proposed_amount: float = Field(..., gt=0, example=300.0)
    note: Optional[str] = Field(None, example="Tarif direct après 18h")

class FareProposalResponse(BaseModel):
    id: str
    fare_id: str
    user_id: str
    proposed_amount: float
    note: Optional[str]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class FareResponse(BaseModel):
    id: str
    line_id: Optional[str]
    origin_station_id: str
    destination_station_id: str
    amount: float
    is_community_validated: bool
    confirmation_score: int
    last_verified_at: datetime
    origin_station: Optional[StationResponse] = None
    destination_station: Optional[StationResponse] = None
    line: Optional[LineResponse] = None

    model_config = ConfigDict(from_attributes=True)
