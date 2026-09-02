import { WALKING_SPEEDS_KMH } from "./estimators";
import type { Coordinate } from "./transport-graph";
import type { WalkConnectorKind } from "./walk-config";

export type RoutingPoint = { lat: number; lon: number };

export type PedestrianRoute = {
  distanceKm: number;
  durationMinutes: number;
  durationP90: number;
  coordinates: Coordinate[];
  method: "valhalla_pedestrian";
  confidence: number;
  guidanceAvailable: boolean;
  connectorKind: WalkConnectorKind;
  source: "valhalla_osm";
  walkingDurationS: number;
};

type ValhallaResponse = {
  trip?: {
    summary?: { time?: number; length?: number };
    legs?: Array<{ shape?: string | { coordinates?: Coordinate[] } }>;
  };
};

export const haversineKm = (a: RoutingPoint, b: RoutingPoint) => {
  const radians = (value: number) => value * Math.PI / 180;
  const dLat = radians(b.lat - a.lat);
  const dLon = radians(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

export const decodeValhallaShape = (encoded: string, precision = 6): Coordinate[] => {
  const coordinates: Coordinate[] = [];
  let index = 0;
  let lat = 0;
  let lon = 0;
  const factor = 10 ** precision;
  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    lon += result & 1 ? ~(result >> 1) : result >> 1;
    coordinates.push([lon / factor, lat / factor]);
  }
  return coordinates;
};

const extractCoordinates = (data: ValhallaResponse): Coordinate[] => {
  const shape = data.trip?.legs?.[0]?.shape;
  if (typeof shape === "string") return decodeValhallaShape(shape);
  if (shape?.coordinates?.length) return shape.coordinates;
  return [];
};

export const routePedestrian = async (
  valhallaUrl: string,
  origin: RoutingPoint,
  destination: RoutingPoint,
  options: { maxDistanceM: number; connectorKind: WalkConnectorKind; walkingSpeedKmh?: number; timeoutMs?: number; onValhallaTiming?: (durationMs: number) => void },
): Promise<PedestrianRoute | null> => {
  const directKm = haversineKm(origin, destination);
  if (directKm * 1000 > options.maxDistanceM) return null;
  if (directKm < 0.005) return null;

  const payload = {
    locations: [origin, destination],
    costing: "pedestrian",
    costing_options: { pedestrian: { walking_speed: options.walkingSpeedKmh ?? WALKING_SPEEDS_KMH.standard } },
    units: "kilometers",
    language: "fr-FR",
    shape_format: "geojson",
    directions_options: { units: "kilometers" },
  };
  try {
    const startedAt = performance.now();
    const response = await fetch(`${valhallaUrl}/route`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(options.timeoutMs ?? 3500),
    });
    options.onValhallaTiming?.(performance.now() - startedAt);
    if (response.ok) {
      const data = await response.json() as ValhallaResponse;
      const distanceKm = data.trip?.summary?.length ?? 0;
      const seconds = data.trip?.summary?.time ?? 0;
      const coordinates = extractCoordinates(data);
      if (distanceKm > 0 && seconds > 0 && coordinates.length > 1 && distanceKm * 1000 <= options.maxDistanceM) {
        const durationMinutes = Math.max(1, Math.round(seconds / 60));
        return {
          distanceKm: Number(distanceKm.toFixed(3)),
          durationMinutes,
          durationP90: Math.max(durationMinutes + 1, Math.round(durationMinutes * 1.25)),
          coordinates,
          method: "valhalla_pedestrian",
          confidence: 0.82,
          guidanceAvailable: true,
          connectorKind: options.connectorKind,
          source: "valhalla_osm",
          walkingDurationS: Math.round(seconds),
        };
      }
    }
  } catch {
    options.onValhallaTiming?.(0);
  }

  return null;
};
