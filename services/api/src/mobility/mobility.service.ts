import { BadRequestException, Injectable } from "@nestjs/common";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

type Point = { lat: number; lon: number; name?: string };
export type JourneyRequest = {
  origin: Point;
  destination: Point;
  budget?: number;
  preference?: "balanced" | "fast" | "cheap" | "comfort";
};

type TransportLineRecord = {
  id?: string;
  properties?: {
    line_id?: string;
    code?: string;
    name?: string;
    operator?: string;
    network?: string;
    mode?: string;
    raw_mode?: string;
    sira_mode?: string;
    colour?: string;
    frequency_raw?: string;
    opening_hours_raw?: string;
    freshness_status?: string;
    validation_status?: string;
    confidence_score?: number;
  };
  geometry?: { type?: string; coordinates?: unknown[] };
};

type ValhallaTrip = {
  trip?: { summary?: { time?: number; length?: number }; legs?: Array<{ shape?: string; maneuvers?: unknown[] }> };
  geometry?: Array<[number, number]>;
};

@Injectable()
export class MobilityService {
  private readonly valhallaUrl = process.env.VALHALLA_URL ?? "http://valhalla:8002";
  private readonly photonUrl = process.env.PHOTON_URL ?? "https://photon.komoot.io";
  private readonly aiUrl = process.env.AI_URL ?? "http://ai:8000";
  private readonly dataRoot = join(process.cwd(), "data");

  async searchPlaces(query: string) {
    if (!query || query.trim().length < 2) throw new BadRequestException("La recherche doit contenir au moins 2 caractères.");
    const params = new URLSearchParams({ q: `${query}, Abidjan, Côte d'Ivoire`, limit: "6", lang: "fr", lon: "-4.0083", lat: "5.3484" });
    const response = await fetch(`${this.photonUrl}/api/?${params}`);
    if (!response.ok) throw new BadRequestException("Le service de recherche est temporairement indisponible.");
    return response.json();
  }

  async getTransportLines(filters: { operator?: string; network?: string; siraMode?: string; validationStatus?: string } = {}) {
    const source = this.readTransportDataset();
    const lines = source.features
      .map((feature) => this.toTransportLineRecord(feature))
      .filter((line) => {
        if (filters.operator && line.operator !== filters.operator) return false;
        if (filters.network && line.network !== filters.network) return false;
        if (filters.siraMode && line.sira_mode !== filters.siraMode) return false;
        if (filters.validationStatus && line.validation_status !== filters.validationStatus) return false;
        return true;
      });

    return {
      source: "local-geojson",
      count: lines.length,
      items: lines,
    };
  }

  async getTransportLine(id: string) {
    const source = this.readTransportDataset();
    const match = source.features.find((feature) => {
      const properties = feature.properties ?? {};
      return String(properties.line_id ?? properties.code ?? properties.name ?? "") === id || String(feature.id ?? "") === id;
    });
    if (!match) throw new BadRequestException("Aucune ligne de transport trouvée pour cet identifiant.");
    return this.toTransportLineRecord(match);
  }

  async getTransportGeoJson(filters: { bbox?: string; operator?: string; network?: string; siraMode?: string; validationStatus?: string } = {}) {
    const source = this.readTransportDataset();
    const features = source.features
      .map((feature) => this.toTransportFeature(feature))
      .filter((feature) => {
        const props = feature.properties ?? {};
        if (filters.operator && props.operator !== filters.operator) return false;
        if (filters.network && props.network !== filters.network) return false;
        if (filters.siraMode && props.sira_mode !== filters.siraMode) return false;
        if (filters.validationStatus && props.validation_status !== filters.validationStatus) return false;
        return true;
      });

    return {
      type: "FeatureCollection",
      metadata: {
        generated_at: new Date().toISOString(),
        source: "transport-lines-normalized.geojson",
        filters,
      },
      features,
    };
  }

  async getTransportNetworks() {
    const source = this.readTransportDataset();
    const networks = new Map<string, number>();
    for (const feature of source.features) {
      const network = feature.properties?.network ?? "UNKNOWN";
      networks.set(network, (networks.get(network) ?? 0) + 1);
    }
    return Array.from(networks.entries()).map(([name, count]) => ({ name, count }));
  }

