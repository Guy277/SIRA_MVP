import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.database import SessionLocal
from app.models.user import OtpVerification

client = TestClient(app)

def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "OK"

def test_request_and_verify_otp():
    phone = "+2250700112233"
    # 1. Demande d'OTP
    req_resp = client.post("/api/v1/auth/request-otp", json={"phone_number": phone})
    assert req_resp.status_code == 200
    assert "Code OTP" in req_resp.json()["message"]

    # 2. Récupération du code généré en base
    db = SessionLocal()
    otp_record = db.query(OtpVerification).filter(
        OtpVerification.phone_number == phone,
        OtpVerification.is_used == False
    ).order_by(OtpVerification.created_at.desc()).first()
    assert otp_record is not None
    code = otp_record.code
    db.close()

    # 3. Vérification OTP
    verify_resp = client.post("/api/v1/auth/verify-otp", json={
        "phone_number": phone,
        "code": code,
        "full_name": "Test Usager SIRA"
    })
    assert verify_resp.status_code == 200
    assert "access_token" in verify_resp.json()
    token = verify_resp.json()["access_token"]

    # 4. Récupération du profil /auth/me
    me_resp = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_resp.status_code == 200
    assert me_resp.json()["phone_number"] == phone

def test_get_stations_and_lines():
    stations_resp = client.get("/api/v1/transport/stations")
    assert stations_resp.status_code == 200
    assert isinstance(stations_resp.json(), list)

    lines_resp = client.get("/api/v1/transport/lines")
    assert lines_resp.status_code == 200
    assert isinstance(lines_resp.json(), list)

def test_calculate_itinerary():
    payload = {
        "origin_lat": 5.3401,
        "origin_lng": -4.0812,
        "origin_name": "Yopougon Siporex",
        "destination_lat": 5.3532,
        "destination_lng": -4.0267,
        "destination_name": "Adjamé Liberté"
    }
    response = client.post("/api/v1/routing/calculate", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "routes" in data
    assert len(data["routes"]) > 0
    assert data["routes"][0]["total_fare_amount"] > 0

def test_voice_nlp_query():
    payload = {
        "text": "Combien coûte le transport de Yopougon à Adjamé ?"
    }
    response = client.post("/api/v1/voice/query", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["intent"] == "CHECK_FARE"
    assert "voice_response" in data
