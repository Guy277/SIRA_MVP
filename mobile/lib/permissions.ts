// Real state of the phone's permissions (position, microphone), shown on the
// privacy and location screens. The app can ask once; after a refusal only the
// phone's (or browser's) settings can change it, so SIRA says where to go.
import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import * as Location from 'expo-location';
import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from 'expo-audio';
import { ensureCurrentPlace } from '@/lib/places';

export type PermissionKind = 'location' | 'microphone';
// granted · denied (can still be asked) · blocked (settings only) · unknown (never asked)
export type PermissionState = 'granted' | 'denied' | 'blocked' | 'unknown' | 'checking';

type Response = { status: string; canAskAgain?: boolean };
const toState = ({ status, canAskAgain }: Response): PermissionState =>
  status === 'granted' ? 'granted' : status === 'undetermined' ? 'unknown' : canAskAgain === false ? 'blocked' : 'denied';

const read = { location: Location.getForegroundPermissionsAsync, microphone: getRecordingPermissionsAsync };
const ask = { location: Location.requestForegroundPermissionsAsync, microphone: requestRecordingPermissionsAsync };

export const PERMISSION_LABELS: Record<PermissionState, string> = {
  granted: 'Autorisé', denied: 'Refusé', blocked: 'Refusé', unknown: 'Pas encore demandé', checking: '…',
};

export const canOpenSettings = Platform.OS !== 'web';
export const openPhoneSettings = () => Linking.openSettings().catch(() => {});

async function readPermissions() {
  const entries = await Promise.all((Object.keys(read) as PermissionKind[]).map(async (kind) => {
    try { return [kind, toState(await read[kind]())] as const; } catch { return [kind, 'unknown'] as const; }
  }));
  return Object.fromEntries(entries) as Record<PermissionKind, PermissionState>;
}

export function usePermissions() {
  const [states, setStates] = useState<Record<PermissionKind, PermissionState>>({ location: 'checking', microphone: 'checking' });
  const refresh = useCallback(() => readPermissions().then(setStates), []);

  // Read at opening, and again when coming back from the phone's settings.
  useEffect(() => {
    let alive = true;
    const load = () => { void readPermissions().then((next) => { if (alive) setStates(next); }); };
    load();
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') load(); });
    return () => { alive = false; subscription.remove(); };
  }, []);

  const request = useCallback(async (kind: PermissionKind) => {
    try { await ask[kind](); } catch { /* refus ou navigateur sans prise en charge */ }
    if (kind === 'location') void ensureCurrentPlace();
    await refresh();
  }, [refresh]);

  return { states, request, refresh };
}
