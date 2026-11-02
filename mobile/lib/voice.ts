// SIRA's voice, shared by every screen (greeting, assistant, guidance, alerts).
// Three settings as in Google Maps: all spoken, alerts only, or muted. Muted until the
// traveller turns it on (Paramètres → Voix de SIRA, or the speaker button): opening SIRA
// never starts talking by itself.
// SIRA speaks with ONE voice only: its own Piper voice « pierre » (services/voice), a man
// like the character. No other voice, not even the phone's: without SIRA's voice (offline,
// service stopped) the sentence stays on screen, unspoken.
import { useEffect, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import type { Ionicons } from '@expo/vector-icons';
import { apiBaseUrl } from '@/lib/sira-api';

export type VoiceMode = 'on' | 'alerts' | 'off';
// expo-audio's player emits this event (typed loosely by the SDK).
type PlayerEvents = { addListener: (event: 'playbackStatusUpdate', listener: (status: { didJustFinish: boolean }) => void) => { remove(): void } };
// guidance: steps of the trip; alert: incidents, next stop; answer: reply to
// something the traveller asked (always spoken unless muted); greeting: hello.
export type SpeechKind = 'guidance' | 'alert' | 'answer' | 'greeting';

const KEY = 'sira-voice-mode';
const MODES: VoiceMode[] = ['on', 'alerts', 'off'];
export const VOICE_MODE_LABELS: Record<VoiceMode, string> = { on: 'Voix activée', alerts: 'Alertes seulement', off: 'Voix coupée' };
// One icon per setting, the same on every screen (home, trip, profile, settings).
export const VOICE_MODE_ICONS: Record<VoiceMode, keyof typeof Ionicons.glyphMap> = { on: 'volume-high', alerts: 'notifications', off: 'volume-mute' };
export const VOICE_MODE_DETAILS: Record<VoiceMode, string> = {
  on: 'SIRA te salue, te guide pendant le trajet et répond à voix haute.',
  alerts: 'SIRA parle seulement pour les alertes du trajet et pour répondre à tes questions.',
  off: 'SIRA ne parle pas : tout reste écrit à l’écran.',
};

// Until the traveller chooses, SIRA stays silent.
export const DEFAULT_VOICE_MODE: VoiceMode = 'off';
let mode: VoiceMode = DEFAULT_VOICE_MODE;
const listeners = new Set<() => void>();

const readSetting = (key: string) => (Platform.OS === 'web' ? Promise.resolve(window.localStorage.getItem(key)) : SecureStore.getItemAsync(key));
function writeSetting(key: string, value: string) {
  try {
    if (Platform.OS === 'web') window.localStorage.setItem(key, value);
    else void SecureStore.setItemAsync(key, value).catch(() => {});
  } catch { /* stockage indisponible */ }
}

export async function loadVoiceMode() {
  try {
    const saved = await readSetting(KEY);
    if (saved && (MODES as string[]).includes(saved)) { mode = saved as VoiceMode; listeners.forEach((l) => l()); }
  } catch { /* réglage illisible : voix coupée */ }
}

export function setVoiceMode(next: VoiceMode) {
  mode = next;
  listeners.forEach((l) => l());
  writeSetting(KEY, next);
  if (next === 'off') stopSpeaking();
}

// The traveller picked a setting: SIRA says it, so they hear what they turned on.
export function chooseVoiceMode(next: VoiceMode) {
  setVoiceMode(next);
  if (next !== 'off') void say(next === 'on' ? 'Voix activée.' : 'Je te préviens seulement des alertes.', 'alert');
}

// Speaker button: on → alerts only → off → on.
export function cycleVoiceMode() {
  const next = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
  chooseVoiceMode(next);
  return next;
}

export const getVoiceMode = () => mode;

export function useVoiceMode() {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    () => mode,
    () => mode,
  );
}

