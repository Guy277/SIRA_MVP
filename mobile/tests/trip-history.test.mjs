// The traveller's trip history (on the phone): what is kept, how it is read back and shown. Run: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addTrip, markFinished, MAX_TRIPS, parseStoredTrips, removeTrip, searchTrips, tripTitle, whenLabel } from '../lib/trip-history-core.ts';

const point = (name) => ({ name, latitude: 5.4, longitude: -4.0 });
const trip = (id, at, champs = {}) => ({
  id, at, from: point('Abobo Samaké'), to: point('Orange Digital Center'), category: 'coule',
  transport: 'Bus 203 › Wôrô', durationMin: 55, priceF: 200, finished: false, ...champs,
});

test('newest first, no duplicate, at most MAX_TRIPS kept', () => {
  let trips = [];
  for (let i = 0; i < MAX_TRIPS + 5; i += 1) trips = addTrip(trips, trip(`t${i}`, i));
  assert.equal(trips.length, MAX_TRIPS);
  assert.equal(trips[0].id, `t${MAX_TRIPS + 4}`);
  assert.equal(addTrip(trips, trip(trips[3].id, 9e12)).length, MAX_TRIPS);
});

test('arrival marks the trip, deletion removes it', () => {
  const trips = [trip('a', 2), trip('b', 1)];
  assert.deepEqual(markFinished(trips, 'b').map((t) => t.finished), [false, true]);
  assert.deepEqual(removeTrip(trips, 'a').map((t) => t.id), ['b']);
});

test('stored history read back sorted; damaged entries and unreadable text dropped', () => {
  const stored = JSON.stringify([trip('old', 1), { id: 'abîmé', at: 5 }, trip('new', 9, { category: null, priceF: null })]);
  assert.deepEqual(parseStoredTrips(stored).map((t) => t.id), ['new', 'old']);
  assert.deepEqual(parseStoredTrips('pas du json'), []);
  assert.deepEqual(parseStoredTrips(null), []);
  assert.deepEqual(parseStoredTrips(JSON.stringify([trip('x', 1, { category: 'inconnue' })])), []);
});

test('title with French elision', () => {
  assert.equal(tripTitle(trip('a', 1)), 'D’Abobo Samaké à Orange Digital Center');
  assert.equal(tripTitle({ from: point('Yopougon'), to: point('Plateau') }), 'De Yopougon à Plateau');
});

test('date label: today, yesterday, then day and month (phone time)', () => {
  const now = new Date(2026, 10, 8, 18, 0).getTime();
  assert.equal(whenLabel(new Date(2026, 10, 8, 8, 30).getTime(), now), 'Aujourd’hui, 08:30');
  assert.equal(whenLabel(new Date(2026, 10, 7, 17, 45).getTime(), now), 'Hier, 17:45');
  assert.equal(whenLabel(new Date(2026, 8, 12, 10, 45).getTime(), now), '12 sept., 10:45');
});

test('search by place, option or transport, without accents', () => {
  const trips = [trip('a', 2), trip('b', 1, { to: point('Cocody'), category: 'suspendu', transport: 'Taxi' })];
  assert.deepEqual(searchTrips(trips, 'coule').map((t) => t.id), ['a']);
  assert.deepEqual(searchTrips(trips, 'taxi cocody').map((t) => t.id), ['b']);
  assert.equal(searchTrips(trips, '  ').length, 2);
});
