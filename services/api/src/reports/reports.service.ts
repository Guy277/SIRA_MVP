import { Injectable } from "@nestjs/common";

export type TrafficReport = { id: string; type: string; title: string; location: string; lat: number; lon: number; severity: "low" | "medium" | "high"; createdAt: string };

@Injectable()
export class ReportsService {
  private readonly reports: TrafficReport[] = [
    { id: "demo-1", type: "traffic", title: "Trafic dense", location: "Pont HKB", lat: 5.326, lon: -4.003, severity: "medium", createdAt: new Date().toISOString() },
  ];
  list() { return this.reports.slice(0, 50); }
  add(report: Omit<TrafficReport, "id" | "createdAt">) {
    const value = { ...report, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    this.reports.unshift(value); return value;
  }
}
