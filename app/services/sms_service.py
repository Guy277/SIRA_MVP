import httpx
import logging
import urllib.parse
from app.config import settings

logger = logging.getLogger("sira.sms")

class SmsService:
    @staticmethod
    def send_otp_sms(phone_number: str, code: str) -> bool:
        """
        Envoi du code OTP par SMS en temps réel via Orange Developer API Côte d'Ivoire.
        """
        clean_phone = phone_number.replace(" ", "").strip()
        message = f"Votre code de vérification SIRA est : {code}. Valable 10 minutes."

        # 1. Envoi via Orange Developer API Côte d'Ivoire
        if settings.ORANGE_AUTH_HEADER or (settings.ORANGE_CLIENT_ID and settings.ORANGE_CLIENT_SECRET):
            try:
                print(f"[SMS Orange CI] Demande de token OAuth pour envoyer le SMS au {clean_phone}...")
                
                headers = {"Content-Type": "application/x-www-form-urlencoded"}
                if settings.ORANGE_AUTH_HEADER:
                    headers["Authorization"] = settings.ORANGE_AUTH_HEADER
                
                token_resp = httpx.post(
                    "https://api.orange.com/oauth/v3/token",
                    headers=headers,
                    data={"grant_type": "client_credentials"},
                    timeout=12.0
                )

                if token_resp.status_code == 200:
                    access_token = token_resp.json().get("access_token")
                    sender_raw = settings.ORANGE_SENDER_ADDRESS or "tel:+2250000"
                    sender_encoded = urllib.parse.quote(sender_raw)

                    sms_payload = {
                        "outboundSMSMessageRequest": {
                            "address": f"tel:{clean_phone}",
                            "senderAddress": sender_raw,
                            "outboundSMSTextMessage": {"message": message}
                        }
                    }

                    sms_url = f"https://api.orange.com/smsmessaging/v1/outbound/{sender_encoded}/requests"
                    send_resp = httpx.post(
                        sms_url,
                        headers={
                            "Authorization": f"Bearer {access_token}",
                            "Content-Type": "application/json"
                        },
                        json=sms_payload,
                        timeout=12.0
                    )

                    if send_resp.status_code in [200, 201]:
                        print(f"[SMS Orange CI SUCCESS] SMS envoyé avec succès au {clean_phone} !")
                        return True
                    else:
                        print(f"[SMS Orange CI Response {send_resp.status_code}] {send_resp.text}")
                else:
                    print(f"[SMS Orange CI Auth Error {token_resp.status_code}] {token_resp.text}")
            except Exception as e:
                print(f"[SMS Orange CI Exception] {e}")

        # 2. Twilio (Alternative)
        elif settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN:
            try:
                print(f"[SMS Twilio] Envoi en cours au {clean_phone}...")
                twilio_url = f"https://api.twilio.com/2010-04-01/Accounts/{settings.TWILIO_ACCOUNT_SID}/Messages.json"
                resp = httpx.post(
                    twilio_url,
                    auth=(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN),
                    data={
                        "From": settings.TWILIO_FROM_NUMBER,
                        "To": clean_phone,
                        "Body": message
                    },
                    timeout=10.0
                )
                if resp.status_code in [200, 201]:
                    print(f"[SMS Twilio SUCCESS] SMS envoyé avec succès au {clean_phone}")
                    return True
                else:
                    print(f"[SMS Twilio Error] {resp.text}")
            except Exception as e:
                print(f"[SMS Twilio Exception] {e}")

        # Mode console / local
        print("\n=======================================================")
        print(f"[SMS SIRA ENVOYE AU {clean_phone}]")
        print(f"Message : '{message}'")
        print(f"Code OTP : {code}")
        print("=======================================================\n")
        return True
