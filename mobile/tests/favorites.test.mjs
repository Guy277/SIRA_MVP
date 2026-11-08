// The traveller's favourite trips (on the phone): what is kept, how it is read back and found. Run: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addFavorite, favoriteId, isFavorite, MAX_FAVORITES, parseStoredFavorites, removeFavorite, searchFavorites, toggleFavorite,
} from '../lib/favorites-core.ts';

const point = (name, latitude = 5.4, longitude = -4.0) => ({ name, latitude, longitude });
const fav = (from = 'Abobo Samaké', to = 'Orange Digital Center', champs = {}) => ({
  from: point(from), to: point(to), category: 'coule', transport: 'Bus 203 › Wôrô', durationMin: 55, priceF: 200, ...champs,
});

test('the same two places give the same favourite (accents, case and a few metres aside)', () => {
  assert.equal(favoriteId(point('Abobo Samaké'), point('Plateau')), favoriteId(point('abobo samake'), point('PLATEAU', 5.40004, -4.00004)));
  assert.notEqual(favoriteId(point('Abobo'), point('Plateau')), favoriteId(point('Plateau'), point('Abobo')));
  assert.notEqual(favoriteId(point('Abobo'), point('Plateau')), favoriteId(point('Abobo'), point('Plateau', 5.32, -4.02)));
});

test('newest first, adding again updates instead of doubling, at most MAX_FAVORITES', () => {
  let list = addFavorite([], fav('A', 'B'), 1);
  list = addFavorite(list, fav('C', 'D'), 2);
  list = addFavorite(list, fav('A', 'B', { durationMin: 40 }), 3);
  assert.deepEqual(list.map((f) => [f.from.name, f.durationMin]), [['A', 40], ['C', 55]]);
  for (let i = 0; i < MAX_FAVORITES + 3; i += 1) list = addFavorite(list, fav(`P${i}`, 'Q'), 10 + i);
  assert.equal(list.length, MAX_FAVORITES);
});

test('toggle adds then removes; isFavorite follows', () => {
  const first = toggleFavorite([], fav(), 1);
  assert.equal(first.added, true);
  assert.equal(isFavorite(first.list, point('Abobo Samaké'), point('Orange Digital Center')), true);
  const second = toggleFavorite(first.list, fav(), 2);
  assert.equal(second.added, false);
  assert.deepEqual(second.list, []);
  assert.deepEqual(removeFavorite(addFavorite([], fav(), 1), 'inconnu').length, 1);
});

test('stored favourites read back sorted; damaged entries and unreadable text dropped', () => {
  const a = addFavorite([], fav('A', 'B'), 1)[0];
  const b = addFavorite([], fav('C', 'D', { category: null, priceF: null }), 9)[0];
  const stored = JSON.stringify([a, { id: 'abîmé', addedAt: 5 }, b, { ...a, id: 'x', category: 'inconnue' }]);
  assert.deepEqual(parseStoredFavorites(stored).map((f) => f.from.name), ['C', 'A']);
  assert.deepEqual(parseStoredFavorites('pas du json'), []);
  assert.deepEqual(parseStoredFavorites(null), []);
});

test('search by place, option or transport, without accents', () => {
  const list = [addFavorite([], fav(), 2)[0], addFavorite([], fav('Yopougon', 'Cocody', { category: 'suspendu', transport: 'Taxi' }), 1)[0]];
  assert.deepEqual(searchFavorites(list, 'samake').map((f) => f.to.name), ['Orange Digital Center']);
  assert.deepEqual(searchFavorites(list, 'taxi cocody').map((f) => f.to.name), ['Cocody']);
  assert.equal(searchFavorites(list, ' ').length, 2);
});
