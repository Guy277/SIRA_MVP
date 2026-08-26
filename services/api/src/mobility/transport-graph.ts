import { estimateFare, estimateWait, estimateWalkingDuration, isServiceOpen, rideMinutesRaw, type SiraTransportMode } from "./estimators";

export type Coordinate = [number, number];

export type TransportFeature = {
  id?: string;
  properties?: {
    line_id?: string; code?: string; name?: string; operator?: string; network?: string;
    mode?: string; raw_mode?: string; sira_mode?: string; colour?: string;
    frequency?: string; frequency_exceptions?: string; opening_hours?: string;
    frequency_raw?: string; opening_hours_raw?: string; freshness_status?: string;
    validation_status?: string; confidence_score?: number;
  };
  geometry?: { type?: string; coordinates?: unknown[] };
};

type LineMeta = {
  lineId: string; name: string; operator: string; network: string; mode: SiraTransportMode;
  frequency?: string; frequencyExceptions?: string; openingHours?: string; sourceConfidence: number;
};
type Edge = LineMeta & { to: string; distanceKm: number };
type RidePrevious = { kind: "ride"; state: string; fromNode: string; edge: Edge };
type WalkPrevious = { kind: "walk"; state: string; fromNode: string; toNode: string; distanceKm: number; durationMinutes: number };
type Previous = RidePrevious | WalkPrevious;

export type NetworkLeg = LineMeta & {
  distanceKm: number; durationMinutes: number; durationP90: number; durationMethod: string;
  waitMinutes: number; waitP90: number; waitMethod: string; waitConfidence: number;
  price: number; priceP90: number; priceMethod: string; priceConfidence: number;
  coordinates: Coordinate[];
};
export type NetworkTransfer = {
  afterLegIndex: number; from: Coordinate; to: Coordinate; distanceKm: number;
  durationMinutes: number; interchangeBufferMinutes: number;
};
export type NetworkJourney = {
  access: { distanceKm: number; durationMinutes: number; coordinates: Coordinate[] };
  egress: { distanceKm: number; durationMinutes: number; coordinates: Coordinate[] };
  legs: NetworkLeg[]; transfers: NetworkTransfer[]; transferMinutes: number;
  distanceKm: number; durationMinutes: number; durationP90: number; price: number; priceP90: number;
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
      this.values[index] = this.values[parent]; index = parent;
    }
    this.values[index] = item;
  }
  pop(): [number, string] | undefined {
    const first = this.values[0]; const last = this.values.pop();
    if (!this.values.length || !last) return first;
    this.values[0] = last;
    let index = 0;
    while (true) {
      const left = index * 2 + 1; const right = left + 1; let smallest = index;
      if (left < this.values.length && this.values[left][0] < this.values[smallest][0]) smallest = left;
      if (right < this.values.length && this.values[right][0] < this.values[smallest][0]) smallest = right;
      if (smallest === index) break;
      [this.values[index], this.values[smallest]] = [this.values[smallest], this.values[index]]; index = smallest;
    }
    return first;
  }
  get size() { return this.values.length; }
}

const keyOf = ([lon, lat]: Coordinate) => `${lon.toFixed(5)},${lat.toFixed(5)}`;
const stateOf = (node: string, lineId: string, transfers: number) => `${node}|${lineId}|${transfers}`;
const splitState = (state: string) => {
  const transferSeparator = state.lastIndexOf("|");
  const lineSeparator = state.lastIndexOf("|", transferSeparator - 1);
  return { node: state.slice(0, lineSeparator), line: state.slice(lineSeparator + 1, transferSeparator), transfers: Number(state.slice(transferSeparator + 1)) };
};
export const distanceKm = (a: Coordinate, b: Coordinate) => {
  const radians = (value: number) => value * Math.PI / 180;
  const dLat = radians(b[1] - a[1]); const dLon = radians(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a[1])) * Math.cos(radians(b[1])) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};
const lineMode = (properties: NonNullable<TransportFeature["properties"]>): SiraTransportMode => {
  const value = `${properties.sira_mode ?? ""} ${properties.raw_mode ?? properties.mode ?? ""} ${properties.network ?? ""}`.toLowerCase();
  if (/ferry|bateau|monbato|aqualine|stl/.test(value)) return "boat";
  if (/gbaka/.test(value)) return "gbaka";
  if (/woro|wôrô/.test(value)) return "woro";
  return "sotra";
};