const allowed = (kind: SpeechKind) =>
  mode === 'on' || (mode === 'alerts' && (kind === 'alert' || kind === 'answer'));

// Kept outside the screens so a sentence goes on when the screen changes.
let player: AudioPlayer | null = null;
let finish: (() => void) | null = null;
let sentence = 0;  // only the latest sentence is spoken

// True while SIRA is talking: every screen then shows how to stop it (WCAG 1.4.2).
let speaking = false;
const speakingListeners = new Set<() => void>();
function setSpeaking(next: boolean) {
  if (speaking === next) return;
  speaking = next;
  speakingListeners.forEach((l) => l());
}
export function useSpeaking() {
  return useSyncExternalStore(
    (listener) => { speakingListeners.add(listener); return () => speakingListeners.delete(listener); },
    () => speaking,
    () => speaking,
  );
}

const finished = () => {
  finish?.();
  finish = null;
  setSpeaking(false);
};

// Number of the last sentence cut before its end (« Stop », or a newer sentence).
let interrupted = 0;

export function stopSpeaking() {
  interrupted = sentence;
  player?.remove();
  player = null;
  finished();
}

// Sentences written by the app (greeting, steps, prompts) come back often: SIRA's
// voice for each one is kept (on the phone: in the cache folder, even after a
// restart; on the web: for the session), so it plays at once the next time.
const CACHE_VERSION = 'v5';
const WEB_CACHE_MAX = 40;
const webCache = new Map<string, string>();
// Waited for, since there is no other voice: a sentence arrives late rather than in another voice.
const TTS_TIMEOUT_MS = 10000;

const textKey = (text: string) => {
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) hash = ((hash << 5) + hash + text.charCodeAt(index)) | 0;
  return `${CACHE_VERSION}-${(hash >>> 0).toString(36)}-${text.length}`;
};

// The server sends MP3 (about 9 times lighter than WAV, so it arrives in time on a
// mobile connection and SIRA keeps its own voice), or WAV when it could not encode it.
const extensionFor = (mime: string | null | undefined) => (mime?.includes('wav') ? 'wav' : 'mp3');

async function fetchVoice(text: string): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TTS_TIMEOUT_MS);
  try {
    const response = await fetch(`${apiBaseUrl()}/voice/tts`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }), signal: controller.signal,
    });
    return response.ok ? response : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// SIRA's own voice for a sentence, from the cache when possible. The same sentence
// asked twice at once (prepared, then said) is fetched only once.
const inflight = new Map<string, Promise<string | null>>();
function cachedVoice(text: string): Promise<string | null> {
  const key = textKey(text);
  const known = inflight.get(key);
  if (known) return known;
  const loading = loadVoice(text, key).finally(() => inflight.delete(key));
  inflight.set(key, loading);
  return loading;
}

async function loadVoice(text: string, key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    const known = webCache.get(key);
    if (known) return known;
    const response = await fetchVoice(text);
    if (!response) return null;
    const url = URL.createObjectURL(await response.blob());
    webCache.set(key, url);
    if (webCache.size > WEB_CACHE_MAX) {
      const [oldest, oldUrl] = webCache.entries().next().value as [string, string];
      webCache.delete(oldest);
      URL.revokeObjectURL(oldUrl);
    }
    return url;
  }
  const known = ['mp3', 'wav'].map((ext) => new File(Paths.cache, `sira-voix-${key}.${ext}`)).find((file) => file.exists);
  if (known) return known.uri;
  const response = await fetchVoice(text);
  if (!response) return null;
  const file = new File(Paths.cache, `sira-voix-${key}.${extensionFor(response.headers.get('content-type'))}`);
  file.write(new Uint8Array(await response.arrayBuffer()));
  return file.uri;
}

