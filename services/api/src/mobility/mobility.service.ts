import { BadRequestException, Injectable, OnModuleInit, ServiceUnavailableException } from "@nestjs/common";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { TransportGraph, type NetworkJourney, type TransportFeature } from "./transport-graph";
import { combineConfidence } from "./estimators";
import { decodeValhallaShape, routePedestrian, type PedestrianRoute } from "./pedestrian-router";
import { classifyTransferDistance, SIRA_WALK, type WalkConnectorKind } from "./walk-config";
import { JourneyProfiler } from "./journey-profiler";

type Point = { lat: number; lon: number; name?: string };
export type JourneyRequest = {
  origin: Point;
  destination: Point;
  budget?: number;
  departureAt?: string;
  preference?: "balanced" | "fast" | "cheap" | "comfort";
  constraints?: {
    maxWalkingDistanceM?: number;
    maxTransfers?: number;
    excludedModes?: string[];
  };
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
    frequency?: string;
    frequency_exceptions?: string;
    opening_hours?: string;
    frequency_raw?: string;
    opening_hours_raw?: string;
    freshness_status?: string;
    validation_status?: string;
    confidence_score?: number;
  };
  geometry?: { type?: string; coordinates?: unknown[] };
};

type ValhallaTrip = {
  trip?: { summary?: { time?: number; length?: number }; legs?: Array<{ shape?: string | { coordinates?: Array<[number, number]> }; maneuvers?: unknown[] }> };
  geometry?: Array<[number, number]>;
};

@Injectable()
export class MobilityService implements OnModuleInit {
  private readonly valhallaUrl = process.env.VALHALLA_URL ?? "http://valhalla:8002";
  private readonly photonUrl = process.env.PHOTON_URL ?? "https://photon.komoot.io";
  private readonly osrmUrl = process.env.OSRM_URL ?? "https://router.project-osrm.org";
  private readonly aiUrl = process.env.AI_URL ?? "http://ai:8000";
  private readonly allowRankingFallback = process.env.SIRA_ALLOW_RANKING_FALLBACK === "true";
  private readonly profileJourneys = process.env.SIRA_JOURNEY_PROFILING === "true";
  private readonly dataRoot = process.env.SIRA_DATA_ROOT ?? join(process.cwd(), "data");
  private transportGraph?: TransportGraph;
  private readonly pedestrianRouteCache = new Map<string, Promise<PedestrianRoute | null>>();

