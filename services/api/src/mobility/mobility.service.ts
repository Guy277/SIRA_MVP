import { BadRequestException, Injectable, OnModuleInit, ServiceUnavailableException } from "@nestjs/common";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { TransportGraph, type NetworkJourney, type TransportFeature } from "./transport-graph";
import { combineConfidence, type SiraTransportMode, estimateRideDuration, estimateWait } from "./estimators";
import { decodeValhallaShape, haversineKm, routePedestrian, type PedestrianRoute } from "./pedestrian-router";
import { classifyTransferDistance, SIRA_WALK, type WalkConnectorKind } from "./walk-config";
import { JourneyProfiler } from "./journey-profiler";
import { TransportRepository } from "./transport.repository";

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

type WalkFoundResult = {
  status: "found";
  origin: Point;
  destination: Point;
  maxDistanceM: number;
  distanceM: number;
  durationSeconds: number;
  durationMinutes: number;
  durationP90: number;
  geometry: { type: "LineString"; coordinates: [number, number][] };
  provider: string;
  method: string;
  guidanceAvailable: boolean;
  confidence: number;
};

type WalkFailedResult = {
  status: "no_walk_path_found" | "walk_engine_unavailable";
  origin: Point;
  destination: Point;
  maxDistanceM: number;
  provider: string;
};

export type WalkResult = WalkFoundResult | WalkFailedResult;

const toSiraTransportMode = (rawMode?: string | null): SiraTransportMode => {
  const value = `${rawMode ?? ""}`.toLowerCase();
  if (/ferry|bateau|monbato|aqualine|stl/.test(value)) return "boat";
  if (/gbaka/.test(value)) return "gbaka";
  if (/woro|wôrô/.test(value)) return "woro";
  return "sotra";
};

const geometryLengthKm = (coordinates: [number, number][]): number => {
  let length = 0;
  for (let i = 1; i < coordinates.length; i++) {
    length += haversineKm(
      { lat: coordinates[i - 1][1], lon: coordinates[i - 1][0] },
      { lat: coordinates[i][1], lon: coordinates[i][0] }
    );
  }
  return length;
};

export type MultimodalRequest = {
  origin: Point;
  destination: Point;
  radiusM?: number;
  maxWalkingDistanceM?: number;
  maxCandidates?: number;
};

export type MultimodalWalkLeg = {
  mode: "WALK";
  from: { lat: number; lon: number; name?: string | null; id?: string | null };
  to: { lat: number; lon: number; name?: string | null; id?: string | null };
  distanceM: number;
  durationSeconds: number;
  durationP90: number;
  geometry: { type: "LineString"; coordinates: [number, number][] };
  provider: string;
  method: string;
  guidanceAvailable: boolean;
  confidence: number;
};

export type MultimodalTransitLeg = {
  mode: string;
  route: {
    id: string;
    shortName?: string | null;
    longName: string;
    operator?: string | null;
  };
  from: {
    id: string;
    name: string;
    code?: string | null;
    latitude: number;
    longitude: number;
  };
  to: {
    id: string;
    name: string;
    code?: string | null;
    latitude: number;
    longitude: number;
  };
  distanceM: number;
  durationSeconds: number;
  durationP90: number;
  durationStatus: "estimated";
  fare: number | null;
  fareStatus: string;
  dataStatus: string;

  geometry: { type: "LineString"; coordinates: [number, number][] };
  waiting_minutes?: number;
  waitP90?: number;
};

