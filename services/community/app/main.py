"""SIRA community service: phone accounts and community fares.

Built from the AKA branch (Aka Abraham): OTP login through Orange, JWT
sessions and crowd-validated fares (validated after 3 matching reports).
It sits behind the NestJS API, which forwards /auth, /users and /fares.
"""

from __future__ import annotations

from statistics import median
from typing import Literal

from fastapi import Depends, FastAPI, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .models import FareReport, User, get_db, init_db
from .security import current_user, request_otp, user_payload, verify_otp

Role = Literal["STUDENT", "WORKER", "TRADER", "DRIVER", "TOURIST"]
FARE_TOLERANCE_FCFA = 50
FARE_VALIDATION_COUNT = 3

app = FastAPI(title="SIRA Community", version="1.0.0", description="Comptes par téléphone et tarifs communautaires.")
init_db()


class OtpRequest(BaseModel):
    phone_number: str = Field(examples=["07 08 09 10 11"])


class OtpVerify(BaseModel):
    phone_number: str
    code: str = Field(min_length=4, max_length=8)
    full_name: str | None = Field(default=None, max_length=100)
    role: Role | None = None


class ProfileUpdate(BaseModel):
    full_name: str | None = Field(default=None, max_length=100)
    role: Role | None = None


class FareReportIn(BaseModel):
    line_id: str = Field(min_length=1, max_length=64)
    mode: Literal["sotra", "gbaka", "woro", "taxi", "boat"]
    amount: float = Field(gt=0, le=20_000)


@app.get("/health")
def health():
    return {"status": "ok", "service": "sira-community"}


@app.post("/auth/request-otp")
def auth_request_otp(payload: OtpRequest, db: Session = Depends(get_db)):
    return request_otp(db, payload.phone_number)


@app.post("/auth/verify-otp")
def auth_verify_otp(payload: OtpVerify, db: Session = Depends(get_db)):
    return verify_otp(db, payload.phone_number, payload.code, payload.full_name, payload.role)


@app.get("/auth/me")
def auth_me(user: User = Depends(current_user)):
    return user_payload(user)


@app.patch("/users/me")
def update_me(payload: ProfileUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if payload.full_name is not None:
        user.full_name = payload.full_name.strip() or None
    if payload.role is not None:
        user.role = payload.role
    db.add(user)
    db.commit()
    return user_payload(user)


def fare_summary(line_id: str, reports: list[FareReport]) -> dict:
    """Median paid price; validated once enough reports agree with it."""
    if not reports:
        return {"line_id": line_id, "reports": 0, "median_fcfa": None, "validated": False}
    amounts = [report.amount for report in reports]
    middle = median(amounts)
    agreeing = sum(1 for amount in amounts if abs(amount - middle) <= FARE_TOLERANCE_FCFA)
    return {
        "line_id": line_id,
        "reports": len(amounts),
        "median_fcfa": round(middle / 25) * 25,
        "agreeing": agreeing,
        "validated": agreeing >= FARE_VALIDATION_COUNT and agreeing / len(amounts) >= 0.6,
    }


@app.post("/fares/reports", status_code=201)
def report_fare(payload: FareReportIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    # One current report per traveller and line: a new price replaces the old one.
    db.query(FareReport).filter(FareReport.user_id == user.id, FareReport.line_id == payload.line_id).delete()
    db.add(FareReport(user_id=user.id, line_id=payload.line_id, mode=payload.mode, amount=payload.amount))
    db.commit()
    return fare_summary(payload.line_id, db.query(FareReport).filter(FareReport.line_id == payload.line_id).all())


@app.get("/fares")
def fares(line_id: list[str] = Query(default=[], max_length=20), db: Session = Depends(get_db)):
    if not line_id:
        raise HTTPException(status_code=400, detail="Indiquez au moins une ligne (line_id).")
    return [fare_summary(line, db.query(FareReport).filter(FareReport.line_id == line).all()) for line in line_id]