  async getTransportOperators() {
    const source = this.readTransportDataset();
    const operators = new Map<string, number>();
    for (const feature of source.features) {
      const operator = feature.properties?.operator ?? "UNKNOWN";
      operators.set(operator, (operators.get(operator) ?? 0) + 1);
    }
    return Array.from(operators.entries()).map(([name, count]) => ({ name, count }));
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

  private readTransportDataset() {
    const rawPath = join(this.dataRoot, "processed", "transport-lines-normalized.geojson");
    const fallbackPath = join(this.dataRoot, "LigneArete", "SIRA_Phase1_Dataset_Synthetique_Abidjan_v1.geojson");
    const chosenPath = existsSync(rawPath) ? rawPath : fallbackPath;
    const file = readFileSync(chosenPath, "utf8");
    return JSON.parse(file);
  }

  private toTransportLineRecord(feature: TransportLineRecord) {
    const properties = feature.properties ?? {};
    return {
      id: feature.id ?? properties.line_id ?? properties.code ?? properties.name ?? "unknown",
      external_id: properties.line_id ?? properties.code ?? null,
      name: properties.name ?? "Ligne inconnue",
      code: properties.code ?? null,
      operator: properties.operator ?? "UNKNOWN",
      network: properties.network ?? "UNKNOWN",
      raw_mode: properties.raw_mode ?? properties.mode ?? "UNKNOWN",
      sira_mode: properties.sira_mode ?? "UNKNOWN",
      colour: properties.colour ?? "#7c7c7c",
      geometry: feature.geometry ?? null,
      frequency_raw: properties.frequency_raw ?? null,
      opening_hours_raw: properties.opening_hours_raw ?? null,
      freshness_status: properties.freshness_status ?? "historical_open_data",
      validation_status: properties.validation_status ?? "pending",
      confidence_score: properties.confidence_score ?? 0.5,
    };
  }

  private toTransportFeature(feature: TransportLineRecord) {
    const properties = feature.properties ?? {};
    return {
      type: "Feature",
      id: feature.id ?? properties.line_id ?? properties.code ?? properties.name ?? "unknown",
      geometry: feature.geometry ?? { type: "LineString", coordinates: [] },
      properties: {
        ...properties,
        operator: properties.operator ?? "UNKNOWN",
        network: properties.network ?? "UNKNOWN",
        sira_mode: properties.sira_mode ?? "UNKNOWN",
        validation_status: properties.validation_status ?? "pending",
        freshness_status: properties.freshness_status ?? "historical_open_data",
      },
    };
  }

  private async route(origin: Point, destination: Point, costing: string): Promise<ValhallaTrip> {
    const payload = { locations: [origin, destination], costing, units: "kilometers", language: "fr-FR", date_time: { type: 0 }, directions_options: { units: "kilometers" } };
    try {
      const response = await fetch(`${this.valhallaUrl}/route`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(8000) });
      if (response.ok) return response.json() as Promise<ValhallaTrip>;
    } catch { /* use distance fallback */ }
    try {
      const coordinates = `${origin.lon},${origin.lat};${destination.lon},${destination.lat}`;
      const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=false`, { signal: AbortSignal.timeout(8000) });
      if (response.ok) {
        const data = await response.json() as { routes?: Array<{ distance?: number; duration?: number; geometry?: { coordinates?: Array<[number, number]> } }> };
        const route = data.routes?.[0];
        if (route?.geometry?.coordinates?.length) {
          return { geometry: route.geometry.coordinates, trip: { summary: { length: (route.distance ?? 0) / 1000, time: route.duration ?? 0 }, legs: [] } };
        }
      }
    } catch { /* use distance fallback */ }
    const km = this.distance(origin, destination);
    return { trip: { summary: { length: km, time: km / (costing === "multimodal" ? 18 : 24) * 3600 }, legs: [] } };
  }

  private toCandidate(id: string, label: string, profile: string, route: ValhallaTrip, price: number, comfort: number, modes: string[], durationScale = 1, transferMinutes = 0) {
    const seconds = route.trip?.summary?.time ?? 1800;
    return { id, label, profile, duration: Math.max(8, Math.round(seconds / 60 * durationScale + transferMinutes)), distance_km: Number((route.trip?.summary?.length ?? 0).toFixed(1)), price, walking_minutes: id === "cheap" ? 13 : id === "fast" ? 3 : 7, comfort, reliability: id === "recommended" ? 91 : id === "fast" ? 84 : 77, modes, shape: route.trip?.legs?.[0]?.shape ?? null, geometry: route.geometry ?? null };
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
