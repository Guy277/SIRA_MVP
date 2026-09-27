// What SIRA says during a trip, and when (GPS). Short sentences in the spirit
// of Google Maps / Waze, with the words of Abidjan (gbaka, wôrô-wôrô), and only
// facts given by SIRA-MORE: line, duration, distance, estimated price.
import type { ApiJourney, ApiLeg, Coordinates } from '@/lib/sira-api';
import { isVehicle, MODE_NAMES, toLatLng } from '@/lib/journey-format';
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
      if (nextRide) {
        const stop = nextRide.mode === 'taxi' ? 'à la route, pour trouver un taxi' : `à l'arrêt, pour prendre ${spokenLine(nextRide)}`;
        return `${getOff}${leg.mode === 'transfer' ? 'Correspondance. ' : ''}${walkTo(leg, stop)}`;
      }
      return `${getOff}${walkTo(leg, `à ${destination}`)}`;
    case 'wait': {
      const ride = steps[index + 1]?.leg;
      if (!ride || !isVehicle(ride)) return `Attends environ ${minutes(leg.duration)}.`;
      const ends = lineEnds(ride);
      // Other lines between the same two stops (Bonjour RATP: « le premier qui passe »).
      const others = [...new Set((ride.alternatives ?? [])
        .filter((line) => line.mode === ride.mode && line.code && line.code !== ride.line_code)
        .map((line) => line.code))].slice(0, 3);
      const orOthers = others.length ? ` Le ${others.join(', le ')} ${others.length > 1 ? 'vont' : 'va'} aussi : prends le premier qui passe.` : '';
      return `${getOff}Attends ${spokenLine(ride)}${ends && ride.mode !== 'taxi' ? `, ligne ${ends}` : ''}. Environ ${minutes(leg.duration)} d'attente.${orOthers}`;
    }
    default: {
      const last = index === steps.length - 1;
      const where = last ? ` jusqu'à ${destination}` : '';
      return `${getOff}À bord ${leg.mode === 'taxi' ? "d'un taxi" : `${spokenLine(leg).replace(/^le /, 'du ')}`} : environ ${minutes(leg.duration)}${where}.${price(leg)}${followed ? ' Je te préviens avant de descendre.' : ''}`;
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
