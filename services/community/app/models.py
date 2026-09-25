"""Persistence of accounts, one-time codes and community fare reports."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

from .config import settings


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _id() -> str:
    return str(uuid.uuid4())


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "community_users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    phone_number: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    full_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # Profile from the specification's targets: STUDENT, WORKER, TRADER, DRIVER, TOURIST.
    role: Mapped[str] = mapped_column(String(20), default="WORKER")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class OtpCode(Base):
    __tablename__ = "community_otp_codes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    phone_number: Mapped[str] = mapped_column(String(20), index=True)
    # Only a salted hash of the code is stored.
    code_hash: Mapped[str] = mapped_column(String(128))
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    used: Mapped[bool] = mapped_column(Boolean, default=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class FareReport(Base):
    """Price a traveller actually paid on a line (cahier des charges : confirmer ou corriger le prix payé)."""

    __tablename__ = "community_fare_reports"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("community_users.id", ondelete="CASCADE"), index=True)
    # Line ids of the SIRA transport graph (open data line ids) or "taxi".
    line_id: Mapped[str] = mapped_column(String(64), index=True)
    mode: Mapped[str] = mapped_column(String(20))
    amount: Mapped[float] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


if settings.database_url.startswith("sqlite:///"):
    Path(settings.database_url.removeprefix("sqlite:///")).parent.mkdir(parents=True, exist_ok=True)

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False} if settings.database_url.startswith("sqlite") else {},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def init_db() -> None:
    Base.metadata.create_all(engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
