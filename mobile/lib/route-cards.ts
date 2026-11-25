// The route detail screen in short (« Ton trajet »): one card per vehicle, the walks and changes as
// one thin line, the details only when asked. Before, each step had up to 8 lines and the stop
// was written 3 times (walk to it, wait at it, get on at it): seen on an iPhone, 25 November 2026.
// Pattern: progressive disclosure (NN/g, IxDF); first and last stop with the number of stops,
// the whole list on touch (Yandex Maps, family of Yango); wait and stops up front (Moovit).
// Sources in docs/etude-guidage-carte.md. Pure functions (types only) so tests/route-cards.test.mjs runs them with Node.
import type { ApiLeg } from './sira-api';

export type TimedStep = { leg: ApiLeg & { duration_p90?: number }; start: Date };

// The wait just before a ride, folded into its card (« Monte à … · ≈ 5 min d'attente »).
export type MergedWait = { index: number; minutes: number; peak: number | null };

export type RouteBlock =
  | { kind: 'ride'; index: number; leg: ApiLeg; start: Date; wait: MergedWait | null; stopsBetween: string[] }
  | { kind: 'walk'; index: number; leg: ApiLeg; start: Date; metres: number | null }
  | { kind: 'wait'; index: number; leg: ApiLeg; start: Date };

const VEHICLES = new Set(['sotra', 'gbaka', 'woro', 'taxi', 'boat']);

// « 1 240 m à pied » in the engine's detail → 1240.
export function walkMetres(leg: Pick<ApiLeg, 'detail'>) {
  const found = /(\d[\d\s  ]*) m\b/.exec(leg.detail ?? '')?.[1];
  return found ? Number(found.replace(/[\s  ]/g, '')) : null;
}

// The stops between getting on and getting off, in order, each name once in a row.
export function stopsBetween(leg: Pick<ApiLeg, 'ride_stops'>) {
  const names = (leg.ride_stops ?? []).map((stop) => stop.name);
  if (names.length < 3) return [];
  const first = names[0];
  const last = names[names.length - 1];
  return names.slice(1, -1).filter((name, index, list) => name !== first && name !== last && name !== list[index - 1]);
}

// `index` is the step's place in the timeline: the keys SIRA lights up while it talks ('step:2', 'board:2').
export function routeBlocks(steps: TimedStep[]): RouteBlock[] {
  const blocks: RouteBlock[] = [];
  let pendingWait: { index: number; step: TimedStep } | null = null;
  const flushWait = () => {
    if (pendingWait) blocks.push({ kind: 'wait', index: pendingWait.index, leg: pendingWait.step.leg, start: pendingWait.step.start });
    pendingWait = null;
  };
  steps.forEach((step, index) => {
    const { leg } = step;
    if (leg.mode === 'wait') {
      flushWait();
      pendingWait = { index, step };
      return;
    }
    if (VEHICLES.has(leg.mode)) {
      const wait = pendingWait as { index: number; step: TimedStep } | null;
      const peak = wait?.step.leg.duration_p90;
      blocks.push({
        kind: 'ride',
        index,
        leg,
        // The clock of the card: when you reach the stop, the wait included.
        start: wait ? wait.step.start : step.start,
        wait: wait ? { index: wait.index, minutes: wait.step.leg.duration, peak: peak && peak > wait.step.leg.duration ? peak : null } : null,
        stopsBetween: stopsBetween(leg),
      });
      pendingWait = null;
      return;
    }
    flushWait();
    blocks.push({ kind: 'walk', index, leg, start: step.start, metres: walkMetres(leg) });
  });
  flushWait();
  return blocks;
}
