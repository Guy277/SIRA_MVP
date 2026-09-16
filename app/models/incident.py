from sqlalchemy import Column, String, Float, Integer, ForeignKey, DateTime, func
from sqlalchemy.orm import relationship
import uuid
from app.database import Base

class Incident(Base):
    __tablename__ = "incidents"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    type = Column(String(40), nullable=False)  # TRAFFIC_JAM, FLOOD, ACCIDENT, ROADWORK, POLICE_CHECK, BREAKDOWN
    title = Column(String(150), nullable=False)
    description = Column(String(500), nullable=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    commune = Column(String(60), nullable=True)
    severity = Column(String(20), default="MEDIUM")  # LOW, MEDIUM, HIGH, CRITICAL
    status = Column(String(20), default="REPORTED")  # REPORTED, CONFIRMED, RESOLVED, REJECTED
    upvotes = Column(Integer, default=1)
    downvotes = Column(Integer, default=0)
    reported_by_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    reported_by = relationship("User", back_populates="incidents")
    votes = relationship("IncidentVote", back_populates="incident", cascade="all, delete-orphan")

class IncidentVote(Base):
    __tablename__ = "incident_votes"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    incident_id = Column(String(36), ForeignKey("incidents.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    is_helpful = Column(Integer, default=1)  # 1 = upvote, 0 = downvote
    created_at = Column(DateTime, server_default=func.now())

    incident = relationship("Incident", back_populates="votes")
    user = relationship("User", back_populates="incident_votes")
