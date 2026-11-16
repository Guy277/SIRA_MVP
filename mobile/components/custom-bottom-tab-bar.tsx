// Bottom bar of every screen: the active tab is an orange circle in a light-blue ring,
// raised above the bar. Moving to another tab, the circle slides from the tab one comes
// from to the new one.
import React, { useEffect } from 'react';
import { StyleSheet, View, TouchableOpacity, Platform, useWindowDimensions } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

export type TabPath = 'explore' | 'routes' | 'alerts' | 'profile';

interface CustomBottomTabBarProps {
  activeTab?: TabPath;
}

// Room the bar takes at the bottom of a screen: the bar itself, its raised active
// button and the phone's bottom inset. Scrolling content keeps this much free
// space at its end, so its last item can scroll above the bar.
export const TAB_BAR_HEIGHT = 66;
// Room under the icons, so the bar does not sit squeezed on the screen's edge: 30 px, or the
// iPhone's gesture bar plus 10 px (that bar already gives room of its own).
export const tabBarBottomPadding = (insetBottom: number) => (insetBottom > 0 ? insetBottom + 10 : 30);
export function useTabBarSpace() {
  const insets = useSafeAreaInsets();
  return TAB_BAR_HEIGHT + tabBarBottomPadding(insets.bottom);
}

const SIDE_PADDING = 8;
const BADGE = 58;

type Tab = {
  id: TabPath;
  label: string;
  icon: string;
  family: 'Ionicons' | 'MaterialCommunityIcons';
  path: string;
};

const TABS: Tab[] = [
  { id: 'explore', label: 'Carte', icon: 'location', family: 'Ionicons', path: '/(tabs)/explore' },
  // Two cars, as in the design (« Trafic »).
  { id: 'routes', label: 'Trafic', icon: 'car-multiple', family: 'MaterialCommunityIcons', path: '/traffic' },
  { id: 'alerts', label: 'Signaler', icon: 'warning', family: 'Ionicons', path: '/report-event' },
  { id: 'profile', label: 'Profil', icon: 'person', family: 'Ionicons', path: '/profile' },
];

// Every screen draws its own bar: the one being left says where the circle was, so the new
// one can slide it from there.
let lastTabIndex: number | null = null;

function TabIcon({ tab, size, color }: { tab: Tab; size: number; color: string }) {
  return tab.family === 'MaterialCommunityIcons'
    ? <MaterialCommunityIcons name={tab.icon as keyof typeof MaterialCommunityIcons.glyphMap} size={size + 2} color={color} />
    : <Ionicons name={tab.icon as keyof typeof Ionicons.glyphMap} size={size} color={color} />;
}

export function CustomBottomTabBar({ activeTab }: CustomBottomTabBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  // Determine active tab dynamically if not passed explicitly
  const currentTab: TabPath = activeTab || (
    pathname.includes('traffic') || pathname.includes('route-detail') || pathname.includes('navigation-active')
      ? 'routes'
      : pathname.includes('report-event') || pathname.includes('notifications') || pathname.includes('accident')
      ? 'alerts'
      : pathname.includes('profile')
      ? 'profile'
      : 'explore'
  );
  const activeIndex = TABS.findIndex((tab) => tab.id === currentTab);
  const slot = (width - SIDE_PADDING * 2) / TABS.length;

  // Starts under the tab one comes from, then slides to this screen's tab.
  const position = useSharedValue(lastTabIndex ?? activeIndex);
  useEffect(() => {
    position.value = withTiming(activeIndex, { duration: 260, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System });
    lastTabIndex = activeIndex;
  }, [activeIndex, position]);

  const badgeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: SIDE_PADDING + slot * (position.value + 0.5) - BADGE / 2 }],
  }));

  const go = (tab: Tab) => {
    if (pathname !== tab.path) router.push(tab.path as never);
  };

  return (
    <View style={[styles.tabBarContainer, { paddingBottom: tabBarBottomPadding(insets.bottom) }]}>
      {TABS.map((tab, index) => (
        <TouchableOpacity
          key={tab.id}
          style={styles.tabItemContainer}
          onPress={() => go(tab)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={tab.label}
          accessibilityState={{ selected: index === activeIndex }}
        >
          {/* The active tab's place stays empty: its circle is raised above the bar. */}
          {index !== activeIndex && <TabIcon tab={tab} size={24} color="#D1D5DB" />}
        </TouchableOpacity>
      ))}

      {/* Light-blue ring and orange circle, raised above the bar, sliding between tabs. */}
      <Animated.View style={[styles.outerBlueBadge, badgeStyle]} pointerEvents="none">
        <View style={styles.innerOrangeBadge}>
          <TabIcon tab={TABS[activeIndex]} size={22} color="#FFFFFF" />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabBarContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#333333',
    paddingTop: 10,
    paddingHorizontal: SIDE_PADDING,
    zIndex: 100,
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
      },
      android: {
        elevation: 12,
      },
    }),
  },
  tabItemContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    // As tall as an icon: the bar keeps its height even with the active slot empty.
    minHeight: 26,
  },
  outerBlueBadge: {
    position: 'absolute',
    left: 0,
    top: -22,
    width: BADGE,
    height: BADGE,
    borderRadius: BADGE / 2,
    backgroundColor: '#80C4FF',
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#80C4FF',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.5,
        shadowRadius: 6,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  innerOrangeBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F26522',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