export class TransportGraph {
  private readonly adjacency = new Map<string, Edge[]>();
  private readonly coordinates = new Map<string, Coordinate>();
  private readonly nodeLines = new Map<string, Set<string>>();
  private readonly spatialGrid = new Map<string, string[]>();
  private readonly transferCache = new Map<string, Array<{ key: string; distanceKm: number }>>();
  private readonly gridDegrees = 0.003;

  constructor(features: TransportFeature[]) {
    for (const feature of features) this.addFeature(feature);
    for (const [key, coordinate] of this.coordinates) {
      const bucket = this.gridKey(coordinate);
      if (!this.spatialGrid.has(bucket)) this.spatialGrid.set(bucket, []);
      this.spatialGrid.get(bucket)!.push(key);
    }
  }

  get stats() {
    return { nodes: this.coordinates.size, directedEdges: Array.from(this.adjacency.values()).reduce((sum, edges) => sum + edges.length, 0), pedestrianTransferRadiusM: 350 };
  }

  route(origin: { lat: number; lon: number }, destination: { lat: number; lon: number }, strategy: "balanced" | "cheap" = "balanced", options: { maxAccessDistanceM?: number; maxTransferDistanceM?: number; maxTransfers?: number } = {}): NetworkJourney | null {
    if (!this.coordinates.size) return null;
    const originCoordinate: Coordinate = [origin.lon, origin.lat]; const destinationCoordinate: Coordinate = [destination.lon, destination.lat];
    const start = this.nearestNode(originCoordinate); const finish = this.nearestNode(destinationCoordinate);
    const maxAccessKm = (options.maxAccessDistanceM ?? 1500) / 1000;
    const maxTransferKm = Math.min(0.8, (options.maxTransferDistanceM ?? 350) / 1000);
    if (!start || !finish || start.distanceKm > maxAccessKm || finish.distanceKm > maxAccessKm) return null;

    const maxTransfers = options.maxTransfers ?? 3;
    const serviceDate = new Date();
    const startState = stateOf(start.key, "__start__", 0);
    const distances = new Map<string, number>([[startState, 0]]); const previous = new Map<string, Previous>(); const heap = new MinHeap(); const visited = new Set<string>();
    const heuristic = (nodeKey: string) => distanceKm(this.coordinates.get(nodeKey)!, destinationCoordinate) / 24 * 60;
    heap.push([heuristic(start.key), startState]); let finishState: string | null = null; let explored = 0;
    while (heap.size && explored < 180_000) {
      const [, currentState] = heap.pop()!;
      if (visited.has(currentState)) continue;
      const currentDistance = distances.get(currentState);
      if (currentDistance === undefined) continue;
      visited.add(currentState); explored += 1;
      const { node: currentNode, line: currentLine, transfers: currentTransfers } = splitState(currentState);
      if (currentNode === finish.key && !currentLine.startsWith("__")) { finishState = currentState; break; }
      for (const edge of this.adjacency.get(currentNode) ?? []) {
        if (!isServiceOpen(edge.openingHours, serviceDate)) continue;
        const boarding = currentLine === "__start__" || currentLine === "__walk__";
        const changingAtSameNode = !boarding && currentLine !== edge.lineId;
        const nextTransfers = currentTransfers + (changingAtSameNode ? 1 : 0);
        if (nextTransfers > maxTransfers) continue;
        const wait = boarding || changingAtSameNode ? estimateWait(edge.mode, edge.frequency, edge.frequencyExceptions, serviceDate).value : 0;
        const transferBuffer = changingAtSameNode ? 2 : 0;
        const pricePenalty = strategy === "cheap" && (boarding || changingAtSameNode) ? estimateFare(edge.mode, 5).value / 100 * 2.5 : 0;
        const nextDistance = currentDistance + rideMinutesRaw(edge.mode, edge.distanceKm) + wait + transferBuffer + pricePenalty;
        const nextState = stateOf(edge.to, edge.lineId, nextTransfers);
        if (nextDistance < (distances.get(nextState) ?? Number.POSITIVE_INFINITY)) {
          distances.set(nextState, nextDistance); previous.set(nextState, { kind: "ride", state: currentState, fromNode: currentNode, edge }); heap.push([nextDistance + heuristic(edge.to), nextState]);
        }
      }
      if (!currentLine.startsWith("__") && currentTransfers < maxTransfers) {
        for (const transfer of this.nearbyTransferNodes(currentNode, currentLine, maxTransferKm)) {
          const walking = estimateWalkingDuration(transfer.distanceKm); const nextDistance = currentDistance + walking.value + 2; const nextState = stateOf(transfer.key, "__walk__", currentTransfers + 1);
          if (nextDistance < (distances.get(nextState) ?? Number.POSITIVE_INFINITY)) {
            distances.set(nextState, nextDistance); previous.set(nextState, { kind: "walk", state: currentState, fromNode: currentNode, toNode: transfer.key, distanceKm: transfer.distanceKm, durationMinutes: walking.value }); heap.push([nextDistance + heuristic(transfer.key), nextState]);
          }
        }
      }
    }
    if (!finishState) return null;
    const path: Previous[] = []; let current = finishState;
    while (current !== startState) { const step = previous.get(current); if (!step) return null; path.push(step); current = step.state; }
    path.reverse();

    const legs: NetworkLeg[] = []; const transfers: NetworkTransfer[] = []; let pendingWalk: WalkPrevious | null = null;
    for (const step of path) {
      if (step.kind === "walk") { pendingWalk = step; continue; }
      const from = this.coordinates.get(step.fromNode)!; const to = this.coordinates.get(step.edge.to)!; const active = legs[legs.length - 1];
      if (!active || active.lineId !== step.edge.lineId) {
        if (active) {
          transfers.push({ afterLegIndex: legs.length - 1, from: pendingWalk ? this.coordinates.get(pendingWalk.fromNode)! : from, to: pendingWalk ? this.coordinates.get(pendingWalk.toNode)! : from, distanceKm: pendingWalk?.distanceKm ?? 0, durationMinutes: pendingWalk?.durationMinutes ?? 0, interchangeBufferMinutes: 2 });
        }
        const wait = estimateWait(step.edge.mode, step.edge.frequency, step.edge.frequencyExceptions, serviceDate); const rawRide = rideMinutesRaw(step.edge.mode, step.edge.distanceKm);
        legs.push({ ...step.edge, distanceKm: step.edge.distanceKm, durationMinutes: rawRide, durationP90: rawRide * 1.35, durationMethod: "mode_speed_prior", waitMinutes: wait.value, waitP90: wait.p90, waitMethod: wait.method, waitConfidence: wait.confidence, price: 0, priceP90: 0, priceMethod: "historical_mode_fare_prior", priceConfidence: 0, coordinates: [from, to] });
        pendingWalk = null;
      } else {
        const rawRide = rideMinutesRaw(step.edge.mode, step.edge.distanceKm);
        active.distanceKm += step.edge.distanceKm; active.durationMinutes += rawRide; active.durationP90 += rawRide * 1.35; active.coordinates.push(to);
      }
    }
    for (const leg of legs) {
      leg.distanceKm = Number(leg.distanceKm.toFixed(2)); const price = estimateFare(leg.mode, leg.distanceKm);
      leg.durationMinutes = Math.max(1, Math.round(leg.durationMinutes));
      leg.durationP90 = Math.max(2, Math.round(leg.durationP90));
      leg.price = price.value; leg.priceP90 = price.p90; leg.priceMethod = price.method; leg.priceConfidence = price.confidence;
    }

    const accessWalk = estimateWalkingDuration(start.distanceKm); const egressWalk = estimateWalkingDuration(finish.distanceKm);
    const transferMinutes = transfers.reduce((sum, transfer) => sum + transfer.durationMinutes + transfer.interchangeBufferMinutes, 0);
    const transferP90 = transfers.reduce((sum, transfer) => sum + estimateWalkingDuration(transfer.distanceKm).p90 + transfer.interchangeBufferMinutes, 0);
    const transitMinutes = legs.reduce((sum, leg) => sum + leg.durationMinutes + leg.waitMinutes, 0);
    const transitP90 = legs.reduce((sum, leg) => sum + leg.durationP90 + leg.waitP90, 0);
    const rideGeometry = legs.flatMap((leg, index) => index === 0 ? leg.coordinates : leg.coordinates.slice(1));
    return {
      access: { distanceKm: Number(start.distanceKm.toFixed(3)), durationMinutes: accessWalk.value, coordinates: [originCoordinate, this.coordinates.get(start.key)!] },
      egress: { distanceKm: Number(finish.distanceKm.toFixed(3)), durationMinutes: egressWalk.value, coordinates: [this.coordinates.get(finish.key)!, destinationCoordinate] },
      legs, transfers, transferMinutes,
      distanceKm: Number((start.distanceKm + finish.distanceKm + legs.reduce((sum, leg) => sum + leg.distanceKm, 0) + transfers.reduce((sum, transfer) => sum + transfer.distanceKm, 0)).toFixed(2)),
      durationMinutes: accessWalk.value + egressWalk.value + transferMinutes + transitMinutes,
      durationP90: accessWalk.p90 + egressWalk.p90 + transferP90 + transitP90,
      price: legs.reduce((sum, leg) => sum + leg.price, 0), priceP90: legs.reduce((sum, leg) => sum + leg.priceP90, 0), geometry: rideGeometry,
    };
  }

