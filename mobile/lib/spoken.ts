// Everything SIRA says out loud outside a trip, in one place: short sentences
// in « tu », for travellers who walk, are in the noise or have no time to read.
// Figures (price, duration) always come from SIRA-MORE, never written here.
// The guidance during a trip is in lib/guidance.ts.
import type { ApiJourney, ApiLeg, StopMention } from '@/lib/sira-api';
import type { JourneySearch } from '@/lib/journey-store';
import { isVehicle, walkStepText } from '@/lib/journey-format';
import { minutes, spokenJourney, spokenLine } from '@/lib/guidance';
import { isNight } from '@/lib/greeting';

const francs = (price: number | null | undefined) => (price == null ? 'prix à confirmer' : `${price} francs`);

// The home greeting (« Akwaba Guy ! … ») is written and said from lib/greeting.ts.

// Voice assistant, as soon as it opens.
export const MIC_PROMPT = 'Assistant vocal SIRA. Touche le micro et dis où tu vas.';

// Results of a search: how many ways, and the cheapest one.
export function resultsSpeech(search: JourneySearch) {
  const { journeys } = search;
  if (!journeys.length) return null;
  const collective = journeys.filter((journey) => journey.legs.some((leg) => isVehicle(leg) && leg.mode !== 'taxi'));
  if (!collective.length) {
    const taxi = journeys[0];
    const figures = `environ ${francs(taxi.price)} et ${minutes(taxi.duration)}`;
    return isNight(search.departureAt)
      ? `À cette heure, les bus, gbakas et wôrô-wôrô sont fermés : je te propose seulement le taxi, ${figures}.`
      : `Pour ce trajet, je n'ai trouvé que le taxi : ${figures}.`;
  }
  const cheapest = [...collective].sort((a, b) => (a.price ?? 1e9) - (b.price ?? 1e9))[0];
  const count = journeys.length;
  return `J'ai trouvé ${count} façon${count > 1 ? 's' : ''} d'aller à ${search.arrival.name}. `
    + `La moins chère : ${spokenJourney(cheapest)}, ${francs(cheapest.price)}, ${minutes(cheapest.duration)}.`;
}

export const SEARCH_ERRORS = {
  sameEndpoints: "Le départ et l'arrivée sont les mêmes : choisis une autre destination.",
  nothing: "Je n'ai trouvé aucun trajet entre ces deux lieux à cette heure.",
  offline: "Je n'arrive pas à joindre SIRA. Vérifie ta connexion, puis réessaie.",
};

// A journey out loud. Rules, or it becomes noise: one breath per sentence (about
// 12 words), one piece of advice each, never twice the same thing. Each sentence
// has the key of the part of the screen it lights up: 'summary', `step:2`,
// `board:2` / `alight:2` (the « Monte à » / « Descends à » lines of step 2).
export type SpokenPart = { key: string; text: string };

// « jusqu'à l'arrêt Carrefour Kouté » for a stop of the line, « vers Carrefour Kouté » for a landmark.
const spokenTo = (stop: StopMention) => (stop.on_line ? `jusqu'à l'arrêt ${stop.name}` : `vers ${stop.name}`);
export const spokenAt = (stop: StopMention) => (stop.on_line ? `à l'arrêt ${stop.name}` : `vers ${stop.name}`);
const capital = (text: string) => text.replace(/^./, (letter) => letter.toUpperCase());
const stopsLeft = (count: number | null | undefined) => (count ? `, après ${count} arrêt${count > 1 ? 's' : ''}` : '');
const spokenDuration = (value: number) => {
  if (value < 60) return minutes(value);
  const hours = Math.floor(value / 60);
  return `${hours} heure${hours > 1 ? 's' : ''}${value % 60 ? ` ${value % 60}` : ''}`;
};
// « 240 mètres » (rounded as people say it).
const spokenMetres = (value: number) => `${value < 100 ? Math.round(value / 10) * 10 : Math.round(value / 50) * 50} mètres`;

