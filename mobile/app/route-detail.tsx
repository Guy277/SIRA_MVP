import React, { useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
  Pressable,
  ScrollView,
  Share,
  Dimensions,
} from 'react-native';
import { Text } from '@/components/sira-text';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown, ReduceMotion, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { isFavorite as isFavoriteIn, toggleFavoriteTrip, useFavorites } from '@/lib/favorites';
import { journeyCategory } from '@/lib/trip-history';
import { OsmMapView } from '@/components/osm-map-view';
import { showSuccess } from '@/components/success-card';
import { journeyStore, selectedJourney, useJourneyStore } from '@/lib/journey-store';
import { journeyBrief, stepInFull, type SpokenPart } from '@/lib/spoken';
import { say, stopSpeaking } from '@/lib/voice';
import { alternativesText, arrivalTime, formatClock, formatDistance, formatDuration, formatPrice, isVehicle, journeyPath, journeyTitle, legBadges, legCodes, legPath, MODE_NAMES, timeline, walkStepText } from '@/lib/journey-format';
import { routeBlocks } from '@/lib/route-cards';
import { fareSummaries, type ApiLeg, type Coordinates, type FareSummary, type LegMode, type StopMention } from '@/lib/sira-api';
import { notify } from '@/lib/notify';
import { goBack } from '@/lib/navigation';
import { alertBadge, useAlertCount } from '@/lib/reports';

const STEP_ICONS: Record<LegMode, keyof typeof Ionicons.glyphMap> = {
  walk: 'walk', wait: 'time', transfer: 'swap-horizontal', sotra: 'bus', gbaka: 'bus-outline', woro: 'car-sport', taxi: 'car', boat: 'boat',
};

// Three kinds of steps, three looks (as in Google Maps): what you ride is a card on
// the road, walking a thin line on a dotted path, waiting a small clock.
type StepKind = 'ride' | 'walk' | 'wait';

// « Bus SOTRA 26 / 85 », « Gbaka », « Taxi »: the line to look for.
function rideBadge(leg: ApiLeg) {
  const { codes } = legCodes(leg);
  return codes.length ? `${MODE_NAMES[leg.mode]} ${codes.slice(0, 3).join(' / ')}` : MODE_NAMES[leg.mode];
}

// What the vehicle shows in the direction travelled, else the two ends of the line.
function rideDirection(leg: ApiLeg) {
  if (leg.mode === 'taxi') return null;
  if (leg.headsign) return `Direction « ${leg.headsign} »`;
  const direction = leg.label.split(':')[1]?.trim();
  return direction ? `Direction ${direction}` : null;
}

// « à « Abobo Samaké » » for a stop of the line, « vers « … » » for a landmark only (see lib/journey-format.ts).
const shortAt = (stop: StopMention) => (stop.on_line ? `à « ${stop.name} »` : `vers « ${stop.name} »`);
const stopsLabel = (count: number) => `${count} arrêt${count > 1 ? 's' : ''}`;

// Every step sits on the same column: the icon slot is as wide as the biggest icon,
// so all texts start on one line, never on the road.
const ICON_SLOT = 48;
const ROAD_WIDTH = 14;
// The road reaches the centre of the next step's icon.
const ROAD_REACH = ICON_SLOT / 2;
const WALK_DOTS = Array.from({ length: 24 }, (_, index) => index);

// The piece of road under a step, up to the next one: drawn from top to bottom
// when the screen opens (like « ON TRACE »), a dotted path when walking.
function RoadPiece({ kind, delay }: { kind: StepKind; delay: number }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.set(withDelay(delay, withTiming(1, { duration: 260, reduceMotion: ReduceMotion.System })));
  }, [delay, progress]);
  const grow = useAnimatedStyle(() => ({ transform: [{ scaleY: progress.get() }] }));
  if (kind === 'walk') {
    return (
      <Animated.View style={[styles.walkPath, grow]} pointerEvents="none">
        {WALK_DOTS.map((dot) => <View key={dot} style={styles.walkDot} />)}
      </Animated.View>
    );
  }
  return (
    <Animated.View style={[styles.roadPiece, grow]} pointerEvents="none">
      <View style={styles.roadCenterLine} />
    </Animated.View>
  );
}