  private addFeature(feature: TransportFeature) {
    if (!feature.geometry?.coordinates || !feature.properties) return;
    const properties = feature.properties;
    const meta: LineMeta = { lineId: properties.line_id ?? String(feature.id ?? properties.name ?? "unknown"), name: properties.name ?? "Ligne de transport", operator: properties.operator ?? "Opérateur non renseigné", network: properties.network ?? "Réseau non renseigné", mode: lineMode(properties), frequency: properties.frequency ?? properties.frequency_raw, frequencyExceptions: properties.frequency_exceptions, openingHours: properties.opening_hours ?? properties.opening_hours_raw, sourceConfidence: properties.confidence_score ?? 0.5 };
    const lines = feature.geometry.type === "MultiLineString" ? feature.geometry.coordinates : [feature.geometry.coordinates];
    for (const candidate of lines) {
      if (!Array.isArray(candidate)) continue;
      const line = candidate.filter((coordinate): coordinate is Coordinate => Array.isArray(coordinate) && coordinate.length >= 2 && Number.isFinite(coordinate[0]) && Number.isFinite(coordinate[1]));
      for (let index = 1; index < line.length; index += 1) this.addEdge(line[index - 1], line[index], meta);
    }
  }
  private addEdge(from: Coordinate, to: Coordinate, meta: LineMeta) {
    const fromKey = keyOf(from); const toKey = keyOf(to); if (fromKey === toKey) return;
    this.coordinates.set(fromKey, from); this.coordinates.set(toKey, to);
    if (!this.adjacency.has(fromKey)) this.adjacency.set(fromKey, []); if (!this.adjacency.has(toKey)) this.adjacency.set(toKey, []);
    if (!this.nodeLines.has(fromKey)) this.nodeLines.set(fromKey, new Set()); if (!this.nodeLines.has(toKey)) this.nodeLines.set(toKey, new Set());
    this.nodeLines.get(fromKey)!.add(meta.lineId); this.nodeLines.get(toKey)!.add(meta.lineId);
    const edgeDistance = distanceKm(from, to);
    this.adjacency.get(fromKey)!.push({ ...meta, to: toKey, distanceKm: edgeDistance }); this.adjacency.get(toKey)!.push({ ...meta, to: fromKey, distanceKm: edgeDistance });
  }
  private gridKey([lon, lat]: Coordinate) { return `${Math.floor(lon / this.gridDegrees)},${Math.floor(lat / this.gridDegrees)}`; }
  private nearbyTransferNodes(nodeKey: string, currentLine: string, radiusKm: number) {
    const cacheKey = `${nodeKey}|${currentLine}|${radiusKm.toFixed(3)}`; const cached = this.transferCache.get(cacheKey); if (cached) return cached;
    const coordinate = this.coordinates.get(nodeKey)!; const [cellLon, cellLat] = this.gridKey(coordinate).split(",").map(Number); const candidates: Array<{ key: string; distanceKm: number }> = [];
    for (let lonOffset = -2; lonOffset <= 2; lonOffset += 1) for (let latOffset = -2; latOffset <= 2; latOffset += 1) {
      for (const candidateKey of this.spatialGrid.get(`${cellLon + lonOffset},${cellLat + latOffset}`) ?? []) {
        if (candidateKey === nodeKey || this.nodeLines.get(candidateKey)?.has(currentLine)) continue;
        const candidateDistance = distanceKm(coordinate, this.coordinates.get(candidateKey)!);
        if (candidateDistance > 0.005 && candidateDistance <= radiusKm) candidates.push({ key: candidateKey, distanceKm: candidateDistance });
      }
    }
    candidates.sort((left, right) => left.distanceKm - right.distanceKm); const result = candidates.slice(0, 3); this.transferCache.set(cacheKey, result); return result;
  }
  private nearestNode(target: Coordinate) {
    let nearest: { key: string; distanceKm: number } | null = null;
    for (const [key, coordinate] of this.coordinates) { const distance = distanceKm(target, coordinate); if (!nearest || distance < nearest.distanceKm) nearest = { key, distanceKm: distance }; }
    return nearest;
  }
}
