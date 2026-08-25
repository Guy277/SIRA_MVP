export type Coordinate = [number, number];

export type TransportFeature = {
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

type LineMeta = {
  lineId: string;
  name: string;
  operator: string;
  network: string;
  mode: "sotra" | "gbaka" | "woro" | "boat";
};

type Edge = LineMeta & { to: string; distanceKm: number };
type Previous = { state: string; fromNode: string; edge: Edge; penaltyMinutes: number };

export type NetworkLeg = LineMeta & {
  distanceKm: number;
  durationMinutes: number;
  waitMinutes: number;
  price: number;
  coordinates: Coordinate[];
};

export type NetworkJourney = {
  access: { distanceKm: number; durationMinutes: number; coordinates: Coordinate[] };
  egress: { distanceKm: number; durationMinutes: number; coordinates: Coordinate[] };
  legs: NetworkLeg[];
  transferMinutes: number;
  distanceKm: number;
  durationMinutes: number;
  price: number;
  geometry: Coordinate[];
};

class MinHeap {
  private values: Array<[number, string]> = [];

  push(item: [number, string]) {
    this.values.push(item);
    let index = this.values.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.values[parent][0] <= item[0]) break;
      this.values[index] = this.values[parent];
      index = parent;
    }
    this.values[index] = item;
  }

  pop(): [number, string] | undefined {
    const first = this.values[0];
    const last = this.values.pop();
    if (!this.values.length || !last) return first;
    this.values[0] = last;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;
      if (left < this.values.length && this.values[left][0] < this.values[smallest][0]) smallest = left;
      if (right < this.values.length && this.values[right][0] < this.values[smallest][0]) smallest = right;
      if (smallest === index) break;
      [this.values[index], this.values[smallest]] = [this.values[smallest], this.values[index]];
      index = smallest;
    }
    return first;
  }

  get size() { return this.values.length; }
}

const keyOf = ([lon, lat]: Coordinate) => `${lon.toFixed(5)},${lat.toFixed(5)}`;
const stateOf = (node: string, lineId: string) => `${node}|${lineId}`;

const distanceKm = (a: Coordinate, b: Coordinate) => {
  const radians = (value: number) => value * Math.PI / 180;
  const dLat = radians(b[1] - a[1]);
  const dLon = radians(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a[1])) * Math.cos(radians(b[1])) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

const lineMode = (properties: NonNullable<TransportFeature["properties"]>): LineMeta["mode"] => {
  const value = `${properties.sira_mode ?? ""} ${properties.raw_mode ?? properties.mode ?? ""} ${properties.network ?? ""}`.toLowerCase();
  if (/ferry|bateau|monbato|aqualine|stl/.test(value)) return "boat";
  if (/gbaka/.test(value)) return "gbaka";
  if (/woro|wôrô/.test(value)) return "woro";
  return "sotra";
};

const speedKmH = (mode: LineMeta["mode"]) => mode === "boat" ? 24 : mode === "woro" ? 21 : mode === "gbaka" ? 19 : 18;
const waitMinutes = (mode: LineMeta["mode"]) => mode === "gbaka" || mode === "woro" ? 6 : mode === "boat" ? 12 : 9;
const fare = (mode: LineMeta["mode"], km: number) => {
  if (mode === "sotra") return 200;
  if (mode === "boat") return 500;
  if (mode === "woro") return Math.max(200, Math.round(km * 55 / 100) * 100);
  return Math.max(300, Math.round(km * 50 / 100) * 100);
};

export class TransportGraph {
  private readonly adjacency = new Map<string, Edge[]>();
  private readonly coordinates = new Map<string, Coordinate>();

  constructor(features: TransportFeature[]) {
    for (const feature of features) this.addFeature(feature);
  }

  get stats() {
    return { nodes: this.coordinates.size, directedEdges: Array.from(this.adjacency.values()).reduce((sum, edges) => sum + edges.length, 0) };
  }

