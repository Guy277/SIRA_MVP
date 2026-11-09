// SIRA's own switches for the position and the microphone, as stored on the phone. Run: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_USAGE, parseUsage, USAGE_OFF_MESSAGES } from '../lib/usage-core.ts';

test('both on until the traveller turns one off', () => {
  assert.deepEqual(DEFAULT_USAGE, { location: true, microphone: true });
  assert.deepEqual(parseUsage(null), DEFAULT_USAGE);
  assert.deepEqual(parseUsage(''), DEFAULT_USAGE);
});

test('stored choice read back; anything else falls back to on', () => {
  assert.deepEqual(parseUsage('{"location":false,"microphone":true}'), { location: false, microphone: true });
  assert.deepEqual(parseUsage('{"microphone":false}'), { location: true, microphone: false });
  assert.deepEqual(parseUsage('{"location":"non","microphone":0}'), DEFAULT_USAGE);
  assert.deepEqual(parseUsage('pas du json'), DEFAULT_USAGE);
  assert.deepEqual(parseUsage('null'), DEFAULT_USAGE);
});

test('the messages say it is SIRA’s setting, and where to change it', () => {
  for (const message of Object.values(USAGE_OFF_MESSAGES)) assert.match(message, /dans SIRA \(Profil > Autorisations\)/);
});
