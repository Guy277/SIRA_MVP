from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database import get_db
from app.models.transport import Station, Line, LineStop
from app.schemas.transport import StationResponse, StationCreate, LineResponse, LineDetailResponse
from app.services.geo_utils import calculate_distance_km
from app.services.auth_service import get_current_user
from app.models.user import User

router = APIRouter(prefix="/transport", tags=["Transports & Réseau"])

@router.get("/stations", response_model=List[StationResponse], summary="Lister les gares et arrêts")
def get_stations(
    commune: Optional[str] = Query(None, description="Filtrer par commune (ex: Yopougon, Adjamé, Cocody)"),
    is_informal: Optional[bool] = Query(None, description="True pour Gbaka/Wôrô-wôrô, False pour SOTRA"),
    db: Session = Depends(get_db)
):
    query = db.query(Station)
    if commune:
        query = query.filter(Station.commune.ilike(f"%{commune}%"))
    if is_informal is not None:
        query = query.filter(Station.is_informal == is_informal)
    return query.order_by(Station.name.asc()).all()

@router.get("/stations/nearby", response_model=List[StationResponse], summary="Trouver les arrêts à proximité d'un point GPS")
def get_nearby_stations(
    lat: float = Query(..., example=5.3401),
    lng: float = Query(..., example=-4.0812),
    radius: float = Query(3.0, description="Rayon en kilomètres"),
    db: Session = Depends(get_db)
):
    all_stations = db.query(Station).all()
    results = []
    for s in all_stations:
        dist = calculate_distance_km(lat, lng, s.latitude, s.longitude)
        if dist <= radius:
            s_dict = StationResponse.from_orm(s)
            s_dict.distance_km = dist
            results.append(s_dict)

    results.sort(key=lambda x: x.distance_km)
    return results

@router.post("/stations", response_model=StationResponse, status_code=201, summary="Créer une nouvelle gare/arrêt communautaire")
def create_station(
    payload: StationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    station = Station(
        name=payload.name,
        commune=payload.commune,
        latitude=payload.latitude,
        longitude=payload.longitude,
        is_informal=payload.is_informal,
        description=payload.description
    )
    db.add(station)
    db.commit()
    db.refresh(station)
    return station

@router.get("/lines", response_model=List[LineResponse], summary="Lister les lignes de transport")
def get_lines(
    type: Optional[str] = Query(None, description="BUS_SOTRA, GBAKA, WORO_WORO"),
    is_informal: Optional[bool] = None,
    db: Session = Depends(get_db)
):
    query = db.query(Line).filter(Line.is_active == True)
    if type:
        query = query.filter(Line.type == type)
    if is_informal is not None:
        query = query.filter(Line.is_informal == is_informal)
    return query.all()

@router.get("/lines/{id}", response_model=LineDetailResponse, summary="Détail complet d'une ligne avec ses arrêts")
def get_line_detail(id: str, db: Session = Depends(get_db)):
    line = db.query(Line).filter(Line.id == id).first()
    if not line:
        raise HTTPException(status_code=404, detail="Ligne de transport introuvable.")
    return line
