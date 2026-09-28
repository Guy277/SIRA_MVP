// SIRA's home message, hour by hour (Abidjan time = UTC). Run: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { arrivalGreeting, homeGreeting, INTRODUCTION } from '../lib/greeting.ts';

const at = (hour, minute = 0) => new Date(Date.UTC(2026, 8, 28, hour, minute));

test('each hour gets its message, same shape: Akwaba + useful line + question', () => {
  const expected = [
    [at(4, 59), 'Akwaba Guy ! À cette heure, seuls les taxis roulent. On rentre ?'],
    [at(5), 'Akwaba Guy ! Bien matinal ! On va où ?'],
    [at(8, 59), 'Akwaba Guy ! Bien matinal ! On va où ?'],
    [at(9), 'Akwaba Guy ! On va où ?'],
    [at(16, 59), 'Akwaba Guy ! On va où ?'],
    [at(17), 'Akwaba Guy ! On rentre ?'],
    [at(19, 59), 'Akwaba Guy ! On rentre ?'],
    [at(20), "Akwaba Guy ! Les transports roulent jusqu'à 22 h. On va où ?"],
    [at(21, 59), "Akwaba Guy ! Les transports roulent jusqu'à 22 h. On va où ?"],
    [at(22), 'Akwaba Guy ! À cette heure, seuls les taxis roulent. On rentre ?'],
  ];
  for (const [date, speech] of expected) assert.equal(homeGreeting('Guy', false, date).speech, speech, date.toISOString());
});

test('the bubble shows exactly what SIRA says', () => {
  for (let hour = 0; hour < 24; hour += 1) {
    for (const firstTime of [true, false]) {
      const greeting = homeGreeting('Awa', firstTime, at(hour));
      assert.equal(greeting.speech, [greeting.hello, ...greeting.lines].join(' '));
    }
  }
  const back = arrivalGreeting('Cocody', 'Retour vers Yopougon', at(19));
  assert.equal(back.speech, 'Bonne soirée à Cocody ! Pour rentrer, touche Retour vers Yopougon.');
  assert.equal(back.speech, [back.hello, ...back.lines].join(' '));
});

test('SIRA introduces itself only the first time, just before the question', () => {
  const first = homeGreeting('Guy', true, at(10));
  assert.deepEqual(first.lines, [INTRODUCTION, 'On va où ?']);
  assert.ok(!homeGreeting('Guy', false, at(10)).speech.includes('Je suis SIRA'));
  assert.deepEqual(homeGreeting('Guy', true, at(23)).lines, ['À cette heure, seuls les taxis roulent.', INTRODUCTION, 'On rentre ?']);
});

test('without a first name: « Akwaba ! »', () => {
  assert.equal(homeGreeting(null, false, at(10)).speech, 'Akwaba ! On va où ?');
});

test('short: under 5 seconds of voice (about 15 characters a second)', () => {
  for (let hour = 0; hour < 24; hour += 1) {
    assert.ok(homeGreeting('Guy', false, at(hour)).speech.length <= 75, `${hour} h`);
  }
});

test('never says the lines run when they are closed', () => {
  for (const hour of [22, 23, 0, 1, 2, 3, 4]) {
    assert.match(homeGreeting('Guy', false, at(hour)).speech, /seuls les taxis/);
  }
  for (let hour = 5; hour < 22; hour += 1) {
    assert.doesNotMatch(homeGreeting('Guy', false, at(hour)).speech, /seuls les taxis/);
  }
});
