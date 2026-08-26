import { estimateWalkingDuration, WALKING_SPEEDS_KMH } from "./estimators";
import type { Coordinate } from "./transport-graph";

export type RoutingPoint = { lat: number; lon: number };

export type PedestrianRoute = {
  distanceKm: number;
  durationMinutes: number;
  durationP90: number;
  coordinates: Coordinate[];
  method: "valhalla_pedestrian" | "estimated_short_connector";
  confidence: number;
  guidanceAvailable: boolean;
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
  options: { maxDistanceM: number; allowEstimatedShortConnector?: boolean; timeoutMs?: number },
): Promise<PedestrianRoute | null> => {
  const directKm = haversineKm(origin, destination);
  if (directKm * 1000 > options.maxDistanceM) return null;
  if (directKm < 0.005) {
    return { distanceKm: 0, durationMinutes: 1, durationP90: 1, coordinates: [], method: "estimated_short_connector", confidence: 0.7, guidanceAvailable: false };
  }

  const payload = {
    locations: [origin, destination],
    costing: "pedestrian",
    costing_options: { pedestrian: { walking_speed: WALKING_SPEEDS_KMH.standard } },
    units: "kilometers",
    language: "fr-FR",
    shape_format: "geojson",
    directions_options: { units: "kilometers" },
  };
  try {
    const response = await fetch(`${valhallaUrl}/route`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(options.timeoutMs ?? 3500),
    });
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
        };
      }
    }
  } catch { /* controlled fallback below */ }

  if (options.allowEstimatedShortConnector && directKm <= 0.15) {
    const duration = estimateWalkingDuration(directKm);
    return {
      distanceKm: Number(directKm.toFixed(3)),
      durationMinutes: duration.value,
      durationP90: duration.p90,
      coordinates: [],
      method: "estimated_short_connector",
      confidence: 0.22,
      guidanceAvailable: false,
    };
  }
  return null;
};
