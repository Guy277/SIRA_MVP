// Zones the traveller follows (on the phone): what is kept, and which reports fall in them. Run: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addZone, followedZoneAt, MAX_ZONES, parseStoredZones, removeZone, ZONE_RADIUS_M, zonesContaining,
} from '../lib/followed-zones-core.ts';

// Plateau, and points about 300 m, 100 m and 1 km from it.
const plateau = { label: 'Carrefour du Plateau', latitude: 5.3236, longitude: -4.0168 };
const near300 = { latitude: 5.3263, longitude: -4.0168 };
const near100 = { latitude: 5.3245, longitude: -4.0168 };
const far1km = { latitude: 5.3326, longitude: -4.0168 };

test('a report 300 m away falls in the zone, one 1 km away does not', () => {
  const zones = addZone([], plateau, 1);
  assert.equal(zones[0].radiusM, ZONE_RADIUS_M);
  assert.equal(zonesContaining(zones, near300).length, 1);
  assert.equal(zonesContaining(zones, far1km).length, 0);
});

test('following the same place again updates it instead of doubling', () => {
  let zones = addZone([], plateau, 1);
  zones = addZone(zones, { ...near100, label: 'Plateau, rue du Commerce' }, 2);
  assert.equal(zones.length, 1);
  assert.equal(zones[0].label, 'Plateau, rue du Commerce');
  assert.equal(zones[0].addedAt, 2);
  assert.ok(followedZoneAt(zones, plateau));
  assert.equal(followedZoneAt(zones, far1km), null);
});

test('newest first, at most MAX_ZONES, and a zone can be removed', () => {
  let zones = [];
  for (let i = 0; i < MAX_ZONES + 3; i += 1) zones = addZone(zones, { label: `Z${i}`, latitude: 5.2 + i * 0.02, longitude: -4.0 }, i);
  assert.equal(zones.length, MAX_ZONES);
  assert.equal(zones[0].label, `Z${MAX_ZONES + 2}`);
  assert.equal(removeZone(zones, zones[0].id).length, MAX_ZONES - 1);
});

test('stored zones are read back, broken ones are dropped', () => {
  const zones = addZone([], plateau, 1);
  assert.deepEqual(parseStoredZones(JSON.stringify(zones)), zones);
  assert.deepEqual(parseStoredZones('pas du json'), []);
  assert.deepEqual(parseStoredZones(JSON.stringify([{ id: 'x' }, ...zones])), zones);
  assert.deepEqual(parseStoredZones(null), []);
});
