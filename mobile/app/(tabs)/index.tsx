import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LocationSuggestionsList } from '@/components/location-suggestions-list';
import { YangoLocationModal } from '@/components/yango-location-modal';
import { OsmMapView } from '@/components/osm-map-view';

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

export default function HomeScreen() {
  const router = useRouter();
  const [destination, setDestination] = useState('');
  const [isYangoModalOpen, setIsYangoModalOpen] = useState(false);
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);

  const handleLocationSelect = (selectedLoc: string) => {
    setDestination(selectedLoc);
    setIsYangoModalOpen(false);
    router.push({
      pathname: '/(tabs)/explore',
      params: { destination: selectedLoc, query: selectedLoc },
    });
  };

  const handleOpenMic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setIsVoiceModalOpen(true);
  };

  const handleVoiceSelect = (phrase: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setDestination(phrase);
    setIsVoiceModalOpen(false);
    router.push({
      pathname: '/(tabs)/explore',
      params: { destination: phrase, query: phrase },
    });
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      {/* Real OpenStreetMap Interactive Canvas */}
      <OsmMapView style={styles.backgroundImage} />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Top Header Bar with Circular Black Back Button */}
        <View style={styles.topHeader}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.8}
          >
            <Ionicons name="arrow-back" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Speech / Greeting Bubble (Positioned above character's head with speech pointer tail) */}
        <View style={styles.speechBubble}>
          <Text style={styles.speechGreeting}>
            salut <Text style={styles.speechGreetingBold}>diata</Text>
          </Text>
          <Text style={styles.speechMain}>
            Je suis <Text style={styles.siraBold}>SIRA</Text>, votre
          </Text>
          <Text style={styles.speechSub}>assistant de mobilité.</Text>
          {/* Speech bubble pointer arrow */}
          <View style={styles.speechBubbleArrow} />
        </View>

        {/* 3D Animated Assistant Character - Designer Specs (324x486 at Top: 414px, Left: 39px, Angle: 0deg, Opacity: 1) */}
        <View style={styles.characterContainer} pointerEvents="none">
          <Image
            source={require('@/assets/images/sira-character-assistant.png')}
            style={styles.characterImage}
            contentFit="contain"
          />
        </View>

        {/* Bottom Destination Section */}
        <View style={styles.bottomBarContainer}>
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
                {destination || "Où voulez-vous aller ?"}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.micButton}
              onPress={handleOpenMic}
              activeOpacity={0.7}
            >
              <Ionicons name="mic" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* Yango Full Screen Location Modal */}
      <YangoLocationModal
        visible={isYangoModalOpen}
        onClose={() => setIsYangoModalOpen(false)}
        onSelectLocation={handleLocationSelect}
        currentLocationName="Orange Digital Center"
        initialQuery={destination}
      />

      {/* SIRA Interactive Voice Recognition Assistant Modal */}
      <Modal
        visible={isVoiceModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsVoiceModalOpen(false)}
      >
        <View style={styles.voiceModalOverlay}>
          <View style={styles.voiceModalContent}>
            {/* Modal Close Button */}
            <TouchableOpacity
              style={styles.voiceCloseButton}
              onPress={() => setIsVoiceModalOpen(false)}
              activeOpacity={0.8}
            >
              <Ionicons name="close" size={20} color="#FFFFFF" />
            </TouchableOpacity>

            <Text style={styles.voiceModalTitle}>Assistant Vocal SIRA</Text>
            <Text style={styles.voiceModalSubtitle}>Dites votre destination à voix haute...</Text>

            {/* Glowing Animated Microphone Circle */}
            <View style={styles.voiceMicGlowOuter}>
              <View style={styles.voiceMicGlowInner}>
                <Ionicons name="mic" size={44} color="#FFFFFF" />
              </View>
            </View>

            {/* Live Soundwave Bar Visualizer */}
            <View style={styles.soundwaveContainer}>
              <View style={[styles.soundwaveBar, { height: 28 }]} />
              <View style={[styles.soundwaveBar, { height: 42 }]} />
              <View style={[styles.soundwaveBar, { height: 56 }]} />
              <View style={[styles.soundwaveBar, { height: 38 }]} />
              <View style={[styles.soundwaveBar, { height: 24 }]} />
            </View>

            {/* Voice Command Quick Suggestions */}
            <Text style={styles.voiceSuggestLabel}>Exemples de destination :</Text>
            <View style={styles.voiceChipsContainer}>
              {[
                'Orange Digital Center',
                "Gare d'Adjamé",
                'Cocody Saint-Jean',
                'Abobo Samaké',
              ].map((item) => (
                <TouchableOpacity
                  key={item}
                  style={styles.voiceChip}
                  onPress={() => handleVoiceSelect(item)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="location-sharp" size={14} color="#F26522" style={{ marginRight: 6 }} />
                  <Text style={styles.voiceChipText}>{item}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>
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
    paddingHorizontal: 18,
    paddingTop: 8,
    zIndex: 30,
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
    top: CHARACTER_TOP - 110,
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

  /* Voice Assistant Modal Styles */
  voiceModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.82)',
    justifyContent: 'flex-end',
  },
  voiceModalContent: {
    backgroundColor: '#1E1E1E',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: Platform.OS === 'ios' ? 44 : 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  voiceCloseButton: {
    position: 'absolute',
    top: 20,
    right: 20,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  voiceModalTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  voiceModalSubtitle: {
    color: '#AAAAAA',
    fontSize: 14,
    fontWeight: '400',
    marginBottom: 28,
    textAlign: 'center',
  },
  voiceMicGlowOuter: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(242, 101, 34, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  voiceMicGlowInner: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#F26522',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#F26522',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 10,
  },
  soundwaveContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 28,
    height: 60,
  },
  soundwaveBar: {
    width: 6,
    backgroundColor: '#F26522',
    borderRadius: 3,
  },
  voiceSuggestLabel: {
    color: '#888888',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
    alignSelf: 'flex-start',
  },
  voiceChipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    width: '100%',
  },
  voiceChip: {
    backgroundColor: '#2A2A2A',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  voiceChipText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
  },
});
