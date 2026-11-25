// The line written under SIRA's voice during the guidance: only what the banner does not say. Run: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stepScreenLine } from '../lib/journey-format.ts';

// A FICTITIOUS trip: walk to « Poubelle », wait, wôrô-wôrô, then a taxi.
const leg = (mode, extra = {}) => ({ id: mode, mode, label: mode, detail: '', duration: 5, price: 0, geometry: [], ...extra });
const walk = leg('walk', { walk_steps: [{ text: 'Marche vers le nord sur Rue Kouame Théodore.', distance_m: 120, landmark: null }] });
const wait = leg('wait');
const woro = leg('woro', {
  label: 'Wôrô: Adjamé ↔ Plateau', headsign: 'Plateau', line_code: '12',
  alternatives: [{ line_id: 'a', code: '15', name: '', mode: 'woro' }, { line_id: 'b', code: '15', name: '', mode: 'woro' }],
  alight_stop: { name: 'Cité administrative', on_line: true }, stop_count: 6,
});
const taxi = leg('taxi', { alight_stop: { name: 'Pharmacie', on_line: false } });
const steps = [walk, wait, woro, taxi].map((item) => ({ leg: item }));

test('a walk: the way to start, not the stop already in the banner', () => {
  assert.equal(stepScreenLine(steps, 0, 'Plateau'), 'Marche vers le nord sur Rue Kouame Théodore.');
  assert.equal(stepScreenLine([{ leg: leg('walk') }], 0), null);
});

test('a wait: what is written on the vehicle, and the other lines once each', () => {
  assert.equal(stepScreenLine(steps, 1), 'Direction « Plateau » · le 15 va aussi');
  const noSign = [{ leg: wait }, { leg: { ...woro, headsign: null, alternatives: [] } }];
  assert.equal(stepScreenLine(noSign, 0), 'Ligne Adjamé ↔ Plateau');
  assert.equal(stepScreenLine([{ leg: wait }, { leg: taxi }], 0), null);
});

test('a ride: where to get off and in how many stops; nothing for a taxi', () => {
  assert.equal(stepScreenLine(steps, 2), 'Tu descends à « Cité administrative », dans 6 arrêts.');
  assert.equal(stepScreenLine(steps, 3), null);
  assert.equal(stepScreenLine(steps, 9), null);
});
