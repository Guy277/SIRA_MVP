// What SIRA says during a trip, and when (GPS). Short sentences in the spirit
// of Google Maps / Waze, with the words of Abidjan (gbaka, wôrô-wôrô), and only
// facts given by SIRA-MORE: line, duration, distance, estimated price.
import type { ApiJourney, ApiLeg, Coordinates } from '@/lib/sira-api';
import { isVehicle, MODE_NAMES, toLatLng, walkStepText } from '@/lib/journey-format';
import { distanceM } from '@/lib/places';

export type Step = { leg: ApiLeg; start: Date; end: Date };

// « le bus 40 », « le gbaka », « un taxi »: how the line is said out loud.
export function spokenLine(leg: ApiLeg) {
  if (leg.mode === 'taxi') return 'un taxi';
  const name = leg.label.split(':')[0].trim();
  if (leg.line_code && leg.mode === 'sotra') return `le bus ${leg.line_code}`;
  if (leg.mode === 'boat') return 'le bateau-bus';
  if (leg.mode === 'gbaka' || leg.mode === 'woro') return `le ${MODE_NAMES[leg.mode].toLowerCase()}`;
  return name.length <= 22 ? `le ${name}` : `le ${MODE_NAMES[leg.mode].toLowerCase()}`;
}

// « Yopougon Kouté – Gare Sud »: the two ends of the line, as painted on the vehicle.
function lineEnds(leg: ApiLeg) {
  const [, ends] = leg.label.split(':');
  return ends ? ends.replace(/\s*(↔|<->|->|→)\s*/g, ' – ').trim() : null;
}

function metres(leg: ApiLeg) {
  const found = /(\d[\d\s]*) m\b/.exec(leg.detail)?.[1]?.replace(/\s/g, '');
  return found ? Number(found) : null;
}

export const minutes = (value: number) => `${value} minute${value > 1 ? 's' : ''}`;
const spokenClock = (date: Date) => `${date.getHours()} heures${date.getMinutes() ? ` ${date.getMinutes()}` : ''}`;
const price = (leg: ApiLeg) => (leg.price > 0 && leg.mode !== 'taxi' ? ` Prévois environ ${leg.price} francs.` : '');

function walkTo(leg: ApiLeg, where: string) {
  const distance = metres(leg);
  return distance && distance >= 20
    ? `Marche environ ${Math.round(distance / 10) * 10} mètres jusqu'${where}.`
    : `Marche jusqu'${where}, c'est tout près.`;
}

// The sentence for step `index` (said when the step begins).
// followed: the GPS follows the traveller, so SIRA can warn before getting off.
export function stepSpeech(steps: Step[], index: number, destination: string, followed = false) {
  const step = steps[index];
  if (!step) return '';
  const { leg } = step;
  const previous = steps[index - 1]?.leg;
  const nextRide = steps.slice(index + 1).map((item) => item.leg).find(isVehicle);
  const getOff = previous && isVehicle(previous) ? 'Descends ici. ' : '';
  switch (leg.mode) {
    case 'walk':
    case 'transfer':
      // The first instruction of the walk says which way to start (the next ones
      // are said at each turn, see gpsHint).
      const firstWay = leg.walk_steps?.length && leg.walk_steps[0].distance_m > 0 ? ` ${walkStepText(leg.walk_steps[0], destination)}` : '';
      if (nextRide) {
        const target = leg.to_stop ?? nextRide.board_stop;
        const place = target ? (target.on_line ? `à l'arrêt ${target.name}` : `vers ${target.name}`) : "à l'arrêt";
        const stop = nextRide.mode === 'taxi' ? 'à la route, pour trouver un taxi' : `${place}, pour prendre ${spokenLine(nextRide)}`;
        return `${getOff}${leg.mode === 'transfer' ? 'Correspondance. ' : ''}${walkTo(leg, stop)}${firstWay}`;
      }
      return `${getOff}${walkTo(leg, `à ${destination}`)}${firstWay}`;
    case 'wait': {
      const ride = steps[index + 1]?.leg;
      if (!ride || !isVehicle(ride)) return `Attends environ ${minutes(leg.duration)}.`;
      const ends = lineEnds(ride);
      // Other lines between the same two stops (Bonjour RATP: « le premier qui passe »).
      const others = [...new Set((ride.alternatives ?? [])
        .filter((line) => line.mode === ride.mode && line.code && line.code !== ride.line_code)
        .map((line) => line.code))].slice(0, 3);
      const orOthers = others.length ? ` Le ${others.join(', le ')} ${others.length > 1 ? 'vont' : 'va'} aussi : prends le premier qui passe.` : '';
      // What is written on the vehicle in the direction travelled, else the two ends of the line.
      const shows = ride.headsign && ride.mode !== 'taxi' ? `, direction ${ride.headsign}` : ends && ride.mode !== 'taxi' ? `, ligne ${ends}` : '';
      const here = leg.at_stop?.on_line ? `Tu es à l'arrêt ${leg.at_stop.name}. ` : '';
      return `${getOff}${here}Attends ${spokenLine(ride)}${shows}. Environ ${minutes(leg.duration)} d'attente.${orOthers}`;
    }
    default: {
      const last = index === steps.length - 1;
      const where = last ? ` jusqu'à ${destination}` : '';
      const off = leg.alight_stop && leg.mode !== 'taxi'
        ? ` Tu descends ${leg.alight_stop.on_line ? `à l'arrêt ${leg.alight_stop.name}` : `vers ${leg.alight_stop.name}`}${leg.stop_count ? `, dans ${leg.stop_count} arrêt${leg.stop_count > 1 ? 's' : ''}` : ''}.`
        : '';
      return `${getOff}À bord ${leg.mode === 'taxi' ? "d'un taxi" : `${spokenLine(leg).replace(/^le /, 'du ')}`} : environ ${minutes(leg.duration)}${where}.${off}${price(leg)}${followed ? ' Je te préviens avant de descendre.' : ''}`;
    }
  }
}