// Before leaving (about 10 s): only what must be remembered — the line, where to
// get on, where to get off — then how long and how much. Walks and waits are written,
// not said; touching a step reads it in full.
export function journeyBrief(journey: ApiJourney, legs: ApiLeg[], arrival: string): SpokenPart[] {
  const parts: SpokenPart[] = [];
  legs.forEach((leg, index) => {
    if (!isVehicle(leg)) return;
    if (leg.mode === 'taxi') {
      parts.push({ key: `step:${index}`, text: `Un taxi, environ ${minutes(leg.duration)}.` });
      return;
    }
    parts.push({ key: `step:${index}`, text: `${capital(spokenLine(leg))}${leg.headsign ? `, direction ${leg.headsign}` : ''}.` });
    if (leg.board_stop) parts.push({ key: `board:${index}`, text: `Monte ${spokenAt(leg.board_stop)}.` });
    if (leg.alight_stop) parts.push({ key: `alight:${index}`, text: `Descends ${spokenAt(leg.alight_stop)}${stopsLeft(leg.stop_count)}.` });
  });
  if (!parts.length) parts.push({ key: 'step:0', text: `À pied, environ ${spokenDuration(journey.duration)} jusqu'à ${arrival}.` });
  const cost = journey.price ? `, ${francs(journey.price)}` : '';
  parts.push({ key: 'summary', text: `${capital(spokenDuration(journey.duration))}${cost}. Touche Démarrer quand tu veux.` });
  return parts;
}

// One step in full, when the traveller touches it: the same words as on the screen.
export function stepInFull(leg: ApiLeg, arrival: string, index: number): SpokenPart[] {
  const key = `step:${index}`;
  switch (leg.mode) {
    case 'walk':
    case 'transfer': {
      const where = leg.to_stop ? ` ${spokenTo(leg.to_stop)}` : leg.from_stop ? ` jusqu'à ${arrival}` : '';
      const first = `${leg.mode === 'transfer' ? 'Change à pied' : 'Marche'} ${minutes(leg.duration)}${where}.`;
      const turns = (leg.walk_steps ?? []).slice(0, 8).map((step) => ({
        key,
        text: step.distance_m >= 20 ? `${capital(spokenMetres(step.distance_m))} : ${walkStepText(step, arrival)}` : walkStepText(step, arrival),
      }));
      return [{ key, text: first }, ...turns];
    }
    case 'wait': {
      const parts = [{ key, text: `Attends environ ${minutes(leg.duration)}${leg.at_stop ? ` ${spokenAt(leg.at_stop)}` : ''}.` }];
      const peak = (leg as ApiLeg & { duration_p90?: number }).duration_p90;
      if (peak && peak > leg.duration) parts.push({ key, text: `Aux heures de pointe, jusqu'à ${minutes(peak)}.` });
      return parts;
    }
    case 'taxi':
      return [
        { key, text: `Prends un taxi, environ ${minutes(leg.duration)}.` },
        { key, text: `Environ ${francs(leg.price)}.` },
      ];
    default: {
      const parts: SpokenPart[] = [{ key, text: `Prends ${spokenLine(leg)}${leg.headsign ? `, direction ${leg.headsign}` : ''}.` }];
      if (leg.board_stop) parts.push({ key: `board:${index}`, text: `Monte ${spokenAt(leg.board_stop)}.` });
      const via = leg.via_stops ?? [];
      if (via.length) parts.push({ key, text: `Tu passes par ${via.length > 1 ? `${via.slice(0, -1).join(', ')} et ${via[via.length - 1]}` : via[0]}.` });
      if (leg.before_alight_stop) parts.push({ key, text: `Prépare-toi après ${leg.before_alight_stop}.` });
      if (leg.alight_stop) parts.push({ key: `alight:${index}`, text: `Descends ${spokenAt(leg.alight_stop)}${stopsLeft(leg.stop_count)}.` });
      if (leg.price) parts.push({ key, text: `Environ ${francs(leg.price)}.` });
      return parts;
    }
  }
}

// Reports.
export const REPORT_CHOOSE = 'Quel incident veux-tu signaler ? Touche le bon type.';
export const reportDetailSpeech = (title: string) => `${title}. Vérifie l'endroit, puis touche Signaler l'événement.`;
export const REPORT_SENT = "Merci ! Ton signalement est envoyé. Il comptera dès qu'un autre voyageur le confirme.";
export const REPORT_FAILED = "Je n'ai pas pu envoyer ton signalement. Réessaie dans un instant.";
