// The traveller's places (« Mes lieux »): what is kept, names allowed, how SIRA says them. Run: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { arrivalPhrase, labelError, MAX_CUSTOM_PLACES, parseStoredPlaces, voicePlaces } from '../lib/saved-places-core.ts';

const address = (title) => ({ title, subtitle: 'Cocody, Abidjan', latitude: 5.36, longitude: -3.96 });
const custom = (id, label) => ({ ...address(`${label} adresse`), id, kind: 'custom', label, icon: 'heart' });

test('the first version ({ home, work }) is read as Maison and Travail', () => {
  const places = parseStoredPlaces(JSON.stringify({ work: address('Orange Digital Center'), home: address('Riviera Palmeraie') }));
  assert.deepEqual(places.map((place) => [place.id, place.label, place.title]), [
    ['home', 'Maison', 'Riviera Palmeraie'],
    ['work', 'Travail', 'Orange Digital Center'],
  ]);
});

test('Maison, then Travail, then the traveller’s places; broken entries are dropped', () => {
  const stored = [
    custom('a', 'Chez Maman'),
    { ...address('Plateau'), id: 'work', kind: 'work' },
    { id: 'b', kind: 'custom', label: 'Sans adresse', icon: 'star' },
    { ...address('Angré'), id: 'home', kind: 'home' },
    { ...address('Doublon'), id: 'home', kind: 'home' },
    custom('c', 'École'),
  ];
  assert.deepEqual(parseStoredPlaces(JSON.stringify(stored)).map((place) => place.label), ['Maison', 'Travail', 'Chez Maman', 'École']);
  assert.deepEqual(parseStoredPlaces('pas du json'), []);
  assert.deepEqual(parseStoredPlaces(null), []);
});

test('no more than the allowed number of named places, and an unknown icon becomes a star', () => {
  const many = Array.from({ length: MAX_CUSTOM_PLACES + 3 }, (_, index) => ({ ...custom(`p${index}`, `Lieu ${index}`), icon: 'rocket' }));
  const places = parseStoredPlaces(JSON.stringify(many));
  assert.equal(places.length, MAX_CUSTOM_PLACES);
  assert.ok(places.every((place) => place.icon === 'star'));
});

test('names: needed, 3 letters at least, not Maison or Travail, not twice', () => {
  const places = [custom('a', 'Chez Maman')];
  assert.equal(labelError('  ', places), 'Donne un nom à ce lieu.');
  assert.match(labelError('Ab', places), /3 lettres/);
  assert.match(labelError('maison', places), /Maison et Travail/);
  assert.match(labelError('TRAVAIL', places), /Maison et Travail/);
  assert.match(labelError('chez  maman', places), /déjà un lieu/);
  assert.equal(labelError('Chez Maman', places, 'a'), null, 'renaming a place to its own name');
  assert.equal(labelError('École des enfants', places), null);
});

test('arrival: « à la maison », « au travail », « chez Maman », « à École »', () => {
  assert.equal(arrivalPhrase({ kind: 'home', label: 'Maison' }), 'à la maison');
  assert.equal(arrivalPhrase({ kind: 'work', label: 'Travail' }), 'au travail');
  assert.equal(arrivalPhrase({ kind: 'custom', label: 'Chez Maman' }), 'chez Maman');
  assert.equal(arrivalPhrase({ kind: 'custom', label: 'École' }), 'à École');
});

test('sent to the voice assistant: kind, name, address and coordinates only', () => {
  assert.deepEqual(voicePlaces([custom('a', 'Chez Maman')]), [
    { kind: 'custom', label: 'Chez Maman', title: 'Chez Maman adresse', lat: 5.36, lon: -3.96 },
  ]);
});
