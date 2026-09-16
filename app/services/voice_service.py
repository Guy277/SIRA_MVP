from sqlalchemy.orm import Session
from datetime import datetime, timezone
from typing import Dict, Any
from app.models.fare import Fare
from app.models.incident import Incident
from app.services.routing_service import RoutingService

ABIDJAN_LANDMARKS = {
    "yopougon siporex": {"lat": 5.3401, "lng": -4.0812, "name": "Yopougon Siporex", "commune": "Yopougon"},
    "yopougon": {"lat": 5.3401, "lng": -4.0812, "name": "Yopougon Centre", "commune": "Yopougon"},
    "adjamé liberté": {"lat": 5.3532, "lng": -4.0267, "name": "Adjamé Liberté", "commune": "Adjamé"},
    "adjame": {"lat": 5.3532, "lng": -4.0267, "name": "Gare Adjamé", "commune": "Adjamé"},
    "cocody saint-jean": {"lat": 5.3551, "lng": -3.9934, "name": "Cocody Saint-Jean", "commune": "Cocody"},
    "cocody": {"lat": 5.3551, "lng": -3.9934, "name": "Cocody Saint-Jean", "commune": "Cocody"},
    "riviera palmeraie": {"lat": 5.3789, "lng": -3.9421, "name": "Riviera Palmeraie", "commune": "Cocody"},
    "riviera 2": {"lat": 5.3622, "lng": -3.9681, "name": "Riviera 2", "commune": "Cocody"},
    "plateau": {"lat": 5.3235, "lng": -4.0195, "name": "Plateau Gare Sud", "commune": "Plateau"},
    "treichville": {"lat": 5.3021, "lng": -4.0089, "name": "Treichville Bassam", "commune": "Treichville"},
    "koumassi": {"lat": 5.2954, "lng": -3.9511, "name": "Koumassi Grand Carrefour", "commune": "Koumassi"},
    "marcory": {"lat": 5.3061, "lng": -3.9782, "name": "Marcory Ste Thérèse", "commune": "Marcory"},
    "abobo": {"lat": 5.4167, "lng": -4.0167, "name": "Abobo Gare", "commune": "Abobo"},
    "bingerville": {"lat": 5.3558, "lng": -3.8951, "name": "Bingerville Gare", "commune": "Bingerville"},
}

class VoiceService:
    @staticmethod
    def process_voice_query(db: Session, transcript_text: str, user_commune: str = "Yopougon") -> Dict[str, Any]:
        text = transcript_text.lower()

        # 1. Détection de l'intention
        intent = "FIND_ROUTE"
        if any(k in text for k in ["combien", "tarif", "prix", "coûte", "coute"]):
            intent = "CHECK_FARE"
        elif any(k in text for k in ["embouteillage", "bouchon", "accident", "inondation", "circulation", "route"]):
            intent = "CHECK_TRAFFIC"

        # 2. Détection des lieux
        origin = None
        destination = None

        for landmark_key, landmark_val in ABIDJAN_LANDMARKS.items():
            if landmark_key in text:
                if not destination:
                    destination = landmark_val
                elif not origin:
                    origin = landmark_val

        # Fallbacks
        if not destination:
            destination = ABIDJAN_LANDMARKS["plateau"]
        if not origin:
            origin = ABIDJAN_LANDMARKS["yopougon siporex"]

        # 3. Traitement selon l'intention
        if intent == "CHECK_TRAFFIC":
            now = datetime.now(timezone.utc)
            incidents = db.query(Incident).filter(
                Incident.expires_at > now,
                Incident.status != "REJECTED"
            ).all()

            if incidents:
                voice_resp = f"Attention, il y a actuellement {len(incidents)} signalement(s) sur les routes vers {destination['name']}. Notamment : {incidents[0].title}."
            else:
                voice_resp = f"La circulation est actuellement fluide vers {destination['name']}."

            return {
                "intent": intent,
                "transcript_text": transcript_text,
                "voice_response": voice_resp,
                "data": {"incidents_count": len(incidents)}
            }

        if intent == "CHECK_FARE":
            fare = db.query(Fare).first()
            amount = fare.amount if fare else 300.0
            voice_resp = f"Le tarif habituel vérifié par la communauté entre {origin['name']} et {destination['name']} est de {int(amount)} francs CFA."
            return {
                "intent": intent,
                "transcript_text": transcript_text,
                "voice_response": voice_resp,
                "data": {"origin": origin, "destination": destination, "fare_amount": amount}
            }

        # FIND_ROUTE
        itinerary = RoutingService.calculate_multimodal_itinerary(
            db=db,
            origin_lat=origin["lat"],
            origin_lng=origin["lng"],
            origin_name=origin["name"],
            destination_lat=destination["lat"],
            destination_lng=destination["lng"],
            destination_name=destination["name"]
        )

        top_route = itinerary["routes"][0] if itinerary["routes"] else None
        if top_route:
            voice_resp = f"Pour vous rendre à {destination['name']}, prenez le {top_route['title']}. Comptez environ {top_route['total_duration_min']} minutes pour {int(top_route['total_fare_amount'])} francs CFA."
        else:
            voice_resp = f"Aucun trajet direct trouvé vers {destination['name']}."

        return {
            "intent": intent,
            "transcript_text": transcript_text,
            "voice_response": voice_resp,
            "data": itinerary
        }
