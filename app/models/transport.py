from sqlalchemy import Column, String, Float, Boolean, Integer, ForeignKey, DateTime, func
from sqlalchemy.orm import relationship
import uuid
from app.database import Base

class Station(Base):
    __tablename__ = "stations"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(120), nullable=False, index=True)
    commune = Column(String(60), nullable=False, index=True)  # Yopougon, Adjamé, Cocody, Plateau, etc.
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    is_informal = Column(Boolean, default=False)  # True = Gbaka / Wôrô-wôrô, False = SOTRA
    description = Column(String(255), nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    line_stops = relationship("LineStop", back_populates="station", cascade="all, delete-orphan")
    fares_as_origin = relationship("Fare", foreign_keys="Fare.origin_station_id", back_populates="origin_station")
    fares_as_destination = relationship("Fare", foreign_keys="Fare.destination_station_id", back_populates="destination_station")

class Line(Base):
    __tablename__ = "lines"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    code = Column(String(30), nullable=True, index=True)  # ex: '85', 'GBAKA-YOP-ADJ'
    name = Column(String(150), nullable=False)
    type = Column(String(30), nullable=False)  # BUS_SOTRA, GBAKA, WORO_WORO, BOAT_BUS
    operator = Column(String(100), nullable=True)  # 'SOTRA', 'Syndicat Transporteurs Yopougon'
    is_informal = Column(Boolean, default=False)
    color_code = Column(String(20), default="#FF8C00")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())

    line_stops = relationship("LineStop", back_populates="line", cascade="all, delete-orphan", order_by="LineStop.stop_order")
    fares = relationship("Fare", back_populates="line")

class LineStop(Base):
    __tablename__ = "line_stops"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    line_id = Column(String(36), ForeignKey("lines.id", ondelete="CASCADE"), nullable=False)
    station_id = Column(String(36), ForeignKey("stations.id", ondelete="CASCADE"), nullable=False)
    stop_order = Column(Integer, nullable=False)
    distance_to_next_km = Column(Float, default=0.0)
    estimated_time_to_next_min = Column(Integer, default=5)

    line = relationship("Line", back_populates="line_stops")
    station = relationship("Station", back_populates="line_stops")
