from sqlalchemy import Column, String, Float, Boolean, Integer, ForeignKey, DateTime, func
from sqlalchemy.orm import relationship
import uuid
from app.database import Base

class Fare(Base):
    __tablename__ = "fares"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    line_id = Column(String(36), ForeignKey("lines.id", ondelete="SET NULL"), nullable=True)
    origin_station_id = Column(String(36), ForeignKey("stations.id", ondelete="CASCADE"), nullable=False)
    destination_station_id = Column(String(36), ForeignKey("stations.id", ondelete="CASCADE"), nullable=False)
    amount = Column(Float, nullable=False)  # Tarif en FCFA
    is_community_validated = Column(Boolean, default=False)
    confirmation_score = Column(Integer, default=1)
    last_verified_at = Column(DateTime, server_default=func.now())
    created_at = Column(DateTime, server_default=func.now())

    line = relationship("Line", back_populates="fares")
    origin_station = relationship("Station", foreign_keys=[origin_station_id], back_populates="fares_as_origin")
    destination_station = relationship("Station", foreign_keys=[destination_station_id], back_populates="fares_as_destination")
    proposals = relationship("FareProposal", back_populates="fare", cascade="all, delete-orphan")

class FareProposal(Base):
    __tablename__ = "fare_proposals"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    fare_id = Column(String(36), ForeignKey("fares.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    proposed_amount = Column(Float, nullable=False)
    note = Column(String(255), nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    fare = relationship("Fare", back_populates="proposals")
    user = relationship("User", back_populates="fare_proposals")
