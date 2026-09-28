// Back button that never dead-ends: screens can be opened directly (web
// link, reload, notification) with nothing behind them to go back to.
import type { Href, useRouter } from 'expo-router';

// End of a trip: back to the home map, nothing left behind (« back » cannot reopen the trip).
export function goHome(router: ReturnType<typeof useRouter>) {
  if (router.canDismiss()) router.dismissAll();
  router.replace('/(tabs)');
}

export function goBack(router: ReturnType<typeof useRouter>, fallback: Href = '/(tabs)') {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
