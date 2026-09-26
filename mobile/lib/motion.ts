// Full intro animations (slogan, greeting) play once a day; after that the
// screens only fade in, so the motion never gets tiresome.
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const KEY = 'sira-intro-days';
let seen: Record<string, string> = {};

export async function loadIntroMemory() {
  try {
    const text = Platform.OS === 'web' ? window.localStorage.getItem(KEY) : await SecureStore.getItemAsync(KEY);
    if (text) seen = { ...(JSON.parse(text) as Record<string, string>), ...seen };
  } catch { /* mémoire illisible : les intros rejouent */ }
}

// True the first time `name` is shown today; records it at once.
export function playIntroToday(name: string) {
  const today = new Date().toDateString();
  if (seen[name] === today) return false;
  seen = { ...seen, [name]: today };
  const text = JSON.stringify(seen);
  try {
    if (Platform.OS === 'web') window.localStorage.setItem(KEY, text);
    else void SecureStore.setItemAsync(KEY, text).catch(() => {});
  } catch { /* stockage indisponible */ }
  return true;
}
