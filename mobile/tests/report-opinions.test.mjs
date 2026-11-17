// What the phone remembers of its own reports and opinions. Run: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  confirmationsLabel, KEEP_MS, opinionFor, parseStoredOpinions, rememberOpinion,
} from '../lib/report-opinions-core.ts';

test('an opinion is remembered, and a newer one replaces it', () => {
  let list = rememberOpinion([], 'r1', 'confirm', 1000);
  assert.equal(opinionFor(list, 'r1'), 'confirm');
  list = rememberOpinion(list, 'r1', 'contest', 2000);
  assert.equal(opinionFor(list, 'r1'), 'contest');
  assert.equal(list.length, 1);
  assert.equal(opinionFor(list, 'other'), null);
});

test('the author stays the author, and « known » never hides a known opinion', () => {
  let list = rememberOpinion([], 'mine', 'author', 1000);
  list = rememberOpinion(list, 'mine', 'known', 2000);
  assert.equal(opinionFor(list, 'mine'), 'author');
  list = rememberOpinion(list, 'r2', 'confirm', 2000);
  list = rememberOpinion(list, 'r2', 'known', 3000);
  assert.equal(opinionFor(list, 'r2'), 'confirm');
  list = rememberOpinion(list, 'r3', 'known', 3000);
  assert.equal(opinionFor(list, 'r3'), 'known');
});

test('old opinions and broken storage are dropped', () => {
  const now = 10 * KEEP_MS;
  const text = JSON.stringify([
    { reportId: 'new', opinion: 'confirm', at: now - 1000 },
    { reportId: 'old', opinion: 'confirm', at: now - KEEP_MS - 1 },
    { reportId: 'bad', opinion: 'maybe', at: now },
  ]);
  assert.deepEqual(parseStoredOpinions(text, now).map((item) => item.reportId), ['new']);
  assert.deepEqual(parseStoredOpinions('pas du json', now), []);
});

test('« 1 confirmation », « 2 confirmations »', () => {
  assert.equal(confirmationsLabel(0), '0 confirmation');
  assert.equal(confirmationsLabel(1), '1 confirmation');
  assert.equal(confirmationsLabel(2), '2 confirmations');
});
