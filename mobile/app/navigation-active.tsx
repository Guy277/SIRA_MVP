import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  Platform,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Text, TextInput } from '@/components/sira-text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { OsmMapView } from '@/components/osm-map-view';
import { TripRatingModal } from '@/components/trip-rating-modal';
import { notify } from '@/lib/notify';
import { journeyStore, useJourneyStore } from '@/lib/journey-store';
import { fetchJourneys, journeyImpact, reportFare, voteReport, type ApiJourney, type LegMode, type ReportImpact } from '@/lib/sira-api';
import { formatClock, formatDistance, formatDuration, formatPrice, isVehicle, journeyPath, journeyTitle, legPath, stepDescription, stepTitle, timeline } from '@/lib/journey-format';
import { useMapSettings } from '@/lib/map-settings';
import { upsertReport, useLiveReports } from '@/lib/reports';
import { locateUser, refreshCurrentPlace } from '@/lib/places';
import { usageAllowed } from '@/lib/usage';
import { goBack, goHome } from '@/lib/navigation';
import { currentToken } from '@/lib/session';
import { arrivalPhrase, placeForTitle } from '@/lib/saved-places';
import { alightSoonSpeech, arrivalSpeech, fareQuestion, gpsEvent, gpsHint, minutes, spokenJourney, startSpeech, stepSpeech } from '@/lib/guidance';
import { cycleVoiceMode, say, stopSpeaking, useVoiceMode, VOICE_MODE_ICONS, VOICE_MODE_LABELS } from '@/lib/voice';
import { useSpokenQuestion } from '@/lib/use-spoken-question';
import { lieuViseVers, oublierLieuVise } from '@/lib/lieu-vise';
import { followCamera, rideCountdown, rideProgress } from '@/lib/ride-progress-core';
import * as Haptics from 'expo-haptics';
import { repondreEncoreLa } from '@/lib/lieux';

const { height } = Dimensions.get('window');

const MODE_ICONS: Record<LegMode, keyof typeof Ionicons.glyphMap> = {
  walk: 'walk', wait: 'time', transfer: 'swap-horizontal', sotra: 'bus', gbaka: 'bus', woro: 'car-sport', taxi: 'car', boat: 'boat',
};
const MODE_COLORS: Record<LegMode, string> = {
  walk: '#10B981', wait: '#64748B', transfer: '#7C3AED', sotra: '#F26522', gbaka: '#F26522', woro: '#1E6091', taxi: '#1E6091', boat: '#0284C7',
};
// Map moved by hand during guidance: it follows the traveller again after this long without a touch.
// 8 s: a proposal (Waze also comes back by itself after a few seconds), to adjust in real use.
const RECENTER_AFTER_MS = 8_000;
// Speaker button, as in Google Maps: all spoken → alerts only → muted.

