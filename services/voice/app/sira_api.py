"""Client de l'API NestJS de SIRA : calcul des trajets (qui passe par SIRA-MORE) et signalements des voyageurs."""
from __future__ import annotations

import httpx

from .dialog import JourneyServiceError
from .trip import LiveDataError


class SiraApiClient:
    def __init__(self, base_url: str, timeout_s: float = 60.0):
        self.base_url = base_url.rstrip("/")
        self.timeout_s = timeout_s
        # Appel interne (même machine ou réseau Docker) : on ignore les proxys HTTP du système.
        self.client = httpx.Client(timeout=timeout_s, trust_env=False)

    def plan(self, request: dict) -> dict:
        try:
            response = self.client.post(f"{self.base_url}/mobility/journeys", json=request)
        except httpx.HTTPError as error:
            raise JourneyServiceError(f"API SIRA injoignable : {error}",
                                      "Le calcul des trajets est indisponible pour le moment. Réessaie dans un instant.") from error
        if response.status_code == 503:
            raise JourneyServiceError("SIRA-MORE indisponible (503)",
                                      "Le moteur de trajets est arrêté pour le moment. Réessaie dans un instant.")
        if response.status_code >= 400:
            raise JourneyServiceError(f"API SIRA {response.status_code} : {response.text[:300]}",
                                      "Je n'ai pas pu calculer ce trajet. Essaie un autre point de départ ou une autre destination.")
        return response.json()

    def _live(self, method: str, path: str, **kwargs):
        try:
            response = self.client.request(method, f"{self.base_url}{path}", timeout=min(self.timeout_s, 10), **kwargs)
            response.raise_for_status()
            return response.json()
        except (httpx.HTTPError, ValueError) as error:
            raise LiveDataError(f"API SIRA {path} : {error}") from error

    def impact(self, legs: list) -> dict:
        """Signalements des voyageurs sur les étapes d'un trajet (retard, blocage)."""
        return self._live("POST", "/reports/impact", json={"legs": legs})

    def reports(self) -> list:
        """Signalements en cours."""
        return self._live("GET", "/reports")

    def health(self) -> bool:
        try:
            return self.client.get(f"{self.base_url}/health", timeout=3).status_code == 200
        except httpx.HTTPError:
            return False
