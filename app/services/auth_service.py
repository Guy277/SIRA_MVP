from datetime import datetime, timezone, timedelta
import random
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from app.config import settings
from app.database import get_db
from app.models.user import User, OtpVerification

security = HTTPBearer(auto_error=False)

class AuthService:
    @staticmethod
    def request_otp(db: Session, phone_number: str) -> dict:
        clean_phone = phone_number.replace(" ", "").strip()
        if len(clean_phone) < 8:
            raise HTTPException(status_code=400, detail="Numéro de téléphone invalide.")

        # Invalider les anciens OTP non utilisés
        db.query(OtpVerification).filter(
            OtpVerification.phone_number == clean_phone,
            OtpVerification.is_used == False
        ).update({"is_used": True})

        code = settings.DEFAULT_OTP_CODE if settings.ORANGE_OTP_MOCK else f"{random.randint(100000, 999999)}"
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)

        otp_record = OtpVerification(
            phone_number=clean_phone,
            code=code,
            expires_at=expires_at,
            is_used=False
        )
        db.add(otp_record)
        db.commit()

        print(f"[SIRA OTP Orange CI] SMS envoyé à {clean_phone} -> Code: {code}")

        return {
            "message": "Code OTP envoyé avec succès par SMS.",
            "phone_number": clean_phone,
            "expires_in_seconds": 600,
            "mock_code": code if settings.ORANGE_OTP_MOCK else None
        }

    @staticmethod
    def verify_otp(db: Session, phone_number: str, code: str, full_name: str = None, role: str = "WORKER") -> dict:
        clean_phone = phone_number.replace(" ", "").strip()

        otp_record = db.query(OtpVerification).filter(
            OtpVerification.phone_number == clean_phone,
            OtpVerification.code == code,
            OtpVerification.is_used == False,
            OtpVerification.expires_at >= datetime.now(timezone.utc)
        ).order_by(OtpVerification.created_at.desc()).first()

        if not otp_record:
            raise HTTPException(status_code=400, detail="Code OTP invalide ou expiré.")

        otp_record.is_used = True
        db.commit()

        user = db.query(User).filter(User.phone_number == clean_phone).first()
        is_new_user = False

        if not user:
            is_new_user = True
            user = User(
                phone_number=clean_phone,
                full_name=full_name or "Usager SIRA",
                role=role or "WORKER"
            )
            db.add(user)
            db.commit()
            db.refresh(user)

        # Création du Token JWT
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        payload = {
            "sub": user.id,
            "phone_number": user.phone_number,
            "role": user.role,
            "exp": expire
        }
        token = jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)

        return {
            "access_token": token,
            "token_type": "bearer",
            "is_new_user": is_new_user,
            "user": {
                "id": user.id,
                "phone_number": user.phone_number,
                "full_name": user.full_name,
                "role": user.role,
                "preferred_language": user.preferred_language
            }
        }

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> User:
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token d'authentification manquant."
        )
    try:
        payload = jwt.decode(credentials.credentials, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Token invalide.")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Session expirée ou token invalide.")

    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Utilisateur inactif ou introuvable.")
    return user

def get_optional_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> User:
    if not credentials:
        return None
    try:
        payload = jwt.decode(credentials.credentials, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id = payload.get("sub")
        if user_id:
            return db.query(User).filter(User.id == user_id).first()
    except Exception:
        pass
    return None
