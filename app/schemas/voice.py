from pydantic import BaseModel, Field
from typing import Optional, Any

class VoiceQueryRequest(BaseModel):
    text: Optional[str] = Field(None, example="Je veux aller à Adjamé Liberté depuis Yopougon Siporex")
    audio_base64: Optional[str] = None
    user_commune: Optional[str] = Field("Yopougon", example="Yopougon")

class VoiceQueryResponse(BaseModel):
    intent: str  # FIND_ROUTE, CHECK_FARE, CHECK_TRAFFIC
    transcript_text: str
    voice_response: str
    data: Optional[Any] = None
