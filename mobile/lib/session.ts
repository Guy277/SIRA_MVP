// Signed-in traveller: token kept in the phone's secure storage
// (expo-secure-store) or in the browser on web.
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { useSyncExternalStore } from 'react';
import { setAuthenticated } from '@/hooks/use-auth';

export type SessionUser = { id: string; phone_number: string; full_name: string | null; role: string };
type Session = { token: string; user: SessionUser } | null;

const KEY = 'sira-session';
let session: Session = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

async function persist(value: Session) {
  const text = value ? JSON.stringify(value) : null;
  try {
    if (Platform.OS === 'web') {
      if (text) window.localStorage.setItem(KEY, text); else window.localStorage.removeItem(KEY);
    } else if (text) {
      await SecureStore.setItemAsync(KEY, text);
    } else {
      await SecureStore.deleteItemAsync(KEY);
    }
  } catch { /* stockage indisponible : session gardée en mémoire */ }
}

export function currentToken() {
  return session?.token ?? null;
}

export function setSession(value: Session) {
  session = value;
  setAuthenticated(Boolean(value));
  void persist(value);
  emit();
}

// Restores a previous session at start-up.
export async function restoreSession() {
  try {
    const text = Platform.OS === 'web' ? window.localStorage.getItem(KEY) : await SecureStore.getItemAsync(KEY);
    if (text) { session = JSON.parse(text) as Session; setAuthenticated(true); emit(); }
  } catch { /* session illisible : on repart déconnecté */ }
}

export function useSession() {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    () => session,
    () => session,
  );
}

export const firstName = (user: SessionUser | null | undefined) => user?.full_name?.trim().split(/\s+/)[0] ?? null;
