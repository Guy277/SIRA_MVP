// Named stops of the 2021 network (GTFS Jungle Bus, data/processed/transport-network-unified.json):
// 3 820 stops, each line with its stops in order. They say to the traveller where to
// get on, where to get off, what the vehicle shows, and give landmarks for walking
// (« Carrefour Kouté », « Bel Air - Station Shell »): streets of Abidjan often have no name.
import { existsSync, readFileSync } from "node:fs";
import type { Coordinate } from "./transport-graph";

export type StopRef = { id: string; name: string; distance_m: number };
// on_line: a stop of the line itself (« Monte à … »); otherwise only a nearby landmark (« Monte vers … »).
export type RideStop = StopRef & { on_line: boolean };

export type RideStops = {
  board: RideStop | null;
  alight: RideStop | null;
  // A few stops passed on the way, to know where you are.
  via: string[];
  // The stop just before getting off: « get ready ».
  before_alight: string | null;
  // What the vehicle shows (the end of the line in the direction travelled).
  headsign: string | null;
  stop_count: number | null;
  // Every stop from boarding to alighting, in order, with where it is: during the trip
  // SIRA says « Tu viens de passer Gare Nord, encore 6 arrêts ».
  stops: Array<{ name: string; lon: number; lat: number }>;
};

type Stop = { id: string; name: string; lon: number; lat: number };
type Trip = { headsign: string | null; stops: Stop[] };
type UnifiedNetwork = {
  stops?: Array<{ id: string; name: string | null; latitude: number; longitude: number }>;
  trips?: Array<{ route_id: string; trip_id: string; trip_headsign?: string | null }>;
  stop_times?: Array<{ trip_id: string; stop_id: string; stop_sequence: string | number }>;
};

// A stop of the line farther than this from where the ride starts or ends is not « the » stop
// (the two directions often stop on opposite sides, a few hundred metres apart).
const RIDE_STOP_MAX_M = 400;
// Otherwise a landmark this close is given (« vers … »): gbakas often change in the middle of a road.
const LANDMARK_MAX_M = 200;
const VIA_MAX = 3;
const CELL_DEG = 0.003;  // ≈ 330 m

const metres = (lon1: number, lat1: number, lon2: number, lat2: number) => {
  const cosLat = Math.cos(((lat1 + lat2) / 2) * Math.PI / 180);
  return 111_320 * Math.hypot(lat2 - lat1, (lon2 - lon1) * cosLat);
};
const cellOf = (lon: number, lat: number) => `${Math.floor(lon / CELL_DEG)}:${Math.floor(lat / CELL_DEG)}`;
// « Line:relation:5985016 » (lines) ↔ « r5985016 » (GTFS routes).
const routeKey = (lineId: string) => {
  const digits = /(\d+)$/.exec(lineId)?.[1];
  return digits ? `r${digits}` : lineId;
};

export class StopIndex {
  private readonly tripsByRoute = new Map<string, Trip[]>();
  private readonly grid = new Map<string, Stop[]>();

  static load(path: string): StopIndex | null {
    if (!existsSync(path)) return null;
    try {
      return new StopIndex(JSON.parse(readFileSync(path, "utf8")) as UnifiedNetwork);
    } catch {
      return null;
    }
  }

  constructor(data: UnifiedNetwork) {
    const stops = new Map<string, Stop>();
    for (const raw of data.stops ?? []) {
      const name = raw.name?.trim();
      if (!name || !Number.isFinite(raw.latitude) || !Number.isFinite(raw.longitude)) continue;
      const stop = { id: raw.id, name, lon: raw.longitude, lat: raw.latitude };
      stops.set(stop.id, stop);
      const cell = cellOf(stop.lon, stop.lat);
      const list = this.grid.get(cell);
      if (list) list.push(stop); else this.grid.set(cell, [stop]);
    }
    const timesByTrip = new Map<string, Array<{ stop: Stop; sequence: number }>>();
    for (const time of data.stop_times ?? []) {
      const stop = stops.get(time.stop_id);
      if (!stop) continue;
      const list = timesByTrip.get(time.trip_id) ?? [];
      list.push({ stop, sequence: Number(time.stop_sequence) });
      timesByTrip.set(time.trip_id, list);
    }
    for (const trip of data.trips ?? []) {
      const times = timesByTrip.get(trip.trip_id);
      if (!times || times.length < 2) continue;
      const ordered = times.sort((a, b) => a.sequence - b.sequence).map((entry) => entry.stop);
      const list = this.tripsByRoute.get(trip.route_id) ?? [];
      list.push({ headsign: trip.trip_headsign?.trim() || null, stops: ordered });
      this.tripsByRoute.set(trip.route_id, list);
    }
  }

