// Everything SIRA says out loud outside a trip, in one place: short sentences
// in « tu », for travellers who walk, are in the noise or have no time to read.
// Figures (price, duration) always come from SIRA-MORE, never written here.
// The guidance during a trip is in lib/guidance.ts.
import type { ApiJourney } from '@/lib/sira-api';
import type { JourneySearch } from '@/lib/journey-store';
import { isVehicle } from '@/lib/journey-format';
import { minutes, spokenJourney } from '@/lib/guidance';

const francs = (price: number | null | undefined) => (price == null ? 'prix à confirmer' : `${price} francs`);

// Home, at every opening of the app.
export const greetingSpeech = (firstName: string | null) =>
  `Akwaba${firstName ? ` ${firstName}` : ''} ! Je suis SIRA, ton assistant de mobilité. On va où ?`;

// Home, after a trip: goodbye (« journée », « soirée » or « nuit », Abidjan time), and how to go back.
const partOfDay = (date: Date) => {
  const hour = date.getUTCHours();
  return hour >= 5 && hour < 18 ? 'journée' : hour >= 18 && hour < 22 ? 'soirée' : 'nuit';
};
export const arrivalHomeSpeech = (arrival: string, wayBack: string, now = new Date()) =>
  `Bonne ${partOfDay(now)} à ${arrival} ! Pour rentrer, touche ${wayBack}.`;

// Voice assistant, as soon as it opens.
export const MIC_PROMPT = 'Assistant vocal SIRA. Touche le micro et dis où tu vas.';

// Lines closed at night in the 2021 data (latest closing 22:00, opening 05:00), Abidjan time (UTC).
const isNight = (date: Date) => date.getUTCHours() >= 22 || date.getUTCHours() < 5;

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

// Detail of a journey, before leaving.
export const journeySpeech = (journey: ApiJourney) =>
  `${spokenJourney(journey).replace(/^./, (letter) => letter.toUpperCase())}. Environ ${minutes(journey.duration)} et ${francs(journey.price)}. `
  + "Touche Démarrer l'itinéraire pour commencer.";

// Reports.
export const REPORT_CHOOSE = 'Quel incident veux-tu signaler ? Touche le bon type.';
export const reportDetailSpeech = (title: string) => `${title}. Vérifie l'endroit, puis touche Signaler l'événement.`;
export const REPORT_SENT = "Merci ! Ton signalement est envoyé. Il comptera dès qu'un autre voyageur le confirme.";
export const REPORT_FAILED = "Je n'ai pas pu envoyer ton signalement. Réessaie dans un instant.";

// Sign-in.
export const LOGIN_PHONE = 'Entre ton numéro Orange qui commence par 07.';
export const LOGIN_CODE = 'Je t\'ai envoyé un code par SMS. Entre les 4 chiffres.';
export const LOGIN_NAME = 'Bienvenue ! Comment tu t\'appelles ?';
