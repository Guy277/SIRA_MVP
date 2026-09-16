from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.schemas.voice import VoiceQueryRequest, VoiceQueryResponse
from app.services.voice_service import VoiceService

router = APIRouter(prefix="/voice", tags=["Assistant Vocal & NLP"])

@router.post("/query", response_model=VoiceQueryResponse, summary="Interaction vocale ou textuelle en langage naturel")
def process_voice_query(
    payload: VoiceQueryRequest,
    db: Session = Depends(get_db)
):
    transcript = payload.text
    if not transcript and payload.audio_base64:
        # Simulation transcription Whisper pour audio
        transcript = "Je veux aller à Adjamé Liberté depuis Yopougon Siporex"

    if not transcript:
        raise HTTPException(
            status_code=400,
            detail="Veuillez fournir du texte ou un audio encodé en base64 (champs: text ou audio_base64)."
        )

    return VoiceService.process_voice_query(
        db=db,
        transcript_text=transcript,
        user_commune=payload.user_commune or "Yopougon"
    )