  get size() { return this.grid.size; }

  // Nearest named stop, as a landmark (« au niveau de … »).
  nearest([lon, lat]: Coordinate, maxM: number): StopRef | null {
    const cx = Math.floor(lon / CELL_DEG);
    const cy = Math.floor(lat / CELL_DEG);
    const reach = Math.max(1, Math.ceil(maxM / 330));
    let best: StopRef | null = null;
    for (let dx = -reach; dx <= reach; dx += 1) {
      for (let dy = -reach; dy <= reach; dy += 1) {
        for (const stop of this.grid.get(`${cx + dx}:${cy + dy}`) ?? []) {
          const distance = metres(lon, lat, stop.lon, stop.lat);
          if (distance <= maxM && (!best || distance < best.distance_m)) best = { id: stop.id, name: stop.name, distance_m: Math.round(distance) };
        }
      }
    }
    return best;
  }

  // Where to get on and off a line, from the stretch ridden on it. The direction of
  // travel is the trip (way out or way back) where the boarding stop comes first.
  describeRide(lineId: string, coordinates: Coordinate[]): RideStops | null {
    if (coordinates.length < 2) return null;
    const start = coordinates[0];
    const end = coordinates[coordinates.length - 1];
    let best: { trip: Trip; board: number; alight: number; boardM: number; alightM: number } | null = null;
    for (const trip of this.tripsByRoute.get(routeKey(lineId)) ?? []) {
      const boardDistances = trip.stops.map((stop) => metres(start[0], start[1], stop.lon, stop.lat));
      const alightDistances = trip.stops.map((stop) => metres(end[0], end[1], stop.lon, stop.lat));
      let boardIndex = -1;
      for (let alight = 1; alight < trip.stops.length; alight += 1) {
        const candidate = alight - 1;
        if (boardIndex < 0 || boardDistances[candidate] < boardDistances[boardIndex]) boardIndex = candidate;
        const boardM = boardDistances[boardIndex];
        const alightM = alightDistances[alight];
        if (!best || boardM + alightM < best.boardM + best.alightM) best = { trip, board: boardIndex, alight, boardM, alightM };
      }
    }
    const ref = (stop: Stop, distance: number, onLine: boolean): RideStop => ({ id: stop.id, name: stop.name, distance_m: Math.round(distance), on_line: onLine });
    const landmark = (point: Coordinate): RideStop | null => {
      const near = this.nearest(point, LANDMARK_MAX_M);
      return near ? { ...near, on_line: false } : null;
    };
    const boardOk = best !== null && best.boardM <= RIDE_STOP_MAX_M;
    const alightOk = best !== null && best.alightM <= RIDE_STOP_MAX_M;
    const board = best && boardOk ? ref(best.trip.stops[best.board], best.boardM, true) : landmark(start);
    const alight = best && alightOk ? ref(best.trip.stops[best.alight], best.alightM, true) : landmark(end);
    if (!best || (!boardOk && !alightOk)) {
      return board || alight ? { board, alight, via: [], before_alight: null, headsign: null, stop_count: null, stops: [] } : null;
    }
    const { trip } = best;
    // Stops passed and « get ready » only when both ends are stops of the line.
    let via: string[] = [];
    let before: string | null = null;
    let count: number | null = null;
    let passed: RideStops["stops"] = [];
    if (boardOk && alightOk) {
      passed = trip.stops.slice(best.board, best.alight + 1).map((stop) => ({ name: stop.name, lon: stop.lon, lat: stop.lat }));
      const ends = new Set([trip.stops[best.board].name, trip.stops[best.alight].name]);
      const names = [...new Set(trip.stops.slice(best.board + 1, best.alight).map((stop) => stop.name))].filter((name) => !ends.has(name));
      const step = names.length / VIA_MAX;
      via = names.length <= VIA_MAX ? names : Array.from({ length: VIA_MAX }, (_, index) => names[Math.floor(index * step + step / 2)]);
      const previous = best.alight - 1 > best.board ? trip.stops[best.alight - 1].name : null;
      before = previous && !ends.has(previous) ? previous : null;
      count = best.alight - best.board;
    }
    return { board, alight, via, before_alight: before, headsign: trip.headsign, stop_count: count, stops: passed };
  }
}
