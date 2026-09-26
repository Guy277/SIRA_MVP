// Signed-in traveller: token kept in the phone's secure storage
// (expo-secure-store) or in the browser on web.
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { useSyncExternalStore } from 'react';
import { setAuthenticated } from '@/hooks/use-auth';

export type SessionUser = { id: string; phone_number: string; full_name: string | null; role: string };
type Session = { token: string; user: SessionUser } | null;

const KEY = 'sira-session';
// Last traveller signed in on this device, kept after logout so the login
// screen can greet them by name and prefill their number.
const KNOWN_KEY = 'sira-known-traveller';
export type KnownTraveller = { phone_number: string; full_name: string | null };
let session: Session = null;
let known: KnownTraveller | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

async function persist(key: string, value: unknown) {
  const text = value ? JSON.stringify(value) : null;
  try {
    if (Platform.OS === 'web') {
      if (text) window.localStorage.setItem(key, text); else window.localStorage.removeItem(key);
    } else if (text) {
      await SecureStore.setItemAsync(key, text);
    } else {
      await SecureStore.deleteItemAsync(key);
    }
  } catch { /* stockage indisponible : gardé en mémoire */ }
}

async function load<T>(key: string): Promise<T | null> {
  const text = Platform.OS === 'web' ? window.localStorage.getItem(key) : await SecureStore.getItemAsync(key);
  return text ? JSON.parse(text) as T : null;
}

export function currentToken() {
  return session?.token ?? null;
}

export function setSession(value: Session) {
  session = value;
  setAuthenticated(Boolean(value));
  void persist(KEY, value);
  if (value) {
    known = { phone_number: value.user.phone_number, full_name: value.user.full_name };
    void persist(KNOWN_KEY, known);
  }
  emit();
}

// Restores a previous session at start-up.
export async function restoreSession() {
  try {
    known = await load<KnownTraveller>(KNOWN_KEY);
    session = await load<NonNullable<Session>>(KEY);
    if (session && tokenExpired(session.token)) { session = null; void persist(KEY, null); }
    if (session) {
      setAuthenticated(true);
      known ??= { phone_number: session.user.phone_number, full_name: session.user.full_name };
    }
  } catch { /* session illisible : on repart déconnecté */ }
  restored = true;
  emit();
}

let restored = false;

// Reads the expiry of the signed token; unreadable tokens count as expired.
function tokenExpired(token: string) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number };
    return !payload.exp || payload.exp * 1000 <= Date.now();
  } catch {
    return true;
  }
}

// Ends the session (expired or refused by the server); the traveller stays
// known on this phone so only the SMS code is asked again.
export function expireSession() {
  if (session) setSession(null);
}

export function useKnownTraveller() {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    () => (restored ? known : undefined),
    () => (restored ? known : undefined),
  );
}

// False until the stored session has been read at start-up.
export function useSessionRestored() {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    () => restored,
    () => restored,
  );
}

export function useSession() {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    () => session,
    () => session,
  );
}

export const firstName = (user: { full_name: string | null } | null | undefined) => user?.full_name?.trim().split(/\s+/)[0] ?? null;
