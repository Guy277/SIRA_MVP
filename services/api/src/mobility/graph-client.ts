import { join } from "node:path";
import { Worker } from "node:worker_threads";
import type { AvoidArea, NetworkJourney } from "./transport-graph";
import type { GraphRouteMessage } from "./graph-worker";

type RouteOptions = Omit<GraphRouteMessage["options"], "serviceDate"> & { serviceDate: Date };

// Main-thread side of graph-worker: one worker, requests matched by id.
export class GraphWorkerClient {
  stats: Record<string, unknown> = {};
  private readonly worker: Worker;
  private readonly ready: Promise<void>;
  private readonly pending = new Map<number, { resolve: (value: NetworkJourney | null) => void; reject: (error: Error) => void }>();
  private nextId = 1;

  constructor(datasetPath: string, warmRadiusKm: number) {
    this.worker = new Worker(join(__dirname, "graph-worker.js"), { workerData: { datasetPath, warmRadiusKm } });
    // The HTTP server keeps the process alive; the worker alone must not.
    this.worker.unref();
    this.ready = new Promise((resolve, reject) => {
      this.worker.on("message", (message: { ready?: boolean; id?: number; result?: NetworkJourney | null; error?: string; stats?: Record<string, unknown> }) => {
        if (message.stats) this.stats = message.stats;
        if (message.ready) { resolve(); return; }
        const task = message.id === undefined ? undefined : this.pending.get(message.id);
        if (!task) return;
        this.pending.delete(message.id!);
        if (message.error) task.reject(new Error(message.error));
        else task.resolve(message.result ?? null);
      });
      const fail = (error: Error) => {
        reject(error);
        for (const task of this.pending.values()) task.reject(error);
        this.pending.clear();
      };
      this.worker.on("error", fail);
      this.worker.on("exit", (code) => { if (code !== 0) fail(new Error(`Le calcul d'itinéraires s'est arrêté (code ${code}).`)); });
    });
  }

  close() {
    return this.worker.terminate();
  }

  async route(origin: { lat: number; lon: number }, destination: { lat: number; lon: number }, strategy: GraphRouteMessage["strategy"], options: RouteOptions & { avoidAreas?: AvoidArea[] }) {
    await this.ready;
    const id = this.nextId++;
    return new Promise<NetworkJourney | null>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, origin, destination, strategy, options: { ...options, serviceDate: options.serviceDate.toISOString() } } satisfies GraphRouteMessage);
    });
  }
}
