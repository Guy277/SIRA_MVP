// Guidance map: it turns so that the road goes up in front of the traveller. Run: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { headingAlong } from '../components/osm-map-types.ts';

// A road from the Plateau going north (~110 m between points), then east.
const north = [{ latitude: 5.3200, longitude: -4.0170 }, { latitude: 5.3210, longitude: -4.0170 }, { latitude: 5.3220, longitude: -4.0170 }];
const thenEast = [...north, { latitude: 5.3220, longitude: -4.0160 }, { latitude: 5.3220, longitude: -4.0150 }];

test('la carte se tourne dans le sens de la route, devant le voyageur', () => {
  assert.ok(Math.abs(headingAlong(north, north[0]) - 0) < 1);  // vers le nord
  assert.ok(Math.abs(headingAlong(thenEast, thenEast[2]) - 90) < 1);  // après le virage : vers l'est
  const back = headingAlong([...north].reverse(), north[2]);
  assert.ok(Math.abs(back - 180) < 1);  // dans l'autre sens : vers le sud
});

test('sans trajet utilisable, la carte garde son cap', () => {
  assert.equal(headingAlong([], north[0]), null);
  assert.equal(headingAlong([north[0]], north[0]), null);
  assert.equal(headingAlong([north[0], north[0]], north[0]), null);
});