export type MultimodalJourney = {
  id: string;
  source: "postgis";
  dataStatus: "historical";
  confidence: number;
  legs: [MultimodalWalkLeg, MultimodalTransitLeg, MultimodalWalkLeg];
  summary: {
    walkingDistanceM: number;
    transitDistanceM: number;
    totalDistanceM: number;
    walkingDurationSeconds: number;
    transitDurationSeconds: number;
    totalDurationSeconds: number;
    waiting_minutes: number;
    waitP90: number;
    fare: number | null;
    fareStatus: string;
    transfers: number;
  };
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

  constructor(private readonly transportRepository: TransportRepository) {}

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

  async findNearbyStops(latitude: number, longitude: number, radiusM = 1500) {
    this.validatePoint({ lat: latitude, lon: longitude });
    if (!Number.isFinite(radiusM) || radiusM <= 0 || radiusM > 10_000) throw new BadRequestException("Rayon d'arrêt invalide.");
    if (!this.transportRepository.enabled) throw new ServiceUnavailableException("PostGIS transport n'est pas configuré.");
    try {
      const stops = await this.transportRepository.findNearbyStops(latitude, longitude, radiusM);
      return { source: "postgis", dataStatus: "historical", radiusM, items: stops };
    } catch {
      throw new ServiceUnavailableException("PostGIS transport est indisponible.");
    }
  }

  async walk(origin: Point, destination: Point, options: { maxDistanceM?: number; connectorKind?: WalkConnectorKind } = {}): Promise<WalkResult> {
    this.validatePoint(origin);
    this.validatePoint(destination);
    const maxDistanceM = options.maxDistanceM ?? SIRA_WALK.maxTotalDistanceM;
    if (!Number.isFinite(maxDistanceM) || maxDistanceM <= 0 || maxDistanceM > 20_000) throw new BadRequestException("Distance maximale de marche invalide.");
    const connectorKind = options.connectorKind ?? "access";
    try {
      const profiler = new JourneyProfiler(false);
      const route = await routePedestrian(this.valhallaUrl, { lon: origin.lon, lat: origin.lat }, { lon: destination.lon, lat: destination.lat }, {
        maxDistanceM,
        connectorKind,
        walkingSpeedKmh: SIRA_WALK.speedsKmh.normal,
        onValhallaTiming: (durationMs) => profiler.record("valhalla_walk", durationMs),
      });
      if (!route) {
        return {
          status: "no_walk_path_found",
          origin,
          destination,
          maxDistanceM,
          provider: "valhalla",
        };
      }
      return {
        status: "found",
        origin,
        destination,
        maxDistanceM,
        distanceM: Math.round(route.distanceKm * 1000),
        durationSeconds: route.walkingDurationS,
        durationMinutes: route.durationMinutes,
        durationP90: route.durationP90,
        geometry: { type: "LineString", coordinates: route.coordinates },
        provider: route.source,
        method: route.method,
        guidanceAvailable: route.guidanceAvailable,
        confidence: route.confidence,
      };
    } catch {
      return {
        status: "walk_engine_unavailable",
        origin,
        destination,
        maxDistanceM,
        provider: "valhalla",
      };
    }
  }

  async findAccessibleStop(origin: Point, options: { radiusM?: number; maxWalkingDistanceM?: number; maxCandidates?: number } = {}) {
    this.validatePoint(origin);
    if (!this.transportRepository.enabled) throw new ServiceUnavailableException("PostGIS transport n'est pas configuré.");
    const radiusM = options.radiusM ?? SIRA_WALK.maxAccessOrEgressDistanceM;
    const maxWalkingDistanceM = options.maxWalkingDistanceM ?? SIRA_WALK.maxAccessOrEgressDistanceM;
    const maxCandidates = Math.max(1, Math.min(8, options.maxCandidates ?? 5));
    if (!Number.isFinite(radiusM) || radiusM <= 0 || radiusM > 10_000) throw new BadRequestException("Rayon de recherche invalide.");
    if (!Number.isFinite(maxWalkingDistanceM) || maxWalkingDistanceM <= 0 || maxWalkingDistanceM > 10_000) throw new BadRequestException("Distance maximale de marche invalide.");

    let candidates: Awaited<ReturnType<TransportRepository["findNearbyStops"]>>;
    try {
      candidates = await this.transportRepository.findNearbyStops(origin.lat, origin.lon, radiusM, maxCandidates);
    } catch {
      throw new ServiceUnavailableException("PostGIS transport est indisponible.");
    }
    if (!candidates.length) {
      return { status: "no_accessible_stop_found", source: "postgis", origin, radiusM, maxWalkingDistanceM, candidatesEvaluated: 0 };
    }

    const evaluated: Array<{
      stop: (typeof candidates)[number];
      crowDistanceM: number;
      walk: WalkResult;
    }> = [];
    for (const stop of candidates) {
      const walkResult = await this.walk(origin, { lat: stop.latitude, lon: stop.longitude, name: stop.name }, { maxDistanceM: maxWalkingDistanceM, connectorKind: "access" });
      evaluated.push({ stop, crowDistanceM: Number(stop.distance_m), walk: walkResult });
    }

    const reachable = evaluated
      .filter((e): e is { stop: (typeof candidates)[number]; crowDistanceM: number; walk: WalkFoundResult } => e.walk.status === "found")
      .sort((a, b) => a.walk.distanceM - b.walk.distanceM);

    if (!reachable.length) {
      return {
        status: "no_accessible_stop_found",
        source: "postgis",
        origin,
        radiusM,
        maxWalkingDistanceM,
        candidatesEvaluated: evaluated.length,
        provider: "valhalla",
        candidates: evaluated.map((e) => ({
          stopId: e.stop.id,
          stopName: e.stop.name,
          crowDistanceM: e.crowDistanceM,
          walkStatus: e.walk.status,
        })),
      };
    }

    const best = reachable[0];
    return {
      status: "found",
      source: "postgis",
      origin,
      radiusM,
      maxWalkingDistanceM,
      candidatesEvaluated: evaluated.length,
      provider: "valhalla",
      stop: {
        id: best.stop.id,
        name: best.stop.name,
        code: best.stop.code,
        latitude: best.stop.latitude,
        longitude: best.stop.longitude,
        crowDistanceM: best.crowDistanceM,
      },
      walk: {
        distanceM: best.walk.distanceM,
        durationSeconds: best.walk.durationSeconds,
        durationMinutes: best.walk.durationMinutes,
        durationP90: best.walk.durationP90,
        geometry: best.walk.geometry,
        provider: best.walk.provider,
        method: best.walk.method,
        guidanceAvailable: best.walk.guidanceAvailable,
        confidence: best.walk.confidence,
      },
      candidates: evaluated.map((e) => ({
        stopId: e.stop.id,
        stopName: e.stop.name,
        crowDistanceM: e.crowDistanceM,
        walkStatus: e.walk.status,
        walkDistanceM: e.walk.status === "found" ? e.walk.distanceM : null,
      })),
    };
  }

  async findEgressWalk(fromStop: { lat: number; lon: number; id?: string; name?: string }, destination: Point, options: { maxWalkingDistanceM?: number } = {}) {
    const stopPoint: Point = { lat: fromStop.lat, lon: fromStop.lon, name: fromStop.name ?? fromStop.id };
    const maxWalkingDistanceM = options.maxWalkingDistanceM ?? SIRA_WALK.maxAccessOrEgressDistanceM;
    const walkResult = await this.walk(stopPoint, destination, { maxDistanceM: maxWalkingDistanceM, connectorKind: "egress" });
    return {
      ...walkResult,
      fromStop: {
        id: fromStop.id ?? null,
        name: fromStop.name ?? null,
        latitude: fromStop.lat,
        longitude: fromStop.lon,
      },
    };
  }

  async buildPostgisMultimodalJourney(
    origin: Point,
    destination: Point,
    options: { radiusM?: number; maxWalkingDistanceM?: number; maxCandidates?: number } = {}
  ): Promise<MultimodalJourney | { status: string; detail?: Record<string, unknown> }> {
    const radiusM = options.radiusM ?? 1500;
    const maxWalkingDistanceM = options.maxWalkingDistanceM ?? SIRA_WALK.maxAccessOrEgressDistanceM;
    const maxCandidates = Math.max(1, Math.min(8, options.maxCandidates ?? 5));
    this.validatePoint(origin);
    this.validatePoint(destination);
    if (!this.transportRepository.enabled) throw new ServiceUnavailableException("PostGIS transport n'est pas configuré.");
    if (!Number.isFinite(radiusM) || radiusM <= 0 || radiusM > 10_000) throw new BadRequestException("Rayon de recherche invalide.");
    if (!Number.isFinite(maxWalkingDistanceM) || maxWalkingDistanceM <= 0 || maxWalkingDistanceM > 10_000) throw new BadRequestException("Distance maximale de marche invalide.");

    const accessResult = await this.findAccessibleStop(origin, {
      radiusM,
      maxWalkingDistanceM,
      maxCandidates,
    });
    if (accessResult.status !== "found") {
      return { status: "no_accessible_stop_found", detail: accessResult as unknown as Record<string, unknown> };
    }

    type FoundAccess = {
      status: "found";
      stop: { id: string; name: string; code: string | null; latitude: number; longitude: number; crowDistanceM: number };
      walk: {
        distanceM: number;
        durationSeconds: number;
        durationMinutes: number;
        durationP90: number;
        geometry: { type: "LineString"; coordinates: [number, number][] };
        provider: string;
        method: string;
        guidanceAvailable: boolean;
        confidence: number;
      };
    };
    const foundAccess = accessResult as FoundAccess;
    const accessStop = foundAccess.stop;
    const accessWalk = foundAccess.walk;
    const fromStopPoint: Point = {
      lat: accessStop.latitude,
      lon: accessStop.longitude,
      name: accessStop.name,
    };

    let transitSegment: Awaited<ReturnType<TransportRepository["findFirstTransitSegment"]>> | null = null;
    try {
      transitSegment = await this.transportRepository.findFirstTransitSegment({
        origin: fromStopPoint,
        destination,
        radiusM,
      });
    } catch {
      return { status: "transport_unavailable", detail: accessResult as unknown as Record<string, unknown> };
    }
    if (!transitSegment) {
      return { status: "no_transport_path_found", detail: { access: accessResult as unknown as Record<string, unknown> } };
    }

    const egressResult = await this.findEgressWalk(
      {
        lat: transitSegment.to_latitude,
        lon: transitSegment.to_longitude,
        id: transitSegment.to_stop_id,
        name: transitSegment.to_stop_name,
      },
      destination,
      { maxWalkingDistanceM }
    );
    if (egressResult.status !== "found") {
      return { status: "no_egress_walk_path_found", detail: { access: accessResult as unknown as Record<string, unknown>, transit: transitSegment as unknown as Record<string, unknown>, egress: egressResult as unknown as Record<string, unknown> } };
    }

    const transitCoordinates = transitSegment.geometry?.coordinates ?? [];
    const transitDistanceKm = geometryLengthKm(transitCoordinates);
    const transitDistanceM = Math.round(transitDistanceKm * 1000);
    const mode = toSiraTransportMode(transitSegment.mode);
    const rideEstimate = estimateRideDuration(mode, transitDistanceKm);
    const transitDurationSeconds = Math.round(rideEstimate.value * 60);
    const transitDurationP90 = Math.round(rideEstimate.p90 * 60);

    if (!this.validateTransitGeometry(transitCoordinates, transitSegment.from_latitude, transitSegment.from_longitude, transitSegment.to_latitude, transitSegment.to_longitude)) {
      return { status: "no_transport_path_found", detail: { access: accessResult as unknown as Record<string, unknown>, reason: "geometry_validation_failed" } };
    }

    const totalFare = transitSegment.historical_fare === null ? null : Number(transitSegment.historical_fare);
    const totalFareStatus = transitSegment.fare_status ?? "unknown";

    const walkingDistanceM = accessWalk.distanceM + egressResult.distanceM;
    const walkingDurationSeconds = accessWalk.durationSeconds + egressResult.durationSeconds;
    const totalDistanceM = walkingDistanceM + transitDistanceM;
    const totalDurationSeconds = walkingDurationSeconds + transitDurationSeconds;

    return {
      id: `postgis-multimodal-${Date.now()}`,
      source: "postgis",
      dataStatus: "historical",
      confidence: combineConfidence([accessWalk.confidence, transitSegment.confidence ?? null, egressResult.confidence].filter((v): v is number => v !== null && Number.isFinite(v))),
      legs: [
        {
          mode: "WALK",
          from: { lat: origin.lat, lon: origin.lon, name: origin.name, id: undefined },
          to: { lat: accessStop.latitude, lon: accessStop.longitude, name: accessStop.name, id: accessStop.id },
          distanceM: accessWalk.distanceM,
          durationSeconds: accessWalk.durationSeconds,
          durationP90: accessWalk.durationP90,
          geometry: accessWalk.geometry,
          provider: accessWalk.provider,
          method: accessWalk.method,
          guidanceAvailable: accessWalk.guidanceAvailable,
          confidence: accessWalk.confidence,
        },
        {
          mode: transitSegment.mode,
          route: {
            id: transitSegment.route_id,
            shortName: transitSegment.short_name,
            longName: transitSegment.long_name,
            operator: transitSegment.operator,
          },
          from: {
            id: transitSegment.from_stop_id,
            name: transitSegment.from_stop_name,
            code: transitSegment.from_stop_code,
            latitude: transitSegment.from_latitude,
            longitude: transitSegment.from_longitude,
          },
          to: {
            id: transitSegment.to_stop_id,
            name: transitSegment.to_stop_name,
            code: transitSegment.to_stop_code,
            latitude: transitSegment.to_latitude,
            longitude: transitSegment.to_longitude,
          },
          distanceM: transitDistanceM,
          durationSeconds: transitDurationSeconds,
          durationP90: transitDurationP90,
          durationStatus: "estimated",
          fare: totalFare,
          fareStatus: totalFareStatus,
          dataStatus: transitSegment.data_status,
          geometry: transitSegment.geometry,
          waiting_minutes: estimateWait(mode).value,
          waitP90: estimateWait(mode).p90,
        },
        {
          mode: "WALK",
          from: { lat: egressResult.fromStop.latitude, lon: egressResult.fromStop.longitude, name: egressResult.fromStop.name, id: egressResult.fromStop.id ?? undefined },
          to: { lat: destination.lat, lon: destination.lon, name: destination.name, id: undefined },
          distanceM: egressResult.distanceM,
          durationSeconds: egressResult.durationSeconds,
          durationP90: egressResult.durationP90,
          geometry: egressResult.geometry,
          provider: egressResult.provider,
          method: egressResult.method,
          guidanceAvailable: egressResult.guidanceAvailable,
          confidence: egressResult.confidence,
        },
      ],
      summary: {
        walkingDistanceM,
        transitDistanceM,
        totalDistanceM,
        walkingDurationSeconds,
        transitDurationSeconds,
        totalDurationSeconds,
        waiting_minutes: estimateWait(mode).value,
        waitP90: estimateWait(mode).p90,
        fare: totalFare,
        fareStatus: totalFareStatus,
        transfers: 0,
      },
    };
  }

  async generatePostgisCandidates(
    origin: Point,
    destination: Point,
    options: { radiusM?: number; maxWalkingDistanceM?: number; maxCandidates?: number } = {}
  ): Promise<MultimodalJourney[]> {
    const radiusM = options.radiusM ?? 1500;
    const maxWalkingDistanceM = options.maxWalkingDistanceM ?? SIRA_WALK.maxAccessOrEgressDistanceM;
    const maxCandidates = Math.max(1, Math.min(8, options.maxCandidates ?? 5));
    const maxAccessStops = Math.max(2, Math.min(5, Math.ceil(maxCandidates / 2)));
    const maxTransitOptions = Math.max(2, Math.min(5, Math.ceil(maxCandidates / 2)));
    this.validatePoint(origin);
    this.validatePoint(destination);
    if (!this.transportRepository.enabled) throw new ServiceUnavailableException("PostGIS transport n'est pas configuré.");
    if (!Number.isFinite(radiusM) || radiusM <= 0 || radiusM > 10_000) throw new BadRequestException("Rayon de recherche invalide.");
    if (!Number.isFinite(maxWalkingDistanceM) || maxWalkingDistanceM <= 0 || maxWalkingDistanceM > 10_000) throw new BadRequestException("Distance maximale de marche invalide.");

    let accessStops: Array<{ id: string; name: string | null; code: string | null; latitude: number; longitude: number; distance_m: number }>;
    try {
      accessStops = await this.transportRepository.findNearbyStops(origin.lat, origin.lon, radiusM, maxAccessStops);
    } catch {
      throw new ServiceUnavailableException("PostGIS transport est indisponible.");
    }
    if (!accessStops.length) return [];

    const walkCache = new Map<string, WalkResult>();

    const cachedWalk = async (from: Point, to: Point, connectorKind: WalkConnectorKind): Promise<WalkResult> => {
      const cacheKey = `${from.lat},${from.lon}|${to.lat},${to.lon}|${maxWalkingDistanceM}|${connectorKind}`;
      const cached = walkCache.get(cacheKey);
      if (cached) return cached;
      const result = await this.walk(from, to, { maxDistanceM: maxWalkingDistanceM, connectorKind });
      walkCache.set(cacheKey, result);
      return result;
    };

    type SegmentRow = {
      route_id: string;
      short_name: string | null;
      long_name: string;
      mode: string;
      operator: string | null;
      historical_fare: number | null;
      fare_status: string;
      data_status: string;
      confidence: number | null;
      from_stop_id: string;
      from_stop_name: string;
      from_stop_code: string | null;
      from_latitude: number;
      from_longitude: number;
      from_distance_m: number;
      to_stop_id: string;
      to_stop_name: string;
      to_stop_code: string | null;
      to_latitude: number;
      to_longitude: number;
      to_distance_m: number;
      geometry: { type: "LineString"; coordinates: [number, number][] };
    };

    const allCandidates: Array<{ dedupKey: string; candidate: MultimodalJourney }> = [];

    for (const stop of accessStops) {
      const accessStopPoint: Point = { lat: stop.latitude, lon: stop.longitude, name: stop.name ?? stop.id };

      let segments: SegmentRow[];
      try {
        segments = await this.transportRepository.findTransitSegments({
          origin: accessStopPoint,
          destination,
          radiusM,
        }, maxTransitOptions);
      } catch {
        continue;
      }
      if (!segments.length) continue;

      for (const seg of segments) {
        const dedupKey = `${seg.from_stop_id}:${seg.route_id}:${seg.to_stop_id}`;

        const accessWalk = await cachedWalk(origin, { lat: seg.from_latitude, lon: seg.from_longitude, name: seg.from_stop_name }, "access");
        if (accessWalk.status !== "found") continue;

        const egressWalk = await cachedWalk(
          { lat: seg.to_latitude, lon: seg.to_longitude, name: seg.to_stop_name },
          destination,
          "egress",
        );
        if (egressWalk.status !== "found") continue;

        const transitCoordinates = seg.geometry?.coordinates ?? [];
        if (!this.validateTransitGeometry(transitCoordinates, seg.from_latitude, seg.from_longitude, seg.to_latitude, seg.to_longitude)) continue;

        const transitDistanceKm = geometryLengthKm(transitCoordinates);
        const transitDistanceM = Math.round(transitDistanceKm * 1000);
        const mode = toSiraTransportMode(seg.mode);
        const rideEstimate = estimateRideDuration(mode, transitDistanceKm);
        const transitDurationSeconds = Math.round(rideEstimate.value * 60);
        const transitDurationP90 = Math.round(rideEstimate.p90 * 60);
        const totalFare = seg.historical_fare === null ? null : Number(seg.historical_fare);
        const walkingDistanceM = accessWalk.distanceM + egressWalk.distanceM;
        const walkingDurationSeconds = accessWalk.durationSeconds + egressWalk.durationSeconds;
        const totalDurationSeconds = walkingDurationSeconds + transitDurationSeconds;

        const egressFromStop = {
          id: seg.to_stop_id,
          name: seg.to_stop_name,
          latitude: seg.to_latitude,
          longitude: seg.to_longitude,
        };

        allCandidates.push({
          dedupKey,
          candidate: {
            id: `postgis-${seg.from_stop_id}-${seg.route_id}-${seg.to_stop_id}`,
            source: "postgis",
            dataStatus: "historical",
            confidence: combineConfidence([accessWalk.confidence, seg.confidence ?? null, egressWalk.confidence].filter((v): v is number => v !== null && Number.isFinite(v))),
            legs: [
              {
                mode: "WALK",
                from: { lat: origin.lat, lon: origin.lon, name: origin.name, id: undefined },
                to: { lat: seg.from_latitude, lon: seg.from_longitude, name: seg.from_stop_name, id: seg.from_stop_id },
                distanceM: accessWalk.distanceM,
                durationSeconds: accessWalk.durationSeconds,
                durationP90: accessWalk.durationP90,
                geometry: accessWalk.geometry,
                provider: accessWalk.provider,
                method: accessWalk.method,
                guidanceAvailable: accessWalk.guidanceAvailable,
                confidence: accessWalk.confidence,
              },
              {
                mode: seg.mode,
                route: {
                  id: seg.route_id,
                  shortName: seg.short_name,
                  longName: seg.long_name,
                  operator: seg.operator,
                },
                from: {
                  id: seg.from_stop_id,
                  name: seg.from_stop_name,
                  code: seg.from_stop_code,
                  latitude: seg.from_latitude,
                  longitude: seg.from_longitude,
                },
                to: {
                  id: seg.to_stop_id,
                  name: seg.to_stop_name,
                  code: seg.to_stop_code,
                  latitude: seg.to_latitude,
                  longitude: seg.to_longitude,
                },
                distanceM: transitDistanceM,
                durationSeconds: transitDurationSeconds,
                durationP90: transitDurationP90,
                durationStatus: "estimated",
                fare: totalFare,
                fareStatus: seg.fare_status,
                dataStatus: seg.data_status,
                geometry: seg.geometry,
                // Estimate waiting time for transit leg
                waiting_minutes: estimateWait(toSiraTransportMode(seg.mode)).value,
                waitP90: estimateWait(toSiraTransportMode(seg.mode)).p90,
              },
              {
                mode: "WALK",
                from: { lat: egressFromStop.latitude, lon: egressFromStop.longitude, name: egressFromStop.name, id: egressFromStop.id },
                to: { lat: destination.lat, lon: destination.lon, name: destination.name, id: undefined },
                distanceM: egressWalk.distanceM,
                durationSeconds: egressWalk.durationSeconds,
                durationP90: egressWalk.durationP90,
                geometry: egressWalk.geometry,
                provider: egressWalk.provider,
                method: egressWalk.method,
                guidanceAvailable: egressWalk.guidanceAvailable,
                confidence: egressWalk.confidence,
              },
            ],
            summary: {
              walkingDistanceM,
              transitDistanceM,
              totalDistanceM: walkingDistanceM + transitDistanceM,
              walkingDurationSeconds,
              transitDurationSeconds,
              totalDurationSeconds,
              waiting_minutes: estimateWait(toSiraTransportMode(seg.mode)).value,
              waitP90: estimateWait(toSiraTransportMode(seg.mode)).p90,
              fare: totalFare,
              fareStatus: seg.fare_status,
              transfers: 0,
            },
          },
        });
      }
    }

    const bestByKey = new Map<string, MultimodalJourney>();
    for (const { dedupKey, candidate } of allCandidates) {
      const existing = bestByKey.get(dedupKey);
      if (!existing) {
        bestByKey.set(dedupKey, candidate);
        continue;
      }
      const existingTotal = existing.summary.totalDurationSeconds;
      const candidateTotal = candidate.summary.totalDurationSeconds;
      if (candidateTotal < existingTotal) {
        bestByKey.set(dedupKey, candidate);
      } else if (candidateTotal === existingTotal) {
        if (candidate.summary.walkingDistanceM < existing.summary.walkingDistanceM) {
          bestByKey.set(dedupKey, candidate);
        } else if (candidate.summary.walkingDistanceM === existing.summary.walkingDistanceM) {
          const existingFare = existing.summary.fare ?? Infinity;
          const candidateFare = candidate.summary.fare ?? Infinity;
          if (candidateFare < existingFare) {
            bestByKey.set(dedupKey, candidate);
          }
        }
      }
    }

    return Array.from(bestByKey.values())
      .sort((a, b) => {
        const durationDiff = a.summary.totalDurationSeconds - b.summary.totalDurationSeconds;
        if (durationDiff !== 0) return durationDiff;
        const fareA = a.summary.fare ?? Infinity;
        const fareB = b.summary.fare ?? Infinity;
        return fareA - fareB;
      })
      .slice(0, maxCandidates);
  }

  async findTransportSegment(request: { origin: Point; destination: Point; radiusM?: number }) {
    this.validatePoint(request.origin);
    this.validatePoint(request.destination);
    const radiusM = request.radiusM ?? 1500;
    if (!Number.isFinite(radiusM) || radiusM <= 0 || radiusM > 10_000) throw new BadRequestException("Rayon de recherche invalide.");
    if (!this.transportRepository.enabled) throw new ServiceUnavailableException("PostGIS transport n'est pas configuré.");
    try {
      const segment = await this.transportRepository.findFirstTransitSegment({ ...request, radiusM });
      if (!segment) return { status: "no_transport_path_found", source: "postgis", dataStatus: "historical", fare: null, fareStatus: "unknown" };
      return {
        status: "found",
        source: "postgis",
        dataStatus: segment.data_status,
        origin: request.origin,
        destination: request.destination,
        legs: [
          {
            type: "transit",
            mode: segment.mode,
            route: { id: segment.route_id, shortName: segment.short_name, longName: segment.long_name, operator: segment.operator },
            fromStop: { id: segment.from_stop_id, name: segment.from_stop_name, code: segment.from_stop_code, latitude: Number(segment.from_latitude), longitude: Number(segment.from_longitude), distanceM: Number(segment.from_distance_m) },
            toStop: { id: segment.to_stop_id, name: segment.to_stop_name, code: segment.to_stop_code, latitude: Number(segment.to_latitude), longitude: Number(segment.to_longitude), distanceM: Number(segment.to_distance_m) },
            geometry: segment.geometry,
            fare: segment.historical_fare === null ? null : Number(segment.historical_fare),
            fareStatus: segment.fare_status,
          },
        ],
        metadata: { dataStatus: segment.data_status, confidence: segment.confidence === null ? null : Number(segment.confidence) },
      };
    } catch {
      throw new ServiceUnavailableException("PostGIS transport est indisponible.");
    }
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
    const strategies = ["fast", "balanced", "cheap", "min_transfers", "min_walking"] as const;
    const networks = profiler.measure("transport_graph_search", () => 
      strategies.map(strategy => ({ strategy, result: graph.route(request.origin, request.destination, strategy, graphOptions) }))
    );

    const candidates: Array<Record<string, unknown>> = [];
    const road = await roadPromise;
    if (road.geometry?.length || road.trip?.legs?.[0]?.shape) {
      candidates.push(this.toRoadCandidate("road-fast", "Taxi / route directe", road, 5, 82));
    }

    const postgisCandidateIds = new Set<string>();
    if (this.transportRepository.enabled) {
      try {
        const multimodalCandidates = await this.generatePostgisCandidates(request.origin, request.destination, {
          radiusM: 1500,
          maxWalkingDistanceM,
          maxCandidates: 5,
        });
        for (const journey of multimodalCandidates) {
          const siraCandidate = await this.toPostgisCandidate(journey);
          postgisCandidateIds.add(siraCandidate.id as string);
          candidates.unshift(siraCandidate);
        }
      } catch {
        // PostGIS indisponible : on continue avec le fallback GeoJSON
      }
    }

const signatures = new Set<string>();
    for (const { strategy, result } of networks) {
      if (!result) continue;
      const candidate = await this.toNetworkCandidate(
        `network-${strategy}`,
        `Option ${strategy}`,
        result,
        strategy === "cheap" ? 3 : (strategy === "min_walking" ? 5 : 4),
        strategy === "cheap" ? 72 : (strategy === "fast" ? 80 : 78),
        maxWalkingDistanceM,
        profiler
      );
      if (!candidate) continue;
      const signature = result.legs.map(l => l.lineId).join("->");
      if (signatures.has(signature)) continue;
      signatures.add(signature);
      candidates.push(candidate);
    }

    // Global deduplication across all sources (PostGIS, Road, GeoJSON) with robust signature
    const buildSignature = (candidate: Record<string, unknown>): string => {
      const source = String(candidate.source ?? candidate.profile ?? "unknown");
      const lineIds = Array.isArray(candidate.line_ids) ? candidate.line_ids.join("->") : "";
      const legs = Array.isArray(candidate.legs) ? candidate.legs : [];
      const accessStop = legs.find((l: Record<string, unknown>) => l.mode === "walk" && String(l.label ?? "").includes("Accès"))?.to?.id
        ?? legs.find((l: Record<string, unknown>) => l.mode === "walk")?.from?.id
        ?? "unknown_access";
      const egressStop = legs.find((l: Record<string, unknown>) => l.mode === "walk" && String(l.label ?? "").includes("Sortie"))?.to?.id
        ?? legs.filter((l: Record<string, unknown>) => l.mode === "walk").pop()?.to?.id
        ?? "unknown_egress";
      return `${source}|${lineIds}|${accessStop}|${egressStop}`;
    };

    const globalSignatures = new Set<string>();
    const deduplicatedCandidates: Array<Record<string, unknown>> = [];
    for (const candidate of candidates) {
      const signature = buildSignature(candidate);
      if (globalSignatures.has(signature)) continue;
      globalSignatures.add(signature);
      deduplicatedCandidates.push(candidate);
    }

if (!deduplicatedCandidates.length) throw new BadRequestException("Aucun itinéraire suivant le réseau disponible n'a été trouvé.");
    
    // Budget constraint: only apply if explicitly provided by user
    const userBudget = request.budget ?? null;
    const effectiveBudget = userBudget ?? 999999; // Very high = no effective constraint
    const constraints = {
      max_budget_fcfa: effectiveBudget,
      max_walking_distance_m: maxWalkingDistanceM,
      max_transfers: request.constraints?.maxTransfers ?? 3,
      excluded_modes: request.constraints?.excludedModes ?? [],
    };
    try {
      const ranked = await profiler.measureAsync("sira_more", () => fetch(`${this.aiUrl}/v1/recommendations/rank`, {
        method: "POST", headers: { "content-type": "application/json" },
        signal: AbortSignal.timeout(10_000),
        body: JSON.stringify({ budget: effectiveBudget, preference: request.preference ?? "balanced", constraints, journeys: deduplicatedCandidates }),
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
    const feasible = deduplicatedCandidates.filter((candidate) =>
      Number(candidate.price) <= constraints.max_budget_fcfa
      && Number(candidate.walking_distance_m) <= constraints.max_walking_distance_m
      && Number(candidate.transfer_count) <= constraints.max_transfers
      && !(candidate.modes as string[]).some((mode) => constraints.excluded_modes.includes(mode)),
    ).sort((left, right) => Number(left.duration) + Number(left.price) / 50 - (Number(right.duration) + Number(right.price) / 50));
    const source = postgisCandidateIds.size > 0 && feasible.some((c) => postgisCandidateIds.has(c.id as string)) ? "postgis_multimodal" : "local_geojson";
    return this.withProfile({
      journeys: feasible.map((candidate, index) => ({ ...candidate, recommended: index === 0, reasons: ["Respecte vos contraintes", "Classement de secours déterministe"] })),
      recommended_id: feasible[0]?.id ?? null,
      rejected_count: deduplicatedCandidates.length - feasible.length,
      source,
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

  private validateTransitGeometry(
    coordinates: [number, number][],
    fromLat: number,
    fromLon: number,
    toLat: number,
    toLon: number,
  ): boolean {
    if (!coordinates.length) return false;
    const start = coordinates[0];
    const end = coordinates[coordinates.length - 1];
    const fromDistance = haversineKm({ lat: start[1], lon: start[0] }, { lat: fromLat, lon: fromLon }) * 1000;
    const toDistance = haversineKm({ lat: end[1], lon: end[0] }, { lat: toLat, lon: toLon }) * 1000;
    return fromDistance <= 200 && toDistance <= 200;
  }

  private async toPostgisCandidate(journey: MultimodalJourney): Promise<Record<string, unknown>> {
    const accessLeg = journey.legs[0];
    const transitLeg = journey.legs[1];
    const egressLeg = journey.legs[2];
    const transitMode = transitLeg.mode.toLowerCase();
    const walkingMinutes = Math.round(journey.summary.walkingDurationSeconds / 60);
    const inVehicleMinutes = Math.round(journey.summary.transitDurationSeconds / 60);
    const geometry = [
      ...(accessLeg.geometry.coordinates as [number, number][]),
      ...(transitLeg.geometry?.coordinates ?? []),
      ...(egressLeg.geometry.coordinates as [number, number][]),
    ];
    const estimatedWaitMinutes = transitLeg.waiting_minutes ?? 0;
    const estimatedWaitP90 = transitLeg.waitP90 ?? 0;
    const legs = [
      {
        id: `${journey.id}-access`, mode: "walk", label: "Accès piéton",
        detail: `${accessLeg.durationSeconds} s · ${accessLeg.distanceM} m · ${accessLeg.provider}`,
        duration: Math.round(accessLeg.durationSeconds / 60), duration_p90: Math.round(accessLeg.durationP90 / 60),
        price: 0, geometry: accessLeg.geometry.coordinates, dataStatus: "routed_osm",
        estimate_method: accessLeg.method, confidence: accessLeg.confidence, guidance_available: accessLeg.guidanceAvailable,
      },
      {
        id: `${journey.id}-wait`, mode: "wait", label: `Attente estimée — ${transitLeg.mode}`,
        detail: `${estimatedWaitMinutes} min (P90 ${estimatedWaitP90} min) · estimation basée sur fréquence déclarée`,
        duration: estimatedWaitMinutes, duration_p90: estimatedWaitP90, price: 0, geometry: [], dataStatus: "estimated_mvp",
        estimate_method: "mode_headway_prior", confidence: 0.32,
      },
      {
        id: `${journey.id}-ride`, mode: transitLeg.mode, label: transitLeg.route.longName,
        detail: `${transitLeg.durationSeconds} s · ${transitLeg.distanceM} m · ${transitLeg.fareStatus === "historical" && transitLeg.fare !== null ? transitLeg.fare + " FCFA" : "tarif inconnu"}`,
        duration: inVehicleMinutes, duration_p90: Math.round(transitLeg.durationP90 / 60),
        price: transitLeg.fare ?? null, price_p90: transitLeg.fare ?? null, geometry: transitLeg.geometry?.coordinates ?? [],
        line_id: transitLeg.route.id, source: `${transitLeg.route.operator ?? "Opérateur inconnu"} · ${transitLeg.route.id}`,
        dataStatus: transitLeg.dataStatus, estimate_method: "postgis_transit_segment", confidence: 0.6,
      },
      {
        id: `${journey.id}-egress`, mode: "walk", label: "Sortie piétonne",
        detail: `${egressLeg.durationSeconds} s · ${egressLeg.distanceM} m · ${egressLeg.provider}`,
        duration: Math.round(egressLeg.durationSeconds / 60), duration_p90: Math.round(egressLeg.durationP90 / 60),
        price: 0, geometry: egressLeg.geometry.coordinates, dataStatus: "routed_osm",
        estimate_method: egressLeg.method, confidence: egressLeg.confidence, guidance_available: egressLeg.guidanceAvailable,
      },
    ];
    return {
      id: journey.id, label: "Trajet multimodal PostGIS", profile: "postgis-multimodal",
      description: "Marche Valhalla + transport PostGIS + marche Valhalla",
      duration: Math.round(journey.summary.totalDurationSeconds / 60),
      duration_p90: Math.round(journey.summary.totalDurationSeconds * 1.2 / 60),
      distance_km: Number((journey.summary.totalDistanceM / 1000).toFixed(2)),
      price: journey.summary.fare ?? null, price_p90: journey.summary.fare ?? null,
      walking_minutes: walkingMinutes, walking_distance_m: journey.summary.walkingDistanceM,
      waiting_minutes: estimatedWaitMinutes, in_vehicle_minutes: inVehicleMinutes,
      boarding_count: 1, transfer_count: journey.summary.transfers,
      comfort: 70, reliability: 75, confidence: 0.6, uncertainty: 0.4,
      incident_risk: 0.25,
      modes: ["walk", transitMode, "walk"],
      line_ids: [transitLeg.route.id],
      geometry, legs,
      data_notice: "Accès et sorties calculés sur le réseau piéton OpenStreetMap/Valhalla. Segment transport issu des données GTFS historiques importées dans PostGIS. Attentes et temps en véhicule restent des estimations.",
      source: "postgis_multimodal",
      dataStatus: journey.dataStatus,
      fareStatus: journey.summary.fareStatus,
      waitingStatus: "estimated",
      waitP90: estimatedWaitP90,
    };
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
