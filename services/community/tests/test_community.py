import os
import sys
import tempfile
import time
import unittest
from pathlib import Path

# Isolated database and demo mode before the app is imported.
_tmp = tempfile.mkdtemp()
os.environ["COMMUNITY_DATABASE_URL"] = f"sqlite:///{Path(_tmp, 'test.db').as_posix()}"
os.environ["COMMUNITY_OTP_DEMO"] = "true"
os.environ["COMMUNITY_JWT_SECRET"] = "test-secret-not-for-production-use-0123456789"
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

import jwt  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from fastapi import HTTPException  # noqa: E402

from services.community.app.main import app  # noqa: E402
from services.community.app.security import normalize_phone  # noqa: E402

client = TestClient(app)


def login(phone="07 08 09 10 11", name="Awa"):
    code = client.post("/auth/request-otp", json={"phone_number": phone}).json()["demo_code"]
    response = client.post("/auth/verify-otp", json={"phone_number": phone, "code": code, "full_name": name, "role": "STUDENT"})
    return response.json()["access_token"]


class PhoneTests(unittest.TestCase):
    def test_ivorian_formats_are_normalized(self):
        for raw in ("07 08 09 10 11", "0708091011", "+225 07 08 09 10 11", "002250708091011"):
            self.assertEqual(normalize_phone(raw), "+2250708091011")

    def test_invalid_numbers_are_rejected(self):
        for raw in ("12345", "7 08 09 10 11", "+33 6 12 34 56 78"):
            with self.assertRaises(HTTPException):
                normalize_phone(raw)


class AuthTests(unittest.TestCase):
    def test_login_creates_account_and_session(self):
        phone = "05 11 22 33 44"
        request = client.post("/auth/request-otp", json={"phone_number": phone}).json()
        self.assertEqual(len(request["demo_code"]), 4)
        verified = client.post("/auth/verify-otp", json={"phone_number": phone, "code": request["demo_code"], "full_name": "Koffi"}).json()
        self.assertTrue(verified["is_new_user"])
        me = client.get("/auth/me", headers={"Authorization": f"Bearer {verified['access_token']}"}).json()
        self.assertEqual((me["phone_number"], me["full_name"]), ("+2250511223344", "Koffi"))

    def test_wrong_code_is_rejected_and_attempts_are_limited(self):
        phone = "01 02 03 04 05"
        code = client.post("/auth/request-otp", json={"phone_number": phone}).json()["demo_code"]
        wrong = f"{(int(code) + 1) % 10_000:04d}"
        for _ in range(3):
            self.assertEqual(client.post("/auth/verify-otp", json={"phone_number": phone, "code": wrong}).status_code, 400)
        self.assertEqual(client.post("/auth/verify-otp", json={"phone_number": phone, "code": wrong}).status_code, 429)
        # Once blocked, even the right code needs a new request.
        self.assertEqual(client.post("/auth/verify-otp", json={"phone_number": phone, "code": code}).status_code, 429)

    def test_session_lasts_thirty_days(self):
        phone = "07 55 66 77 88"
        code = client.post("/auth/request-otp", json={"phone_number": phone}).json()["demo_code"]
        token = client.post("/auth/verify-otp", json={"phone_number": phone, "code": code}).json()["access_token"]
        claims = jwt.decode(token, options={"verify_signature": False})
        self.assertAlmostEqual(claims["exp"] - time.time(), 30 * 24 * 3600, delta=120)

    def test_code_cannot_be_reused(self):
        phone = "07 77 77 77 77"
        code = client.post("/auth/request-otp", json={"phone_number": phone}).json()["demo_code"]
        self.assertEqual(client.post("/auth/verify-otp", json={"phone_number": phone, "code": code}).status_code, 200)
        self.assertEqual(client.post("/auth/verify-otp", json={"phone_number": phone, "code": code}).status_code, 400)

    def test_code_requests_are_rate_limited(self):
        phone = "05 55 55 55 55"
        statuses = [client.post("/auth/request-otp", json={"phone_number": phone}).status_code for _ in range(4)]
        self.assertEqual(statuses, [200, 200, 200, 429])

    def test_protected_routes_need_a_valid_token(self):
        self.assertEqual(client.get("/auth/me").status_code, 401)
        self.assertEqual(client.get("/auth/me", headers={"Authorization": "Bearer faux"}).status_code, 401)


class FareTests(unittest.TestCase):
    def test_fare_is_validated_after_three_matching_reports(self):
        line = "ligne-test-28"
        for index, amount in enumerate((200, 200, 225)):
            token = login(phone=f"07 00 00 00 0{index}", name=f"Usager {index}")
            summary = client.post("/fares/reports", json={"line_id": line, "mode": "sotra", "amount": amount}, headers={"Authorization": f"Bearer {token}"}).json()
        self.assertEqual((summary["reports"], summary["median_fcfa"], summary["validated"]), (3, 200, True))

    def test_a_traveller_counts_once_per_line(self):
        token = login(phone="07 12 12 12 12")
        for amount in (300, 350):
            summary = client.post("/fares/reports", json={"line_id": "ligne-unique", "mode": "gbaka", "amount": amount}, headers={"Authorization": f"Bearer {token}"}).json()
        self.assertEqual((summary["reports"], summary["median_fcfa"]), (1, 350))

    def test_reporting_a_fare_needs_an_account(self):
        self.assertEqual(client.post("/fares/reports", json={"line_id": "x", "mode": "taxi", "amount": 1000}).status_code, 401)

    def test_unknown_line_has_no_fare_yet(self):
        self.assertEqual(client.get("/fares", params={"line_id": "inconnue"}).json()[0]["validated"], False)


if __name__ == "__main__":
    unittest.main()
