import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { useIsFocused, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LocationSuggestionsList } from '@/components/location-suggestions-list';
import { YangoLocationModal } from '@/components/yango-location-modal';
import { OsmMapView } from '@/components/osm-map-view';
import { firstName, useSession, useSessionRestored } from '@/lib/session';
import { ensureCurrentPlace, isOwnPosition, rememberPlace, useCurrentPlace } from '@/lib/places';
import { VoiceAssistantSheet } from '@/components/voice-assistant-sheet';
import type { VoiceJourneyRequest, VoiceReply } from '@/lib/sira-api';
import { journeyStore, useJourneyStore } from '@/lib/journey-store';
import { cycleVoiceMode, useVoiceMode, VOICE_MODE_LABELS, type VoiceMode } from '@/lib/voice';
import { useHomeGreeting } from '@/lib/use-home-greeting';
import { notify } from '@/lib/notify';
import { playIntroToday } from '@/lib/motion';
import { TypewriterText } from '@/components/typewriter-text';
import Animated, { FadeIn, FadeInDown, FadeInUp, ZoomIn } from 'react-native-reanimated';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Designer canvas reference metrics (406px x 874px)
const DESIGN_CANVAS_WIDTH = 406;
const DESIGN_CANVAS_HEIGHT = 874;

// Character Assistant specs: Width 324px, Height 486px, Top 414px, Left 39px
const CHARACTER_WIDTH = (324 / DESIGN_CANVAS_WIDTH) * SCREEN_WIDTH;
const CHARACTER_HEIGHT = (486 / DESIGN_CANVAS_HEIGHT) * SCREEN_HEIGHT;
const CHARACTER_TOP = (414 / DESIGN_CANVAS_HEIGHT) * SCREEN_HEIGHT;
const CHARACTER_LEFT = (39 / DESIGN_CANVAS_WIDTH) * SCREEN_WIDTH;

// Search Pill specs: Width 364px, Height 58px, Angle 0deg, Opacity 1, Radius 100px, #F26522
const SEARCH_PILL_WIDTH = (364 / DESIGN_CANVAS_WIDTH) * SCREEN_WIDTH;
const SEARCH_PILL_HEIGHT = (58 / DESIGN_CANVAS_HEIGHT) * SCREEN_HEIGHT;

const VOICE_ICONS: Record<VoiceMode, keyof typeof Ionicons.glyphMap> = { on: 'volume-high', alerts: 'notifications', off: 'volume-mute' };

// A line of the bubble: « SIRA » in bold.
const bubbleLine = (line: string) => line.split(/(SIRA)/).map((part, index) =>
  part === 'SIRA' ? <Text key={index} style={styles.siraBold}>SIRA</Text> : part);

