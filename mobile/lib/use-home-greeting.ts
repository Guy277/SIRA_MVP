// When SIRA greets on the home screen, and with which message (lib/greeting.ts).
// A greeting moment is: the first time the home is shown after the app opens, after
// a new sign-in (another traveller, or the same one again), after more than 30 min
// away from the app, or just back from a trip. The bubble and the voice start
// together at that moment; the rest of the time the bubble stays, silent.
import { useEffect, useId, useState, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { arrivalGreeting, homeGreeting, type Greeting } from '@/lib/greeting';
import { prepareSpeech, say } from '@/lib/voice';
import { MIC_PROMPT } from '@/lib/spoken';

const AWAY_MS = 30 * 60_000;
// The voice waits for the screen to appear (transition from the sign-in).
const VOICE_DELAY_MS = 500;
// A home shown right after its moment began still plays the bubble's entrance.
const FRESH_MS = 2500;

type Moment = { kind: 'hello' | 'arrival'; firstTime: boolean; key: number; at: number };

// Kept for the whole run of the app: the home can be mounted more than once in the
// navigation (one under the sign-in screen, one after it), all show the same moment.
let lastMoment: Moment | null = null;
// The hour the message is written for, refreshed every minute and at each moment.
let clock = new Date();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
let clockTimer: ReturnType<typeof setInterval> | undefined;
function subscribe(listener: () => void) {
  listeners.add(listener);
  clockTimer ??= setInterval(() => { clock = new Date(); emit(); }, 60_000);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) { clearInterval(clockTimer); clockTimer = undefined; }
  };
}

let greetedUser: string | null | undefined;  // undefined: nobody greeted since the app opened
let greetedSession: string | null = null;
let awayLong = false;
let leftAt: number | null = null;
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    if (leftAt !== null && Date.now() - leftAt >= AWAY_MS) awayLong = true;
    leftAt = null;
    clock = new Date();
    emit();
  } else if (state === 'background' && leftAt === null) {
    leftAt = Date.now();
  }
});

// The voice belongs to the moment, not to one of the homes: it is said if a home
// is shown when it starts, dropped if the traveller already left the home.
const shownHomes = new Set<string>();
let voiceTimer: ReturnType<typeof setTimeout> | undefined;
function sayWhenShown(text: string, kind: 'guidance' | 'greeting') {
  clearTimeout(voiceTimer);
  voiceTimer = setTimeout(() => {
    if (!shownHomes.size) return;
    // Then the microphone prompt is prepared, so it starts at once (not before:
    // it would slow down the greeting).
    void say(text, kind).then(() => prepareSpeech([MIC_PROMPT]));
  }, VOICE_DELAY_MS);
}

// Accounts SIRA already introduced itself to on this phone (« Je suis SIRA… »).
const INTRODUCED_KEY = 'sira-introduced';
const INTRODUCED_MAX = 20;
let introduced: string[] = [];
const introducedReady = (async () => {
  try {
    const text = Platform.OS === 'web' ? window.localStorage.getItem(INTRODUCED_KEY) : await SecureStore.getItemAsync(INTRODUCED_KEY);
    if (text) introduced = JSON.parse(text) as string[];
  } catch { /* mémoire illisible : SIRA se présente de nouveau */ }
})();
function markIntroduced(userId: string) {
  introduced = [...introduced.filter((id) => id !== userId), userId].slice(-INTRODUCED_MAX);
  const text = JSON.stringify(introduced);
  try {
    if (Platform.OS === 'web') window.localStorage.setItem(INTRODUCED_KEY, text);
    else void SecureStore.setItemAsync(INTRODUCED_KEY, text).catch(() => {});
  } catch { /* stockage indisponible */ }
}

// A new sign-in gives a new token, even for the same traveller.
const due = (userId: string | null, sessionToken: string | null) =>
  greetedUser === undefined || greetedUser !== userId || greetedSession !== sessionToken || awayLong;

type Options = {
  ready: boolean;  // stored session read
  focused: boolean;  // the home is really shown (not under the sign-in screen)
  userId: string | null;
  sessionToken: string | null;
  firstName: string | null;
  // Just back from a trip, not yet said goodbye.
  arrival: { to: string; wayBack: string; pending: boolean } | null;
  onArrivalSaid: () => void;
};

export type HomeMessage = { greeting: Greeting; key: number; animate: boolean } | null;

export function useHomeGreeting({ ready, focused, userId, sessionToken, firstName, arrival, onArrivalSaid }: Options): HomeMessage {
  const moment = useSyncExternalStore(subscribe, () => lastMoment, () => lastMoment);
  const now = useSyncExternalStore(subscribe, () => clock, () => clock);
  const [mountedAt] = useState(() => Date.now());
  const id = useId();

  useEffect(() => {
    if (!focused) return;
    shownHomes.add(id);
    return () => { shownHomes.delete(id); };
  }, [focused, id]);

  const arrivalPending = Boolean(arrival?.pending);
  // Back from the background after a long time: `now` changes, the moment is checked again.
  const wake = now.getTime();
  useEffect(() => {
    if (!ready || !focused || (!arrivalPending && !due(userId, sessionToken))) return;
    let alive = true;
    void introducedReady.then(() => {
      if (!alive || (!arrivalPending && !due(userId, sessionToken))) return;
      const at = new Date();
      const kind = arrivalPending && arrival ? 'arrival' : 'hello';
      const firstTime = kind === 'hello' && userId !== null && !introduced.includes(userId);
      if (firstTime && userId) markIntroduced(userId);
      if (kind === 'arrival') onArrivalSaid();
      // Counted as greeted now: leaving the home at once drops the voice instead
      // of saying it later, out of place.
      greetedUser = userId;
      greetedSession = sessionToken;
      awayLong = false;
      // The bubble is written for the very minute the voice speaks.
      clock = at;
      lastMoment = { kind, firstTime, key: (lastMoment?.key ?? 0) + 1, at: at.getTime() };
      emit();
      const message = kind === 'arrival' && arrival
        ? arrivalGreeting(arrival.to, arrival.wayBack, at)
        : homeGreeting(firstName, firstTime, at);
      sayWhenShown(message.speech, kind === 'arrival' ? 'guidance' : 'greeting');
    });
    return () => { alive = false; };
    // `arrival` and `firstName` are read at the moment itself; they do not start one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, focused, userId, sessionToken, arrivalPending, wake]);

  // Not greeted yet since the app opened: nothing shown until the moment comes.
  if (!moment) return null;
  const greeting = moment.kind === 'arrival' && arrival
    ? arrivalGreeting(arrival.to, arrival.wayBack, now)
    : homeGreeting(firstName, moment.firstTime, now);
  // The entrance plays with the voice: for a moment that began while this home was
  // shown, or just before it appeared.
  return { greeting, key: moment.key, animate: moment.at >= mountedAt - FRESH_MS };
}
