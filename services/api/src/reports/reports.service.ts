import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";

export type ReportType = "accident" | "traffic" | "flood" | "works" | "blocked" | "road_damage" | "breakdown" | "transport" | "other";
export type ReportSeverity = "low" | "medium" | "high";
// Cahier des charges §12.3 : SIGNALÉ → CONFIRMÉ → FIABLE → EXPIRÉ / RÉSOLU
export type ReportStatus = "reported" | "confirmed" | "reliable" | "expired" | "resolved";

export type TrafficReport = {
  id: string;
  type: ReportType;
  title: string;
  description: string | null;
  location: string;
  lat: number;
  lon: number;
  severity: ReportSeverity;
  status: ReportStatus;
  confirmations: number;
  contests: number;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};

export type CreateReportInput = {
  type?: unknown; lat?: unknown; lon?: unknown; location?: unknown;
  description?: unknown; severity?: unknown; clientId?: unknown;
};

type ImpactLeg = { mode?: unknown; geometry?: unknown };
export type ReportImpact = {
  report: TrafficReport;
  distanceM: number;
  delayMinutes: number;
  blocking: boolean;
  legIndex: number;
};

// Delays are MVP priors, surfaced as estimates. Blocking events make the
// affected segment impassable instead of only slowing it down.
const REPORT_TYPES: Record<ReportType, { title: string; ttlMinutes: number; delayMinutes: number; blocking: boolean; affectsWalking: boolean; severity: ReportSeverity }> = {
  accident: { title: "Accident", ttlMinutes: 90, delayMinutes: 15, blocking: false, affectsWalking: false, severity: "high" },
  traffic: { title: "Embouteillage", ttlMinutes: 45, delayMinutes: 10, blocking: false, affectsWalking: false, severity: "medium" },
  flood: { title: "Route inondée", ttlMinutes: 240, delayMinutes: 25, blocking: true, affectsWalking: true, severity: "high" },
  works: { title: "Travaux", ttlMinutes: 7 * 24 * 60, delayMinutes: 8, blocking: false, affectsWalking: false, severity: "medium" },
  blocked: { title: "Route bloquée", ttlMinutes: 360, delayMinutes: 0, blocking: true, affectsWalking: true, severity: "high" },
  road_damage: { title: "Route dégradée", ttlMinutes: 3 * 24 * 60, delayMinutes: 6, blocking: false, affectsWalking: false, severity: "medium" },
  breakdown: { title: "Véhicule en panne", ttlMinutes: 60, delayMinutes: 8, blocking: false, affectsWalking: false, severity: "medium" },
  transport: { title: "Problème de transport", ttlMinutes: 60, delayMinutes: 12, blocking: false, affectsWalking: false, severity: "medium" },
  other: { title: "Autre événement", ttlMinutes: 60, delayMinutes: 5, blocking: false, affectsWalking: false, severity: "low" },
};
const SEVERITY_FACTOR: Record<ReportSeverity, number> = { low: 0.5, medium: 1, high: 1.5 };
const ACTIVE_STATUSES: ReportStatus[] = ["reported", "confirmed", "reliable"];
// Only events confirmed by at least one other user may change a journey.
const ACTIONABLE_STATUSES: ReportStatus[] = ["confirmed", "reliable"];
const GRAND_ABIDJAN_BOUNDS = { minLat: 5.1, maxLat: 5.65, minLon: -4.35, maxLon: -3.7 };
const IMPACT_RADIUS_M = 150;
const MAX_REPORTS = 500;

const isReportType = (value: unknown): value is ReportType => typeof value === "string" && value in REPORT_TYPES;
const isSeverity = (value: unknown): value is ReportSeverity => value === "low" || value === "medium" || value === "high";

const distanceToSegmentM = (point: [number, number], a: [number, number], b: [number, number]) => {
  // Equirectangular projection is accurate enough at city scale.
  const metersPerDegLat = 111_320;
  const metersPerDegLon = 111_320 * Math.cos(point[1] * Math.PI / 180);
  const ax = (a[0] - point[0]) * metersPerDegLon; const ay = (a[1] - point[1]) * metersPerDegLat;
  const bx = (b[0] - point[0]) * metersPerDegLon; const by = (b[1] - point[1]) * metersPerDegLat;
  const dx = bx - ax; const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared));
  return Math.hypot(ax + t * dx, ay + t * dy);
};

export const distanceToLineM = (point: [number, number], line: [number, number][]) => {
  if (line.length === 1) return distanceToSegmentM(point, line[0], line[0]);
  let best = Number.POSITIVE_INFINITY;
  for (let index = 1; index < line.length; index += 1) best = Math.min(best, distanceToSegmentM(point, line[index - 1], line[index]));
  return best;
};

const toCoordinates = (value: unknown): [number, number][] => Array.isArray(value)
  ? value.filter((item): item is [number, number] => Array.isArray(item) && item.length >= 2 && Number.isFinite(item[0]) && Number.isFinite(item[1]))
  : [];

@Injectable()
export class ReportsService {
  private readonly reports: TrafficReport[] = [];
  private readonly voters = new Map<string, Set<string>>();

