import { Image } from 'expo-image';
import { useNavigation, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Dimensions, Platform, StyleSheet } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { isUserAuthenticated } from '@/hooks/use-auth';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Designer canvas reference metrics (406px x 874px)
const DESIGN_CANVAS_WIDTH = 406;
const DESIGN_CANVAS_HEIGHT = 874;

// Logo reference metrics (173px x 176px at top: 338px, left: 114px)
const LOGO_WIDTH = (173 / DESIGN_CANVAS_WIDTH) * SCREEN_WIDTH;
const LOGO_HEIGHT = (176 / DESIGN_CANVAS_HEIGHT) * SCREEN_HEIGHT;
const LOGO_TOP = (338 / DESIGN_CANVAS_HEIGHT) * SCREEN_HEIGHT;

export default function SplashScreen() {
  const router = useRouter();
  const navigation = useNavigation();

  // Web: the loading page (public/index.html) already shows this very logo at this very place. The splash takes
  // over without fading in again, then removes that page once its own logo is drawn: one start screen, no jump.
  const [fromLoader] = useState(() => Platform.OS === 'web' && Boolean(globalThis.document?.getElementById('sira-loader')));
  const removeLoader = () => globalThis.document?.getElementById('sira-loader')?.remove();
  useEffect(() => {
    if (!fromLoader) return;
    const fallback = setTimeout(removeLoader, 1500); // the logo never reports loaded: do not keep the page forever
    return () => clearTimeout(fallback);
  }, [fromLoader]);

  // Animation values
  const logoOpacity = useSharedValue(fromLoader ? 1 : 0);
  const logoScale = useSharedValue(fromLoader ? 1 : 0.92);

  const navigateToNextScreen = () => {
    // Only leave the splash if it is still the screen shown: deep links on web
    // mount it underneath the opened page, which must not be replaced.
    if (!navigation.isFocused()) return;
    if (isUserAuthenticated()) {
      router.replace('/(tabs)');
    } else {
      router.replace('/onboarding');
    }
  };

  useEffect(() => {
    // 1. Logo entry animation (not after the web loading page, which already showed the logo)
    if (!fromLoader) {
      logoOpacity.value = withTiming(1, { duration: 800, easing: Easing.out(Easing.cubic) });
      logoScale.value = withSpring(1, { damping: 15, stiffness: 120 });
    }

    // 2. Auto transition to onboarding after 2.2s
    const timer = setTimeout(() => {
      logoOpacity.value = withTiming(0, { duration: 400, easing: Easing.in(Easing.cubic) }, (finished) => {
        if (finished) {
          runOnJS(navigateToNextScreen)();
        }
      });
    }, 2200);

    return () => clearTimeout(timer);
  }, []);

  const animatedLogoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      {/* Sira logo with exact designer coordinates */}
      <Animated.View style={[styles.logoWrapper, animatedLogoStyle]}>
        <Image
          source={require('@/assets/images/sira-logo-white-designer.png')}
          style={styles.logoImage}
          contentFit="contain"
          onLoad={fromLoader ? removeLoader : undefined}
        />
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#010101',
    alignItems: 'center',
  },
  logoWrapper: {
    position: 'absolute',
    top: LOGO_TOP,
    width: LOGO_WIDTH,
    height: LOGO_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
});

