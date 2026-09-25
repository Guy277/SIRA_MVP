// Back button that never dead-ends: screens can be opened directly (web
// link, reload, notification) with nothing behind them to go back to.
import type { Href, useRouter } from 'expo-router';

export function goBack(router: ReturnType<typeof useRouter>, fallback: Href = '/(tabs)') {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
