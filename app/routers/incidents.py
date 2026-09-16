from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from app.database import get_db
from app.models.incident import Incident, IncidentVote
from app.schemas.incident import IncidentCreate, IncidentResponse, IncidentVoteRequest
from app.services.auth_service import get_current_user
from app.models.user import User
from app.services.geo_utils import calculate_distance_km

router = APIRouter(prefix="/incidents", tags=["Signalements & Trafic"])

@router.get("/active", response_model=List[IncidentResponse], summary="Lister les signalements actifs (embouteillages, inondations...)")
def get_active_incidents(
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    radius: float = 15.0,
    db: Session = Depends(get_db)
):
    now = datetime.now(timezone.utc)
    incidents = db.query(Incident).filter(
        Incident.expires_at > now,
        Incident.status != "REJECTED"
    ).order_by(Incident.created_at.desc()).all()

    if lat is not None and lng is not None:
        results = []
        for inc in incidents:
            dist = calculate_distance_km(lat, lng, inc.latitude, inc.longitude)
            if dist <= radius:
                inc_dict = IncidentResponse.from_orm(inc)
                inc_dict.distance_km = dist
                results.append(inc_dict)
        results.sort(key=lambda x: x.distance_km)
        return results

    return incidents

@router.post("", response_model=IncidentResponse, status_code=201, summary="Signaler un incident sur les routes d'Abidjan")
def report_incident(
    payload: IncidentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    expires_at = datetime.now(timezone.utc) + timedelta(hours=payload.duration_hours or 3)
    incident = Incident(
        type=payload.type,
        title=payload.title,
        description=payload.description,
        latitude=payload.latitude,
        longitude=payload.longitude,
        commune=payload.commune or "Abidjan",
        severity=payload.severity or "MEDIUM",
        reported_by_id=current_user.id,
        expires_at=expires_at,
        upvotes=1,
        downvotes=0
    )
    db.add(incident)
    db.commit()
    db.refresh(incident)

    # Vote auto du déclarant
    vote = IncidentVote(
        incident_id=incident.id,
        user_id=current_user.id,
        is_helpful=1
    )
    db.add(vote)
    db.commit()

    return incident

@router.post("/{id}/vote", response_model=IncidentResponse, summary="Confirmer ou infirmer un signalement (Validation croisée)")
def vote_incident(
    id: str,
    payload: IncidentVoteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    incident = db.query(Incident).filter(Incident.id == id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Signalement introuvable.")

    existing_vote = db.query(IncidentVote).filter(
        IncidentVote.incident_id == id,
        IncidentVote.user_id == current_user.id
    ).first()

    vote_val = 1 if payload.is_helpful else 0

    if existing_vote:
        existing_vote.is_helpful = vote_val
    else:
        new_vote = IncidentVote(
            incident_id=id,
            user_id=current_user.id,
            is_helpful=vote_val
        )
        db.add(new_vote)

    db.commit()

    # Recompter les votes
    upvotes = db.query(IncidentVote).filter(IncidentVote.incident_id == id, IncidentVote.is_helpful == 1).count()
    downvotes = db.query(IncidentVote).filter(IncidentVote.incident_id == id, IncidentVote.is_helpful == 0).count()

    incident.upvotes = upvotes
    incident.downvotes = downvotes

    if upvotes >= 3:
        incident.status = "CONFIRMED"
    elif downvotes >= 3 and downvotes > upvotes:
        incident.status = "REJECTED"

    db.commit()
    db.refresh(incident)
    return incident
