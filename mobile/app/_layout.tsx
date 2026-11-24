import { useFonts } from 'expo-font';
import { Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { restoreSession } from '@/lib/session';
import { loadIntroMemory } from '@/lib/motion';
import { loadSavedPlaces } from '@/lib/saved-places';
import { loadFavorites } from '@/lib/favorites';
import { loadTripHistory } from '@/lib/trip-history';
import { loadUsage } from '@/lib/usage';
import { loadVoiceMode } from '@/lib/voice';
import { SpeakingPill } from '@/components/speaking-pill';
import { FollowedZoneAlerts } from '@/components/followed-zone-alerts';
import { SuccessHost } from '@/components/success-card';
import { loadFollowedZones } from '@/lib/followed-zones';
import { loadProfilePicture } from '@/lib/profile-picture';
import { loadReportOpinions } from '@/lib/report-opinions';
import { loadWebFonts, MONTSERRAT_FONTS } from '@/components/sira-text';
import { FontDisplay } from 'expo-font';

// Web: Montserrat shows as soon as it arrives (font-display: swap), the phone's own font until then.
const FONTS = Platform.OS === 'web'
  ? Object.fromEntries(Object.entries(MONTSERRAT_FONTS).map(([family, source]) => [family, { uri: source, display: FontDisplay.SWAP }]))
  : MONTSERRAT_FONTS;

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  useEffect(() => { void restoreSession(); void loadIntroMemory(); void loadVoiceMode(); void loadSavedPlaces(); void loadTripHistory(); void loadFavorites(); void loadUsage(); void loadFollowedZones(); void loadProfilePicture(); void loadReportOpinions(); }, []);
  // Phone app: Montserrat before the first screen, so no text flashes in the system font (the files are in the app).
  // Web: the first screen does not wait for the 6 weights (about 0.9 MB, several seconds on a mobile connection,
  // seen on an iPhone on 23 November 2026): the text switches to Montserrat as soon as it arrives.
  const [fontsLoaded, fontError] = useFonts(FONTS);
  // Web: the app is drawn, the loading page of public/index.html goes away. On « / » the start screen
  // (app/index.tsx) removes it itself once its logo is drawn, so that the two look like one screen.
  const pathname = usePathname();
  useEffect(() => {
    if (Platform.OS === 'web' && pathname !== '/') globalThis.document?.getElementById('sira-loader')?.remove();
  }, [pathname]);
  // Web: every weight starts downloading now, without holding the first screen
  // (about 2 MB of fonts, several seconds on a slow mobile connection).
  useEffect(() => { if (fontsLoaded) void loadWebFonts(); }, [fontsLoaded]);
  if (Platform.OS !== 'web' && !fontsLoaded && !fontError) return null;
  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen
          name="index"
          options={{ headerShown: false }}
        />

        <Stack.Screen
          name="onboarding"
          options={{
            headerShown: false,
            animation: 'fade',
          }}
        />

        <Stack.Screen
          name="login"
          options={{
            headerShown: false,
            animation: 'slide_from_right',
          }}
        />


        <Stack.Screen
          name="(tabs)"
          options={{ headerShown: false }}
        />

        <Stack.Screen
          name="route-detail"
          options={{
            headerShown: false,
            animation: 'slide_from_right',
          }}
        />

        <Stack.Screen
          name="navigation-active"
          options={{
            headerShown: false,
            animation: 'fade',
          }}
        />

        <Stack.Screen
          name="notifications"
          options={{
            headerShown: false,
            animation: 'slide_from_right',
          }}
        />

        <Stack.Screen
          name="traffic"
          options={{
            headerShown: false,
            animation: 'slide_from_right',
          }}
        />

        <Stack.Screen
          name="traffic-detail"
          options={{
            headerShown: false,
            animation: 'slide_from_right',
          }}
        />

        <Stack.Screen
          name="history"
          options={{
            headerShown: false,
            animation: 'slide_from_right',
          }}
        />

        <Stack.Screen
          name="profile"
          options={{
            headerShown: false,
            animation: 'slide_from_right',
          }}
        />

        <Stack.Screen
          name="privacy"
          options={{
            headerShown: false,
            animation: 'slide_from_right',
          }}
        />

        <Stack.Screen
          name="chat"
          options={{
            headerShown: false,
            animation: 'slide_from_right',
          }}
        />

        <Stack.Screen
          name="edit-profile"
          options={{
            headerShown: false,
            animation: 'slide_from_right',
          }}
        />

        <Stack.Screen
          name="settings"
          options={{
            headerShown: false,
            animation: 'slide_from_right',
          }}
        />

        <Stack.Screen
          name="report-event"
          options={{
            headerShown: false,
            animation: 'slide_from_right',
          }}
        />

        <Stack.Screen
          name="report-event-detail"
          options={{
            headerShown: false,
            animation: 'slide_from_right',
          }}
        />

        <Stack.Screen
          name="notification-accident-detail"
          options={{
            headerShown: false,
            animation: 'slide_from_right',
          }}
        />

        <Stack.Screen
          name="notification-settings"
          options={{
            headerShown: false,
            animation: 'slide_from_right',
          }}
        />

        <Stack.Screen
          name="permissions"
          options={{
            headerShown: false,
            animation: 'slide_from_right',
          }}
        />

        <Stack.Screen
          name="location-settings"
          options={{
            headerShown: false,
            animation: 'slide_from_right',
          }}
        />

        <Stack.Screen
          name="appearance-settings"
          options={{
            headerShown: false,
            animation: 'slide_from_right',
          }}
        />

        <Stack.Screen
          name="voice-settings"
          options={{
            headerShown: false,
            animation: 'slide_from_right',
          }}
        />

        <Stack.Screen
          name="info-settings"
          options={{
            headerShown: false,
            animation: 'slide_from_right',
          }}
        />

        <Stack.Screen
          name="my-places"
          options={{
            headerShown: false,
            animation: 'slide_from_right',
          }}
        />

        <Stack.Screen
          name="favorites"
          options={{
            headerShown: false,
            animation: 'slide_from_right',
          }}
        />
      </Stack>

      {/* While SIRA talks by itself, every screen shows how to stop it. */}
      <SpeakingPill />
      <FollowedZoneAlerts />
      {/* « … avec succès » cards (favourites), above every screen. */}
      <SuccessHost />
      <StatusBar style="light" />
    </>
  );
}