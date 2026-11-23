// Guidance map: it turns so that the road goes up in front of the traveller. Run: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { altitudeForZoom, headingAlong, metresPerPoint, pointAhead } from '../components/osm-map-types.ts';

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

test('appli installée : la caméra vise un point devant le voyageur, dans son sens de marche', () => {
  const here = { latitude: 5.32, longitude: -4.017 };
  const north = pointAhead(here, 0, 111.32);
  assert.ok(Math.abs(north.latitude - 5.321) < 1e-6 && Math.abs(north.longitude - here.longitude) < 1e-9);
  const east = pointAhead(here, 90, 100);
  assert.ok(east.longitude > here.longitude && Math.abs(east.latitude - here.latitude) < 1e-9);
});

test('appli installée sur iPhone : l’altitude de la caméra suit le zoom (deux fois plus haut par niveau en moins)', () => {
  assert.ok(Math.abs(metresPerPoint(17, 0) - 1.1943) < 0.001); // valeur Web Mercator connue à l'équateur
  const a17 = altitudeForZoom(17, 5.32, 800);
  const a16 = altitudeForZoom(16, 5.32, 800);
  assert.ok(Math.abs(a16 / a17 - 2) < 0.01);
  assert.ok(a17 > 1000 && a17 < 2500, `altitude à zoom 17 : ${a17} m`);
});
