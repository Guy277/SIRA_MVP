// Zones the traveller follows, on the phone (rules: lib/followed-zones-core.ts). Web: localStorage;
// phone: a file of the app. Never sent to SIRA's servers: the server does not follow zones yet,
// so alerts only come while SIRA is open (FollowedZoneAlerts, in the root layout).
import { File, Paths } from 'expo-file-system';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { addZone, parseStoredZones, removeZone, type FollowedZone, type NewZone } from '@/lib/followed-zones-core';

export * from '@/lib/followed-zones-core';

const KEY = 'sira-zones-suivies';
let zones: FollowedZone[] = [];
let loaded = false;
const listeners = new Set<() => void>();
const file = () => new File(Paths.document, `${KEY}.json`);

function publish(next: FollowedZone[], persist = true) {
  zones = next;
  listeners.forEach((listener) => listener());
  if (!persist) return;
  const text = JSON.stringify(zones);
  try {
    if (Platform.OS === 'web') window.localStorage.setItem(KEY, text);
    else void file().write(text).catch(() => {});
  } catch { /* stockage indisponible : gardé jusqu'à la fermeture de l'appli */ }
}

export async function loadFollowedZones() {
  if (loaded) return;
  try {
    let text: string | null = null;
    if (Platform.OS === 'web') text = window.localStorage.getItem(KEY);
    else if (file().exists) text = await file().text();
    // A zone followed before the phone answered is kept with the stored ones.
    if (!loaded) publish([...zones, ...parseStoredZones(text).filter((old) => !zones.some((zone) => zone.id === old.id))], false);
  } catch { /* zones illisibles : elles repartent de zéro */ }
  loaded = true;
}

export const followZone = (zone: NewZone) => publish(addZone(zones, zone));
export const unfollowZone = (id: string) => publish(removeZone(zones, id));

export function useFollowedZones() {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    () => zones,
    () => zones,
  );
}
