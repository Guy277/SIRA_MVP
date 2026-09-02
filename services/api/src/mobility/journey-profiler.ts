import { performance } from "node:perf_hooks";

export type JourneyTiming = { component: string; calls: number; total_ms: number; average_ms: number };

export class JourneyProfiler {
  private readonly startedAt = performance.now();
  private readonly samples = new Map<string, number[]>();

  constructor(private readonly enabled: boolean) {}

  record(component: string, durationMs: number) {
    if (!this.enabled) return;
    const samples = this.samples.get(component) ?? [];
    samples.push(durationMs);
    this.samples.set(component, samples);
  }

  measure<T>(component: string, operation: () => T): T {
    const startedAt = performance.now();
    try { return operation(); } finally { this.record(component, performance.now() - startedAt); }
  }

  async measureAsync<T>(component: string, operation: () => Promise<T>): Promise<T> {
    const startedAt = performance.now();
    try { return await operation(); } finally { this.record(component, performance.now() - startedAt); }
  }

  snapshot() {
    const components: JourneyTiming[] = Array.from(this.samples, ([component, samples]) => {
      const total = samples.reduce((sum, sample) => sum + sample, 0);
      return { component, calls: samples.length, total_ms: Number(total.toFixed(1)), average_ms: Number((total / samples.length).toFixed(1)) };
    }).sort((left, right) => right.total_ms - left.total_ms);
    return { total_ms: Number((performance.now() - this.startedAt).toFixed(1)), components };
  }
}
