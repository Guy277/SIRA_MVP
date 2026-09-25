import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import {
  Dimensions,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width, height } = Dimensions.get('window');

interface NavigationStep {
  id: number;
  instruction: string;
  subtext: string;
  icon: keyof typeof Ionicons.glyphMap;
  modeColor: string;
  distanceRemaining: string;
  timeRemaining: string;
}

export default function NavigationActiveScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ destination?: string }>();

  const targetDestination = params.destination || 'Orange Digital Center';

  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isVoiceMuted, setIsVoiceMuted] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  const steps: NavigationStep[] = [
    {
      id: 1,
      instruction: "Dans 150m, prenez la rue à droite vers la Gare d'Adjamé",
      subtext: "Étape 1/4 • Marche à pied",
      icon: "walk",
      modeColor: "#10B981",
      distanceRemaining: "450 m",
      timeRemaining: "4 min",
    },
    {
      id: 2,
      instruction: "Montez dans le Bus 22 à la Gare d'Adjamé",
      subtext: "Étape 2/4 • Bus SUTRA",
      icon: "bus",
      modeColor: "#F26522",
      distanceRemaining: "12,5 km",
      timeRemaining: "20 min",
    },
    {
      id: 3,
      instruction: "Prenez un taxi au Rond-Point de la Riviera",
      subtext: "Étape 3/4 • Taxi Compteur",
      icon: "car",
      modeColor: "#1E6091",
      distanceRemaining: "3,2 km",
      timeRemaining: "7 min",
    },
    {
      id: 4,
      instruction: "Vous êtes arrivé à votre destination !",
      subtext: "Étape 4/4 • Arrivée",
      icon: "location",
      modeColor: "#FF4500",
      distanceRemaining: "0 m",
      timeRemaining: "0 min",
    },
  ];

  const currentStep = steps[currentStepIndex];

  // Auto advance steps preview timer for simulation
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentStepIndex((prev) => (prev < steps.length - 1 ? prev + 1 : prev));
    }, 12000);
    return () => clearInterval(timer);
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Full Screen 3D Live Map View */}
      <Image
        source={require('@/assets/images/city-route-3d-bg.jpg')}
        style={styles.fullMapImage}
        contentFit="cover"
      />

      {/* Overlay Safe Area */}
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        {/* Top Turn-by-Turn Instruction Banner (HUD) */}
        <View style={styles.topHudCard}>
          <View style={styles.hudHeaderRow}>
            <View style={[styles.directionIconCircle, { backgroundColor: currentStep.modeColor }]}>
              <Ionicons name={currentStep.icon} size={26} color="#FFFFFF" />
            </View>
            <View style={styles.hudTextCol}>
              <Text style={styles.hudInstructionText}>{currentStep.instruction}</Text>
              <Text style={styles.hudSubtext}>{currentStep.subtext}</Text>
            </View>
            <TouchableOpacity
              onPress={() => setShowExitConfirm(true)}
              style={styles.exitNavBtn}
              activeOpacity={0.8}
            >
              <Ionicons name="close-circle" size={30} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {/* Quick Distance & Time Countdown Bar inside Top HUD */}
          <View style={styles.hudBottomRow}>
            <View style={styles.hudMetricBadge}>
              <Ionicons name="navigate-outline" size={14} color="#FFFFFF" />
              <Text style={styles.hudMetricText}>Reste : {currentStep.distanceRemaining}</Text>
            </View>
            <View style={styles.hudMetricBadge}>
              <Ionicons name="time-outline" size={14} color="#FFFFFF" />
              <Text style={styles.hudMetricText}>Durée : {currentStep.timeRemaining}</Text>
            </View>
          </View>
        </View>

        {/* Map Side Quick Action Buttons (Right Side) */}
        <View style={styles.mapSideControls}>
          <TouchableOpacity
            style={styles.mapControlBtn}
            onPress={() => setIsVoiceMuted(!isVoiceMuted)}
            activeOpacity={0.8}
          >
            <Ionicons
              name={isVoiceMuted ? 'volume-mute' : 'volume-high'}
              size={22}
              color={isVoiceMuted ? '#94A3B8' : '#F26522'}
            />
          </TouchableOpacity>

          <TouchableOpacity style={styles.mapControlBtn} activeOpacity={0.8}>
            <Ionicons name="locate" size={22} color="#1E6091" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.mapControlBtn} activeOpacity={0.8}>
            <Ionicons name="layers" size={22} color="#334155" />
          </TouchableOpacity>
        </View>

        {/* Traffic Alert Callout on Map */}
        <View style={styles.liveTrafficBadge}>
          <View style={styles.liveDotPulse} />
          <Text style={styles.liveTrafficText}>Trafic fluide sur votre axe</Text>
        </View>

        {/* SIRA Live Voice Assistant Assistant Floating Bar */}
        <View style={styles.siraVoiceFloatingBar}>
          <Image
            source={require('@/assets/images/sira-character-assistant.png')}
            style={styles.siraNavAvatar}
            contentFit="contain"
          />
          <View style={styles.siraSpeechBubble}>
            <View style={styles.voiceWaveHeader}>
              <Ionicons name="mic" size={12} color="#F26522" />
              <Text style={styles.voiceLabel}>SIRA VOCAL</Text>
            </View>
            <Text style={styles.siraSpeechText}>
              Prenez la passerelle à droite pour arriver rapidement à la gare !
            </Text>
          </View>
        </View>

        {/* Bottom Navigation Dashboard Card */}
        <View style={styles.bottomDashboardCard}>
          {/* Progress Bar with Milestones */}
          <View style={styles.progressTrackContainer}>
            <View style={styles.progressTrackBg}>
              <View style={[styles.progressTrackFill, { width: `${((currentStepIndex + 1) / steps.length) * 100}%` }]} />
            </View>
            <View style={styles.milestonesRow}>
              {steps.map((step, idx) => (
                <TouchableOpacity
                  key={step.id}
                  onPress={() => setCurrentStepIndex(idx)}
                  style={[
                    styles.milestoneDot,
                    idx <= currentStepIndex && { backgroundColor: step.modeColor, borderColor: '#FFFFFF' },
                  ]}
                >
                  <Ionicons
                    name={step.icon}
                    size={10}
                    color={idx <= currentStepIndex ? '#FFFFFF' : '#94A3B8'}
                  />
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Time, Destination & Actions Footer Row */}
          <View style={styles.dashboardFooterRow}>
            <View style={styles.etaCol}>
              <Text style={styles.etaTimeText}>10:15</Text>
              <Text style={styles.etaLabelText}>Arrivée estimée</Text>
            </View>

            <View style={styles.destCol}>
              <Text style={styles.destNameText} numberOfLines={1}>
                {targetDestination}
              </Text>
              <Text style={styles.destSubText}>27 min • 14,2 km au total</Text>
            </View>

            <TouchableOpacity
              style={styles.sosButton}
              onPress={() => setShowExitConfirm(true)}
              activeOpacity={0.85}
            >
              <Ionicons name="stop-circle" size={20} color="#FFFFFF" />
              <Text style={styles.sosButtonText}>Quitter</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Exit Confirmation Modal Overlay */}
        {showExitConfirm && (
          <View style={styles.exitModalOverlay}>
            <View style={styles.exitModalCard}>
              <Ionicons name="alert-circle" size={44} color="#F26522" />
              <Text style={styles.exitModalTitle}>Arrêter la navigation ?</Text>
              <Text style={styles.exitModalSub}>
                Voulez-vous vraiment quitter le guidage en direct vers {targetDestination} ?
              </Text>
              <View style={styles.exitModalButtonsRow}>
                <TouchableOpacity
                  style={styles.cancelExitBtn}
                  onPress={() => setShowExitConfirm(false)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.cancelExitText}>Continuer</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.confirmExitBtn}
                  onPress={() => {
                    setShowExitConfirm(false);
                    router.back();
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.confirmExitText}>Quitter</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  fullMapImage: {
    ...StyleSheet.absoluteFill,
    width: '100%',
    height: '100%',
  },
  safeArea: {
    flex: 1,
    justifyContent: 'space-between',
  },
  topHudCard: {
    marginHorizontal: 16,
    marginTop: Platform.OS === 'android' ? 10 : 0,
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: 14,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  hudHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  directionIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 4,
  },
  hudTextCol: {
    flex: 1,
  },
  hudInstructionText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 20,
  },
  hudSubtext: {
    fontSize: 11.5,
    color: '#94A3B8',
    marginTop: 2,
    fontWeight: '600',
  },
  exitNavBtn: {
    padding: 2,
  },
  hudBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  hudMetricBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  hudMetricText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  mapSideControls: {
    position: 'absolute',
    right: 16,
    top: height * 0.22,
    gap: 10,
  },
  mapControlBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 5,
  },
  liveTrafficBadge: {
    position: 'absolute',
    top: height * 0.22,
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  liveDotPulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  liveTrafficText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  siraVoiceFloatingBar: {
    marginHorizontal: 16,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  siraNavAvatar: {
    width: 54,
    height: 64,
  },
  siraSpeechBubble: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
    borderWidth: 1,
    borderColor: '#EEF2F6',
  },
  voiceWaveHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  voiceLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: '#F26522',
    letterSpacing: 0.5,
  },
  siraSpeechText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
    lineHeight: 16,
  },
  bottomDashboardCard: {
    marginHorizontal: 16,
    marginBottom: Platform.OS === 'ios' ? 10 : 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  progressTrackContainer: {
    position: 'relative',
    marginBottom: 14,
  },
  progressTrackBg: {
    height: 6,
    backgroundColor: '#E2E8F0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressTrackFill: {
    height: '100%',
    backgroundColor: '#F26522',
    borderRadius: 3,
  },
  milestonesRow: {
    position: 'absolute',
    top: -4,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  milestoneDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#CBD5E1',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  dashboardFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  etaCol: {
    alignItems: 'flex-start',
  },
  etaTimeText: {
    fontSize: 22,
    fontWeight: '900',
    color: '#F26522',
  },
  etaLabelText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },
  destCol: {
    flex: 1,
    paddingHorizontal: 8,
  },
  destNameText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  destSubText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  sosButton: {
    backgroundColor: '#EF4444',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    gap: 4,
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 4,
  },
  sosButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  exitModalOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 1000,
  },
  exitModalCard: {
    width: '88%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  exitModalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 12,
    textAlign: 'center',
  },
  exitModalSub: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 6,
    textAlign: 'center',
    lineHeight: 18,
  },
  exitModalButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
    width: '100%',
  },
  cancelExitBtn: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    paddingVertical: 12,
    borderRadius: 16,
    alignItems: 'center',
  },
  cancelExitText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#475569',
  },
  confirmExitBtn: {
    flex: 1,
    backgroundColor: '#EF4444',
    paddingVertical: 12,
    borderRadius: 16,
    alignItems: 'center',
  },
  confirmExitText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
