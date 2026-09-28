// Everything SIRA says out loud outside a trip, in one place: short sentences
// in « tu », for travellers who walk, are in the noise or have no time to read.
// Figures (price, duration) always come from SIRA-MORE, never written here.
// The guidance during a trip is in lib/guidance.ts.
import type { ApiJourney, ApiLeg } from '@/lib/sira-api';
import type { JourneySearch } from '@/lib/journey-store';
import { isVehicle } from '@/lib/journey-format';
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

// Detail of a journey, before leaving: read step by step, each sentence lighting
// up its step on the screen (the summary, every step, then the arrival).
const spokenClock = (date: Date) => `${date.getHours()} h${date.getMinutes() ? ` ${String(date.getMinutes()).padStart(2, '0')}` : ''}`;
function stepSpeech(leg: ApiLeg) {
  switch (leg.mode) {
    case 'walk': return `Marche environ ${minutes(leg.duration)}.`;
    case 'transfer': return `Change à pied, environ ${minutes(leg.duration)}.`;
    case 'wait': return `Attends environ ${minutes(leg.duration)}.`;
    default: return `Prends ${spokenLine(leg)}, environ ${minutes(leg.duration)}.`;
  }
}
export const journeyReading = (journey: ApiJourney, legs: ApiLeg[], arrival: string, arrivalAt: Date) => ({
  summary: `Ton trajet : ${spokenJourney(journey)}. Environ ${minutes(journey.duration)} et ${francs(journey.price)}.`,
  steps: legs.map(stepSpeech),
  arrival: `Tu arrives à ${arrival} vers ${spokenClock(arrivalAt)}. Touche Démarrer l'itinéraire pour partir.`,
});

// Reports.
export const REPORT_CHOOSE = 'Quel incident veux-tu signaler ? Touche le bon type.';
export const reportDetailSpeech = (title: string) => `${title}. Vérifie l'endroit, puis touche Signaler l'événement.`;
export const REPORT_SENT = "Merci ! Ton signalement est envoyé. Il comptera dès qu'un autre voyageur le confirme.";
export const REPORT_FAILED = "Je n'ai pas pu envoyer ton signalement. Réessaie dans un instant.";

// Sign-in: read only when the traveller touches « Écouter » (the screen stays silent).
export const LOGIN_SIGNED_IN = 'Ton compte est déjà actif sur ce téléphone. Touche Continuer.';
export const LOGIN_PHONE = 'Entre ton numéro Orange qui commence par 07.';
export const LOGIN_CODE = 'Je t\'ai envoyé un code par SMS. Entre les 4 chiffres.';
export const LOGIN_NAME = 'Bienvenue ! Comment tu t\'appelles ?';
