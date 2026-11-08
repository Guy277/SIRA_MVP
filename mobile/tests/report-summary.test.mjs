// What is being reported right now, for the « Signaler un évènement » screen. Run: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { categoryOfType, distanceM, NEAR_RADIUS_M, summarizeReports } from '../lib/report-summary-core.ts';

const ABOBO = { latitude: 5.416, longitude: -4.015 };
const report = (type, lat, lon, champs = {}) => ({ type, lat, lon, status: 'reported', ...champs });

test('distance between two points of Abidjan, in metres', () => {
  // Abobo -> Boulevard de la Liberté (Adjamé): about 6.3 km.
  const d = distanceM(ABOBO, { latitude: 5.3599, longitude: -4.0275 });
  assert.ok(d > 6000 && d < 6600, String(d));
  assert.equal(distanceM(ABOBO, ABOBO), 0);
});

test('near the traveller: only active reports within the radius, counted by kind', () => {
  const reports = [
    report('traffic', 5.417, -4.016),
    report('traffic', 5.418, -4.014, { status: 'confirmed' }),
    report('accident', 5.415, -4.015),
    report('flood', 5.3599, -4.0275), // Adjamé, too far
    report('blocked', 5.416, -4.015, { status: 'resolved' }),
    report('works', 5.416, -4.016), // no card of its own: « Autre »
  ];
  const summary = summarizeReports(reports, ABOBO);
  assert.equal(summary.scope, 'near');
  assert.equal(summary.total, 4);
  assert.deepEqual(summary.byCategory, { embouteillage: 2, accident: 1, autre: 1 });
  assert.equal(NEAR_RADIUS_M, 3000);
});

test('position unknown: the whole Grand Abidjan; nothing reported: zero', () => {
  const summary = summarizeReports([report('flood', 5.3599, -4.0275)], null);
  assert.equal(summary.scope, 'city');
  assert.deepEqual(summary.byCategory, { inondation: 1 });
  assert.deepEqual(summarizeReports([], ABOBO), { scope: 'near', total: 0, byCategory: {} });
  assert.equal(categoryOfType('inconnu'), 'autre');
});
