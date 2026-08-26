export type SiraTransportMode = "sotra" | "gbaka" | "woro" | "boat";

export type Estimate = {
  value: number;
  p50: number;
  p90: number;
  method: string;
  confidence: number;
};

const MODE_PRIORS: Record<SiraTransportMode, { speedKmH: number; headwayMinutes: number; fareBase: number }> = {
  sotra: { speedKmH: 18, headwayMinutes: 18, fareBase: 200 },
  gbaka: { speedKmH: 19, headwayMinutes: 12, fareBase: 300 },
  woro: { speedKmH: 21, headwayMinutes: 12, fareBase: 200 },
  boat: { speedKmH: 24, headwayMinutes: 24, fareBase: 500 },
};

export const rideMinutesRaw = (mode: SiraTransportMode, distanceKm: number) => distanceKm / MODE_PRIORS[mode].speedKmH * 60;

export const WALKING_SPEEDS_KMH = {
  accessibility: 3.6,
  standard: 4.5,
  fast: 5.1,
} as const;

export const parseHeadwayMinutes = (raw?: string | number | null): number | null => {
  if (raw === null || raw === undefined) return null;
  const value = String(raw).trim();
  if (!value) return null;
  const clock = value.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (clock) {
    const minutes = Number(clock[1]) * 60 + Number(clock[2]);
    return minutes > 0 && minutes <= 240 ? minutes : null;
  }
  const minutes = Number(value.replace(",", "."));
  return Number.isFinite(minutes) && minutes > 0 && minutes <= 240 ? minutes : null;
};

const minutesOfDay = (date: Date) => date.getUTCHours() * 60 + date.getUTCMinutes();
const parseClock = (value: string) => {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
};
const withinTimeRange = (now: number, start: number, end: number) => end >= start ? now >= start && now <= end : now >= start || now <= end;

export const resolveHeadwayMinutes = (frequency?: string | number | null, exceptions?: string | null, date = new Date()) => {
  if (exceptions) {
    for (const clause of exceptions.split(";")) {
      const match = clause.match(/^\s*([\d:,\.]+)\s*@.*?(\d{1,2}:\d{2})-(\d{1,2}:\d{2})/);
      if (!match) continue;
      if (withinTimeRange(minutesOfDay(date), parseClock(match[2]), parseClock(match[3]))) {
        const headway = parseHeadwayMinutes(match[1]);
        if (headway) return { headway, method: "historical_timeband_headway" };
      }
    }
  }
  const headway = parseHeadwayMinutes(frequency);
  return headway ? { headway, method: "historical_published_headway" } : null;
};

export const isServiceOpen = (openingHours?: string | null, date = new Date()) => {
  if (!openingHours) return true;
  const ranges = [...openingHours.matchAll(/(\d{1,2}:\d{2})-(\d{1,2}:\d{2})/g)];
  if (!ranges.length) return true;
  const now = minutesOfDay(date);
  return ranges.some((range) => withinTimeRange(now, parseClock(range[1]), parseClock(range[2])));
};

export const estimateWait = (mode: SiraTransportMode, frequency?: string | number | null, exceptions?: string | null, date = new Date()): Estimate => {
  const published = resolveHeadwayMinutes(frequency, exceptions, date);
  const headway = published?.headway ?? MODE_PRIORS[mode].headwayMinutes;
  return {
    value: Math.max(1, Math.round(headway / 2)),
    p50: Math.max(1, Math.round(headway / 2)),
    p90: Math.max(2, Math.round(headway * 0.9)),
    method: published?.method ?? "mode_headway_prior",
    confidence: published ? 0.58 : 0.32,
  };
};

export const estimateRideDuration = (mode: SiraTransportMode, distanceKm: number): Estimate => {
  const minutes = rideMinutesRaw(mode, distanceKm);
  return {
    value: Math.max(1, Math.round(minutes)),
    p50: Math.max(1, Math.round(minutes)),
    p90: Math.max(2, Math.round(minutes * 1.35)),
    method: "mode_speed_prior",
    confidence: 0.42,
  };
};

export const estimateFare = (mode: SiraTransportMode, distanceKm: number): Estimate => {
  const prior = MODE_PRIORS[mode];
  let value = prior.fareBase;
  if (mode === "woro") value = Math.max(prior.fareBase, Math.round(distanceKm * 55 / 100) * 100);
  if (mode === "gbaka") value = Math.max(prior.fareBase, Math.round(distanceKm * 50 / 100) * 100);
  return {
    value,
    p50: value,
    p90: Math.ceil(value * (mode === "sotra" || mode === "boat" ? 1.15 : 1.35) / 100) * 100,
    method: "historical_mode_fare_prior",
    confidence: mode === "sotra" || mode === "boat" ? 0.5 : 0.3,
  };
};

export const estimateWalkingDuration = (
  distanceKm: number,
  profile: keyof typeof WALKING_SPEEDS_KMH = "standard",
): Estimate => {
  const minutes = distanceKm / WALKING_SPEEDS_KMH[profile] * 60;
  return {
    value: Math.max(1, Math.round(minutes)),
    p50: Math.max(1, Math.round(minutes)),
    p90: Math.max(2, Math.round(minutes * (profile === "accessibility" ? 1.2 : 1.3))),
    method: `distance_walk_${profile}`,
    confidence: 0.38,
  };
};

export const combineConfidence = (values: number[]) => {
  const usable = values.filter((value) => Number.isFinite(value));
  if (!usable.length) return 0;
  return Number((usable.reduce((sum, value) => sum + value, 0) / usable.length).toFixed(2));
};