// Journeys already read out loud (coming back to the screen does not read it again).
const readJourneys = new Set<string>();

const { height } = Dimensions.get('window');

export default function RouteDetailScreen() {
  const router = useRouter();
  const alertCount = useAlertCount();
  const favorites = useFavorites();

  const store = useJourneyStore();
  const journey = selectedJourney(store);
  const search = store.search;
  const departure = search?.departure.name ?? '';
  const arrival = search?.arrival.name ?? '';
  const steps = journey && search ? timeline(journey, search.departureAt) : [];
  const arrivalAt = journey && search ? arrivalTime(journey, search.departureAt) : null;
  const insets = useSafeAreaInsets();

  // Touching a step shows its stretch alone on the map; the compass shows all of it.
  const [focusedStep, setFocusedStep] = useState<number | null>(null);
  // One card per vehicle, the walks as one line (lib/route-cards.ts).
  const blocks = routeBlocks(steps);
  // What is unfolded on demand: 'walk:<id>' (the way turn by turn), 'stops:<id>' (every stop),
  // 'details:<id>' (peak hours, other lines, travellers' prices).
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const isOpen = (key: string) => opened.has(key);
  const toggle = (key: string) => setOpened((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const focusPath: Coordinates[] | null = focusedStep !== null && steps[focusedStep] ? legPath(steps[focusedStep].leg) : null;

  // What SIRA is saying lights up on the screen, sentence by sentence (keys of
  // lib/spoken.ts: 'summary', 'step:2', 'board:2', 'alight:2'). « Stop », another
  // reading or leaving the screen ends it.
  const [reading, setReading] = useState<string | null>(null);
  const mounted = useRef(true);
  const readingRun = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const readAloud = async (parts: SpokenPart[], kind: 'guidance' | 'answer') => {
    const run = ++readingRun.current;
    for (const part of parts) {
      await Promise.resolve();
      if (!mounted.current || run !== readingRun.current) return;
      setReading(part.key);
      if (!(await say(part.text, kind))) break;
    }
    if (mounted.current && run === readingRun.current) setReading(null);
  };
  // Once per journey, the short version (line, get on, get off, how long).
  useEffect(() => {
    if (!journey || !search) return;
    const key = `${journey.id}:${search.departureAt.getTime()}`;
    if (readJourneys.has(key)) return;
    readJourneys.add(key);
    const legs = timeline(journey, search.departureAt).map((step) => step.leg);
    void readAloud(journeyBrief(journey, legs, arrival), 'guidance');
    // readAloud only reads refs and state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journey, search, arrival]);
  const litStep = (index: number) => reading === `step:${index}` || reading === `board:${index}` || reading === `alight:${index}`;

  // Touching a step: shown alone on the map and read in full (touching it again stops).
  const touchStep = (index: number) => {
    if (focusedStep === index) {
      setFocusedStep(null);
      readingRun.current += 1;
      setReading(null);
      stopSpeaking();
      return;
    }
    setFocusedStep(index);
    const step = steps[index];
    if (step) void readAloud(stepInFull(step.leg, arrival, index), 'answer');
  };

  // Community fares (cahier des charges : prix confirmé ou corrigé par les
  // voyageurs). Taxi prices depend on distance and are not crowd-sourced.
  const fareLegs = (journey?.legs ?? []).filter((leg) => isVehicle(leg) && leg.mode !== 'taxi' && leg.line_id);
  const fareLegKey = fareLegs.map((leg) => leg.line_id).join('|');
  const [fares, setFares] = useState<Record<string, FareSummary>>({});
  useEffect(() => {
    const ids = fareLegKey ? fareLegKey.split('|') : [];
    if (!ids.length) return;
    let cancelled = false;
    fareSummaries(ids)
      .then((list) => { if (!cancelled) setFares(Object.fromEntries(list.map((item) => [item.line_id, item]))); })
      .catch(() => { /* service des tarifs indisponible : estimations seules */ });
    return () => { cancelled = true; };
  }, [fareLegKey]);

  const [isLiked, setIsLiked] = useState(false);
  const isFavorite = search ? isFavoriteIn(favorites, search.departure, search.arrival) : false;

  const handleStartNavigation = () => {
    if (!journey) return;
    journeyStore.start(journey);
    router.push({ pathname: '/navigation-active', params: { destination: arrival } });
  };

  // The phone's own sharing (WhatsApp, SMS…), with the journey in words.
  const handleShare = async () => {
    if (!journey) return;
    const message = `Mon trajet SIRA : ${departure} → ${arrival}. ${journeyTitle(journey)}, ${formatDuration(journey.duration)}, ${formatPrice(journey.price)}.`;
    try {
      await Share.share({ message });
    } catch {
      notify('Partage impossible', 'Ce téléphone ne permet pas de partager depuis ici.');
    }
  };

  const handleToggleFavorite = () => {
    if (!search || !journey) return;
    const point = (place: typeof search.departure) => ({ name: place.name, latitude: place.latitude, longitude: place.longitude });
    const nowFavorite = toggleFavoriteTrip({
      from: point(search.departure),
      to: point(search.arrival),
      category: journeyCategory(search, journey),
      transport: journeyTitle(journey),
      durationMin: Math.round(journey.duration),
      priceF: journey.price ?? null,
    });
    showSuccess(nowFavorite ? 'Trajet ajouté aux favoris avec succès' : 'Trajet retiré des favoris', nowFavorite ? 'check-decagram' : 'heart-remove');
  };

  const handleLike = () => {
    setIsLiked(!isLiked);
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Top Header Bar */}
        <View style={styles.headerBar}>
          <TouchableOpacity
            onPress={() => goBack(router)}
            style={styles.backBtnWrapper}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="arrow-back" size={24} color="#000000" />
          </TouchableOpacity>

          <Text style={styles.headerTitle} numberOfLines={1}>Ton trajet</Text>

          <View style={styles.headerRightActions}>
            <TouchableOpacity
              style={styles.headerIconButton}
              onPress={() => router.push('/notifications')}
              activeOpacity={0.8}
            >
              <Ionicons name="notifications" size={22} color="#000000" />
              {alertCount > 0 && (
                <View style={styles.notificationBadge}>
                  <Text style={styles.badgeText}>{alertBadge(alertCount)}</Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.headerIconButton}
              onPress={() => router.push('/report-event')}
              activeOpacity={0.8}
            >
              <Ionicons name="warning" size={22} color="#DC2626" />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: 110 + insets.bottom }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Upper Map View Section */}
          <View style={styles.mapContainer}>
            <OsmMapView
              style={styles.mapImage}
              departureName={departure}
              arrivalName={arrival}
              origin={search?.departure}
              destination={search?.arrival}
              routeCoordinates={journeyPath(journey)}
              focusCoordinates={focusPath}
            />

            {/* Orange Compass FAB Icon (Bottom Right of Map) */}
            <TouchableOpacity
              style={styles.mapCompassFab}
              activeOpacity={0.8}
              onPress={() => setFocusedStep(null)}
              accessibilityRole="button"
              accessibilityLabel="Voir tout le trajet"
            >
              <Ionicons name="navigate-sharp" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {/* Summary first, as in Citymapper: how long, how much, when you arrive. */}
          {journey && arrivalAt && (
            <Animated.View entering={FadeIn.duration(250)} style={[styles.summaryCard, reading === 'summary' && styles.lit]}>
              <Text style={styles.summaryMain}>{formatDuration(journey.duration)} · {formatPrice(journey.price)}</Text>
              <Text style={styles.summaryMeta}>
                Arrivée {formatClock(arrivalAt)}{journey.distance_km ? ` · ${formatDistance(journey.distance_km)}` : ''}
              </Text>
              <View style={styles.summaryModes}>
                {legBadges(journey).map((badge, index) => (
                  <View key={index} style={[styles.modeChip, badge.kind === 'walk' && styles.modeChipWalk]}>
                    <Ionicons name={badge.kind === 'walk' ? 'walk' : STEP_ICONS[badge.mode]} size={13} color={badge.kind === 'walk' ? '#4B5563' : '#FFFFFF'} />
                    <Text style={[styles.modeChipText, badge.kind === 'walk' && styles.modeChipTextWalk]}>
                      {badge.kind === 'walk' ? `${badge.minutes} min` : badge.text}
                    </Text>
                  </View>
                ))}
              </View>
              <Text style={styles.summaryNote}>Estimation à partir des lignes de transport OpenStreetMap.</Text>
              <View style={styles.summaryActions}>
                <TouchableOpacity style={styles.summaryAction} onPress={handleToggleFavorite} activeOpacity={0.7} accessibilityRole="button">
                  <Ionicons name={isFavorite ? 'bookmark' : 'bookmark-outline'} size={18} color={isFavorite ? '#F26522' : '#111111'} />
                  <Text style={styles.summaryActionText}>{isFavorite ? 'En favori' : 'Favori'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.summaryAction} onPress={handleShare} activeOpacity={0.7} accessibilityRole="button">
                  <Ionicons name="share-social-outline" size={18} color="#111111" />
                  <Text style={styles.summaryActionText}>Partager</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.summaryAction} onPress={handleLike} activeOpacity={0.7} accessibilityRole="button">
                  <Ionicons name={isLiked ? 'thumbs-up' : 'thumbs-up-outline'} size={18} color={isLiked ? '#F26522' : '#111111'} />
                  <Text style={styles.summaryActionText}>Utile</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          )}

          {/* The steps on SIRA's road: one column for the icons, one for the texts. */}
          <View style={styles.timeline}>
            {!journey && (
              <View style={styles.stepRow}>
                <View style={styles.iconSlot}>
                  <View style={styles.rideIcon}>
                    <Ionicons name="information" size={20} color="#FFFFFF" />
                  </View>
                </View>
                <View style={styles.stepBody}>
                  <Text style={styles.stepTitle}>Aucun trajet sélectionné</Text>
                  <Text style={styles.stepSubDesc}>Reviens aux résultats et choisis un itinéraire.</Text>
                </View>
              </View>
            )}

            {blocks.map((block, position) => {
              const { leg, index } = block;
              const delay = 120 + position * 120;

              // Walking, changing on foot or waiting alone: one thin line (« À pied · 13 min · 1,0 km »).
              // Where it goes is the next card (« Monte à … ») or the arrival: not written twice.
              if (block.kind !== 'ride') {
                const lit = litStep(index) || focusedStep === index;
                const walkSteps = leg.walk_steps ?? [];
                const walkOpen = isOpen(`walk:${leg.id}`);
                const line = block.kind === 'wait'
                  ? `Attente · ≈ ${leg.duration} min`
                  : `${leg.mode === 'transfer' ? 'Change à pied' : 'À pied'} · ${leg.duration} min${block.metres ? ` · ${formatDistance(block.metres / 1000)}` : ''}`;
                return (
                  <Animated.View key={leg.id} entering={FadeInDown.delay(delay).duration(280)}>
                    <Pressable
                      style={[styles.stepRow, styles.thinRow]}
                      onPress={() => touchStep(index)}
                      // No « button » role: the row holds the « Le chemin » button.
                      accessibilityHint="SIRA lit cette étape et la montre sur la carte"
                    >
                      <RoadPiece kind={block.kind} delay={delay + 100} />
                      <View style={styles.iconSlot}>
                        {block.kind === 'wait' ? (
                          <View style={[styles.waitIcon, lit && styles.iconLit]}>
                            <Ionicons name="time-outline" size={17} color="#F26522" />
                          </View>
                        ) : (
                          <View style={[styles.walkIcon, lit && styles.iconLit]}>
                            <Ionicons name={STEP_ICONS[leg.mode] ?? 'walk'} size={14} color="#4B5563" />
                          </View>
                        )}
                      </View>
                      <View style={[styles.stepBody, styles.thinBody, lit && styles.lit]}>
                        <View style={styles.thinHead}>
                          <Text style={styles.thinText}>{line}</Text>
                          {walkSteps.length > 0 && (
                            <TouchableOpacity
                              style={styles.toggle}
                              onPress={() => toggle(`walk:${leg.id}`)}
                              activeOpacity={0.7}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              accessibilityRole="button"
                              accessibilityLabel={walkOpen ? 'Masquer le chemin' : `Voir le chemin, ${walkSteps.length} étapes`}
                              accessibilityState={{ expanded: walkOpen }}
                            >
                              <Text style={styles.toggleText}>Le chemin</Text>
                              <Ionicons name={walkOpen ? 'chevron-up' : 'chevron-down'} size={14} color="#F26522" />
                            </TouchableOpacity>
                          )}
                        </View>
                        {walkOpen && walkSteps.map((step, stepIndex) => (
                          <View key={stepIndex} style={styles.walkStepRow}>
                            <Text style={styles.walkStepDistance}>{step.distance_m > 0 ? `${step.distance_m} m` : ''}</Text>
                            <Text style={styles.walkStepText}>{walkStepText(step, arrival)}</Text>
                          </View>
                        ))}
                      </View>
                    </Pressable>
                  </Animated.View>
                );
              }

              // A vehicle: one card with what you need at the stop. The rest under « Plus de détails ».
              const { wait } = block;
              const lit = litStep(index) || (wait !== null && litStep(wait.index)) || focusedStep === index;
              const between = block.stopsBetween;
              const stopsOpen = isOpen(`stops:${leg.id}`);
              const detailsOpen = isOpen(`details:${leg.id}`);
              const direction = rideDirection(leg);
              const board = leg.board_stop ? `Monte ${shortAt(leg.board_stop)}` : wait ? 'Attends le véhicule' : null;
              const alternatives = alternativesText(leg);
              const fare = leg.line_id ? fares[leg.line_id] : undefined;
              const details = [
                wait?.peak ? `Aux heures de pointe, l’attente peut aller jusqu’à ${wait.peak} min.` : null,
                leg.headsign ? 'La direction est écrite sur le véhicule.' : null,
                leg.before_alight_stop ? `Prépare-toi à descendre après « ${leg.before_alight_stop} ».` : null,
                !between.length && leg.via_stops?.length ? `Passe par : ${leg.via_stops.join(' · ')}.` : null,
                alternatives ? `${alternatives} — prends le premier qui passe.` : null,
                leg.mode === 'taxi' ? 'Taxi compteur, trajet direct.' : null,
                fare?.reports
                  ? fare.validated
                    ? `Prix confirmé par ${fare.agreeing} voyageurs : ${formatPrice(fare.median_fcfa)}.`
                    : `${fare.reports} avis de voyageurs : ${formatPrice(fare.median_fcfa)} (à confirmer).`
                  : null,
              ].filter((line): line is string => Boolean(line));
              return (
                <Animated.View key={leg.id} entering={FadeInDown.delay(delay).duration(280)}>
                  <Pressable
                    style={styles.stepRow}
                    onPress={() => touchStep(index)}
                    // No « button » role: the card holds the « arrêts » and « Plus de détails » buttons.
                    accessibilityHint="SIRA lit cette étape et la montre sur la carte"
                  >
                    <RoadPiece kind="ride" delay={delay + 100} />
                    <View style={styles.iconSlot}>
                      <View style={[styles.rideIcon, lit && styles.iconLit]}>
                        <Ionicons name={STEP_ICONS[leg.mode] ?? 'ellipse'} size={22} color="#FFFFFF" />
                      </View>
                    </View>
                    <View style={[styles.stepBody, styles.rideCard, lit && styles.lit]}>
                      <View style={styles.stepHead}>
                        <View style={styles.lineBadge}>
                          <Text style={styles.lineBadgeText}>{leg.mode === 'taxi' ? 'Taxi' : rideBadge(leg)}</Text>
                        </View>
                        <View style={styles.flexSpace} />
                        <Text style={styles.stepClock}>{formatClock(block.start)}</Text>
                      </View>
                      {direction && <Text style={styles.directionText}>{direction}</Text>}

                      {board && (
                        <View style={[styles.guideRow, (reading === `board:${index}` || (wait !== null && reading === `step:${wait.index}`)) && styles.guideLit]}>
                          <Ionicons name="enter-outline" size={15} color="#15803D" />
                          <Text style={styles.guideText}>
                            {board}
                            {wait ? <Text style={styles.guideExtra}>{` · ≈ ${wait.minutes} min d’attente`}</Text> : null}
                          </Text>
                        </View>
                      )}
                      {leg.alight_stop && (
                        <View style={[styles.guideRow, reading === `alight:${index}` && styles.guideLit]}>
                          <Ionicons name="exit-outline" size={15} color="#F26522" />
                          <Text style={[styles.guideText, styles.guideAlight]}>{`Descends ${shortAt(leg.alight_stop)}`}</Text>
                        </View>
                      )}
                      {/* « 7 arrêts ▾ »: the whole list on touch, as in Yandex Maps (family of Yango). */}
                      {leg.stop_count ? (
                        between.length ? (
                          <TouchableOpacity
                            style={[styles.toggle, styles.stopsToggle]}
                            onPress={() => toggle(`stops:${leg.id}`)}
                            activeOpacity={0.7}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                            accessibilityRole="button"
                            accessibilityLabel={`${stopsLabel(leg.stop_count)}, ${stopsOpen ? 'masquer la liste' : 'voir la liste'}`}
                            accessibilityState={{ expanded: stopsOpen }}
                          >
                            <Text style={styles.toggleText}>{stopsLabel(leg.stop_count)}</Text>
                            <Ionicons name={stopsOpen ? 'chevron-up' : 'chevron-down'} size={14} color="#F26522" />
                          </TouchableOpacity>
                        ) : (
                          <Text style={styles.stopsPlain}>{stopsLabel(leg.stop_count)}</Text>
                        )
                      ) : null}
                      {stopsOpen && (
                        <View style={styles.stopList}>
                          {[leg.board_stop?.name ?? null, ...between, leg.alight_stop?.name ?? null].map((name, stopIndex, list) => name ? (
                            <View key={`${stopIndex}:${name}`} style={styles.stopRow}>
                              <View style={[styles.stopDot, stopIndex === 0 && styles.stopDotBoard, stopIndex === list.length - 1 && styles.stopDotAlight]} />
                              <Text style={[styles.stopName, (stopIndex === 0 || stopIndex === list.length - 1) && styles.stopNameEnd]}>{name}</Text>
                            </View>
                          ) : null)}
                        </View>
                      )}

                      <View style={styles.rideFoot}>
                        <Text style={styles.rideFootText}>
                          {formatDuration(leg.duration)} · <Text style={styles.boldText}>{formatPrice(leg.price)}</Text>
                        </Text>
                        {details.length > 0 && (
                          <TouchableOpacity
                            style={styles.toggle}
                            onPress={() => toggle(`details:${leg.id}`)}
                            activeOpacity={0.7}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            accessibilityRole="button"
                            accessibilityState={{ expanded: detailsOpen }}
                          >
                            <Text style={styles.toggleText}>{detailsOpen ? 'Moins' : 'Plus de détails'}</Text>
                            <Ionicons name={detailsOpen ? 'chevron-up' : 'chevron-down'} size={14} color="#F26522" />
                          </TouchableOpacity>
                        )}
                      </View>
                      {detailsOpen && details.map((line) => (
                        <View key={line} style={styles.detailRow}>
                          <View style={styles.detailBullet} />
                          <Text style={styles.detailText}>{line}</Text>
                        </View>
                      ))}
                    </View>
                  </Pressable>
                </Animated.View>
              );
            })}

            {/* Arrival: the road stops here. */}
            {journey && arrivalAt && (
              <Animated.View entering={FadeInDown.delay(120 + blocks.length * 120).duration(280)} style={styles.stepRow}>
                <View style={styles.iconSlot}>
                  <View style={[styles.rideIcon, reading === 'arrival' && styles.iconLit]}>
                    <Ionicons name="location" size={22} color="#FFFFFF" />
                  </View>
                </View>
                <View style={[styles.stepBody, reading === 'arrival' && styles.lit]}>
                  <View style={styles.stepHead}>
                    <Text style={styles.stepTitle}>{arrival}</Text>
                    <Text style={styles.stepClock}>{formatClock(arrivalAt)}</Text>
                  </View>
                  <Text style={styles.stepSubDesc}>Arrivée</Text>
                </View>
              </Animated.View>
            )}
          </View>
        </ScrollView>

        {/* Démarrer stays on screen, above the phone's bottom edge. */}
        <View style={[styles.floatingButtonContainer, { bottom: 16 + insets.bottom }]}>
          <TouchableOpacity
            style={styles.demarrerBtn}
            onPress={handleStartNavigation}
            activeOpacity={0.88}
          >
            <View style={styles.demarrerIconCircle}>
              <Image
                source={require('@/assets/images/orange-pin-icon.png')}
                style={styles.demarrerPinIcon}
                contentFit="contain"
              />
            </View>
            <Text style={styles.demarrerBtnText}>{"Démarrer l'itinéraire"}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  backBtnWrapper: {
    padding: 4,
  },
  headerTitle: {
    flexShrink: 1,
    fontSize: 18,
    fontWeight: '900',
    color: '#000000',
    letterSpacing: 0.2,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIconButton: {
    position: 'relative',
    padding: 4,
  },
  notificationBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#F26522',
    borderRadius: 8,
    width: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  mapContainer: {
    height: Math.max(260, height * 0.36),
    width: '100%',
    position: 'relative',
    backgroundColor: '#EAEAEA',
  },
  mapImage: {
    width: '100%',
    height: '100%',
  },
  mapCompassFab: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F26522',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#F26522',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 5,
  },
  summaryCard: {
    marginHorizontal: 16,
    marginTop: 14,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EFEFEF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  summaryMain: {
    fontSize: 20,
    fontWeight: '900',
    color: '#000000',
  },
  summaryMeta: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4B5563',
    marginTop: 2,
  },
  summaryModes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  modeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F26522',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  modeChipWalk: {
    backgroundColor: '#F3F4F6',
  },
  modeChipText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  modeChipTextWalk: {
    color: '#4B5563',
  },
  summaryNote: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 8,
  },
  summaryActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  summaryAction: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: 4,
  },
  summaryActionText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#111111',
  },
  // The part SIRA is reading, or the step shown on the map.
  lit: {
    backgroundColor: '#FFF3EA',
  },
  timeline: {
    paddingHorizontal: 16,
    paddingTop: 18,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingBottom: 18,
  },
  iconSlot: {
    width: ICON_SLOT,
    height: ICON_SLOT,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },
  roadPiece: {
    position: 'absolute',
    left: (ICON_SLOT - ROAD_WIDTH) / 2,
    top: ICON_SLOT / 2,
    bottom: -ROAD_REACH,
    width: ROAD_WIDTH,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    transformOrigin: 'top',
    zIndex: 1,
  },
  roadCenterLine: {
    width: 2,
    height: '100%',
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  walkPath: {
    position: 'absolute',
    left: ICON_SLOT / 2 - 2,
    top: ICON_SLOT / 2,
    bottom: -ROAD_REACH,
    width: 4,
    alignItems: 'center',
    gap: 5,
    paddingTop: 16,
    overflow: 'hidden',
    transformOrigin: 'top',
    zIndex: 1,
  },
  walkDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#9CA3AF',
  },
  rideIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F26522',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#F26522',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  waitIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 3,
    borderColor: '#F26522',
    justifyContent: 'center',
    alignItems: 'center',
  },
  walkIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#9CA3AF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconLit: {
    transform: [{ scale: 1.12 }],
  },
  stepBody: {
    flex: 1,
    minWidth: 0,
    marginLeft: 10,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  stepHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  stepClock: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#4B5563',
    marginTop: 1,
  },
  lineBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#111111',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginTop: 4,
  },
  lineBadgeText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '800',
  },
  stepTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '900',
    color: '#000000',
    lineHeight: 19,
  },
  directionText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#000000',
    lineHeight: 19,
    marginTop: 6,
  },
  // A vehicle's card, on the right of the road.
  rideCard: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#FAFAFA',
    borderWidth: 1,
    borderColor: '#EFEFEF',
  },
  flexSpace: {
    flex: 1,
  },
  // Walking, changing, waiting: one line, centred on its icon.
  thinRow: {
    paddingBottom: 10,
  },
  thinBody: {
    minHeight: ICON_SLOT,
    justifyContent: 'center',
  },
  thinHead: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: 12,
    rowGap: 2,
  },
  thinText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#374151',
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 3,
    paddingVertical: 2,
  },
  toggleText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#F26522',
  },
  stopsToggle: {
    marginTop: 2,
    marginLeft: 21,
  },
  stopsPlain: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#6B7280',
    marginTop: 2,
    marginLeft: 21,
  },
  stopList: {
    marginTop: 4,
    marginLeft: 21,
    paddingLeft: 10,
    borderLeftWidth: 2,
    borderLeftColor: '#E5E7EB',
    gap: 4,
  },
  stopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stopDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginLeft: -14.5,
    backgroundColor: '#9CA3AF',
  },
  stopDotBoard: {
    backgroundColor: '#15803D',
  },
  stopDotAlight: {
    backgroundColor: '#F26522',
  },
  stopName: {
    flex: 1,
    fontSize: 12.5,
    color: '#4B5563',
  },
  stopNameEnd: {
    fontWeight: '800',
    color: '#111111',
  },
  rideFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
  },
  rideFootText: {
    fontSize: 13,
    color: '#333333',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 6,
  },
  detailBullet: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginTop: 6,
    backgroundColor: '#9CA3AF',
  },
  detailText: {
    flex: 1,
    fontSize: 12.5,
    color: '#1F2937',
    lineHeight: 17,
  },
  stepSubDesc: {
    fontSize: 12.5,
    color: '#333333',
    marginTop: 2,
    lineHeight: 16,
  },
  guideRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 4,
  },
  // The « Monte à » / « Descends à » line SIRA is saying.
  guideLit: {
    backgroundColor: '#FFE4D2',
    borderRadius: 6,
  },
  guideText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#15803D',
    lineHeight: 17,
  },
  guideAlight: {
    color: '#C2410C',
  },
  // « · ≈ 5 min d'attente » after « Monte à … ».
  guideExtra: {
    fontWeight: '600',
    color: '#4B5563',
  },
  walkStepRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  walkStepDistance: {
    width: 44,
    fontSize: 11.5,
    fontWeight: '800',
    color: '#6B7280',
    textAlign: 'right',
    marginTop: 1,
  },
  walkStepText: {
    flex: 1,
    fontSize: 12.5,
    color: '#1F2937',
    lineHeight: 16,
  },
  boldText: {
    fontWeight: '900',
    color: '#000000',
  },
  floatingButtonContainer: {
    position: 'absolute',
    right: 16,
    zIndex: 20,
  },
  demarrerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F26522',
    borderRadius: 28,
    paddingHorizontal: 18,
    paddingVertical: 12,
    gap: 10,
    shadowColor: '#F26522',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  demarrerIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  demarrerPinIcon: {
    width: 18,
    height: 18,
  },
  demarrerBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
});