  list() {
    return this.reports.map((report) => this.refresh(report)).filter((report) => ACTIVE_STATUSES.includes(report.status)).slice(0, 100);
  }

  add(input: CreateReportInput) {
    if (!isReportType(input.type)) throw new BadRequestException("Type de signalement inconnu.");
    const lat = Number(input.lat); const lon = Number(input.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < GRAND_ABIDJAN_BOUNDS.minLat || lat > GRAND_ABIDJAN_BOUNDS.maxLat || lon < GRAND_ABIDJAN_BOUNDS.minLon || lon > GRAND_ABIDJAN_BOUNDS.maxLon) {
      throw new BadRequestException("La position du signalement doit se trouver dans le Grand Abidjan.");
    }
    const clientId = this.clientId(input.clientId);
    const description = typeof input.description === "string" && input.description.trim() ? input.description.trim().slice(0, 280) : null;
    const location = typeof input.location === "string" && input.location.trim() ? input.location.trim().slice(0, 120) : `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    const meta = REPORT_TYPES[input.type];
    const now = new Date();
    const report: TrafficReport = {
      id: crypto.randomUUID(), type: input.type, title: meta.title, description, location, lat, lon,
      severity: isSeverity(input.severity) ? input.severity : meta.severity,
      status: "reported", confirmations: 0, contests: 0,
      createdAt: now.toISOString(), updatedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + meta.ttlMinutes * 60_000).toISOString(),
    };
    this.reports.unshift(report);
    // The author cannot confirm their own report.
    this.voters.set(report.id, new Set([clientId]));
    if (this.reports.length > MAX_REPORTS) this.voters.delete(this.reports.pop()!.id);
    return report;
  }

  vote(id: string, rawClientId: unknown, kind: "confirm" | "contest") {
    const report = this.reports.find((item) => item.id === id);
    if (!report || !ACTIVE_STATUSES.includes(this.refresh(report).status)) throw new NotFoundException("Signalement introuvable ou expiré.");
    const clientId = this.clientId(rawClientId);
    const voters = this.voters.get(id) ?? new Set<string>();
    if (voters.has(clientId)) throw new BadRequestException("Vous avez déjà donné votre avis sur ce signalement.");
    voters.add(clientId); this.voters.set(id, voters);
    const now = Date.now();
    if (kind === "confirm") {
      report.confirmations += 1;
      // A fresh confirmation keeps the event alive for at least half its lifetime.
      const extended = now + REPORT_TYPES[report.type].ttlMinutes * 30_000;
      if (extended > Date.parse(report.expiresAt)) report.expiresAt = new Date(extended).toISOString();
    } else {
      report.contests += 1;
    }
    report.updatedAt = new Date(now).toISOString();
    return this.refresh(report);
  }

  impact(legs: ImpactLeg[]) {
    const actionable = this.list().filter((report) => ACTIONABLE_STATUSES.includes(report.status));
    const pending = this.list().filter((report) => report.status === "reported");
    const match = (candidates: TrafficReport[]) => {
      const impacts: ReportImpact[] = [];
      for (const report of candidates) {
        const meta = REPORT_TYPES[report.type];
        let nearest: { distanceM: number; legIndex: number } | null = null;
        legs.forEach((leg, legIndex) => {
          if (leg.mode === "wait") return;
          if (!meta.affectsWalking && (leg.mode === "walk" || leg.mode === "transfer")) return;
          const geometry = toCoordinates(leg.geometry);
          if (!geometry.length) return;
          const distanceM = distanceToLineM([report.lon, report.lat], geometry);
          if (distanceM <= IMPACT_RADIUS_M && (!nearest || distanceM < nearest.distanceM)) nearest = { distanceM, legIndex };
        });
        if (!nearest) continue;
        const { distanceM, legIndex } = nearest;
        impacts.push({ report, distanceM: Math.round(distanceM), legIndex, blocking: meta.blocking, delayMinutes: Math.round(meta.delayMinutes * SEVERITY_FACTOR[report.severity]) });
      }
      return impacts.sort((left, right) => left.legIndex - right.legIndex);
    };
    const affected = match(actionable);
    return {
      affected,
      unconfirmed: match(pending),
      delayMinutes: affected.reduce((sum, item) => sum + item.delayMinutes, 0),
      blocking: affected.some((item) => item.blocking),
      requiresReroute: affected.length > 0,
      radiusM: IMPACT_RADIUS_M,
      method: "community_reports_mode_delay_prior",
    };
  }

  private refresh(report: TrafficReport) {
    if (report.status === "expired" || report.status === "resolved") return report;
    const net = report.confirmations - report.contests;
    if (Date.now() >= Date.parse(report.expiresAt)) report.status = "expired";
    else if (report.contests >= report.confirmations + 2) report.status = "resolved";
    else if (net >= 2) report.status = "reliable";
    else if (net >= 1) report.status = "confirmed";
    else report.status = "reported";
    return report;
  }

  private clientId(value: unknown) {
    if (typeof value !== "string" || !/^[A-Za-z0-9_-]{8,64}$/.test(value)) throw new BadRequestException("Identifiant client manquant ou invalide.");
    return value;
  }
}