// First sentence of the trip: where, when, and the first thing to do.
export function startSpeech(steps: Step[], destination: string, eta: Date | null, followed = false) {
  const arrival = eta ? ` Arrivée prévue vers ${spokenClock(eta)}.` : '';
  return `C'est parti pour ${destination}.${arrival} ${stepSpeech(steps, 0, destination, followed)}`;
}

// « le bus 40 puis le gbaka »: a whole journey said in a few words.
export function spokenJourney(journey: ApiJourney) {
  const rides = journey.legs.filter(isVehicle);
  return rides.length ? rides.map(spokenLine).join(' puis ') : 'à pied';
}

export const alightSoonSpeech = (leg: ApiLeg) => (leg.mode === 'taxi'
  ? 'On arrive bientôt, prépare-toi à descendre.'
  : leg.alight_stop?.on_line
    ? `Prépare-toi, tu descends au prochain arrêt : ${leg.alight_stop.name}.`
    : 'Prépare-toi, tu descends au prochain arrêt.');
export const arrivalSpeech = (destination: string) => `Te voilà à ${destination}. Merci d'avoir voyagé avec SIRA !`;
export const fareQuestion = (leg: ApiLeg) =>
  `Combien as-tu payé ${spokenLine(leg).replace(/^un taxi$/, 'le taxi')} ? Ta réponse aide les autres voyageurs.`;

// ── GPS: follow the traveller and move to the next step by itself ────────────

// Distances (metres). GPS in town is often 20-40 m off: thresholds stay wide.
const WALK_DONE_M = 35;
const BOARDED_M = 150;
const ALIGHT_WARN_M = 600;
const ALIGHT_DONE_M = 60;
const ARRIVED_M = 40;

const first = (leg: ApiLeg | undefined) => (leg?.geometry?.length ? toLatLng(leg.geometry[0]) : null);
const last = (leg: ApiLeg | undefined) => (leg?.geometry?.length ? toLatLng(leg.geometry[leg.geometry.length - 1]) : null);

// Said once, at the right place: the next turn of a walk (30 m before), and in the
// middle of a ride, where you are (« Tu viens de passer Gare Nord. Encore 6 arrêts. »).
const TURN_SOON_M = 30;
const PASSED_STOP_M = 80;
const MIDWAY_MIN_STOPS = 5;
export type GpsHint = { id: string; text: string } | null;

export function gpsHint(step: Step | undefined, here: Coordinates, said: Set<string>, key: string, destination: string): GpsHint {
  if (!step) return null;
  const { leg } = step;
  if (leg.mode === 'walk' || leg.mode === 'transfer') {
    const turns = leg.walk_steps ?? [];
    // The first one is said when the walk begins, the last one is the arrival.
    for (let index = 1; index < turns.length - 1; index += 1) {
      const turn = turns[index];
      const id = `${key}:turn:${index}`;
      if (!turn.point || said.has(id)) continue;
      if (distanceM(here, toLatLng(turn.point)) < TURN_SOON_M) return { id, text: walkStepText(turn, destination) };
    }
    return null;
  }
  const stops = leg.ride_stops ?? [];
  if (!isVehicle(leg) || leg.mode === 'taxi' || stops.length < MIDWAY_MIN_STOPS) return null;
  const middle = Math.floor((stops.length - 1) / 2);
  const id = `${key}:midway`;
  const stop = stops[middle];
  if (said.has(id) || distanceM(here, { latitude: stop.lat, longitude: stop.lon }) > PASSED_STOP_M) return null;
  const left = stops.length - 1 - middle;
  return { id, text: `Tu viens de passer ${stop.name}. Encore ${left} arrêt${left > 1 ? 's' : ''}.` };
}

export type GpsEvent = { type: 'advance'; to: number } | { type: 'alight-soon' } | { type: 'arrived' } | null;

// What the new position means for the current step. `warned` = the « prépare-toi »
// of this ride was already said.
export function gpsEvent(steps: Step[], index: number, here: Coordinates, warned: boolean, destination: Coordinates | null): GpsEvent {
  const step = steps[index];
  if (!step) return null;
  const { leg } = step;
  const isLast = index === steps.length - 1;
  const end = last(leg) ?? (isLast ? destination : null);
  const reached = (limit: number) => end != null && distanceM(here, end) < limit;
  const next = (): GpsEvent => (isLast ? { type: 'arrived' } : { type: 'advance', to: index + 1 });

  switch (leg.mode) {
    case 'walk':
    case 'transfer':
      return reached(isLast ? ARRIVED_M : WALK_DONE_M) ? next() : null;
    case 'wait': {
      // On board as soon as the traveller moves away along the line.
      const ride = steps[index + 1]?.leg;
      const boarding = first(ride);
      const rideEnd = last(ride);
      if (!ride || !boarding || !rideEnd) return null;
      const moved = distanceM(here, boarding) > BOARDED_M && distanceM(here, rideEnd) < distanceM(boarding, rideEnd) - 100;
      return moved ? { type: 'advance', to: index + 1 } : null;
    }
    default: {
      if (reached(isLast ? ARRIVED_M : ALIGHT_DONE_M)) return next();
      const long = end != null && first(leg) != null && distanceM(first(leg)!, end) > ALIGHT_WARN_M * 1.5;
      return !warned && long && reached(ALIGHT_WARN_M) ? { type: 'alight-soon' } : null;
    }
  }
}