  onModuleInit() {
    this.getTransportGraph();
  }

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
    const profiler = new JourneyProfiler(this.profileJourneys);
    this.validatePoint(request.origin);
    this.validatePoint(request.destination);
    const serviceDate = request.departureAt ? new Date(request.departureAt) : new Date();
    if (Number.isNaN(serviceDate.getTime())) throw new BadRequestException("Heure de départ invalide.");
    const graph = profiler.measure("graph_initialization", () => this.getTransportGraph());
    const maxWalkingDistanceM = Math.min(request.constraints?.maxWalkingDistanceM ?? SIRA_WALK.maxTotalDistanceM, SIRA_WALK.maxTotalDistanceM);
    const roadPromise = this.route(request.origin, request.destination, "auto", profiler);
    const graphOptions = {
      maxAccessDistanceM: Math.min(SIRA_WALK.maxAccessOrEgressDistanceM, maxWalkingDistanceM),
      maxTransferDistanceM: Math.min(SIRA_WALK.maxTransferDistanceM, maxWalkingDistanceM),
      maxTransfers: request.constraints?.maxTransfers ?? 3,
      serviceDate,
    };
    // A second graph traversal is costly (the historical network contains more than
    // 300k directed arcs). The request preference selects the transit search needed
    // for this response; the road candidate remains a genuinely distinct alternative.
    const transitStrategy = request.preference === "cheap" ? "cheap" : "balanced";
    const network = profiler.measure("transport_graph_search", () => graph.route(request.origin, request.destination, transitStrategy, graphOptions));
    const [road, balancedCandidate, cheapCandidate] = await Promise.all([
      roadPromise,
      network ? this.toNetworkCandidate(`network-${transitStrategy}`, transitStrategy === "cheap" ? "Option économique" : "Transport collectif", network, transitStrategy === "cheap" ? 3 : 4, transitStrategy === "cheap" ? 72 : 78, maxWalkingDistanceM, profiler) : null,
      null,
    ]);
    const candidates: Array<Record<string, unknown>> = [];
    if (balancedCandidate) candidates.push(balancedCandidate);
    if (cheapCandidate) candidates.push(cheapCandidate);
    if (road.geometry?.length || road.trip?.legs?.[0]?.shape) candidates.push(this.toRoadCandidate("road-fast", "Taxi / route directe", road, 5, 82));
    if (!candidates.length) throw new BadRequestException("Aucun itinéraire suivant le réseau disponible n’a été trouvé.");
    const constraints = {
      max_budget_fcfa: request.budget ?? 1500,
      max_walking_distance_m: maxWalkingDistanceM,
      max_transfers: request.constraints?.maxTransfers ?? 3,
      excluded_modes: request.constraints?.excludedModes ?? [],
    };
    try {
      const ranked = await profiler.measureAsync("sira_more", () => fetch(`${this.aiUrl}/v1/recommendations/rank`, {
        method: "POST", headers: { "content-type": "application/json" },
        signal: AbortSignal.timeout(10_000),
        body: JSON.stringify({ budget: request.budget ?? 1500, preference: request.preference ?? "balanced", constraints, journeys: candidates }),
      }));
      if (ranked.ok) return this.withProfile(await ranked.json() as Record<string, unknown>, profiler);
      if (!this.allowRankingFallback) {
        throw new ServiceUnavailableException(`Le moteur SIRA-MORE a répondu avec le statut ${ranked.status}.`);
      }
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      if (!this.allowRankingFallback) {
        throw new ServiceUnavailableException("Le moteur SIRA-MORE est indisponible. Démarrez le service FastAPI sur le port 8000.");
      }
    }
    const feasible = candidates.filter((candidate) =>
      Number(candidate.price) <= constraints.max_budget_fcfa
      && Number(candidate.walking_distance_m) <= constraints.max_walking_distance_m
      && Number(candidate.transfer_count) <= constraints.max_transfers
      && !(candidate.modes as string[]).some((mode) => constraints.excluded_modes.includes(mode)),
    ).sort((left, right) => Number(left.duration) + Number(left.price) / 50 - (Number(right.duration) + Number(right.price) / 50));
    return this.withProfile({
      journeys: feasible.map((candidate, index) => ({ ...candidate, recommended: index === 0, reasons: ["Respecte vos contraintes", "Classement de secours déterministe"] })),
      recommended_id: feasible[0]?.id ?? null,
      rejected_count: candidates.length - feasible.length,
      source: "sira-more-fallback-constraints",
      graph: graph.stats,
    }, profiler);
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
      frequency_raw: properties.frequency ?? properties.frequency_raw ?? null,
      frequency_exceptions: properties.frequency_exceptions ?? null,
      opening_hours_raw: properties.opening_hours ?? properties.opening_hours_raw ?? null,
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

