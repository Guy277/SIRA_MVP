// SIRA's message on the home screen: ONE message, written in the bubble and said
// out loud word for word. It follows the traveller signed in and the time of day.
//
// Three rules, or the greeting becomes noise:
// 1. Same shape every time: « Akwaba Guy ! » + (something useful for this hour) + the
//    question. Travellers who read little recognise it even when it changes a little.
// 2. Short: under 5 seconds of voice (it is heard at every opening of the app).
// 3. Never something that may be false: only facts true at that hour (the lines close
//    at 22:00 and open at 05:00 in the network data), never traffic without a report.
//
// No imports: kept free of the app so its tests run with plain Node (tests/greeting.test.mjs).

export type Greeting = {
  // First line of the bubble, in bold (« Akwaba Guy ! »).
  hello: string;
  // The other lines of the bubble, in order.
  lines: string[];
  // What SIRA says: exactly the bubble, line after line.
  speech: string;
};

// Abidjan is on UTC all year (no summer time).
const hourIn = (date: Date) => date.getUTCHours() + date.getUTCMinutes() / 60;

// Lines closed at night in the 2021 data (latest closing 22:00, opening 05:00).
export const isNight = (date: Date) => date.getUTCHours() >= 22 || date.getUTCHours() < 5;

export const INTRODUCTION = 'Je suis SIRA, ton assistant de mobilité.';

// What is useful to say at this hour, and the question that fits it.
function moment(date: Date): { info: string | null; question: string } {
  const hour = hourIn(date);
  if (isNight(date)) return { info: 'À cette heure, seuls les taxis roulent.', question: 'On rentre ?' };
  if (hour < 9) return { info: 'Bien matinal !', question: 'On va où ?' };
  if (hour < 17) return { info: null, question: 'On va où ?' };
  if (hour < 20) return { info: null, question: 'On rentre ?' };
  return { info: "Les transports roulent jusqu'à 22 h.", question: 'On va où ?' };
}

const build = (hello: string, lines: string[]): Greeting => ({ hello, lines, speech: [hello, ...lines].join(' ') });

// « Akwaba Guy ! » at an opening of the app or a new sign-in. SIRA introduces
// itself only the first time this account opens the app.
export function homeGreeting(firstName: string | null, firstTime: boolean, now = new Date()): Greeting {
  const { info, question } = moment(now);
  const lines = [info, firstTime ? INTRODUCTION : null, question].filter((line): line is string => Boolean(line));
  return build(`Akwaba${firstName ? ` ${firstName}` : ''} !`, lines);
}

// Back from a trip: goodbye for this part of the day, and how to go back.
const partOfDay = (date: Date) => {
  const hour = date.getUTCHours();
  return hour >= 5 && hour < 18 ? 'journée' : hour >= 18 && hour < 22 ? 'soirée' : 'nuit';
};
export const arrivalGreeting = (arrival: string, wayBack: string, now = new Date()): Greeting =>
  build(`Bonne ${partOfDay(now)} à ${arrival} !`, [`Pour rentrer, touche ${wayBack}.`]);
