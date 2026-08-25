import { BadRequestException, Injectable } from "@nestjs/common";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { TransportGraph, type NetworkJourney, type TransportFeature } from "./transport-graph";

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
  private readonly osrmUrl = process.env.OSRM_URL ?? "https://router.project-osrm.org";
  private readonly aiUrl = process.env.AI_URL ?? "http://ai:8000";
  private readonly dataRoot = process.env.SIRA_DATA_ROOT ?? join(process.cwd(), "data");
  private transportGraph?: TransportGraph;

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
    const graph = this.getTransportGraph();
    const roadPromise = this.route(request.origin, request.destination, "auto");
    const balancedNetwork = graph.route(request.origin, request.destination, "balanced");
    const cheapNetwork = graph.route(request.origin, request.destination, "cheap");
    const road = await roadPromise;
    const candidates = balancedNetwork && cheapNetwork ? [
      this.toNetworkCandidate("recommended", "Recommandé", balancedNetwork, 4, 78),
      this.toRoadCandidate("fast", "Le plus rapide", road, 5, 82),
      this.toNetworkCandidate("cheap", "Le moins cher", cheapNetwork, 2, 68),
    ] : [
      this.toRoadCandidate("recommended", "Recommandé", road, 4, 72, 1.15),
      this.toRoadCandidate("fast", "Le plus rapide", road, 5, 80),
      this.toRoadCandidate("cheap", "Le moins cher", road, 2, 62, 1.45),
    ];
    try {
      const ranked = await fetch(`${this.aiUrl}/v1/recommendations/rank`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ budget: request.budget ?? 1500, preference: request.preference ?? "balanced", journeys: candidates }),
      });
      if (ranked.ok) return ranked.json();
    } catch { /* deterministic fallback below */ }
    return { journeys: candidates, recommended_id: "recommended", source: "sira-citywide-network", graph: graph.stats };
  }

  private readTransportDataset(): { type: "FeatureCollection"; features: TransportFeature[] } {
    const rawPath = join(this.dataRoot, "processed", "transport-lines-normalized.geojson");
    const fallbackPath = join(this.dataRoot, "LigneArete", "SIRA_Phase1_Dataset_Synthetique_Abidjan_v1.geojson");
    const chosenPath = existsSync(rawPath) ? rawPath : fallbackPath;
    const file = readFileSync(chosenPath, "utf8");
    return JSON.parse(file);
  }

  private getTransportGraph() {
    if (!this.transportGraph) this.transportGraph = new TransportGraph(this.readTransportDataset().features);
    return this.transportGraph;
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
      const response = await fetch(`${this.valhallaUrl}/route`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(1500) });
      if (response.ok) return response.json() as Promise<ValhallaTrip>;
    } catch { /* use distance fallback */ }
    try {
      const coordinates = `${origin.lon},${origin.lat};${destination.lon},${destination.lat}`;
      const response = await fetch(`${this.osrmUrl}/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=false`, { signal: AbortSignal.timeout(2500) });
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

  private toNetworkCandidate(id: string, label: string, route: NetworkJourney, comfort: number, reliability: number) {
    const legs: Array<Record<string, unknown>> = [
      { id: `${id}-access`, mode: "walk", label: "Rejoindre le réseau de transport", detail: `${route.access.durationMinutes} min · ${(route.access.distanceKm * 1000).toFixed(0)} m`, duration: route.access.durationMinutes, price: 0, geometry: route.access.coordinates, dataStatus: "estimated_mvp" },
    ];
    route.legs.forEach((leg, index) => {
      legs.push({ id: `${id}-wait-${index}`, mode: "wait", label: `Attente estimée — ${leg.mode}`, detail: `${leg.waitMinutes} min · donnée à valider`, duration: leg.waitMinutes, price: 0, geometry: [], dataStatus: "estimated_mvp" });
      legs.push({ id: `${id}-ride-${index}`, mode: leg.mode, label: leg.name, detail: `${leg.durationMinutes} min · ${leg.price} FCFA estimés`, duration: leg.durationMinutes, price: leg.price, geometry: leg.coordinates, source: `${leg.operator} · ${leg.network} · ${leg.lineId}`, dataStatus: "historical_open_data" });
      if (index < route.legs.length - 1) legs.push({ id: `${id}-transfer-${index}`, mode: "transfer", label: "Correspondance", detail: "4 min estimées", duration: 4, price: 0, geometry: [leg.coordinates[leg.coordinates.length - 1], route.legs[index + 1].coordinates[0]], dataStatus: "estimated_mvp" });
    });
    legs.push({ id: `${id}-egress`, mode: "walk", label: "Terminer à pied", detail: `${route.egress.durationMinutes} min · ${(route.egress.distanceKm * 1000).toFixed(0)} m`, duration: route.egress.durationMinutes, price: 0, geometry: route.egress.coordinates, dataStatus: "estimated_mvp" });
    return {
      id,
      label,
      profile: "citywide-transport-network",
      description: id === "cheap" ? "Réseau collectif privilégiant les lignes les moins coûteuses" : "Marche, attente et lignes collectives disponibles",
      duration: route.durationMinutes,
      distance_km: route.distanceKm,
      price: route.price,
      walking_minutes: route.access.durationMinutes + route.egress.durationMinutes,
      comfort,
      reliability,
      modes: [...new Set(["walk", ...route.legs.map((leg) => leg.mode), "walk"])],
      geometry: route.geometry,
      legs,
      data_notice: "Géométries historiques data.gouv.ci (2021). Marche, attente, durée et tarif estimés pour le MVP.",
    };
  }

  private toRoadCandidate(id: string, label: string, route: ValhallaTrip, comfort: number, reliability: number, durationScale = 1) {
    const seconds = route.trip?.summary?.time ?? 1800;
    const distance = route.trip?.summary?.length ?? 0;
    const duration = Math.max(8, Math.round(seconds / 60 * durationScale));
    const price = Math.round(Math.max(900, distance * 230) / 100) * 100;
    const geometry = route.geometry ?? [];
    const legs = [
      { id: `${id}-wait`, mode: "wait", label: "Attente estimée — taxi", detail: "3 min · donnée à valider", duration: 3, price: 0, geometry: [], dataStatus: "estimated_mvp" },
      { id: `${id}-taxi`, mode: "taxi", label: "Taxi compteur / partagé", detail: `${duration} min · ${price} FCFA estimés`, duration, price, geometry, source: "OpenStreetMap · Valhalla/OSRM", dataStatus: "estimated_mvp" },
    ];
    return { id, label, profile: "road", description: "Trajet routier direct", duration: duration + 3, distance_km: Number(distance.toFixed(1)), price, walking_minutes: 0, comfort, reliability, modes: ["wait", "taxi"], shape: route.trip?.legs?.[0]?.shape ?? null, geometry, legs, data_notice: "Tracé routier OpenStreetMap. Durée et tarif estimés pour le MVP." };
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
