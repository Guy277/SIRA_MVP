// What the traveller chose in the map's « Calques » sheet (type of map, what is drawn on it)
// and the 2D / 3D button. Kept on the phone, so the map looks the same next time.
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// plan: OpenFreeMap « liberty » (the map so far); nuit: « dark »; epure: « positron », very light, so the lines stand out.
export type MapStyleName = 'plan' | 'nuit' | 'epure';
export const MAP_STYLE_URLS: Record<MapStyleName, string> = {
  plan: 'https://tiles.openfreemap.org/styles/liberty',
  nuit: 'https://tiles.openfreemap.org/styles/dark',
  epure: 'https://tiles.openfreemap.org/styles/positron',
};
export const MAP_STYLE_LABELS: Record<MapStyleName, string> = { plan: 'Plan', nuit: 'Nuit', epure: 'Épuré' };

// « Lignes SIRA » : une couleur par mode (sira_mode des lignes), sur la carte et dans la fiche Calques.
export const TRANSIT_MODE_COLORS = { SOTRA_BUS: '#2563EB', WIBUS: '#2563EB', GBAKA: '#16A34A', WORO_WORO: '#D97706', FERRY: '#0891B2' };
export const TRANSIT_LEGEND: { label: string; color: string }[] = [
  { label: 'Bus SOTRA', color: TRANSIT_MODE_COLORS.SOTRA_BUS }, { label: 'Gbaka', color: TRANSIT_MODE_COLORS.GBAKA },
  { label: 'Wôrô-wôrô', color: TRANSIT_MODE_COLORS.WORO_WORO }, { label: 'Bateau-bus', color: TRANSIT_MODE_COLORS.FERRY },
];

export type MapSettings = {
  style: MapStyleName;
  tilted: boolean;  // 3D: the map leans and the buildings stand up
  transitLines: boolean;  // « Lignes SIRA »: SOTRA, gbaka, wôrô-wôrô, bateau-bus
  reports: boolean;
  buildings: boolean;
};

const DEFAULTS: MapSettings = { style: 'plan', tilted: false, transitLines: false, reports: true, buildings: true };
const KEY = 'sira-map-settings';
const STYLES = Object.keys(MAP_STYLE_URLS) as MapStyleName[];

function clean(value: unknown): MapSettings {
  const saved = (value && typeof value === 'object' ? value : {}) as Partial<MapSettings>;
  return {
    style: STYLES.includes(saved.style as MapStyleName) ? (saved.style as MapStyleName) : DEFAULTS.style,
    tilted: typeof saved.tilted === 'boolean' ? saved.tilted : DEFAULTS.tilted,
    transitLines: typeof saved.transitLines === 'boolean' ? saved.transitLines : DEFAULTS.transitLines,
    reports: typeof saved.reports === 'boolean' ? saved.reports : DEFAULTS.reports,
    buildings: typeof saved.buildings === 'boolean' ? saved.buildings : DEFAULTS.buildings,
  };
}

// On the web the choice is read at once, so the map does not open in « Plan » and then switch.
function readWebSettings(): MapSettings {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return DEFAULTS;
  try { return clean(JSON.parse(window.localStorage.getItem(KEY) ?? '{}')); } catch { return DEFAULTS; }
}

let settings = readWebSettings();
const listeners = new Set<() => void>();
let loaded = Platform.OS === 'web';

async function loadOnPhone() {
  loaded = true;
  try {
    const text = await SecureStore.getItemAsync(KEY);
    if (text) { settings = clean(JSON.parse(text)); listeners.forEach((listener) => listener()); }
  } catch { /* réglage illisible : carte par défaut */ }
}

export function setMapSettings(change: Partial<MapSettings>) {
  settings = clean({ ...settings, ...change });
  listeners.forEach((listener) => listener());
  const text = JSON.stringify(settings);
  try {
    if (Platform.OS === 'web') window.localStorage.setItem(KEY, text);
    else void SecureStore.setItemAsync(KEY, text).catch(() => {});
  } catch { /* stockage indisponible : le choix vaut pour cette fois */ }
}

export function useMapSettings() {
  if (!loaded) void loadOnPhone();
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    () => settings,
    () => settings,
  );
}
