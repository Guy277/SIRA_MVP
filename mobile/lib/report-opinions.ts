// This phone's reports and opinions on traffic reports (rules: lib/report-opinions-core.ts).
// Web: localStorage ; phone: a file of the app (nothing secret in it, never sent to SIRA's servers).
import { File, Paths } from 'expo-file-system';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { parseStoredOpinions, rememberOpinion, type Opinion, type OpinionRecord } from '@/lib/report-opinions-core';

export * from '@/lib/report-opinions-core';

const KEY = 'sira-mes-avis';
let opinions: OpinionRecord[] = [];
let loaded = false;
const listeners = new Set<() => void>();
const file = () => new File(Paths.document, `${KEY}.json`);

function publish(next: OpinionRecord[], persist = true) {
  opinions = next;
  listeners.forEach((listener) => listener());
  if (!persist) return;
  const text = JSON.stringify(opinions);
  try {
    if (Platform.OS === 'web') window.localStorage.setItem(KEY, text);
    else void file().write(text).catch(() => {});
  } catch { /* stockage indisponible : gardé jusqu'à la fermeture de l'appli */ }
}

export async function loadReportOpinions() {
  if (loaded) return;
  try {
    let text: string | null = null;
    if (Platform.OS === 'web') text = window.localStorage.getItem(KEY);
    else if (file().exists) text = await file().text();
    // An opinion given before the phone answered is kept with the stored ones.
    if (!loaded) {
      const stored = parseStoredOpinions(text).filter((old) => !opinions.some((item) => item.reportId === old.reportId));
      publish([...opinions, ...stored], false);
    }
  } catch { /* mémoire illisible : elle repart de zéro */ }
  loaded = true;
}

export const rememberReportOpinion = (reportId: string, opinion: Opinion) => publish(rememberOpinion(opinions, reportId, opinion));

export function useReportOpinions() {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    () => opinions,
    () => opinions,
  );
}
