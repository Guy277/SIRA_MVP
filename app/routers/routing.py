from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.schemas.routing import RoutingRequest, RoutingResponse
from app.services.routing_service import RoutingService
from app.services.auth_service import get_optional_current_user
from app.models.user import User
from app.models.trip import TripLog

router = APIRouter(prefix="/routing", tags=["Moteur d'Itinéraires Multimodaux"])

@router.post("/calculate", response_model=RoutingResponse, summary="Calculer les meilleurs trajets multimodaux à Abidjan (SOTRA, Gbaka, Wôrô-wôrô)")
def calculate_itinerary(
    payload: RoutingRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_optional_current_user)
):
    result = RoutingService.calculate_multimodal_itinerary(
        db=db,
        origin_lat=payload.origin_lat,
        origin_lng=payload.origin_lng,
        origin_name=payload.origin_name,
        destination_lat=payload.destination_lat,
        destination_lng=payload.destination_lng,
        destination_name=payload.destination_name,
        preferred_mode=payload.preferred_mode
    )

    if current_user and result["routes"]:
        top = result["routes"][0]
        trip = TripLog(
            user_id=current_user.id,
            origin_name=payload.origin_name or "Départ",
            origin_lat=payload.origin_lat,
            origin_lng=payload.origin_lng,
            destination_name=payload.destination_name or "Arrivée",
            destination_lat=payload.destination_lat,
            destination_lng=payload.destination_lng,
            preferred_mode=payload.preferred_mode or "MIXED",
            estimated_fare=top["total_fare_amount"],
            duration_min=top["total_duration_min"]
        )
        db.add(trip)
        db.commit()

    return result
