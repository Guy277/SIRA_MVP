from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.schemas.auth import OtpRequest, OtpResponse, OtpVerifyRequest, TokenResponse
from app.schemas.user import UserResponse
from app.services.auth_service import AuthService, get_current_user
from app.models.user import User

router = APIRouter(prefix="/auth", tags=["Authentification"])

@router.post("/request-otp", response_model=OtpResponse, summary="Demander un code OTP par téléphone (Orange CI)")
def request_otp(payload: OtpRequest, db: Session = Depends(get_db)):
    return AuthService.request_otp(db, payload.phone_number)

@router.post("/verify-otp", response_model=TokenResponse, summary="Vérifier l'OTP et se connecter")
def verify_otp(payload: OtpVerifyRequest, db: Session = Depends(get_db)):
    return AuthService.verify_otp(
        db=db,
        phone_number=payload.phone_number,
        code=payload.code,
        full_name=payload.full_name,
        role=payload.role
    )

@router.get("/me", response_model=UserResponse, summary="Récupérer les informations de l'utilisateur connecté")
def get_me(current_user: User = Depends(get_current_user)):
    return current_user
