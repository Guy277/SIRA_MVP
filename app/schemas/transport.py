from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List
from datetime import datetime

class StationBase(BaseModel):
    name: str = Field(..., example="Yopougon Siporex")
    commune: str = Field(..., example="Yopougon")
    latitude: float = Field(..., example=5.3401)
    longitude: float = Field(..., example=-4.0812)
    is_informal: bool = True
    description: Optional[str] = None

class StationCreate(StationBase):
    pass

class StationResponse(StationBase):
    id: str
    created_at: datetime
    distance_km: Optional[float] = None

    model_config = ConfigDict(from_attributes=True)

class LineStopResponse(BaseModel):
    id: str
    station_id: str
    stop_order: int
    distance_to_next_km: Optional[float] = 0.0
    estimated_time_to_next_min: Optional[int] = 5
    station: StationResponse

    model_config = ConfigDict(from_attributes=True)

class LineResponse(BaseModel):
    id: str
    code: Optional[str]
    name: str
    type: str  # BUS_SOTRA, GBAKA, WORO_WORO
    operator: Optional[str]
    is_informal: bool
    color_code: Optional[str]
    is_active: bool

    model_config = ConfigDict(from_attributes=True)

class LineDetailResponse(LineResponse):
    line_stops: List[LineStopResponse] = []
