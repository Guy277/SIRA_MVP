// SIRA's voice, shared by every screen (greeting, assistant, guidance, alerts).
// Three settings as in Google Maps: all spoken, alerts only, or muted.
// SIRA speaks with its own Piper voice (services/voice), else the phone's voice.
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import * as Speech from 'expo-speech';
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

let mode: VoiceMode = 'on';
const listeners = new Set<() => void>();

export async function loadVoiceMode() {
  try {
    const saved = Platform.OS === 'web' ? window.localStorage.getItem(KEY) : await SecureStore.getItemAsync(KEY);
    if (saved && (MODES as string[]).includes(saved)) { mode = saved as VoiceMode; listeners.forEach((l) => l()); }
  } catch { /* réglage illisible : voix activée */ }
}

export function setVoiceMode(next: VoiceMode) {
  mode = next;
  listeners.forEach((l) => l());
  try {
    if (Platform.OS === 'web') window.localStorage.setItem(KEY, next);
    else void SecureStore.setItemAsync(KEY, next).catch(() => {});
  } catch { /* stockage indisponible */ }
  if (next === 'off') stopSpeaking();
}

// Speaker button: on → alerts only → off → on, and SIRA says the new setting.
export function cycleVoiceMode() {
  const next = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
  setVoiceMode(next);
  if (next !== 'off') void say(next === 'on' ? 'Voix activée.' : 'Je te préviens seulement des alertes.', 'alert');
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
let objectUrl: string | null = null;

export function stopSpeaking() {
  player?.remove();
  player = null;
  if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
  Speech.stop().catch(() => {});
  finish?.();
  finish = null;
}

async function wavUri(base64: string | null, text: string): Promise<string | null> {
  let data = base64;
  if (!data) {
    // SIRA's own voice for sentences written by the app (steps, alerts, greeting).
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
      const response = await fetch(`${apiBaseUrl()}/voice/tts`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }), signal: controller.signal,
      });
      if (!response.ok) return null;
      if (Platform.OS === 'web') {
        objectUrl = URL.createObjectURL(await response.blob());
        return objectUrl;
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      const file = new File(Paths.cache, 'sira-voix.wav');
      file.write(bytes);
      return file.uri;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  if (Platform.OS === 'web') return `data:audio/wav;base64,${data}`;
  const file = new File(Paths.cache, 'sira-voix.wav');
  file.write(data, { encoding: 'base64' });
  return file.uri;
}

// Speaks one sentence (the previous one stops). Resolves when it has been said,
// so a conversation can listen again right after a question.
export async function say(text: string, kind: SpeechKind = 'guidance', audioBase64: string | null = null): Promise<void> {
  if (!text || !allowed(kind)) return;
  stopSpeaking();
  const mine = ++sentence;
  const done = new Promise<void>((resolve) => { finish = resolve; });
  const uri = await wavUri(audioBase64, text);
  if (mine !== sentence) return;  // a newer sentence took over
  try {
    if (!uri) throw new Error('Piper indisponible');
    const current = createAudioPlayer({ uri });
    player = current;
    const subscription = (current as unknown as PlayerEvents).addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish && player === current) {
        subscription.remove();
        finish?.();
        finish = null;
      }
    });
    current.play();
  } catch {
    Speech.speak(text, { language: 'fr-FR', onDone: () => finish?.(), onStopped: () => finish?.(), onError: () => finish?.() });
  }
  // Never wait forever (autoplay blocked, audio route lost…).
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 2000 + text.length * 90));
  await Promise.race([done, timeout]);
}
