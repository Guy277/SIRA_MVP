import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  Easing, FadeIn, FadeInDown, ReduceMotion, cancelAnimation, runOnJS,
  useAnimatedStyle, useSharedValue, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Designer canvas reference metrics (406px x 874px): positions below are
// ratios of it, applied to the real screen size so every phone gets the layout.
const DESIGN_W = 406;
const DESIGN_H = 874;
const PHONE_RATIO = 225 / 523;

// Each slide stays 5 s, as a story, then the next one comes; after the last
// one the login opens. Touching the screen pauses (WCAG 2.2.2).
const SLIDE_MS = 5000;

interface OnboardingSlide {
  id: string;
  title: string;
  description: string;
  heroBgImage: any;
  phoneMockupImage?: any;
}

const SLIDES: OnboardingSlide[] = [
  {
    id: '1',
    title: 'LA PREMIÈRE PLATEFORME\nDE MOBILITÉ INTELLIGENTE',
    description: 'pensée pour simplifier vos déplacements\nà abidjan.',
    heroBgImage: require('@/assets/images/bridge-bg.jpg'),
    phoneMockupImage: require('@/assets/images/sira-phone-official-mockup.png'),
  },
  {
    id: '2',
    title: "TROUVEZ L'ITINÉRAIRE\nQUI VOUS CONVIENT",
    description: 'Sira analyse les conditions de circulation\npour vous proposer des itinéraires\nadaptés à votre situation.',
    heroBgImage: require('@/assets/images/slide2-bg.jpg'),
  },
  {
    id: '3',
    title: 'CHOISISSEZ VOTRE FAÇON\nDE VOUS DÉPLACER',
    description: 'comparez les différentes options de transport\ndisponibles pour choisir celle qui correspond\nle mieux à votre trajet.',
    heroBgImage: require('@/assets/images/slide3-bg.jpg'),
  },
  {
    id: '4',
    title: 'ANTICIPEZ VOTRE TRAJET',
    description: 'estimez le temps et le coût de\nvotre déplacement avant de prendre la route.',
    heroBgImage: require('@/assets/images/slide4-bg.jpg'),
  },
  {
    id: '5',
    title: 'RESTEZ INFORMÉ\nEN TEMPS RÉEL',
    description: 'recevez des informations sur les perturbations,\nles incidents et les conditions de circulation\nsur votre trajet.',
    heroBgImage: require('@/assets/images/slide5-bg.jpg'),
  },
];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export default function OnboardingScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [held, setHeld] = useState(false);
  const [screenReader, setScreenReader] = useState(false);
  const progress = useSharedValue(0);

  // Screen reader users move at their own pace: no automatic advance. The web
  // cannot detect a screen reader (react-native-web always answers yes), so
  // there the press-and-hold pause is the control.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    AccessibilityInfo.isScreenReaderEnabled().then(setScreenReader).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('screenReaderChanged', setScreenReader);
    return () => subscription.remove();
  }, []);

  const finish = useCallback(() => router.replace('/login'), [router]);

  const goTo = useCallback((index: number) => {
    progress.set(0);
    setCurrentIndex(index);
    // On the web the smooth scroll is cut short by the CSS scroll snapping of
    // pagingEnabled, so the slide is set directly there.
    flatListRef.current?.scrollToOffset({ offset: index * width, animated: Platform.OS !== 'web' });
  }, [progress, width]);

  const next = useCallback(() => {
    if (currentIndex >= SLIDES.length - 1) finish();
    else goTo(currentIndex + 1);
  }, [currentIndex, finish, goTo]);

  // The active segment fills in SLIDE_MS; a pause keeps what is filled and
  // resumes with the remaining time. This is a timer, not a decoration, so
  // it runs even when the phone reduces animations.
  const paused = held || screenReader;
  useEffect(() => {
    if (paused) { cancelAnimation(progress); return; }
    const remaining = Math.max(0, (1 - progress.get()) * SLIDE_MS);
    progress.set(withTiming(1, { duration: remaining, easing: Easing.linear, reduceMotion: ReduceMotion.Never }, (done) => {
      if (done) runOnJS(next)();
    }));
    return () => cancelAnimation(progress);
  }, [currentIndex, paused, next, progress]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  // A swipe also changes slide; the timer waits while the finger is down.
  const handleMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / width);
    if (index !== currentIndex && index >= 0 && index < SLIDES.length) goTo(index);
    setHeld(false);
  };

  // Layout from the real screen, keeping the designer's proportions.
  const heroHeight = height * 0.72;
  const phoneHeight = Math.min(height * (523 / DESIGN_H), width * (225 / DESIGN_W) / PHONE_RATIO);
  const phoneWidth = phoneHeight * PHONE_RATIO;
  const titleSize = clamp(width * 0.047, 16, 22);
  const textSize = clamp(width * 0.032, 12, 15);

  const renderSlide = ({ item }: { item: OnboardingSlide }) => (
    <View style={[styles.slide, { width, height }]}>
      <Image
        source={item.heroBgImage}
        style={{ width: '100%', height: heroHeight }}
        contentFit="cover"
        contentPosition={item.phoneMockupImage ? { top: '0%', left: '72%' } : 'center'}
      />
      {item.phoneMockupImage && (
        <View
          style={[styles.phoneMockupContainer, {
            top: height * (157 / DESIGN_H),
            right: width * ((DESIGN_W - 177 - 225) / DESIGN_W),
            width: phoneWidth,
            height: phoneHeight,
          }]}
        >
          <Image source={item.phoneMockupImage} style={styles.fill} contentFit="contain" />
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <FlatList
        ref={flatListRef}
        data={SLIDES}
        renderItem={renderSlide}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScrollBeginDrag={() => setHeld(true)}
        onMomentumScrollEnd={handleMomentumEnd}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        bounces={false}
        style={styles.flatList}
      />

      {/* Skip straight to the login at any time. */}
      <TouchableOpacity
        style={[styles.skipButton, { top: insets.top + 10 }]}
        onPress={finish}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Passer la présentation"
      >
        <Text style={styles.skipText}>Passer</Text>
      </TouchableOpacity>

      {/* Bottom card: press and hold to pause, as on a story. */}
      <Pressable
        style={[styles.bottomCardContent, { top: height * 0.7, paddingBottom: insets.bottom + 20 }]}
        onPressIn={() => setHeld(true)}
        onPressOut={() => setHeld(false)}
        onPress={next}
        // A long press only pauses; it must not also skip to the next slide.
        onLongPress={() => {}}
        delayLongPress={250}
        accessibilityRole="button"
        accessibilityLabel={`Diapositive ${currentIndex + 1} sur ${SLIDES.length}. Toucher pour la suivante.`}
      >
        {/* Story segments: done ones full, the current one filling. */}
        <View style={styles.progressRow}>
          {SLIDES.map((slide, index) => (
            <View key={slide.id} style={styles.segment}>
              {index < currentIndex && <View style={[styles.segmentFill, styles.fill]} />}
              {index === currentIndex && <Animated.View style={[styles.segmentFill, fillStyle]} />}
            </View>
          ))}
        </View>

        <Animated.Text
          key={`title-${currentIndex}`}
          entering={FadeInDown.duration(350)}
          style={[styles.titleText, { fontSize: titleSize, lineHeight: titleSize * 1.22 }]}
          adjustsFontSizeToFit
          numberOfLines={3}
        >
          {SLIDES[currentIndex].title}
        </Animated.Text>

        <Animated.Text
          key={`text-${currentIndex}`}
          entering={FadeIn.delay(120).duration(350)}
          style={[styles.descriptionText, { fontSize: textSize, lineHeight: textSize * 1.35 }]}
        >
          {SLIDES[currentIndex].description}
        </Animated.Text>

        {held && <Text style={styles.pausedText}>En pause</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  flatList: { flex: 1 },
  slide: { overflow: 'hidden' },
  fill: { width: '100%', height: '100%' },

  phoneMockupContainer: {
    position: 'absolute',
    zIndex: 15,
    shadowColor: '#000000',
    shadowOffset: { width: -8, height: 14 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 14,
  },

  skipButton: {
    position: 'absolute',
    right: 16,
    zIndex: 40,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  skipText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },

  /* Bottom card (designer: #010101 at 90 %, from 72 % of the height down). */
  bottomCardContent: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(1, 1, 1, 0.9)',
    paddingHorizontal: 22,
    paddingTop: 16,
    zIndex: 30,
  },

  progressRow: { flexDirection: 'row', gap: 6, marginBottom: 14 },
  segment: { flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(255, 255, 255, 0.3)', overflow: 'hidden' },
  segmentFill: { height: '100%', backgroundColor: '#F26522' },

  titleText: {
    color: '#FFFFFF',
    fontWeight: '700',
    marginBottom: 6,
    textTransform: 'uppercase',
    fontVariant: ['small-caps'],
  },
  descriptionText: { color: '#FFFFFF', fontWeight: '500' },
  pausedText: { color: '#F26522', fontSize: 11, fontWeight: '700', marginTop: 8 },
});