  route(origin: { lat: number; lon: number }, destination: { lat: number; lon: number }, strategy: "balanced" | "cheap" = "balanced"): NetworkJourney | null {
    if (!this.coordinates.size) return null;
    const originCoordinate: Coordinate = [origin.lon, origin.lat];
    const destinationCoordinate: Coordinate = [destination.lon, destination.lat];
    const start = this.nearestNode(originCoordinate);
    const finish = this.nearestNode(destinationCoordinate);
    if (!start || !finish || start.distanceKm > 4 || finish.distanceKm > 4) return null;

    const startState = stateOf(start.key, "__start__");
    const distances = new Map<string, number>([[startState, 0]]);
    const previous = new Map<string, Previous>();
    const heap = new MinHeap();
    heap.push([0, startState]);
    let finishState: string | null = null;
    let explored = 0;

    while (heap.size && explored < 250_000) {
      const [currentDistance, currentState] = heap.pop()!;
      if (currentDistance !== distances.get(currentState)) continue;
      explored += 1;
      const separator = currentState.lastIndexOf("|");
      const currentNode = currentState.slice(0, separator);
      const currentLine = currentState.slice(separator + 1);
      if (currentNode === finish.key && currentLine !== "__start__") {
        finishState = currentState;
        break;
      }

      for (const edge of this.adjacency.get(currentNode) ?? []) {
        const changingLine = currentLine !== "__start__" && currentLine !== edge.lineId;
        const boardingPenalty = strategy === "cheap" && (currentLine === "__start__" || changingLine) ? fare(edge.mode, 5) / 100 * 2.5 : 0;
        const penalty = (currentLine === "__start__" ? waitMinutes(edge.mode) : changingLine ? waitMinutes(edge.mode) + 4 : 0) + boardingPenalty;
        const travelMinutes = edge.distanceKm / speedKmH(edge.mode) * 60;
        const nextDistance = currentDistance + travelMinutes + penalty;
        const nextState = stateOf(edge.to, edge.lineId);
        if (nextDistance < (distances.get(nextState) ?? Number.POSITIVE_INFINITY)) {
          distances.set(nextState, nextDistance);
          previous.set(nextState, { state: currentState, fromNode: currentNode, edge, penaltyMinutes: penalty });
          heap.push([nextDistance, nextState]);
        }
      }
    }

    if (!finishState) return null;
    const path: Previous[] = [];
    let current = finishState;
    while (current !== startState) {
      const step = previous.get(current);
      if (!step) return null;
      path.push(step);
      current = step.state;
    }
    path.reverse();

    const legs: NetworkLeg[] = [];
    for (const step of path) {
      const from = this.coordinates.get(step.fromNode)!;
      const to = this.coordinates.get(step.edge.to)!;
      const active = legs[legs.length - 1];
      if (!active || active.lineId !== step.edge.lineId) {
        legs.push({
          lineId: step.edge.lineId,
          name: step.edge.name,
          operator: step.edge.operator,
          network: step.edge.network,
          mode: step.edge.mode,
          distanceKm: step.edge.distanceKm,
          durationMinutes: step.edge.distanceKm / speedKmH(step.edge.mode) * 60,
          waitMinutes: waitMinutes(step.edge.mode),
          price: 0,
          coordinates: [from, to],
        });
      } else {
        active.distanceKm += step.edge.distanceKm;
        active.durationMinutes += step.edge.distanceKm / speedKmH(step.edge.mode) * 60;
        active.coordinates.push(to);
      }
    }

    for (const leg of legs) {
      leg.distanceKm = Number(leg.distanceKm.toFixed(2));
      leg.durationMinutes = Math.max(1, Math.round(leg.durationMinutes));
      leg.price = fare(leg.mode, leg.distanceKm);
    }

    const accessDuration = Math.max(1, Math.round(start.distanceKm / 4.5 * 60));
    const egressDuration = Math.max(1, Math.round(finish.distanceKm / 4.5 * 60));
    const transferMinutes = Math.max(0, legs.length - 1) * 4;
    const transitMinutes = legs.reduce((sum, leg) => sum + leg.durationMinutes + leg.waitMinutes, 0);
    return {
      access: { distanceKm: Number(start.distanceKm.toFixed(2)), durationMinutes: accessDuration, coordinates: [originCoordinate, this.coordinates.get(start.key)!] },
      egress: { distanceKm: Number(finish.distanceKm.toFixed(2)), durationMinutes: egressDuration, coordinates: [this.coordinates.get(finish.key)!, destinationCoordinate] },
      legs,
      transferMinutes,
      distanceKm: Number((start.distanceKm + finish.distanceKm + legs.reduce((sum, leg) => sum + leg.distanceKm, 0)).toFixed(2)),
      durationMinutes: accessDuration + egressDuration + transferMinutes + transitMinutes,
      price: legs.reduce((sum, leg) => sum + leg.price, 0),
      geometry: [originCoordinate, ...path.map((step) => this.coordinates.get(step.edge.to)!), destinationCoordinate],
    };
  }

  private addFeature(feature: TransportFeature) {
    if (!feature.geometry?.coordinates || !feature.properties) return;
    const properties = feature.properties;
    const meta: LineMeta = {
      lineId: properties.line_id ?? String(feature.id ?? properties.name ?? "unknown"),
      name: properties.name ?? "Ligne de transport",
      operator: properties.operator ?? "Opérateur non renseigné",
      network: properties.network ?? "Réseau non renseigné",
      mode: lineMode(properties),
    };
    const lines = feature.geometry.type === "MultiLineString" ? feature.geometry.coordinates : [feature.geometry.coordinates];
    for (const candidate of lines) {
      if (!Array.isArray(candidate)) continue;
      const line = candidate.filter((coordinate): coordinate is Coordinate => Array.isArray(coordinate) && coordinate.length >= 2 && Number.isFinite(coordinate[0]) && Number.isFinite(coordinate[1]));
      for (let index = 1; index < line.length; index += 1) this.addEdge(line[index - 1], line[index], meta);
    }
  }

  private addEdge(from: Coordinate, to: Coordinate, meta: LineMeta) {
    const fromKey = keyOf(from);
    const toKey = keyOf(to);
    if (fromKey === toKey) return;
    this.coordinates.set(fromKey, from);
    this.coordinates.set(toKey, to);
    if (!this.adjacency.has(fromKey)) this.adjacency.set(fromKey, []);
    if (!this.adjacency.has(toKey)) this.adjacency.set(toKey, []);
    const edgeDistance = distanceKm(from, to);
    this.adjacency.get(fromKey)!.push({ ...meta, to: toKey, distanceKm: edgeDistance });
    this.adjacency.get(toKey)!.push({ ...meta, to: fromKey, distanceKm: edgeDistance });
  }

  private nearestNode(target: Coordinate) {
    let nearest: { key: string; distanceKm: number } | null = null;
    for (const [key, coordinate] of this.coordinates) {
      const distance = distanceKm(target, coordinate);
      if (!nearest || distance < nearest.distanceKm) nearest = { key, distanceKm: distance };
    }
    return nearest;
  }
}
