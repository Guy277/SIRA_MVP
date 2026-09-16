from sqlalchemy import Column, String, Boolean, DateTime, func
from sqlalchemy.orm import relationship
import uuid
from app.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    phone_number = Column(String(30), unique=True, index=True, nullable=False)
    full_name = Column(String(100), nullable=True)
    role = Column(String(30), default="WORKER")  # STUDENT, WORKER, TRADER, DRIVER, TOURIST, ADMIN
    preferred_language = Column(String(10), default="fr")
    avatar_url = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    incidents = relationship("Incident", back_populates="reported_by")
    incident_votes = relationship("IncidentVote", back_populates="user")
    fare_proposals = relationship("FareProposal", back_populates="user")
    trip_logs = relationship("TripLog", back_populates="user")

class OtpVerification(Base):
    __tablename__ = "otp_verifications"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    phone_number = Column(String(30), index=True, nullable=False)
    code = Column(String(10), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    is_used = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())
