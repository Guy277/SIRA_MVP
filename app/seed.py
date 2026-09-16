from datetime import datetime, timedelta
from app.database import SessionLocal, engine, Base
import app.models
from app.models.user import User
from app.models.transport import Station, Line, LineStop
from app.models.fare import Fare
from app.models.incident import Incident, IncidentVote

def seed_abidjan_data():
    print("--- Peuplement de la base de données SIRA (Abidjan) ---")
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        # 1. Utilisateurs
        admin = User(
            phone_number="+2250700000000",
            full_name="Administrateur SIRA",
            role="ADMIN"
        )
        student = User(
            phone_number="+2250701020304",
            full_name="Kouassi Jean (Étudiant)",
            role="STUDENT"
        )
        driver = User(
            phone_number="+2250505060708",
            full_name="Bakayoko Chauffeur Gbaka",
            role="DRIVER"
        )
        db.add_all([admin, student, driver])
        db.commit()

        # 2. Gares et arrêts d'Abidjan
        stations_data = [
            {"name": "Yopougon Siporex", "commune": "Yopougon", "latitude": 5.3401, "longitude": -4.0812, "is_informal": True, "description": "Gare principale Gbaka Siporex"},
            {"name": "Yopougon Keneya", "commune": "Yopougon", "latitude": 5.3489, "longitude": -4.0921, "is_informal": True, "description": "Arrêt carrefour Keneya"},
            {"name": "Yopougon Bel Air", "commune": "Yopougon", "latitude": 5.3312, "longitude": -4.0723, "is_informal": True, "description": "Station Wôrô-wôrô intérieur"},
            {"name": "Adjamé Liberté", "commune": "Adjamé", "latitude": 5.3532, "longitude": -4.0267, "is_informal": True, "description": "Gare centrale Gbaka Liberté"},
            {"name": "Adjamé Renault", "commune": "Adjamé", "latitude": 5.3589, "longitude": -4.0315, "is_informal": False, "description": "Arrêt mixte SOTRA et Gbaka"},
            {"name": "Plateau Gare Sud", "commune": "Plateau", "latitude": 5.3235, "longitude": -4.0195, "is_informal": False, "description": "Terminus central SOTRA Plateau"},
            {"name": "Cocody Saint-Jean", "commune": "Cocody", "latitude": 5.3551, "longitude": -3.9934, "is_informal": True, "description": "Gare Wôrô-wôrô Cocody"},
            {"name": "Cocody Riviera 2", "commune": "Cocody", "latitude": 5.3622, "longitude": -3.9681, "is_informal": True, "description": "Arrêt Carrefour Riviera 2"},
            {"name": "Cocody Riviera Palmeraie", "commune": "Cocody", "latitude": 5.3789, "longitude": -3.9421, "is_informal": True, "description": "Station Palmeraie Triangle"},
            {"name": "Abobo Gare", "commune": "Abobo", "latitude": 5.4167, "longitude": -4.0167, "is_informal": True, "description": "Grande gare routière d'Abobo"},
            {"name": "Treichville Bassam", "commune": "Treichville", "latitude": 5.3021, "longitude": -4.0089, "is_informal": True, "description": "Gare Wôrô-wôrô Sud"},
            {"name": "Koumassi Grand Carrefour", "commune": "Koumassi", "latitude": 5.2954, "longitude": -3.9511, "is_informal": True, "description": "Carrefour majeur Koumassi"},
            {"name": "Bingerville Gare", "commune": "Bingerville", "latitude": 5.3558, "longitude": -3.8951, "is_informal": True, "description": "Gare Gbaka Bingerville"}
        ]

        station_objs = {}
        for s in stations_data:
            st = Station(**s)
            db.add(st)
            db.commit()
            db.refresh(st)
            station_objs[st.name] = st

        # 3. Lignes de Transport
        # Gbaka Yopougon <-> Adjamé
        gbaka_yop = Line(
            code="GBAKA-YOP-ADJ",
            name="Gbaka Yopougon Siporex - Adjamé Liberté (Autoroute)",
            type="GBAKA",
            operator="Syndicat Transporteurs Yopougon",
            is_informal=True,
            color_code="#E65100"
        )
        db.add(gbaka_yop)
        db.commit()
        db.refresh(gbaka_yop)

        db.add_all([
            LineStop(line_id=gbaka_yop.id, station_id=station_objs["Yopougon Siporex"].id, stop_order=1, distance_to_next_km=3.5, estimated_time_to_next_min=8),
            LineStop(line_id=gbaka_yop.id, station_id=station_objs["Adjamé Renault"].id, stop_order=2, distance_to_next_km=2.1, estimated_time_to_next_min=5),
            LineStop(line_id=gbaka_yop.id, station_id=station_objs["Adjamé Liberté"].id, stop_order=3, distance_to_next_km=0.0, estimated_time_to_next_min=0),
        ])

        # Gbaka Adjamé <-> Abobo
        gbaka_abobo = Line(
            code="GBAKA-ADJ-ABO",
            name="Gbaka Adjamé Liberté - Abobo Gare (Voie Express)",
            type="GBAKA",
            operator="Syndicat Abobo-Adjamé",
            is_informal=True,
            color_code="#D84315"
        )
        db.add(gbaka_abobo)
        db.commit()
        db.refresh(gbaka_abobo)

        db.add_all([
            LineStop(line_id=gbaka_abobo.id, station_id=station_objs["Adjamé Liberté"].id, stop_order=1, distance_to_next_km=4.2, estimated_time_to_next_min=12),
            LineStop(line_id=gbaka_abobo.id, station_id=station_objs["Abobo Gare"].id, stop_order=2, distance_to_next_km=0.0, estimated_time_to_next_min=0),
        ])

        # Wôrô-wôrô Cocody Saint-Jean <-> Riviera Palmeraie (Taxis Jaunes)
        woro_cocody = Line(
            code="WORO-COC-PALM",
            name="Wôrô-wôrô Saint-Jean - Riviera Palmeraie",
            type="WORO_WORO",
            operator="Association Taxis Jaunes Cocody",
            is_informal=True,
            color_code="#FBC02D"
        )
        db.add(woro_cocody)
        db.commit()
        db.refresh(woro_cocody)

        db.add_all([
            LineStop(line_id=woro_cocody.id, station_id=station_objs["Cocody Saint-Jean"].id, stop_order=1, distance_to_next_km=2.5, estimated_time_to_next_min=6),
            LineStop(line_id=woro_cocody.id, station_id=station_objs["Cocody Riviera 2"].id, stop_order=2, distance_to_next_km=3.1, estimated_time_to_next_min=7),
            LineStop(line_id=woro_cocody.id, station_id=station_objs["Cocody Riviera Palmeraie"].id, stop_order=3, distance_to_next_km=0.0, estimated_time_to_next_min=0),
        ])

        # SOTRA Ligne 85 (Yopougon -> Plateau)
        sotra_85 = Line(
            code="85",
            name="SOTRA Ligne 85 (Yopougon Siporex - Plateau Gare Sud)",
            type="BUS_SOTRA",
            operator="SOTRA",
            is_informal=False,
            color_code="#1976D2"
        )
        db.add(sotra_85)
        db.commit()
        db.refresh(sotra_85)

        db.add_all([
            LineStop(line_id=sotra_85.id, station_id=station_objs["Yopougon Siporex"].id, stop_order=1, distance_to_next_km=6.2, estimated_time_to_next_min=15),
            LineStop(line_id=sotra_85.id, station_id=station_objs["Plateau Gare Sud"].id, stop_order=2, distance_to_next_km=0.0, estimated_time_to_next_min=0),
        ])
        db.commit()

        # 4. Tarifs Communautaires
        fares = [
            Fare(line_id=gbaka_yop.id, origin_station_id=station_objs["Yopougon Siporex"].id, destination_station_id=station_objs["Adjamé Liberté"].id, amount=300.0, is_community_validated=True, confirmation_score=45),
            Fare(line_id=gbaka_abobo.id, origin_station_id=station_objs["Adjamé Liberté"].id, destination_station_id=station_objs["Abobo Gare"].id, amount=250.0, is_community_validated=True, confirmation_score=30),
            Fare(line_id=woro_cocody.id, origin_station_id=station_objs["Cocody Saint-Jean"].id, destination_station_id=station_objs["Cocody Riviera Palmeraie"].id, amount=350.0, is_community_validated=True, confirmation_score=22),
            Fare(line_id=sotra_85.id, origin_station_id=station_objs["Yopougon Siporex"].id, destination_station_id=station_objs["Plateau Gare Sud"].id, amount=200.0, is_community_validated=True, confirmation_score=160),
        ]
        db.add_all(fares)
        db.commit()

        # 5. Incidents & Alertes Trafic en direct
        inc1 = Incident(
            type="TRAFFIC_JAM",
            title="Gros embouteillage sur le pont De Gaulle / Plateau",
            description="Circulation très dense en direction du Plateau, prévoir +20 minutes.",
            latitude=5.3210,
            longitude=-4.0150,
            commune="Plateau",
            severity="HIGH",
            status="CONFIRMED",
            upvotes=14,
            downvotes=1,
            reported_by_id=student.id,
            expires_at=datetime.utcnow() + timedelta(hours=3)
        )
        inc2 = Incident(
            type="ROADWORK",
            title="Travaux d'aménagement carrefour Siporex",
            description="Ralentissement à la sortie de Yopougon.",
            latitude=5.3412,
            longitude=-4.0805,
            commune="Yopougon",
            severity="MEDIUM",
            status="CONFIRMED",
            upvotes=9,
            downvotes=0,
            reported_by_id=driver.id,
            expires_at=datetime.utcnow() + timedelta(hours=5)
        )
        db.add_all([inc1, inc2])
        db.commit()

        print("[SUCCESS] Données d'Abidjan insérées avec succès dans la base SQLite/PostgreSQL !")
    finally:
        db.close()

if __name__ == "__main__":
    seed_abidjan_data()
