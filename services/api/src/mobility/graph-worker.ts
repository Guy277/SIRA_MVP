// Runs the transport graph A* off the API's event loop: a search takes
// seconds of CPU and would otherwise delay every other request in flight.
import { readFileSync } from "node:fs";
import { parentPort, workerData } from "node:worker_threads";
import { TransportGraph, type AvoidArea } from "./transport-graph";

export type GraphRouteMessage = {
  id: number;
  origin: { lat: number; lon: number };
  destination: { lat: number; lon: number };
  strategy: "fast" | "balanced" | "cheap" | "min_transfers" | "min_walking";
  options: { maxAccessDistanceM?: number; maxTransferDistanceM?: number; maxTransfers?: number; serviceDate: string; avoidAreas?: AvoidArea[] };
};

const { datasetPath, warmRadiusKm } = workerData as { datasetPath: string; warmRadiusKm: number };
const graph = new TransportGraph(JSON.parse(readFileSync(datasetPath, "utf8")).features);
graph.warmUp(warmRadiusKm);
parentPort!.postMessage({ ready: true, stats: graph.stats });

parentPort!.on("message", ({ id, origin, destination, strategy, options }: GraphRouteMessage) => {
  try {
    const result = graph.route(origin, destination, strategy, { ...options, serviceDate: new Date(options.serviceDate) });
    parentPort!.postMessage({ id, result, stats: graph.stats });
  } catch (error) {
    parentPort!.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
});
