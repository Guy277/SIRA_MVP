// Bottom bar of every screen, as in the designer's screens: the active tab is an orange
// circle sitting in a curved notch cut into the bar, through which the screen behind
// shows (white on a white page, the lagoon on the map). Moving to another tab, the
// notch and the circle slide from the tab one comes from to the new one.
import React, { useEffect } from 'react';
import { Platform, StyleSheet, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

export type TabPath = 'explore' | 'routes' | 'alerts' | 'profile';

interface CustomBottomTabBarProps {
  activeTab?: TabPath;
}

// Room the bar takes at the bottom of a screen: the bar itself, its raised active
// button and the phone's bottom inset. Scrolling content keeps this much free
// space at its end, so its last item can scroll above the bar.
export const TAB_BAR_HEIGHT = 64;
export function useTabBarSpace() {
  const insets = useSafeAreaInsets();
  return TAB_BAR_HEIGHT + Math.max(insets.bottom, 6);
}

const BAR_COLOR = '#333333';
const BAR_HEIGHT = 56;
const SIDE_PADDING = 8;
// The notch: half its width at the top (shoulders included) and its depth.
const NOTCH_HALF = 38;
const NOTCH_DEPTH = 28;
// The active circle: its size, and how far its centre sits below the top of the bar.
const CIRCLE = 46;
const CIRCLE_CENTER_Y = 4;

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

// Every screen draws its own bar: the one being left says where the notch was, so the new
// one can slide it from there.
let lastTabIndex: number | null = null;

function TabIcon({ tab, size, color }: { tab: Tab; size: number; color: string }) {
  return tab.family === 'MaterialCommunityIcons'
    ? <MaterialCommunityIcons name={tab.icon as keyof typeof MaterialCommunityIcons.glyphMap} size={size + 2} color={color} />
    : <Ionicons name={tab.icon as keyof typeof Ionicons.glyphMap} size={size} color={color} />;
}

// A strip twice the screen wide, its notch in the middle: moved sideways, the notch lands
// under any tab (cheaper and smoother than redrawing the shape at every frame).
function barPath(width: number, height: number) {
  const cx = width;
  return [
    'M0,0',
    `H${cx - NOTCH_HALF}`,
    `C${cx - NOTCH_HALF + 14},0 ${cx - 26},${NOTCH_DEPTH} ${cx},${NOTCH_DEPTH}`,
    `C${cx + 26},${NOTCH_DEPTH} ${cx + NOTCH_HALF - 14},0 ${cx + NOTCH_HALF},0`,
    `H${width * 2}`,
    `V${height}`,
    'H0',
    'Z',
  ].join(' ');
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
  const activeTabInfo = TABS[activeIndex];

  const barHeight = BAR_HEIGHT + Math.max(insets.bottom, 6);
  const slot = (width - SIDE_PADDING * 2) / TABS.length;

  // Starts under the tab one comes from, then slides to this screen's tab.
  const position = useSharedValue(lastTabIndex ?? activeIndex);
  useEffect(() => {
    position.value = withTiming(activeIndex, { duration: 260, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System });
    lastTabIndex = activeIndex;
  }, [activeIndex, position]);

  const notchStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: SIDE_PADDING + slot * (position.value + 0.5) - width }],
  }));
  const circleStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: SIDE_PADDING + slot * (position.value + 0.5) - CIRCLE / 2 }],
  }));

  const go = (tab: Tab) => {
    if (pathname !== tab.path) router.push(tab.path as never);
  };

  return (
    <View style={[styles.container, { height: barHeight }]} pointerEvents="box-none">
      {/* The bar with its notch; the screen shows through the notch. */}
      <View style={[styles.barClip, { height: barHeight }]} pointerEvents="none">
        <Animated.View style={[{ width: width * 2, height: barHeight }, notchStyle]}>
          <Svg width={width * 2} height={barHeight}>
            <Path d={barPath(width, barHeight)} fill={BAR_COLOR} />
          </Svg>
        </Animated.View>
      </View>

      {/* Inactive tabs; the active one's place stays empty, its circle is above. */}
      <View style={[styles.row, { height: BAR_HEIGHT }]}>
        {TABS.map((tab, index) => (
          <TouchableOpacity
            key={tab.id}
            style={styles.tab}
            onPress={() => go(tab)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected: index === activeIndex }}
          >
            {index !== activeIndex && <TabIcon tab={tab} size={24} color="#D1D5DB" />}
          </TouchableOpacity>
        ))}
      </View>

      {/* The active tab: an orange circle sitting in the notch. */}
      <Animated.View
        style={[styles.circle, { left: 0, top: CIRCLE_CENTER_Y - CIRCLE / 2 }, circleStyle]}
        pointerEvents="none"
      >
        <TabIcon tab={activeTabInfo} size={22} color="#FFFFFF" />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  // Only sideways: the strip is twice the screen wide.
  barClip: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    paddingHorizontal: SIDE_PADDING,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circle: {
    position: 'absolute',
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    backgroundColor: '#F26522',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.25,
        shadowRadius: 5,
      },
      android: {
        elevation: 6,
      },
    }),
  },
});
