// The route detail in short: one card per vehicle, the wait folded into it, walks as one line. Run: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { routeBlocks, stopsBetween, walkMetres } from '../lib/route-cards.ts';

// A FICTITIOUS trip: walk to stop A, wait, gbaka A → D, change on foot, wait alone, walk to the arrival.
const at = (minutes) => new Date(Date.UTC(2026, 10, 25, 8, minutes));
const leg = (id, mode, duration, extra = {}) => ({ id, mode, label: mode, detail: '', duration, price: 0, geometry: [], ...extra });
const steps = [
  { leg: leg('w1', 'walk', 4, { detail: '320 m à pied' }), start: at(0) },
  { leg: leg('t1', 'wait', 5, { duration_p90: 12 }), start: at(4) },
  { leg: leg('g1', 'gbaka', 18, { ride_stops: ['A', 'B', 'B', 'C', 'D'].map((name) => ({ name, lon: 0, lat: 0 })) }), start: at(9) },
  { leg: leg('c1', 'transfer', 2, { detail: '1 240 m à pied' }), start: at(27) },
  { leg: leg('t2', 'wait', 3), start: at(29) },
  { leg: leg('w2', 'walk', 6), start: at(32) },
];

test('the wait before a ride goes into its card, with the clock of reaching the stop', () => {
  const blocks = routeBlocks(steps);
  assert.deepEqual(blocks.map((block) => `${block.kind}:${block.leg.id}`), ['walk:w1', 'ride:g1', 'walk:c1', 'wait:t2', 'walk:w2']);
  const ride = blocks[1];
  assert.equal(ride.index, 2);
  assert.deepEqual(ride.wait, { index: 1, minutes: 5, peak: 12 });
  assert.equal(ride.start.getTime(), at(4).getTime());
});

test('a wait with no ride after it stays a line of its own', () => {
  const blocks = routeBlocks([steps[4]]);
  assert.deepEqual(blocks.map((block) => block.kind), ['wait']);
});

test('peak hours no longer than the usual wait are not told', () => {
  const blocks = routeBlocks([{ leg: leg('t', 'wait', 5, { duration_p90: 5 }), start: at(0) }, steps[2]]);
  assert.equal(blocks[0].wait.peak, null);
});

test('stops between getting on and off: the ends left out, each name once in a row', () => {
  assert.deepEqual(stopsBetween(steps[2].leg), ['B', 'C']);
  assert.deepEqual(stopsBetween({ ride_stops: [{ name: 'A' }, { name: 'D' }] }), []);
  assert.deepEqual(stopsBetween({}), []);
});

test('walk length read from the engine detail, spaces of thousands included', () => {
  assert.equal(walkMetres({ detail: '320 m à pied' }), 320);
  assert.equal(walkMetres({ detail: '1 240 m à pied' }), 1240);
  assert.equal(walkMetres({ detail: '1 240 m à pied' }), 1240);
  assert.equal(walkMetres({ detail: '' }), null);
});
