import { BadRequestException, Injectable } from "@nestjs/common";

type Point = { lat: number; lon: number; name?: string };
export type JourneyRequest = {
  origin: Point;
  destination: Point;
  budget?: number;
  preference?: "balanced" | "fast" | "cheap" | "comfort";
};

type ValhallaTrip = {
  trip?: { summary?: { time?: number; length?: number }; legs?: Array<{ shape?: string; maneuvers?: unknown[] }> };
};

@Injectable()
export class MobilityService {
  private readonly valhallaUrl = process.env.VALHALLA_URL ?? "http://valhalla:8002";
  private readonly photonUrl = process.env.PHOTON_URL ?? "https://photon.komoot.io";
  private readonly aiUrl = process.env.AI_URL ?? "http://ai:8000";

  async searchPlaces(query: string) {
    if (!query || query.trim().length < 2) throw new BadRequestException("La recherche doit contenir au moins 2 caractères.");
    const params = new URLSearchParams({ q: `${query}, Abidjan, Côte d'Ivoire`, limit: "6", lang: "fr", lon: "-4.0083", lat: "5.3484" });
    const response = await fetch(`${this.photonUrl}/api/?${params}`);
    if (!response.ok) throw new BadRequestException("Le service de recherche est temporairement indisponible.");
    return response.json();
  }

  async buildJourneys(request: JourneyRequest) {
    this.validatePoint(request.origin);
    this.validatePoint(request.destination);
    const modes = ["multimodal", "auto", "auto"] as const;
    const routed = await Promise.all(modes.map((mode) => this.route(request.origin, request.destination, mode)));
    const candidates = [
      this.toCandidate("recommended", "Recommandé", "multimodal", routed[0], 700, 4, ["walk", "sotra", "walk"], 1, 7),
      this.toCandidate("fast", "Le plus rapide", "taxi", routed[1], 1700, 5, ["walk", "taxi"], 1, 2),
      this.toCandidate("cheap", "Le moins cher", "gbaka", routed[2], 500, 2, ["walk", "gbaka", "walk"], 1.7, 12),
    ];
    try {
      const ranked = await fetch(`${this.aiUrl}/v1/recommendations/rank`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ budget: request.budget ?? 1500, preference: request.preference ?? "balanced", journeys: candidates }),
      });
      if (ranked.ok) return ranked.json();
    } catch { /* deterministic fallback below */ }
    return { journeys: candidates, recommended_id: "recommended", source: "sira-fallback" };
  }

  private async route(origin: Point, destination: Point, costing: string): Promise<ValhallaTrip> {
    const payload = { locations: [origin, destination], costing, units: "kilometers", language: "fr-FR", date_time: { type: 0 }, directions_options: { units: "kilometers" } };
    try {
      const response = await fetch(`${this.valhallaUrl}/route`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(8000) });
      if (response.ok) return response.json() as Promise<ValhallaTrip>;
    } catch { /* use distance fallback */ }
    const km = this.distance(origin, destination);
    return { trip: { summary: { length: km, time: km / (costing === "multimodal" ? 18 : 24) * 3600 }, legs: [] } };
  }

  private toCandidate(id: string, label: string, profile: string, route: ValhallaTrip, price: number, comfort: number, modes: string[], durationScale = 1, transferMinutes = 0) {
    const seconds = route.trip?.summary?.time ?? 1800;
    return { id, label, profile, duration: Math.max(8, Math.round(seconds / 60 * durationScale + transferMinutes)), distance_km: Number((route.trip?.summary?.length ?? 0).toFixed(1)), price, walking_minutes: id === "cheap" ? 13 : id === "fast" ? 3 : 7, comfort, reliability: id === "recommended" ? 91 : id === "fast" ? 84 : 77, modes, shape: route.trip?.legs?.[0]?.shape ?? null };
  }

  private validatePoint(point: Point) {
    if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lon)) throw new BadRequestException("Coordonnées de départ ou d’arrivée invalides.");
  }

  private distance(a: Point, b: Point) {
    const rad = (value: number) => value * Math.PI / 180;
    const dLat = rad(b.lat - a.lat); const dLon = rad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }
}
