import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type TabPath = 'explore' | 'routes' | 'alerts' | 'profile';

interface CustomBottomTabBarProps {
  activeTab?: TabPath;
}

export function CustomBottomTabBar({ activeTab }: CustomBottomTabBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  // Determine active tab dynamically if not passed explicitly
  const currentTab: TabPath = activeTab || (
    pathname.includes('notifications') || pathname.includes('accident')
      ? 'alerts'
      : pathname.includes('route-detail') || pathname.includes('navigation-active')
      ? 'routes'
      : pathname.includes('profile')
      ? 'profile'
      : 'explore'
  );

  const tabs: {
    id: TabPath;
    label: string;
    iconActive: keyof typeof Ionicons.glyphMap;
    iconInactive: keyof typeof Ionicons.glyphMap;
    path: string;
  }[] = [
    {
      id: 'explore',
      label: 'Carte',
      iconActive: 'location',
      iconInactive: 'location-outline',
      path: '/(tabs)/explore',
    },
    {
      id: 'routes',
      label: 'Trajets',
      iconActive: 'car-sport',
      iconInactive: 'car-sport-outline',
      path: '/route-detail',
    },
    {
      id: 'alerts',
      label: 'Alertes',
      iconActive: 'warning',
      iconInactive: 'warning-outline',
      path: '/notifications',
    },
    {
      id: 'profile',
      label: 'Profil',
      iconActive: 'person',
      iconInactive: 'person-outline',
      path: '/profile',
    },
  ];

  return (
    <View style={[styles.tabBarContainer, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {tabs.map((tab) => {
        const isActive = currentTab === tab.id;
        const color = isActive ? '#F26522' : '#94A3B8';
        const iconName = isActive ? tab.iconActive : tab.iconInactive;

        return (
          <TouchableOpacity
            key={tab.id}
            style={styles.tabItem}
            onPress={() => {
              if (pathname !== tab.path) {
                router.push(tab.path as any);
              }
            }}
            activeOpacity={0.7}
          >
            <View style={[styles.iconWrapper, isActive && styles.activeIconCircle]}>
              <Ionicons name={iconName} size={22} color={color} />
            </View>
            <Text style={[styles.tabLabel, { color }, isActive && styles.activeTabLabel]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tabBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#1E1E1E',
    paddingTop: 8,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: '#2D2D2D',
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: -3 },
        shadowOpacity: 0.2,
        shadowRadius: 6,
      },
      android: {
        elevation: 10,
      },
    }),
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
  },
  iconWrapper: {
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeIconCircle: {
    backgroundColor: 'rgba(242, 101, 34, 0.18)',
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
    textAlign: 'center',
  },
  activeTabLabel: {
    fontWeight: '700',
  },
});
