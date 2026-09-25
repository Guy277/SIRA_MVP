"""Phone OTP login and JWT sessions, based on the AKA branch (Aka Abraham)."""

from __future__ import annotations

import hashlib
import hmac
import logging
import re
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

import httpx
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .config import settings
from .models import OtpCode, User, get_db

logger = logging.getLogger("sira.community")
bearer = HTTPBearer(auto_error=False)

OTP_TTL = timedelta(minutes=10)
MAX_ATTEMPTS = 5
MAX_REQUESTS_PER_WINDOW = 3
REQUEST_WINDOW = timedelta(minutes=10)


def normalize_phone(raw: str) -> str:
    """Ivorian numbers: 10 digits since 2021, stored as +225XXXXXXXXXX."""
    digits = re.sub(r"\D", "", raw)
    if digits.startswith("00225"):
        digits = digits[5:]
    elif digits.startswith("225") and len(digits) == 13:
        digits = digits[3:]
    if not re.fullmatch(r"0\d{9}", digits):
        raise HTTPException(status_code=400, detail="Numéro ivoirien invalide : 10 chiffres attendus, par exemple 07 08 09 10 11.")
    return f"+225{digits}"


def _hash_code(phone: str, code: str) -> str:
    return hmac.new(settings.jwt_secret.encode(), f"{phone}:{code}".encode(), hashlib.sha256).hexdigest()


def _aware(value: datetime) -> datetime:
    # SQLite returns naive datetimes; every stored value is UTC.
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def send_sms(phone: str, message: str) -> bool:
    """Orange Developer API (SMS Côte d'Ivoire). Returns False when not configured or failing."""
    if not settings.sms_enabled:
        return False
    try:
        token = httpx.post(
            "https://api.orange.com/oauth/v3/token",
            auth=(settings.orange_client_id, settings.orange_client_secret),
            data={"grant_type": "client_credentials"},
            timeout=12.0,
        )
        token.raise_for_status()
        sender = settings.orange_sender_address
        response = httpx.post(
            f"https://api.orange.com/smsmessaging/v1/outbound/{quote(sender, safe='')}/requests",
            headers={"Authorization": f"Bearer {token.json()['access_token']}"},
            json={"outboundSMSMessageRequest": {"address": f"tel:{phone}", "senderAddress": sender, "outboundSMSTextMessage": {"message": message}}},
            timeout=12.0,
        )
        return response.status_code in (200, 201)
    except (httpx.HTTPError, KeyError) as error:
        logger.warning("Envoi SMS Orange impossible : %s", error)
        return False


def request_otp(db: Session, raw_phone: str) -> dict:
    phone = normalize_phone(raw_phone)
    now = datetime.now(timezone.utc)
    recent = db.query(OtpCode).filter(OtpCode.phone_number == phone, OtpCode.created_at >= now - REQUEST_WINDOW).count()
    if recent >= MAX_REQUESTS_PER_WINDOW:
        raise HTTPException(status_code=429, detail="Trop de demandes de code. Réessayez dans quelques minutes.")
    db.query(OtpCode).filter(OtpCode.phone_number == phone, OtpCode.used.is_(False)).update({"used": True})
    code = f"{secrets.randbelow(1_000_000):06d}"
    db.add(OtpCode(phone_number=phone, code_hash=_hash_code(phone, code), expires_at=now + OTP_TTL))
    db.commit()
    sent = send_sms(phone, f"Votre code SIRA : {code}. Valable 10 minutes.")
    if not sent and not settings.otp_demo:
        raise HTTPException(status_code=503, detail="Envoi du SMS impossible pour le moment.")
    return {
        "phone_number": phone,
        "expires_in_seconds": int(OTP_TTL.total_seconds()),
        "sms_sent": sent,
        # Only in demo mode, so a jury demo works without an SMS gateway.
        "demo_code": code if settings.otp_demo and not sent else None,
    }


def verify_otp(db: Session, raw_phone: str, code: str, full_name: str | None, role: str | None) -> dict:
    phone = normalize_phone(raw_phone)
    otp = (
        db.query(OtpCode)
        .filter(OtpCode.phone_number == phone, OtpCode.used.is_(False))
        .order_by(OtpCode.created_at.desc())
        .first()
    )
    if not otp or _aware(otp.expires_at) < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Code expiré. Demandez un nouveau code.")
    if otp.attempts >= MAX_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Trop d’essais. Demandez un nouveau code.")
    otp.attempts += 1
    if not hmac.compare_digest(otp.code_hash, _hash_code(phone, code.strip())):
        db.commit()
        raise HTTPException(status_code=400, detail="Code incorrect.")
    otp.used = True
    user = db.query(User).filter(User.phone_number == phone).first()
    is_new = user is None
    if is_new:
        user = User(phone_number=phone, full_name=(full_name or "").strip() or None, role=role or "WORKER")
        db.add(user)
    db.commit()
    return {"access_token": issue_token(user), "token_type": "bearer", "is_new_user": is_new, "user": user_payload(user)}


def issue_token(user: User) -> str:
    expires = datetime.now(timezone.utc) + timedelta(minutes=settings.token_ttl_minutes)
    return jwt.encode({"sub": user.id, "exp": expires}, settings.jwt_secret, algorithm="HS256")


def user_payload(user: User) -> dict:
    return {"id": user.id, "phone_number": user.phone_number, "full_name": user.full_name, "role": user.role}


def current_user(credentials: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)) -> User:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Connexion requise.")
    try:
        user_id = jwt.decode(credentials.credentials, settings.jwt_secret, algorithms=["HS256"]).get("sub")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Session expirée. Reconnectez-vous.") from None
    user = db.get(User, user_id) if user_id else None
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Compte introuvable ou désactivé.")
    return user
