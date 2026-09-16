from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timezone
from app.database import get_db
from app.models.fare import Fare, FareProposal
from app.schemas.fare import FareResponse, FareProposalCreate, FareProposalResponse
from app.services.auth_service import get_current_user
from app.models.user import User

router = APIRouter(prefix="/fares", tags=["Tarifs Communautaires"])

@router.get("", response_model=List[FareResponse], summary="Consulter les tarifs des trajets")
def get_fares(
    line_id: Optional[str] = None,
    origin_station_id: Optional[str] = None,
    destination_station_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(Fare)
    if line_id:
        query = query.filter(Fare.line_id == line_id)
    if origin_station_id:
        query = query.filter(Fare.origin_station_id == origin_station_id)
    if destination_station_id:
        query = query.filter(Fare.destination_station_id == destination_station_id)
    return query.all()

@router.post("/{id}/confirm", response_model=FareResponse, summary="Confirmer l'exactitude d'un tarif (Validation communautaire)")
def confirm_fare(
    id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    fare = db.query(Fare).filter(Fare.id == id).first()
    if not fare:
        raise HTTPException(status_code=404, detail="Tarif introuvable.")

    fare.confirmation_score += 1
    if fare.confirmation_score >= 3:
        fare.is_community_validated = True
    fare.last_verified_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(fare)
    return fare

@router.post("/{id}/propose", response_model=FareProposalResponse, status_code=201, summary="Proposer un nouveau tarif ou une correction")
def propose_fare(
    id: str,
    payload: FareProposalCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    fare = db.query(Fare).filter(Fare.id == id).first()
    if not fare:
        raise HTTPException(status_code=404, detail="Tarif introuvable.")

    proposal = FareProposal(
        fare_id=id,
        user_id=current_user.id,
        proposed_amount=payload.proposed_amount,
        note=payload.note
    )
    db.add(proposal)
    db.commit()
    db.refresh(proposal)

    # Vérification automatique si consensus communautaire (ex: 3 propositions identiques)
    similar_proposals = db.query(FareProposal).filter(
        FareProposal.fare_id == id,
        FareProposal.proposed_amount == payload.proposed_amount
    ).count()

    if similar_proposals >= 3:
        fare.amount = payload.proposed_amount
        fare.is_community_validated = True
        fare.confirmation_score = similar_proposals
        fare.last_verified_at = datetime.now(timezone.utc)
        db.commit()

    return proposal