  private async route(origin: Point, destination: Point, costing: string, profiler: JourneyProfiler): Promise<ValhallaTrip> {
    const payload = { locations: [origin, destination], costing, units: "kilometers", language: "fr-FR", shape_format: "geojson", date_time: { type: 0 }, directions_options: { units: "kilometers" } };
    try {
      const response = await profiler.measureAsync("valhalla_road", () => fetch(`${this.valhallaUrl}/route`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(1500) }));
      if (response.ok) {
        const data = await response.json() as ValhallaTrip;
        const geometry = data.trip?.legs?.flatMap((leg) => typeof leg.shape === "string" ? decodeValhallaShape(leg.shape) : leg.shape?.coordinates ?? []) ?? [];
        return { ...data, geometry };
      }
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

  private async toNetworkCandidate(id: string, label: string, route: NetworkJourney, comfort: number, reliabilityPrior: number, maxWalkingDistanceM: number, profiler: JourneyProfiler) {
    const accessEndpoints = route.access.coordinates;
    const egressEndpoints = route.egress.coordinates;
    const [access, egress] = await Promise.all([
      profiler.measureAsync("access_walk", () => this.walkingRoute(accessEndpoints[0], accessEndpoints[accessEndpoints.length - 1], Math.min(SIRA_WALK.maxAccessOrEgressDistanceM, maxWalkingDistanceM), "access", profiler)),
      profiler.measureAsync("egress_walk", () => this.walkingRoute(egressEndpoints[0], egressEndpoints[egressEndpoints.length - 1], Math.min(SIRA_WALK.maxAccessOrEgressDistanceM, maxWalkingDistanceM), "egress", profiler)),
    ]);
    if (!access || !egress) return null;

    const routedTransfers = await Promise.all(route.transfers.map((transfer) => profiler.measureAsync("transfer_walk", () => this.walkingRoute(transfer.from, transfer.to, Math.min(SIRA_WALK.maxTransferDistanceM, maxWalkingDistanceM), "transfer", profiler))));
    if (routedTransfers.some((transfer) => !transfer)) return null;
    const confirmedTransfers = routedTransfers as PedestrianRoute[];
    const walkingDistanceM = Math.round((access.distanceKm + egress.distanceKm + confirmedTransfers.reduce((sum, transfer) => sum + transfer.distanceKm, 0)) * 1000);
    if (walkingDistanceM > maxWalkingDistanceM) return null;

    const legs: Array<Record<string, unknown>> = [this.walkingLeg(`${id}-access`, "Rejoindre le réseau de transport", access)];
    route.legs.forEach((leg, index) => {
      legs.push({
        id: `${id}-wait-${index}`, mode: "wait", label: `Attente estimée — ${leg.mode}`,
        detail: `${leg.waitMinutes} min (P90 ${leg.waitP90} min) · ${leg.waitMethod.startsWith("historical_") ? "fréquence déclarée 2021" : "valeur-type à calibrer"}`,
        duration: leg.waitMinutes, duration_p90: leg.waitP90, price: 0, geometry: [], dataStatus: "estimated_mvp",
        estimate_method: leg.waitMethod, confidence: leg.waitConfidence,
      });
      legs.push({
        id: `${id}-ride-${index}`, mode: leg.mode, label: leg.name,
        detail: `${leg.durationMinutes} min (P90 ${leg.durationP90}) · ${leg.price}–${leg.priceP90} FCFA estimés`,
        duration: leg.durationMinutes, duration_p90: leg.durationP90, price: leg.price, price_p90: leg.priceP90,
        geometry: leg.coordinates, line_id: leg.lineId, source: `${leg.operator} · ${leg.network} · ${leg.lineId}`,
        dataStatus: "historical_open_data", estimate_method: leg.durationMethod, confidence: leg.sourceConfidence,
      });
      const transfer = route.transfers.find((candidate) => candidate.afterLegIndex === index);
      const routedTransfer = transfer ? confirmedTransfers[route.transfers.indexOf(transfer)] : null;
      if (transfer && routedTransfer) {
        const duration = routedTransfer.durationMinutes + transfer.interchangeBufferMinutes;
        legs.push({
          id: `${id}-transfer-${index}`, mode: "transfer", label: "Correspondance à pied",
          detail: `${duration} min · ${Math.round(routedTransfer.distanceKm * 1000)} m · correspondance ${classifyTransferDistance(routedTransfer.distanceKm * 1000).toLowerCase()}${routedTransfer.guidanceAvailable ? " · chemin OSM" : " · sans guidage"}`,
          duration, duration_p90: routedTransfer.durationP90 + transfer.interchangeBufferMinutes, price: 0,
          geometry: routedTransfer.coordinates, dataStatus: routedTransfer.guidanceAvailable ? "routed_osm" : "estimated_mvp",
          estimate_method: routedTransfer.method, confidence: routedTransfer.confidence, guidance_available: routedTransfer.guidanceAvailable,
        });
      }
    });
    legs.push(this.walkingLeg(`${id}-egress`, "Terminer à pied", egress));

    const walkingMinutes = access.durationMinutes + egress.durationMinutes + confirmedTransfers.reduce((sum, transfer) => sum + transfer.durationMinutes, 0);
    const transferBufferMinutes = route.transfers.reduce((sum, transfer) => sum + transfer.interchangeBufferMinutes, 0);
    const waitingMinutes = route.legs.reduce((sum, leg) => sum + leg.waitMinutes, 0);
    const inVehicleMinutes = route.legs.reduce((sum, leg) => sum + leg.durationMinutes, 0);
    const duration = walkingMinutes + transferBufferMinutes + waitingMinutes + inVehicleMinutes;
    const durationP90 = access.durationP90 + egress.durationP90 + confirmedTransfers.reduce((sum, transfer) => sum + transfer.durationP90, 0) + transferBufferMinutes + route.legs.reduce((sum, leg) => sum + leg.waitP90 + leg.durationP90, 0);
    const confidence = combineConfidence([
      access.confidence, egress.confidence, ...confirmedTransfers.map((transfer) => transfer.confidence),
      ...route.legs.flatMap((leg) => [leg.sourceConfidence, leg.waitConfidence, leg.priceConfidence]),
    ]);
    const reliability = Math.min(reliabilityPrior, Math.round(confidence * 100));
    const geometry = legs.flatMap((leg) => (leg.geometry as Array<[number, number]> | undefined) ?? []);
    return {
      id, label, profile: "citywide-transport-network",
      description: id === "network-cheap" ? "Réseau collectif privilégiant le coût et des correspondances piétonnes vérifiées" : "Marche routée, attente et lignes collectives du Grand Abidjan",
      duration, duration_p90: durationP90, distance_km: Number((route.legs.reduce((sum, leg) => sum + leg.distanceKm, 0) + walkingDistanceM / 1000).toFixed(2)),
      price: route.price, price_p90: route.priceP90, walking_minutes: walkingMinutes, walking_distance_m: walkingDistanceM,
      waiting_minutes: waitingMinutes, in_vehicle_minutes: inVehicleMinutes, boarding_count: route.legs.length,
      transfer_count: route.transfers.length, comfort, reliability, confidence, uncertainty: Number((1 - confidence).toFixed(2)),
      incident_risk: Number(((100 - reliability) / 100).toFixed(2)), modes: [...new Set(["walk", ...route.legs.map((leg) => leg.mode), "walk"])],
      line_ids: route.legs.map((leg) => leg.lineId), geometry, legs,
      data_notice: "Tracés de transport historiques data.gouv.ci (2021). Accès, sorties et correspondances calculés sur le réseau piéton OpenStreetMap/Valhalla. Attentes, temps en véhicule et tarifs restent des estimations avec P90 et confiance.",
    };
  }

  private walkingLeg(id: string, label: string, route: PedestrianRoute) {
    return {
      id, mode: "walk", label,
      detail: `${route.durationMinutes} min · ${Math.round(route.distanceKm * 1000)} m${route.guidanceAvailable ? " · chemin OSM" : " · estimation sans guidage"}`,
      duration: route.durationMinutes, duration_p90: route.durationP90, price: 0, geometry: route.coordinates,
      dataStatus: route.guidanceAvailable ? "routed_osm" : "estimated_mvp", estimate_method: route.method,
      confidence: route.confidence, guidance_available: route.guidanceAvailable,
    };
  }

  private walkingRoute(from: [number, number], to: [number, number], maxDistanceM: number, connectorKind: WalkConnectorKind, profiler: JourneyProfiler) {
    const cacheKey = `${from.join(",")}|${to.join(",")}|${maxDistanceM}|${connectorKind}`;
    const cached = this.pedestrianRouteCache.get(cacheKey);
    if (cached) return cached;
    const pending = routePedestrian(this.valhallaUrl, { lon: from[0], lat: from[1] }, { lon: to[0], lat: to[1] }, { maxDistanceM, connectorKind, walkingSpeedKmh: SIRA_WALK.speedsKmh.normal, onValhallaTiming: (durationMs) => profiler.record("valhalla_total", durationMs) });
    this.pedestrianRouteCache.set(cacheKey, pending);
    void pending.then((result) => { if (!result) this.pedestrianRouteCache.delete(cacheKey); });
    return pending;
  }

  private withProfile(payload: Record<string, unknown>, profiler: JourneyProfiler) {
    if (!this.profileJourneys) return payload;
    const startedAt = performance.now();
    const response = { ...payload };
    profiler.record("response_serialization", performance.now() - startedAt);
    return { ...response, performance: profiler.snapshot() };
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
    return { id, label, profile: "road", description: "Trajet routier calculé sur la voirie OpenStreetMap", duration: duration + 3, duration_p90: Math.round((duration + 3) * 1.18), distance_km: Number(distance.toFixed(1)), price, walking_minutes: 0, walking_distance_m: 0, waiting_minutes: 3, in_vehicle_minutes: duration, boarding_count: 1, transfer_count: 0, comfort, reliability, uncertainty: 0.28, incident_risk: Number(((100 - reliability) / 100).toFixed(2)), modes: ["wait", "taxi"], line_ids: ["road-osm"], shape: route.trip?.legs?.[0]?.shape ?? null, geometry, legs, data_notice: "Tracé routier OpenStreetMap. Durée et tarif estimés pour le MVP." };
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
