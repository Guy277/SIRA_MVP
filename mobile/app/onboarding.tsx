import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const { width, height } = Dimensions.get('window');

// Designer canvas reference metrics (406px x 874px)
const DESIGN_CANVAS_WIDTH = 406;
const DESIGN_CANVAS_HEIGHT = 874;

// Phone placement: Width 225px, Height 523px, Top 157px, Left 177px
const PHONE_WIDTH = (225 / DESIGN_CANVAS_WIDTH) * width;
const PHONE_HEIGHT = (523 / DESIGN_CANVAS_HEIGHT) * height;
const PHONE_TOP = (157 / DESIGN_CANVAS_HEIGHT) * height;
const PHONE_LEFT = (177 / DESIGN_CANVAS_WIDTH) * width;

// Information Card placement: Width 402px, Height 242px, Top 632px, Opacity 90%, Color #010101
const CARD_WIDTH = (402 / DESIGN_CANVAS_WIDTH) * width;
const CARD_HEIGHT = (242 / DESIGN_CANVAS_HEIGHT) * height;
const CARD_TOP = (632 / DESIGN_CANVAS_HEIGHT) * height;

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

export default function OnboardingScreen() {
  const router = useRouter();
  const flatListRef = useRef<FlatList>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Automatic carousel scroll timer with loop back to beginning
  useEffect(() => {
    const timer = setInterval(() => {
      const nextIndex = (currentIndex + 1) % SLIDES.length;
      flatListRef.current?.scrollToOffset({
        offset: nextIndex * width,
        animated: true,
      });
      setCurrentIndex(nextIndex);
    }, 3500);

    return () => clearInterval(timer);
  }, [currentIndex]);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(contentOffsetX / width);
    if (index !== currentIndex && index >= 0 && index < SLIDES.length) {
      setCurrentIndex(index);
    }
  };

  // One entry, as in Orange Max it: the phone number tells whether the
  // traveller signs in or creates an account.
  const handleStart = () => {
    router.push('/login');
  };

  const renderSlide = ({ item }: { item: OnboardingSlide }) => {
    return (
      <View style={styles.slide}>
        {/* Layer 1: Background Image */}
        <Image
          source={item.heroBgImage}
          style={styles.heroBgImage}
          contentFit="cover"
          contentPosition={item.phoneMockupImage ? { top: '0%', left: '72%' } : 'center'}
        />
        <View style={styles.heroOverlayGradient} />

        {/* Layer 2: Black bottom card backdrop */}
        <View style={styles.slideBottomBackdrop} />

        {/* Layer 3: Phone Mockup on Slide 1 - Positioned with exact designer specs (225x523 at Top: 157, Left: 177) */}
        {item.phoneMockupImage && (
          <View style={styles.phoneMockupContainer}>
            <Image
              source={item.phoneMockupImage}
              style={styles.phoneMockupImage}
              contentFit="cover"
              contentPosition={{ top: '0%', left: '0%' }}
            />
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />


      {/* Horizontal Slide Carousel */}
      <FlatList
        ref={flatListRef}
        data={SLIDES}
        renderItem={renderSlide}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        bounces={false}
        style={styles.flatList}
      />

      {/* Layer 5: Bottom Sheet UI Content */}
      <View style={styles.bottomCardContent} pointerEvents="box-none">
        {/* Progress Bar (Orange Bar + 4 White Dots) */}
        <View style={styles.progressRow}>
          {SLIDES.map((_, index) => {
            const isActive = index === currentIndex;
            return (
              <View
                key={index}
                style={[
                  styles.progressPill,
                  isActive ? styles.progressPillActive : styles.progressPillInactive,
                ]}
              />
            );
          })}
        </View>

        {/* Headline Title */}
        <Text style={styles.titleText}>
          {SLIDES[currentIndex].title}
        </Text>

        {/* Subtitle Description */}
        <Text style={styles.descriptionText}>
          {SLIDES[currentIndex].description}
        </Text>

        {/* Single entry: number, then SMS code (new or returning traveller). */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.registerButton}
            onPress={handleStart}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            <Text style={styles.registerButtonText}>COMMENCER</Text>
          </TouchableOpacity>
          <Text style={styles.loginPrefixText}>Avec votre numéro de téléphone{'\n'}et un code reçu par SMS.</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },

  flatList: {
    flex: 1,
    zIndex: 10,
  },
  slide: {
    width: width,
    height: height,
    position: 'relative',
    overflow: 'hidden',
  },

  /* Layer 1: Background Image */
  heroBgImage: {
    width: '100%',
    height: height * 0.70,
  },
  heroOverlayGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: height * 0.70,
    backgroundColor: 'rgba(0, 0, 0, 0.02)',
  },

  /* Layer 2: Slide Bottom Information Card Backdrop - Designer Specs (Width 402px, Height 242px, Top 632px, Opacity 90%, #010101) */
  slideBottomBackdrop: {
    position: 'absolute',
    top: CARD_TOP,
    left: 0,
    right: 0,
    height: CARD_HEIGHT,
    backgroundColor: '#010101',
    opacity: 0.90,
    zIndex: 5,
  },

  /* Layer 3: Phone Mockup in FRONT of black backdrop - Designer Specs (225x523 at Top: 157, Left: 177) */
  phoneMockupContainer: {
    position: 'absolute',
    left: PHONE_LEFT,
    top: PHONE_TOP,
    width: PHONE_WIDTH,
    height: PHONE_HEIGHT,
    zIndex: 15,
    shadowColor: '#000000',
    shadowOffset: { width: -8, height: 14 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 14,
  },
  phoneMockupImage: {
    width: '100%',
    height: '100%',
  },

  /* Layer 4: Bottom Sheet UI Content */
  bottomCardContent: {
    position: 'absolute',
    top: CARD_TOP,
    left: 0,
    right: 0,
    height: CARD_HEIGHT,
    paddingHorizontal: 22,
    paddingTop: 16,
    paddingBottom: 24,
    justifyContent: 'space-between',
    zIndex: 30,
  },

  /* Indicators: Long Orange Pill + Round White Dots */
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 14,
  },
  progressPill: {
    height: 6,
    borderRadius: 3,
  },
  progressPillActive: {
    width: 44,
    backgroundColor: '#F26522',
  },
  progressPillInactive: {
    width: 6,
    backgroundColor: '#FFFFFF',
    opacity: 0.95,
  },

  /* Title: Designer specs - Font Montserrat 19px, LineHeight 23px, Weight 700 (Bold), Small Caps, White */
  titleText: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 23,
    marginBottom: 6,
    textTransform: 'uppercase',
    fontVariant: ['small-caps'],
  },

  /* Subtitle: Designer specs - Font 13px, LineHeight 17px, Weight 500 (Medium), White */
  descriptionText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0,
    lineHeight: 17,
    marginBottom: 16,
  },

  /* Actions Row */
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  /* Button "S'INSCRIRE": Rayon 25px, Background #F26522 */
  registerButton: {
    backgroundColor: '#F26522',
    minWidth: 120,
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  registerButtonText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  loginPrefixText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '500',
  },
});