export default function HomeScreen() {
  const router = useRouter();
  const session = useSession();
  const greetingName = firstName(session?.user);
  const here = useCurrentPlace();
  useEffect(() => { void ensureCurrentPlace(); }, []);
  const [isYangoModalOpen, setIsYangoModalOpen] = useState(false);
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  // Another departure than one's own position, picked in the header of « On va où ? ».
  const [pickedDeparture, setPickedDeparture] = useState<string | null>(null);
  const [bubbleHeight, setBubbleHeight] = useState(90);
  // The map, the character and the search bar come in once a day.
  const [intro] = useState(() => playIntroToday('home'));
  const voiceMode = useVoiceMode();

  // Just back from a trip: the way back is one touch away (people often make the
  // round trip), and SIRA says goodbye instead of « Akwaba ».
  const { finished } = useJourneyStore();
  const wayBackLabel = finished
    ? (isOwnPosition(finished.from.name) ? 'Retour au point de départ' : `Retour vers ${finished.from.name}`)
    : null;

  // SIRA's message: the bubble shows exactly what the voice says, at the same moment
  // (opening of the app, new sign-in, back after 30 min, end of a trip), and it
  // follows the hour. Only once this screen is really shown: it is mounted underneath
  // the sign-in screen, where SIRA must not talk over « Comment tu t'appelles ? ».
  const focused = useIsFocused();
  const message = useHomeGreeting({
    ready: useSessionRestored(),
    focused,
    userId: session?.user.id ?? null,
    sessionToken: session?.token ?? null,
    firstName: greetingName,
    arrival: finished && wayBackLabel ? { to: finished.to.name, wayBack: wayBackLabel, pending: !finished.greeted } : null,
    onArrivalSaid: journeyStore.markFinishedGreeted,
  });

  const handleWayBack = () => {
    if (!finished) return;
    const target = isOwnPosition(finished.from.name) ? 'Point de départ' : finished.from.name;
    rememberPlace(target, { latitude: finished.from.latitude, longitude: finished.from.longitude });
    // From the traveller's position when it is known, else from where the trip ended.
    const fromHere = here.status === 'ready' && !here.outside;
    if (!fromHere) rememberPlace(finished.to.name, { latitude: finished.to.latitude, longitude: finished.to.longitude });
    router.push({
      pathname: '/(tabs)/explore',
      params: { destination: target, query: target, ...(fromHere ? {} : { from: finished.to.name }) },
    });
  };

  const handleLocationSelect = (selectedLoc: string) => {
    setIsYangoModalOpen(false);
    const departure = pickedDeparture;
    // Leaving from one's own position, it cannot also be the destination.
    if (!departure && isOwnPosition(selectedLoc)) {
      notify('Choisis une destination', 'Tu es déjà à cet endroit : indique où tu veux aller, ou touche « Ma position » pour changer de départ.');
      return;
    }
    if (departure && selectedLoc === departure) {
      notify('Choisis une autre destination', 'Le départ et l’arrivée sont le même endroit.');
      return;
    }
    // From another departure, « Ma position » can be the destination (going back home).
    const destination = isOwnPosition(selectedLoc) && here.status === 'ready' ? here.title : selectedLoc;
    setPickedDeparture(null);
    router.push({
      pathname: '/(tabs)/explore',
      params: { destination, query: destination, ...(departure ? { from: departure } : {}) },
    });
  };

  const handleOpenMic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setIsVoiceModalOpen(true);
  };

  // Journeys found by voice open in the trips screen: the places SIRA
  // understood are remembered with their coordinates, no second lookup.
  const handleVoiceJourneys = (request: VoiceJourneyRequest) => {
    setIsVoiceModalOpen(false);
    const { origin, destination } = request;
    if (!destination) return;
    rememberPlace(destination.name, { latitude: destination.lat, longitude: destination.lon });
    const spokenOrigin = origin && origin.name !== 'Ma position' ? origin : null;
    if (spokenOrigin) rememberPlace(spokenOrigin.name, { latitude: spokenOrigin.lat, longitude: spokenOrigin.lon });
    router.push({
      pathname: '/(tabs)/explore',
      params: { destination: destination.name, query: destination.name, ...(spokenOrigin ? { from: spokenOrigin.name } : {}) },
    });
  };

  // « On y va ! » : the trip SIRA described starts right away, like a GPS.
  const handleVoiceStart = (reply: VoiceReply) => {
    const request = reply.journey_request;
    const found = reply.journeys?.journeys?.filter((journey) => journey.legs?.length) ?? [];
    const journey = found.find((item) => item.id === reply.chosen_id) ?? found[0];
    if (!request?.origin || !request.destination || !journey) {
      if (request) handleVoiceJourneys(request);
      return;
    }
    setIsVoiceModalOpen(false);
    const { origin, destination } = request;
    rememberPlace(destination.name, { latitude: destination.lat, longitude: destination.lon });
    journeyStore.setSearch({
      departure: { name: origin.name, latitude: origin.lat, longitude: origin.lon },
      arrival: { name: destination.name, latitude: destination.lat, longitude: destination.lon },
      departureAt: new Date(),
      journeys: found,
      categories: reply.journeys?.categories ?? { coule: [], debout: [], suspendu: [] },
    });
    journeyStore.select(journey.id);
    journeyStore.start(journey);
    router.push({ pathname: '/navigation-active', params: { destination: destination.name } });
  };

  // After two misunderstandings: typing or the map instead of the voice.
  const handleTypeInstead = () => {
    setIsVoiceModalOpen(false);
    setIsYangoModalOpen(true);
  };

  // « Il y a un accident à Adjamé » : the report form, already on the right category.
  const handleVoiceReport = (category: { categoryId: string; title: string }) => {
    setIsVoiceModalOpen(false);
    router.push({ pathname: '/report-event-detail', params: category });
  };

  // The voice assistant leaves from the traveller's position when it is known in Abidjan.
  const voicePosition = here.status === 'ready' && !here.outside ? here.coordinates : null;

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      {/* Real OpenStreetMap Interactive Canvas */}
      <OsmMapView style={styles.backgroundImage} />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Top Header Bar with Circular Black Back Button */}
        <View style={styles.topHeader}>
          {/* Home is the first screen of the app: its back arrow leads to the
              login page (history "back" would only reach the splash, also at "/"). */}
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.push('/login')}
            activeOpacity={0.8}
            accessibilityLabel="Retour"
          >
            <Ionicons name="arrow-back" size={18} color="#FFFFFF" />
          </TouchableOpacity>
          {/* SIRA's voice: on -> alerts only -> off (kept on this phone). */}
          <TouchableOpacity
            style={styles.voiceButton}
            onPress={cycleVoiceMode}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={`Voix : ${VOICE_MODE_LABELS[voiceMode]}. Touche pour changer.`}
          >
            <Ionicons name={VOICE_ICONS[voiceMode]} size={18} color={voiceMode === 'off' ? '#94A3B8' : '#FFFFFF'} />
          </TouchableOpacity>
        </View>

        {/* SIRA's bubble, above the character's head: pops up with the voice,
            « Akwaba Guy ! » writes itself, then the other lines come. It grows
            upwards, so it never covers the character. */}
        {message && (
          <Animated.View
            key={message.key}
            entering={message.animate ? ZoomIn.delay(150).springify().damping(14) : FadeIn.duration(250)}
            style={[styles.speechBubble, { top: Math.max(56, CHARACTER_TOP - 20 - bubbleHeight) }]}
            onLayout={(event) => setBubbleHeight(event.nativeEvent.layout.height)}
            accessibilityLiveRegion="polite"
          >
            <TypewriterText
              play={message.animate}
              delayMs={450}
              text={message.greeting.hello}
              style={[styles.speechGreeting, styles.speechGreetingBold]}
            />
            {message.greeting.lines.map((line, index) => (
              <Animated.Text
                key={line}
                entering={message.animate ? FadeIn.delay(1000 + index * 350).duration(350) : FadeIn.duration(250)}
                style={index === message.greeting.lines.length - 1 ? styles.speechSub : styles.speechMain}
              >
                {bubbleLine(line)}
              </Animated.Text>
            ))}
            {/* Speech bubble pointer arrow */}
            <View style={styles.speechBubbleArrow} />
          </Animated.View>
        )}

        {/* 3D Animated Assistant Character - Designer Specs (324x486 at Top: 414px, Left: 39px, Angle: 0deg, Opacity: 1) */}
        <Animated.View entering={intro ? FadeInDown.duration(500) : FadeIn.duration(250)} style={styles.characterContainer} pointerEvents="none">
          <Image
            source={require('@/assets/images/sira-character-assistant.png')}
            style={styles.characterImage}
            contentFit="contain"
          />
        </Animated.View>

        {/* Bottom Destination Section */}
        <Animated.View entering={intro ? FadeInUp.delay(900).duration(400) : FadeIn.duration(250)} style={styles.bottomBarContainer}>
          {/* Way back after a trip (« Retour vers Treichville »): the reverse journey in one touch. */}
          {wayBackLabel && (
            <TouchableOpacity
              style={styles.wayBackChip}
              onPress={handleWayBack}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={wayBackLabel}
            >
              <Ionicons name="return-down-back" size={18} color="#F26522" />
              <Text style={styles.wayBackText} numberOfLines={1}>{wayBackLabel}</Text>
            </TouchableOpacity>
          )}

          {/* Destination Search Bar (Floating Pill - Orange inactive / Dark active) */}
          <TouchableOpacity
            style={styles.searchPill}
            activeOpacity={0.9}
            onPress={() => setIsYangoModalOpen(true)}
          >
            <View style={styles.searchPinCircle}>
              <Ionicons name="location-sharp" size={20} color="#F26522" />
            </View>

            <View style={styles.searchInputWrapper}>
              <Text style={styles.searchPlaceholderText}>
                On va où ?
              </Text>
            </View>

            <TouchableOpacity
              style={styles.micButton}
              onPress={handleOpenMic}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Parler à SIRA"
            >
              <Ionicons name="mic" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          </TouchableOpacity>
        </Animated.View>
      </SafeAreaView>

      {/* Yango Full Screen Location Modal */}
      <YangoLocationModal
        visible={isYangoModalOpen}
        onClose={() => setIsYangoModalOpen(false)}
        onSelectLocation={handleLocationSelect}
        departureName={pickedDeparture ?? undefined}
        onSelectDeparture={(title) => setPickedDeparture(isOwnPosition(title) ? null : title)}
        currentLocationName={here.status === 'ready' ? here.title : 'Ma position'}
        placeholder="On va où ?"
        initialQuery=""
      />

      {/* Voice assistant: speak, SIRA answers out loud with a real journey */}
      <VoiceAssistantSheet
        visible={isVoiceModalOpen}
        onClose={() => setIsVoiceModalOpen(false)}
        position={voicePosition}
        onShowJourneys={handleVoiceJourneys}
        onStartJourney={handleVoiceStart}
        onTypeInstead={handleTypeInstead}
        onReport={handleVoiceReport}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  backgroundImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  safeArea: {
    flex: 1,
    justifyContent: 'space-between',
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 8,
    zIndex: 30,
  },
  voiceButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  speechBubble: {
    position: 'absolute',
    left: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.78)',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 22,
    borderBottomLeftRadius: 4,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 6,
    zIndex: 20,
    maxWidth: SCREEN_WIDTH * 0.65,
  },
  speechGreeting: {
    color: '#121212',
    fontSize: 16,
    fontWeight: '400',
    marginBottom: 2,
  },
  speechGreetingBold: {
    fontWeight: '800',
    color: '#000000',
  },
  speechMain: {
    color: '#333333',
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 19,
  },
  siraBold: {
    color: '#000000',
    fontWeight: '900',
  },
  speechSub: {
    color: '#333333',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 19,
  },
  speechBubbleArrow: {
    position: 'absolute',
    bottom: -8,
    left: 24,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 9,
    borderStyle: 'solid',
    backgroundColor: 'transparent',
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: 'rgba(255, 255, 255, 0.78)',
  },

  /* 3D Character Container - Designer Specs (324x486 at Top: 414px, Left: 39px) */
  characterContainer: {
    position: 'absolute',
    top: CHARACTER_TOP,
    left: CHARACTER_LEFT,
    width: CHARACTER_WIDTH,
    height: CHARACTER_HEIGHT,
    zIndex: 10,
  },
  characterImage: {
    width: '100%',
    height: '100%',
  },

  /* Bottom Floating Search Bar */
  bottomBarContainer: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 36 : 24,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 25,
  },
  suggestionsContainer: {
    width: SEARCH_PILL_WIDTH,
    marginBottom: 10,
    zIndex: 30,
  },
  wayBackChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: SEARCH_PILL_WIDTH,
    backgroundColor: '#1E1E1E',
    borderRadius: 22,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
  wayBackText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 1,
  },
  searchPill: {
    width: SEARCH_PILL_WIDTH,
    height: Math.max(56, SEARCH_PILL_HEIGHT),
    backgroundColor: '#F26522',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    borderRadius: 100,
    opacity: 1,
    transform: [{ rotate: '0deg' }],
    shadowColor: '#F26522',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.38,
    shadowRadius: 12,
    elevation: 8,
  },
  searchPinCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },
  searchInputWrapper: {
    flex: 1,
    paddingHorizontal: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchPlaceholderText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  searchInput: {
    width: '100%',
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 22,
    letterSpacing: 0,
    textAlign: 'center',
    paddingVertical: Platform.OS === 'ios' ? 4 : 0,
  },
  clearCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  searchPillFocused: {
    backgroundColor: '#333333',
    paddingHorizontal: 20,
    shadowColor: '#000000',
    shadowOpacity: 0.25,
  },
  searchInputWrapperFocused: {
    alignItems: 'flex-start',
    paddingHorizontal: 0,
  },
  searchInputFocused: {
    fontSize: 16,
    fontWeight: '500',
    lineHeight: 22,
    textAlign: 'left',
    color: '#FFFFFF',
  },
  micButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },

});
