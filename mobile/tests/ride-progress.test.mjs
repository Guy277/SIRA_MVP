// Guidance, lot 2: stops or distance left on a ride, the countdown line, the map view of each step. Run: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { followCamera, rideCountdown, rideProgress, shortDistance, warnByStops } from '../lib/ride-progress-core.ts';

// A FICTITIOUS gbaka ride going north, a stop every ~555 m (0.005° of latitude): A (board) → B → C → D (get off).
const lat = (i) => 5.40 + i * 0.005;
const stops = ['A', 'B', 'C', 'D'].map((name, i) => ({ name, lat: lat(i), lon: -4.02 }));
const geometry = [0, 1, 2, 3].map((i) => [-4.02, lat(i)]);
const gbaka = { mode: 'gbaka', geometry, ride_stops: stops, alight_stop: { name: 'D', on_line: true } };
const at = (i) => ({ latitude: lat(i), longitude: -4.02 });

test('arrêts restants : au départ, entre deux arrêts, au prochain, à l’arrêt de descente', () => {
  assert.equal(rideProgress(gbaka, null).stopsLeft, 3); // sans GPS : tous les arrêts du trajet
  assert.equal(rideProgress(gbaka, at(0)).stopsLeft, 3); // à l'arrêt où l'on monte
  assert.equal(rideProgress(gbaka, at(0.6)).stopsLeft, 3); // parti de A, B pas encore atteint : B, C et D restent
  assert.equal(rideProgress(gbaka, at(1.3)).stopsLeft, 2); // B passé : C et D restent
  assert.equal(rideProgress(gbaka, at(2.2)).stopsLeft, 1); // C passé : D est le prochain
  assert.equal(rideProgress(gbaka, at(3)).stopsLeft, 0); // à D
});

test('distance restante le long du trajet', () => {
  const total = rideProgress(gbaka, null).metresLeft;
  assert.ok(total > 1600 && total < 1700, `≈ 1 668 m, obtenu ${total}`);
  assert.ok(rideProgress(gbaka, at(2)).metresLeft < 600);
});

test('le bandeau : « Descends dans 3 arrêts », puis « Ton arrêt est le prochain », puis « C’est ton arrêt »', () => {
  assert.deepEqual(rideCountdown(gbaka, rideProgress(gbaka, at(0))), { text: 'Descends dans 3 arrêts · « D »', urgent: false });
  assert.deepEqual(rideCountdown(gbaka, rideProgress(gbaka, at(2.2))), { text: 'Ton arrêt est le prochain : « D »', urgent: true });
  assert.deepEqual(rideCountdown(gbaka, rideProgress(gbaka, at(3))), { text: 'C’est ton arrêt : « D ». Descends.', urgent: true });
});

test('arrêts inconnus (wôrô-wôrô, arrêt informel) : on compte en mètres', () => {
  const woro = { mode: 'woro', geometry, alight_stop: { name: 'Carrefour', on_line: false } };
  assert.equal(rideProgress(woro, at(0)).stopsLeft, null);
  assert.deepEqual(rideCountdown(woro, rideProgress(woro, at(0))), { text: 'Descends dans 1,7 km', urgent: false });
  assert.deepEqual(rideCountdown(woro, rideProgress(woro, at(2.5))), { text: 'Descends dans 300 m', urgent: true });
  assert.equal(rideCountdown(woro, rideProgress(woro, at(3))).urgent, true);
  const taxi = { mode: 'taxi', geometry };
  assert.equal(rideCountdown(taxi, rideProgress(taxi, at(0))).text, 'Tu arrives dans 1,7 km');
  assert.equal(rideCountdown({ mode: 'walk', geometry }, rideProgress({ mode: 'walk', geometry }, at(0))), null);
});

test('« Prépare-toi » quand le prochain arrêt est le bon (arrêts connus), sinon la règle des 600 m reste', () => {
  assert.equal(warnByStops(rideProgress(gbaka, at(1.3))), false);
  assert.equal(warnByStops(rideProgress(gbaka, at(2.2))), true);
  assert.equal(warnByStops(rideProgress({ mode: 'woro', geometry }, at(2.2))), null);
});

test('distances courtes lisibles', () => {
  assert.equal(shortDistance(12), '50 m');
  assert.equal(shortDistance(812), '800 m');
  assert.equal(shortDistance(1234), '1,2 km');
});

test('la carte selon l’étape : à pied proche et penchée, en véhicule un peu plus loin, toujours en 3D', () => {
  assert.deepEqual(followCamera({ mode: 'walk' }, 200), { kind: 'marche', zoom: 17, pitch: 55 });
  assert.deepEqual(followCamera({ mode: 'wait' }, null), { kind: 'arret', zoom: 17, pitch: 45 });
  assert.deepEqual(followCamera(gbaka, 300), { kind: 'vehicule', zoom: 16.5, pitch: 50 });
  assert.deepEqual(followCamera(gbaka, 1200), { kind: 'vehicule', zoom: 15.5, pitch: 50 });
  assert.equal(followCamera(gbaka, 50_000).zoom, 15); // trajet long : la carte reste assez proche pour la 3D
});
