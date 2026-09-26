import { Redirect, Tabs } from 'expo-router';
import React from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useKnownTraveller, useSession, useSessionRestored } from '@/lib/session';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const session = useSession();
  const restored = useSessionRestored();
  const known = useKnownTraveller();

  // The app is reached only once signed in (SMS code). A traveller known on
  // this phone (session over after 30 days) goes straight to the code screen.
  if (restored && !session) return <Redirect href={known ? '/login' : '/onboarding'} />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: 'none' },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Explore',
        }}
      />
    </Tabs>
  );
}
