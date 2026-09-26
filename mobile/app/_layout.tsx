import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { useEffect } from 'react';
import { restoreSession } from '@/lib/session';
import { loadIntroMemory } from '@/lib/motion';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  useEffect(() => { void restoreSession(); void loadIntroMemory(); }, []);
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
          name="info-settings"
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

        <Stack.Screen
          name="modal"
          options={{
            presentation: 'modal',
            title: 'Modal',
          }}
        />
      </Stack>

      <StatusBar style="light" />
    </>
  );
}