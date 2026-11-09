// The traveller's SIRA switches « Utiliser ma position » and « Utiliser le micro » (rules: lib/usage-core.ts),
// kept on the phone like the voice setting. Read before SIRA locates the traveller or opens the microphone.
import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { parseUsage, type Usage, type UsageKind } from '@/lib/usage-core';

export * from '@/lib/usage-core';

const KEY = 'sira-usage';
// On web the setting is read at once (the home screen may locate before the root layout's effects run).
function readWeb(): string | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try { return window.localStorage.getItem(KEY); } catch { return null; }
}
let usage: Usage = parseUsage(readWeb());
let loading: Promise<Usage> | null = null;
const listeners = new Set<() => void>();

// Once per launch; every caller waits for the same reading (phone: the secure store answers later).
export function loadUsage(): Promise<Usage> {
  loading ??= (async () => {
    if (Platform.OS !== 'web') {
      try { usage = parseUsage(await SecureStore.getItemAsync(KEY)); } catch { /* réglage illisible : tout activé */ }
      listeners.forEach((listener) => listener());
    }
    return usage;
  })();
  return loading;
}

// True if SIRA may use it now (after the stored setting is read).
export async function usageAllowed(kind: UsageKind) {
  return (await loadUsage())[kind];
}

export const getUsage = () => usage;

export function setUsage(kind: UsageKind, on: boolean) {
  usage = { ...usage, [kind]: on };
  listeners.forEach((listener) => listener());
  const text = JSON.stringify(usage);
  try {
    if (Platform.OS === 'web') window.localStorage.setItem(KEY, text);
    else void SecureStore.setItemAsync(KEY, text).catch(() => {});
  } catch { /* stockage indisponible : gardé jusqu'à la fermeture de l'appli */ }
}

export function useUsage() {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    () => usage,
    () => usage,
  );
}