export default function NavigationActiveScreen() {
  const router = useRouter();
  const { activeJourney, search } = useJourneyStore();
  // « Quitter » and « Terminer » clear the followed journey, then go back. The screen keeps the last journey
  // until it is gone: without it, it showed « Aucun trajet en cours » for a moment while leaving (the flash
  // with the tall red « Retour » bar, 22 novembre 2026).
  const [lastJourney, setLastJourney] = useState(activeJourney);
  if (activeJourney && activeJourney !== lastJourney) setLastJourney(activeJourney);
  const journey = activeJourney ?? lastJourney;
  const { reports } = useLiveReports();
  const [startedAt] = useState(() => new Date());
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const voiceMode = useVoiceMode();
  const [modeChip, setModeChip] = useState(false);
  const chipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const question = useSpokenQuestion();
  const [gpsOn, setGpsOn] = useState(false);
  const [arrived, setArrived] = useState(false);
  const [fare, setFare] = useState<{ state: 'ask' | 'sent'; typed: string }>({ state: 'ask', typed: '' });
  // « Tu l'as trouvé ? » : arrivé au lieu choisi depuis sa fiche (« Y aller »).
  const [found, setFound] = useState<'ask' | 'sending' | 'yes' | 'no'>('ask');
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  // « Comment s'est passé ton trajet ? », asked when the traveller ends an arrived trip.
  const [showRating, setShowRating] = useState(false);
  // Small phones: the top card grows (title on two lines), so what sits under it
  // follows its real bottom; the bottom card keeps only the icon of « Quitter ».
  const [hudBottom, setHudBottom] = useState(0);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const narrow = screenWidth < 360;
  const belowHud = { top: Math.max(screenHeight * 0.22, hudBottom + 10) };
  const [impact, setImpact] = useState<{ journeyId: string; value: ReportImpact } | null>(null);
  const [alternative, setAlternative] = useState<ApiJourney | null>(null);
  const [rerouting, setRerouting] = useState(false);
  // Incidents the traveller chose to drive through, and reports already
  // answered in the "toujours là ?" prompt.
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [answered, setAnswered] = useState<string[]>([]);

  const targetDestination = search?.arrival.name ?? 'Destination';
  const steps = useMemo(() => journey ? timeline(journey, startedAt) : [], [journey, startedAt]);
  // Carte du guidage (web : MapLibre ; appli installée : react-native-maps) : penchée, elle suit le voyageur, la
  // route montant devant lui, comme un GPS.
  // Sans GPS, elle suit le début de l'étape en cours. « Vue d'ensemble » la remet à plat sur tout le trajet.
  const mapSettings = useMapSettings();
  const [here, setHere] = useState<{ latitude: number; longitude: number } | null>(null);
  const [overview, setOverview] = useState(false);
  // Le voyageur a déplacé la carte : le suivi s'arrête, la carte reste penchée. « Recentrer » le reprend, et il
  // reprend tout seul après RECENTER_AFTER_MS sans toucher la carte (comme Waze).
  const [followPaused, setFollowPaused] = useState(false);
  const recenterTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearRecenterTimer = () => { if (recenterTimer.current) clearTimeout(recenterTimer.current); recenterTimer.current = null; };
  const pauseFollow = () => {
    setFollowPaused(true);
    clearRecenterTimer();
    recenterTimer.current = setTimeout(() => { recenterTimer.current = null; setFollowPaused(false); }, RECENTER_AFTER_MS);
  };
  const recenter = () => { clearRecenterTimer(); setFollowPaused(false); setOverview(false); };
  // « Vue d'ensemble » : the whole trip, flat; only by its button, never by moving the map.
  const showOverview = () => { clearRecenterTimer(); setFollowPaused(false); setOverview(true); };
  useEffect(() => clearRecenterTimer, []);
  // Without GPS, the map follows the start of the current step. A step drawn without a path (waiting at a stop,
  // changing on foot) takes the start of the next drawn step, else the end of the previous one: without it the
  // map lost its point and fell flat on the whole trip, as if the traveller had asked for the overview.
  const stepStart = useMemo(() => {
    for (let index = currentStepIndex; index < steps.length; index += 1) {
      const path = legPath(steps[index].leg);
      if (path.length) return path[0];
    }
    for (let index = currentStepIndex - 1; index >= 0; index -= 1) {
      const path = legPath(steps[index].leg);
      if (path.length) return path[path.length - 1];
    }
    return null;
  }, [steps, currentStepIndex]);
  const followPoint = !overview && !arrived ? here ?? stepStart : null;
  // Lot 2 (docs/etude-guidage-carte.md): stops or distance left on the current ride, and the map view of the step.
  const stepLeg = steps[Math.min(currentStepIndex, Math.max(steps.length - 1, 0))]?.leg ?? null;
  const progress = useMemo(() => (stepLeg ? rideProgress(stepLeg, here) : null), [stepLeg, here]);
  const countdown = stepLeg && progress ? rideCountdown(stepLeg, progress) : null;
  const camera = useMemo(() => (stepLeg ? followCamera(stepLeg, progress?.metresLeft ?? null) : null), [stepLeg, progress?.metresLeft]);
  const current = steps[Math.min(currentStepIndex, Math.max(steps.length - 1, 0))];

  // Re-evaluates confirmed incidents on this journey whenever reports change.
  const reportsKey = reports.map((report) => `${report.id}:${report.status}`).join('|');
  useEffect(() => {
    if (!journey) return;
    let cancelled = false;
    journeyImpact(journey.legs)
      .then((value) => { if (!cancelled) setImpact({ journeyId: journey.id, value }); })
      .catch(() => { /* signalements indisponibles : pas d'alerte */ });
    return () => { cancelled = true; };
  }, [journey, reportsKey]);

  const currentImpact = impact?.journeyId === journey?.id ? impact?.value : null;
  const affected = (currentImpact?.affected ?? []).filter((item) => !dismissed.includes(item.report.id));
  const delay = affected.reduce((sum, item) => sum + item.delayMinutes, 0);
  // Waze-style prompt for an unconfirmed report on the way.
  const toConfirm = (currentImpact?.unconfirmed ?? []).find((item) => !answered.includes(item.report.id));

  const eta = journey ? new Date(startedAt.getTime() + (journey.duration + delay) * 60_000) : null;

  const findAlternative = async () => {
    if (!search || !journey) return;
    setRerouting(true);
    try {
      // Reroute from where the traveller is now when GPS allows it.
      const here = await locateUser().catch(() => null);
      const origin = here ? { ...here, name: 'Ma position actuelle' } : search.departure;
      const data = await fetchJourneys({
        origin, destination: search.arrival, departureAt: new Date(),
        // Every confirmed incident is avoided, not only the one on this route:
        // otherwise the detour can lead straight into an earlier incident.
        avoid: reports
          .filter((report) => report.status === 'confirmed' || report.status === 'reliable')
          .slice(0, 10)
          .map((report) => ({ lat: report.lat, lon: report.lon, radiusM: ['flood', 'blocked'].includes(report.type) ? 300 : 200 })),
      });
      const best = data.journeys.find((item) => item.recommended) ?? data.journeys[0];
      if (best) setAlternative({ ...best, id: `${best.id}~${Date.now().toString(36)}` });
      else notify('Pas d’alternative', 'Aucun trajet ne contourne l’incident. Ton trajet actuel reste le meilleur choix.');
    } catch (error) {
      notify('Recalcul impossible', error instanceof Error ? error.message : 'Réessaie dans un instant.');
    } finally {
      setRerouting(false);
    }
  };

  const adoptAlternative = () => {
    if (!alternative) return;
    question.cancel();
    journeyStore.replaceActive(alternative);
    setAlternative(null);
    setCurrentStepIndex(0);
  };

  const keepCurrentJourney = () => {
    question.cancel();
    setDismissed((ids) => [...ids, ...affected.map((item) => item.report.id)]);
    setAlternative(null);
  };

  const answerStillThere = async (reportId: string, kind: 'confirm' | 'contest') => {
    question.cancel();
    setAnswered((ids) => [...ids, reportId]);
    try { upsertReport(await voteReport(reportId, kind)); } catch { /* déjà voté, hors ligne ou pas connecté */ }
  };

  const destinationName = search?.arrival.name ?? 'ta destination';
  // « Te voilà à la maison ! » when the trip goes to one of the traveller's places.
  const savedArrival = placeForTitle(search?.arrival.name);
  const arrivalWhere = savedArrival ? arrivalPhrase(savedArrival) : `à ${destinationName}`;
  // Community price asked on arrival (lines with a known id, not taxis).
  const fareLeg = journey?.legs.find((leg) => isVehicle(leg) && leg.mode !== 'taxi' && leg.line_id) ?? null;
  const canShareFare = Boolean(fareLeg && currentToken());

  const sendFare = async (amount: number) => {
    if (!fareLeg?.line_id) return;
    question.cancel();
    try {
      await reportFare(fareLeg.line_id, fareLeg.mode, amount);
      setFare({ state: 'sent', typed: '' });
      void say(`Merci ! ${amount} francs, c'est noté pour les prochains voyageurs.`, 'answer');
    } catch (error) {
      notify('Envoi impossible', error instanceof Error ? error.message : 'Réessaie dans un instant.');
    }
  };

  // The place picked from its sheet, when this trip goes there: on arrival SIRA asks « Tu l'as trouvé ? ».
  // A yes near the place counts as « trouvé avec SIRA », the strongest proof that the place exists.
  const targetPlace = lieuViseVers(search?.arrival);
  const answerFound = async (yes: boolean) => {
    if (!targetPlace || found !== 'ask') return;
    setFound('sending');
    try {
      try {
        await repondreEncoreLa(targetPlace.id, yes, yes && here ? here : undefined);
      } catch (error) {
        // Too far from the place (arrival by touch, poor GPS): the yes still counts as « encore là ».
        if (!(yes && here)) throw error;
        await repondreEncoreLa(targetPlace.id, yes);
      }
      setFound(yes ? 'yes' : 'no');
    } catch (error) {
      setFound('ask');
      notify('Envoi impossible', error instanceof Error ? error.message : 'Réessaie dans un instant.');
    }
  };

  // Arrived: the trip is over, the home map is next (as in Google Maps and Waze).
  const finishTrip = () => {
    setShowRating(false);
    oublierLieuVise();
    journeyStore.finish();
    void refreshCurrentPlace();
    goHome(router);
  };

  const nextStep = () => {
    question.cancel();
    if (currentStepIndex >= steps.length - 1) setArrived(true);
    else setCurrentStepIndex((index) => Math.min(index + 1, steps.length - 1));
  };

  const changeVoiceMode = () => {
    cycleVoiceMode();
    setModeChip(true);
    if (chipTimer.current) clearTimeout(chipTimer.current);
    chipTimer.current = setTimeout(() => setModeChip(false), 2500);
  };

  // ── SIRA speaks each step as it begins (« C'est parti… », « Descends ici… »),
  // and « Nouveau trajet » after a detour, like a GPS.
  const spokenStep = useRef<string | null>(null);
  useEffect(() => {
    if (!journey || !steps.length || arrived) return;
    const key = `${journey.id}:${currentStepIndex}`;
    if (spokenStep.current === key) return;
    const newJourney = !spokenStep.current?.startsWith(`${journey.id}:`);
    const rerouted = newJourney && spokenStep.current !== null;
    spokenStep.current = key;
    const expected = new Date(startedAt.getTime() + journey.duration * 60_000);
    const sentence = rerouted ? `Nouveau trajet : ${spokenJourney(journey)}. ${stepSpeech(steps, currentStepIndex, destinationName, gpsOn)}`
      : newJourney ? startSpeech(steps, destinationName, expected, gpsOn)
      : stepSpeech(steps, currentStepIndex, destinationName, gpsOn);
    void say(sentence, 'guidance');
  }, [journey, steps, currentStepIndex, arrived, destinationName, startedAt, gpsOn]);

  // Silence when leaving the guidance.
  useEffect(() => () => stopSpeaking(), []);

  // ── Waze-style alerts: said once, answered by voice (« oui » / « non ») or with the buttons.
  const alerted = useRef(new Set<string>());
  const incident = affected[0] ?? null;
  useEffect(() => {
    if (!incident || alternative || alerted.current.has(incident.report.id)) return;
    alerted.current.add(incident.report.id);
    const { report } = incident;
    void question.ask(
      `Attention : ${report.title.toLowerCase()} confirmé sur ton trajet, vers ${report.location}. Environ ${minutes(delay)} de retard. Je cherche un détour ? Dis oui ou non.`,
      `reroute:${report.id}`,
    ).then((answer) => {
      if (answer?.answer === 'yes') void findAlternative();
      else if (answer?.answer === 'no') keepCurrentJourney();
    });
  });

  useEffect(() => {
    if (!alternative || alerted.current.has(alternative.id)) return;
    alerted.current.add(alternative.id);
    void question.ask(
      `J'ai trouvé un détour : ${spokenJourney(alternative)}, environ ${minutes(alternative.duration)}. Dis oui pour le prendre.`,
      `adopt:${alternative.id}`,
    ).then((answer) => {
      if (answer?.answer === 'yes') adoptAlternative();
      else if (answer?.answer === 'no') keepCurrentJourney();
    });
  });

  useEffect(() => {
    if (!toConfirm || incident || alerted.current.has(`still:${toConfirm.report.id}`)) return;
    alerted.current.add(`still:${toConfirm.report.id}`);
    const { report } = toConfirm;
    void question.ask(`${report.title} signalé vers ${report.location}. C'est toujours là ?`, `still:${report.id}`).then((answer) => {
      if (!answer?.answer) return;
      void answerStillThere(report.id, answer.answer === 'yes' ? 'confirm' : 'contest');
      void say('Merci, c’est noté.', 'answer');
    });
  });

  // ── GPS: SIRA follows the traveller, moves to the next step and warns
  // before getting off. Tapping the banner stays possible (no GPS, indoors…).
  const latest = useRef({ steps, index: currentStepIndex, arrived, destination: search?.arrival ?? null, destinationName: search?.arrival.name ?? '' });
  useEffect(() => { latest.current = { steps, index: currentStepIndex, arrived, destination: search?.arrival ?? null, destinationName: search?.arrival.name ?? '' }; });
  const warned = useRef(new Set<string>());
  const journeyId = journey?.id;
  useEffect(() => {
    if (!journeyId) return;
    let subscription: Location.LocationSubscription | null = null;
    let stopped = false;
    (async () => {
      try {
        // Position turned off in SIRA: guidance by touch only, the phone's GPS is left alone.
        if (!(await usageAllowed('location')) || stopped) return;
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== 'granted' || stopped) return;
        subscription = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, distanceInterval: 10, timeInterval: 3000 },
          ({ coords }) => {
            setHere({ latitude: coords.latitude, longitude: coords.longitude });
            const { steps: all, index, arrived: done, destination, destinationName: place } = latest.current;
            if (done) return;
            const key = `${journeyId}:${index}`;
            const event = gpsEvent(all, index, coords, warned.current.has(key), destination);
            if (event?.type === 'advance') setCurrentStepIndex(event.to);
            else if (event?.type === 'arrived') setArrived(true);
            else if (event?.type === 'alight-soon') {
              warned.current.add(key);
              // Get ready to get off: the phone buzzes as well as speaks (as Citymapper and Transit do).
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
              if (Platform.OS === 'web') globalThis.navigator?.vibrate?.([200, 100, 200]);
              void say(alightSoonSpeech(all[index].leg), 'alert');
            } else {
              // Nothing changes: maybe a turn just ahead, or halfway on the bus.
              const hint = gpsHint(all[index], coords, warned.current, key, place);
              if (hint) {
                warned.current.add(hint.id);
                void say(hint.text, 'guidance');
              }
            }
          },
        );
        if (stopped) subscription.remove();
        else setGpsOn(true);
      } catch { /* pas de GPS : on avance en touchant le bandeau */ }
    })();
    return () => { stopped = true; subscription?.remove(); };
  }, [journeyId]);

  // ── Arrival: « Te voilà à … » then, for the community, the price paid.
  const arrivalSaid = useRef(false);
  useEffect(() => {
    if (!arrived || arrivalSaid.current) return;
    arrivalSaid.current = true;
    void (async () => {
      await say(arrivalSpeech(arrivalWhere), 'guidance');
      if (!fareLeg || !canShareFare) return;
      const answer = await question.ask(fareQuestion(fareLeg), 'fare');
      if (answer?.amount) void sendFare(answer.amount);
    })();
  });

  const voiceText = affected.length
    ? `${affected[0].report.title} confirmé sur ton trajet : environ ${delay} min de retard.`
    : current ? stepSpeech(steps, currentStepIndex, destinationName, gpsOn) : 'Choisis un trajet pour démarrer le guidage.';

  if (!journey || !current) {
    return (
      <View style={[styles.container, styles.emptyContainer]}>
        <StatusBar style="light" />
        <Ionicons name="navigate-circle" size={54} color="#F26522" />
        <Text style={[styles.exitModalTitle, styles.emptyTitle]}>Aucun trajet en cours</Text>
        <TouchableOpacity style={[styles.confirmExitBtn, styles.emptyButton]} onPress={() => goBack(router)} activeOpacity={0.8}>
          <Text style={styles.confirmExitText}>Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const currentLeg = current.leg;

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Live map of the journey and community reports */}
      <OsmMapView
        style={styles.fullMapImage}
        origin={search?.departure}
        destination={search?.arrival}
        routeCoordinates={journeyPath(alternative ?? journey)}
        reports={reports}
        userPosition={here}
        mapStyle={mapSettings.style}
        showBuildings={mapSettings.buildings}
        follow={followPoint}
        followPaused={followPaused}
        followCamera={camera}
        onFollowPause={pauseFollow}
      />

      {/* Overlay Safe Area */}
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']} pointerEvents="box-none">
        {/* Top instruction banner: tap to move to the next step */}
        <TouchableOpacity
          style={styles.topHudCard}
          onLayout={(event) => setHudBottom(event.nativeEvent.layout.y + event.nativeEvent.layout.height)}
          activeOpacity={0.9}
          onPress={nextStep}
        >
          <View style={styles.hudHeaderRow}>
            <View style={[styles.directionIconCircle, { backgroundColor: MODE_COLORS[currentLeg.mode] }]}>
              <Ionicons name={MODE_ICONS[currentLeg.mode]} size={26} color="#FFFFFF" />
            </View>
            <View style={styles.hudTextCol}>
              <Text style={styles.hudInstructionText}>{stepTitle(currentLeg)}</Text>
              <Text style={styles.hudSubtext}>Étape {currentStepIndex + 1}/{steps.length} • {stepDescription(currentLeg)}</Text>
              {/* « Descends dans 3 arrêts », then « Ton arrêt est le prochain » (stop countdown, as in Transit). */}
              {countdown && (
                <View style={[styles.countdown, countdown.urgent && styles.countdownUrgent]} accessibilityLiveRegion="polite">
                  <Ionicons name={countdown.urgent ? 'notifications' : 'flag-outline'} size={14} color={countdown.urgent ? '#FFFFFF' : '#FDBA74'} />
                  <Text style={[styles.countdownText, countdown.urgent && styles.countdownTextUrgent]}>{countdown.text}</Text>
                </View>
              )}
            </View>
            <TouchableOpacity
              onPress={() => setShowExitConfirm(true)}
              style={styles.exitNavBtn}
              activeOpacity={0.8}
            >
              <Ionicons name="close-circle" size={30} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <View style={styles.hudBottomRow}>
            <View style={styles.hudMetricBadge}>
              <Ionicons name="time-outline" size={14} color="#FFFFFF" />
              <Text style={styles.hudMetricText}>{formatClock(current.start)} → {formatClock(current.end)}</Text>
            </View>
            {isVehicle(currentLeg) && (
              <View style={styles.hudMetricBadge}>
                <Ionicons name="cash-outline" size={14} color="#FFFFFF" />
                <Text style={styles.hudMetricText}>{formatPrice(currentLeg.price)}</Text>
              </View>
            )}
            <View style={styles.hudMetricBadge}>
              <Ionicons name={gpsOn ? 'locate' : 'play-forward-outline'} size={14} color="#FFFFFF" />
              <Text style={styles.hudMetricText}>{gpsOn ? 'GPS : suivi auto' : 'Touche : étape suivante'}</Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Map Side Quick Action Buttons (Right Side) */}
        <View style={[styles.mapSideControls, belowHud]}>
          <View style={styles.voiceModeRow}>
            {modeChip && (
              <View style={styles.voiceModeChip}>
                <Text style={styles.voiceModeChipText}>{VOICE_MODE_LABELS[voiceMode]}</Text>
              </View>
            )}
            <TouchableOpacity
              style={styles.mapControlBtn}
              onPress={changeVoiceMode}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={`Voix : ${VOICE_MODE_LABELS[voiceMode]}. Touche pour changer.`}
            >
              <Ionicons name={VOICE_MODE_ICONS[voiceMode]} size={22} color={voiceMode === 'off' ? '#94A3B8' : '#F26522'} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.mapControlBtn} activeOpacity={0.8} onPress={() => router.push('/report-event')}>
            <Ionicons name="warning" size={22} color="#EF4444" />
          </TouchableOpacity>

          {!arrived && (
            <TouchableOpacity style={styles.mapControlBtn} activeOpacity={0.8} onPress={overview ? recenter : showOverview}
              accessibilityRole="button" accessibilityLabel={overview ? 'Reprendre le suivi, carte penchée' : 'Vue d’ensemble du trajet'}>
              <Ionicons name={overview ? 'navigate' : 'map-outline'} size={22} color="#F26522" />
            </TouchableOpacity>
          )}
        </View>

        {/* Journey traffic status from confirmed community reports */}
        <View style={[styles.liveTrafficBadge, belowHud, { maxWidth: screenWidth - 16 - 16 - 44 - 10 }, affected.length > 0 && styles.liveTrafficBadgeAlert]}>
          <View style={[styles.liveDotPulse, affected.length > 0 && styles.liveDotAlert]} />
          <Text style={styles.liveTrafficText}>
            {affected.length ? `${affected[0].report.title} confirmé · +${delay} min` : 'Aucun incident confirmé sur ton trajet'}
          </Text>
        </View>

        {/* SIRA's voice: what it says, and when it waits for « oui » / « non » */}
        {voiceMode !== 'off' && !arrived && (
          <View style={styles.siraVoiceFloatingBar}>
            <Image
              source={require('@/assets/images/sira-character-assistant.png')}
              style={styles.siraNavAvatar}
              contentFit="contain"
            />
            <View style={styles.siraSpeechBubble}>
              <View style={styles.voiceWaveHeader}>
                <Ionicons name="mic" size={12} color="#F26522" />
                <Text style={styles.voiceLabel}>{question.listening ? 'SIRA T’ÉCOUTE…' : 'SIRA VOCAL'}</Text>
              </View>
              <Text style={styles.siraSpeechText}>{question.listening ? 'Réponds « oui » ou « non », ou touche un bouton.' : voiceText}</Text>
            </View>
          </View>
        )}

        {/* Incident on the route: estimated delay and alternative */}
        {affected.length > 0 && !alternative && (
          <View style={styles.incidentCard}>
            <Ionicons name="warning" size={22} color="#FFFFFF" />
            <View style={styles.incidentTextCol}>
              <Text style={styles.incidentTitle}>{affected[0].report.title} sur ton trajet</Text>
              <Text style={styles.incidentSub}>
                Confirmé par {affected[0].report.confirmations} usager(s) · {affected[0].report.location} · retard estimé {delay} min
              </Text>
            </View>
            <TouchableOpacity style={styles.incidentButton} onPress={() => { question.cancel(); void findAlternative(); }} disabled={rerouting} activeOpacity={0.85}>
              <Text style={styles.incidentButtonText}>{rerouting ? 'Calcul…' : 'Alternative'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {alternative && (
          <View style={styles.alternativeCard}>
            <Text style={styles.alternativeTitle}>Alternative : {journeyTitle(alternative)}</Text>
            <Text style={styles.alternativeSub}>
              {formatDuration(alternative.duration)} · {formatPrice(alternative.price)} · évite l’incident (trajet actuel ≈ {formatDuration(journey.duration + delay)})
            </Text>
            <View style={styles.alternativeButtons}>
              <TouchableOpacity style={styles.confirmExitBtn} onPress={adoptAlternative} activeOpacity={0.85}>
                <Text style={styles.confirmExitText}>Prendre ce trajet</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelExitBtn}
                onPress={keepCurrentJourney}
                activeOpacity={0.85}
              >
                <Text style={styles.cancelExitText}>Garder le mien</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {toConfirm && !affected.length && (
          <View style={styles.alternativeCard}>
            <Text style={styles.alternativeTitle}>{toConfirm.report.title} signalé sur ton trajet</Text>
            <Text style={styles.alternativeSub}>{toConfirm.report.location} · toujours là ?</Text>
            <View style={styles.alternativeButtons}>
              <TouchableOpacity style={styles.confirmExitBtn} onPress={() => answerStillThere(toConfirm.report.id, 'confirm')} activeOpacity={0.85}>
                <Text style={styles.confirmExitText}>Oui, toujours là</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelExitBtn} onPress={() => answerStillThere(toConfirm.report.id, 'contest')} activeOpacity={0.85}>
                <Text style={styles.cancelExitText}>Non, plus là</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Arrival: welcome, then the price paid for the community (by voice or typed) */}
        {arrived && (
          <View style={styles.bottomDashboardCard}>
            <View style={styles.arrivalHeader}>
              <Ionicons name="flag" size={24} color="#10B981" />
              <Text style={styles.arrivalTitle}>Te voilà {arrivalWhere} !</Text>
            </View>
            {canShareFare && fareLeg && fare.state === 'ask' && (
              <>
                <Text style={styles.arrivalSub}>
                  {question.asking === 'fare' && question.listening ? 'Dis le prix payé… ' : ''}
                  Combien as-tu payé pour {journeyTitle({ ...journey, legs: [fareLeg] })} ?
                </Text>
                <View style={styles.alternativeButtons}>
                  <TextInput
                    style={styles.fareInput}
                    value={fare.typed}
                    onChangeText={(typed) => setFare({ state: 'ask', typed: typed.replace(/[^0-9]/g, '') })}
                    onFocus={question.cancel}
                    placeholder="ex. 200"
                    keyboardType="number-pad"
                    accessibilityLabel="Prix payé en francs CFA"
                  />
                  <TouchableOpacity
                    style={[styles.confirmExitBtn, styles.arrivalButton]}
                    onPress={() => { const amount = Number(fare.typed); if (amount > 0) void sendFare(amount); }}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.confirmExitText}>Envoyer</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
            {fare.state === 'sent' && <Text style={styles.arrivalSub}>Merci ! Ton prix aide les prochains voyageurs.</Text>}
            {targetPlace && currentToken() && (found === 'ask' || found === 'sending') && (
              <>
                <Text style={styles.arrivalSub}>Tu as trouvé « {targetPlace.nom} » ?</Text>
                <View style={styles.alternativeButtons}>
                  <TouchableOpacity style={[styles.confirmExitBtn, styles.arrivalButton]} onPress={() => answerFound(true)} disabled={found === 'sending'} activeOpacity={0.85}>
                    <Text style={styles.confirmExitText}>Oui, c’est là</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.cancelExitBtn, styles.arrivalButton]} onPress={() => answerFound(false)} disabled={found === 'sending'} activeOpacity={0.85}>
                    <Text style={styles.cancelExitText}>Non, pas trouvé</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
            {found === 'yes' && <Text style={styles.arrivalSub}>Merci ! Ta confirmation aide les prochains voyageurs à y croire.</Text>}
            {found === 'no' && <Text style={styles.arrivalSub}>C’est noté : si d’autres ne le trouvent pas non plus, le lieu disparaîtra de SIRA.</Text>}
            <TouchableOpacity
              style={[styles.cancelExitBtn, styles.arrivalDone]}
              onPress={() => {
                question.cancel();
                // The note goes to the traveller's account: without one, the trip just ends.
                if (currentToken()) setShowRating(true);
                else finishTrip();
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.cancelExitText}>Terminer</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Bottom Navigation Dashboard Card */}
        {!arrived && (
        <View style={styles.bottomDashboardCard}>
          {/* « Recentrer », just above the card (as in Google Maps): the map follows the traveller again. */}
          {(followPaused || overview) && (
            <View style={styles.recenterRow} pointerEvents="box-none">
              <TouchableOpacity style={styles.recenterPill} onPress={recenter} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Recentrer la carte sur moi">
                <Ionicons name="navigate" size={18} color="#FFFFFF" />
                <Text style={styles.recenterText}>Recentrer</Text>
              </TouchableOpacity>
            </View>
          )}
          {/* Progress Bar with Milestones */}
          <View style={styles.progressTrackContainer}>
            <View style={styles.progressTrackBg}>
              <View style={[styles.progressTrackFill, { width: `${((currentStepIndex + 1) / steps.length) * 100}%` }]} />
            </View>
            <View style={styles.milestonesRow}>
              {steps.map((step, idx) => (
                <TouchableOpacity
                  key={step.leg.id}
                  onPress={() => setCurrentStepIndex(idx)}
                  style={[
                    styles.milestoneDot,
                    idx <= currentStepIndex && { backgroundColor: MODE_COLORS[step.leg.mode], borderColor: '#FFFFFF' },
                  ]}
                >
                  <Ionicons
                    name={MODE_ICONS[step.leg.mode]}
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
              <Text style={styles.etaTimeText}>{eta ? formatClock(eta) : '--:--'}</Text>
              <Text style={styles.etaLabelText}>Arrivée estimée</Text>
            </View>

            <View style={styles.destCol}>
              <Text style={styles.destNameText} numberOfLines={narrow ? 2 : 1}>
                {targetDestination}
              </Text>
              <Text style={styles.destSubText}>
                {formatDuration(journey.duration + delay)}{journey.distance_km ? ` • ${formatDistance(journey.distance_km)} au total` : ''}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.sosButton}
              onPress={() => setShowExitConfirm(true)}
              accessibilityRole="button"
              accessibilityLabel="Quitter le guidage"
              activeOpacity={0.85}
            >
              <Ionicons name="stop-circle" size={20} color="#FFFFFF" />
              {!narrow && <Text style={styles.sosButtonText}>Quitter</Text>}
            </TouchableOpacity>
          </View>
        </View>
        )}

        {/* Exit Confirmation Modal Overlay */}
        {showExitConfirm && (
          <View style={styles.exitModalOverlay}>
            <View style={styles.exitModalCard}>
              <Ionicons name="alert-circle" size={44} color="#F26522" />
              <Text style={styles.exitModalTitle}>Arrêter la navigation ?</Text>
              <Text style={styles.exitModalSub}>
                Tu veux vraiment quitter le guidage vers {targetDestination} ?
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
                    journeyStore.stop();
                    goBack(router);
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

      <TripRatingModal visible={showRating} legs={journey.legs} onClose={finishTrip} />
    </View>
  );
}

const styles = StyleSheet.create({
  voiceModeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  voiceModeChip: {
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  voiceModeChipText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  arrivalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  arrivalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    flex: 1,
  },
  arrivalSub: {
    fontSize: 13,
    color: '#475569',
    marginTop: 8,
  },
  fareInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0F172A',
  },
  arrivalButton: {
    backgroundColor: '#F26522',
  },
  arrivalDone: {
    flex: 0,
    marginTop: 12,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  // Light title on the dark screen; the button keeps its own size (confirmExitBtn grows with flex: 1 in a row).
  emptyTitle: { color: '#FFFFFF' },
  emptyButton: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', alignSelf: 'center', paddingHorizontal: 36 },
  liveTrafficBadgeAlert: {
    backgroundColor: '#991B1B',
  },
  liveDotAlert: {
    backgroundColor: '#FCA5A5',
  },
  incidentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    padding: 12,
    borderRadius: 16,
    backgroundColor: '#DC2626',
  },
  incidentTextCol: {
    flex: 1,
  },
  incidentTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  incidentSub: {
    color: '#FEE2E2',
    fontSize: 11,
    marginTop: 2,
  },
  incidentButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  incidentButtonText: {
    color: '#DC2626',
    fontSize: 12,
    fontWeight: '800',
  },
  alternativeCard: {
    marginHorizontal: 16,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    gap: 6,
  },
  alternativeTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  alternativeSub: {
    fontSize: 12,
    color: '#475569',
  },
  alternativeButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
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
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
    rowGap: 6,
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
    alignItems: 'flex-end',
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
    flexShrink: 1,
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
    fontSize: 11,
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
  countdown: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: 'rgba(242, 101, 34, 0.18)' },
  countdownUrgent: { backgroundColor: '#F26522' },
  countdownText: { color: '#FDBA74', fontSize: 13.5, fontWeight: '800' },
  countdownTextUrgent: { color: '#FFFFFF' },
  recenterRow: { position: 'absolute', top: -60, left: 0, right: 0, alignItems: 'center' },
  recenterPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, height: 44, borderRadius: 22,
    backgroundColor: '#F26522', shadowColor: '#000000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 6,
  },
  recenterText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
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
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  destCol: {
    flex: 1,
    minWidth: 0,
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