async function audioUri(base64: string | null, mime: string, text: string): Promise<string | null> {
  if (!base64) return cachedVoice(text);
  // Answer of the assistant: its audio came with the answer (no second request).
  if (Platform.OS === 'web') return `data:${mime};base64,${base64}`;
  const file = new File(Paths.cache, `sira-voix-reponse.${extensionFor(mime)}`);
  file.write(base64, { encoding: 'base64' });
  return file.uri;
}

// Prepares SIRA's voice for sentences that will be said soon (e.g. the microphone
// prompt), so they start without waiting. One at a time, never blocking the app.
export async function prepareSpeech(texts: string[]) {
  for (const text of texts) await cachedVoice(text).catch(() => null);
}

// Browsers keep a page silent until it is touched once: the sentence waits for
// that first touch instead of being lost (on a phone, it is spoken right away).
type Pending = { text: string; kind: SpeechKind; audioBase64: string | null; audioMime: string };
let pending: Pending | null = null;
const needsTouch = () => {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return false;
  const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  return Boolean(activation && !activation.hasBeenActive);
};
function sayAfterFirstTouch(next: Pending) {
  const first = !pending;
  pending = next;
  if (!first) return;
  window.addEventListener('pointerdown', () => {
    const waiting = pending;
    pending = null;
    if (waiting) void say(waiting.text, waiting.kind, waiting.audioBase64, waiting.audioMime);
  }, { once: true });
}

// Speaks one sentence (the previous one stops). Resolves when it has been said,
// so a conversation can listen again right after a question: true when it was
// said to the end, false when it was not said or was cut (so a series of
// sentences stops with it).
export async function say(text: string, kind: SpeechKind = 'guidance', audioBase64: string | null = null,
  audioMime = 'audio/mpeg'): Promise<boolean> {
  if (!text || !allowed(kind)) return false;
  if (needsTouch()) { sayAfterFirstTouch({ text, kind, audioBase64, audioMime }); return false; }
  stopSpeaking();
  const mine = ++sentence;
  const done = new Promise<void>((resolve) => { finish = resolve; });
  const uri = await audioUri(audioBase64, audioMime, text);
  if (mine !== sentence || interrupted === mine) return false;  // a newer sentence took over, or « Stop »
  // SIRA's voice unavailable (offline, service stopped): the sentence stays on screen, unspoken.
  if (!uri) { finished(); return false; }
  try {
    const current = createAudioPlayer({ uri });
    player = current;
    const subscription = (current as unknown as PlayerEvents).addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish && player === current) {
        subscription.remove();
        finished();
      }
    });
    current.play();
  } catch {
    // Audio could not be played: no other voice takes over.
    finished();
    return false;
  }
  setSpeaking(true);
  // Never wait forever (autoplay blocked, audio route lost…).
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 2000 + text.length * 90));
  await Promise.race([done, timeout]);
  if (mine === sentence) setSpeaking(false);
  return mine === sentence && interrupted !== mine;
}

// A reply of several sentences, said one after the other. The first one's voice came
// with the answer; the next ones are asked for while it plays (the voice service is
// already preparing them), so SIRA starts talking without waiting for the whole reply.
export async function sayParts(parts: string[], kind: SpeechKind = 'answer', firstAudioBase64: string | null = null,
  audioMime = 'audio/mpeg'): Promise<boolean> {
  const [first, ...rest] = parts;
  if (!first || !allowed(kind)) return false;
  rest.forEach((text) => { void cachedVoice(text).catch(() => null); });
  if (!(await say(first, kind, firstAudioBase64, audioMime))) return false;
  for (const text of rest) if (!(await say(text, kind))) return false;
  return true;
}

// A screen that speaks once per situation: `key` names the situation (a search,
// a journey, a step of the login), so coming back to it does not repeat it.
const spokenKeys = new Set<string>();
export function useSpeech(key: string | null, text: string | null, kind: SpeechKind = 'guidance') {
  useEffect(() => {
    if (!key || !text || spokenKeys.has(key)) return;
    spokenKeys.add(key);
    void say(text, kind);
  }, [key, text, kind]);
}
