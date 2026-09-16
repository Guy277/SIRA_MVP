from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.schemas.user import UserResponse, UserUpdate
from app.services.auth_service import get_current_user
from app.models.user import User
from app.models.trip import TripLog

router = APIRouter(prefix="/users", tags=["Utilisateurs"])

@router.patch("/profile", response_model=UserResponse, summary="Mettre à jour le profil de l'utilisateur")
def update_profile(
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if payload.full_name is not None:
        current_user.full_name = payload.full_name
    if payload.role is not None:
        current_user.role = payload.role
    if payload.preferred_language is not None:
        current_user.preferred_language = payload.preferred_language
    if payload.avatar_url is not None:
        current_user.avatar_url = payload.avatar_url

    db.commit()
    db.refresh(current_user)
    return current_user

@router.get("/trips", summary="Historique des trajets recherchés")
def get_trip_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    trips = db.query(TripLog).filter(TripLog.user_id == current_user.id).order_by(TripLog.created_at.desc()).limit(20).all()
    return trips
