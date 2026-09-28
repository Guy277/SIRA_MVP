import React, { useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Pressable,
  ScrollView,
  Share,
  Dimensions,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown, ReduceMotion, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useFavorites } from '@/hooks/use-favorites';
import { OsmMapView } from '@/components/osm-map-view';
import { journeyStore, selectedJourney, useJourneyStore } from '@/lib/journey-store';
import { journeyBrief, stepInFull, type SpokenPart } from '@/lib/spoken';
import { say, stopSpeaking } from '@/lib/voice';
import { alternativesText, arrivalTime, formatClock, formatDistance, formatDuration, formatPrice, isVehicle, journeyPath, journeyTitle, legBadges, legCodes, legPath, MODE_NAMES, rideGuide, stepDescription, stepTitle, timeline, walkStepText } from '@/lib/journey-format';
import { fareSummaries, type ApiLeg, type Coordinates, type FareSummary, type LegMode } from '@/lib/sira-api';
import { notify } from '@/lib/notify';
import { goBack } from '@/lib/navigation';

const STEP_ICONS: Record<LegMode, keyof typeof Ionicons.glyphMap> = {
  walk: 'walk', wait: 'time', transfer: 'swap-horizontal', sotra: 'bus', gbaka: 'bus-outline', woro: 'car-sport', taxi: 'car', boat: 'boat',
};

// Three kinds of steps, three looks (as in Google Maps): what you ride is big and
// on the road, walking is a small dot on a dotted path, waiting a small clock.
type StepKind = 'ride' | 'walk' | 'wait';
const kindOf = (leg: ApiLeg): StepKind => (isVehicle(leg) ? 'ride' : leg.mode === 'wait' ? 'wait' : 'walk');

// « Bus SOTRA 26 / 85 », « Gbaka », « Taxi »: the line to look for.
function rideBadge(leg: ApiLeg) {
  const { codes } = legCodes(leg);
  return codes.length ? `${MODE_NAMES[leg.mode]} ${codes.slice(0, 3).join(' / ')}` : MODE_NAMES[leg.mode];
}

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
  const { isFavorite: checkIsFavorite, toggleFavorite } = useFavorites();

  const store = useJourneyStore();
  const journey = selectedJourney(store);
  const search = store.search;
  const departure = search?.departure.name ?? '';
  const arrival = search?.arrival.name ?? '';
  const tripTitle = `D’${departure} à ${arrival}`;
  const steps = journey && search ? timeline(journey, search.departureAt) : [];
  const arrivalAt = journey && search ? arrivalTime(journey, search.departureAt) : null;
  const insets = useSafeAreaInsets();

  // Touching a step shows its stretch alone on the map; the compass shows all of it.
  const [focusedStep, setFocusedStep] = useState<number | null>(null);
  // Walks unfolded turn by turn (« Voir le chemin »).
  const [openWalks, setOpenWalks] = useState<Set<string>>(new Set());
  const toggleWalk = (id: string) => setOpenWalks((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
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
  const isFavorite = checkIsFavorite(tripTitle);

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
    const nowFavorite = toggleFavorite({
      departure,
      arrival,
      title: tripTitle,
      mode: (journey?.categories?.[0] ?? 'coule') === 'suspendu' ? 'Suspendu' : (journey?.categories?.[0] === 'debout' ? 'Debout' : 'Coulé'),
      transport: journey ? journeyTitle(journey) : '',
      duration: journey ? formatDuration(journey.duration) : '',
      costRange: formatPrice(journey?.price),
    });
    Alert.alert(
      nowFavorite ? 'Ajouté aux favoris' : 'Retiré des favoris',
      nowFavorite
        ? `Le trajet "${tripTitle}" est enregistré dans tes favoris.`
        : `Le trajet "${tripTitle}" a été retiré de tes favoris.`
    );
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
              <View style={styles.notificationBadge}>
                <Text style={styles.badgeText}>5</Text>
              </View>
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

            {/* Top Right Map Legend Badges */}
            <View style={styles.mapLegendContainer}>
              <View style={styles.legendRow}>
                <View style={[styles.legendLine, { backgroundColor: '#F26522' }]} />
                <View style={styles.legendIconCircle}>
                  <Ionicons name="star" size={11} color="#FFFFFF" />
                </View>
              </View>
              <View style={styles.legendRow}>
                <View style={[styles.legendLine, { backgroundColor: '#1E40AF' }]} />
                <View style={styles.legendIconCircleBlue}>
                  <Ionicons name="ribbon" size={11} color="#FFFFFF" />
                </View>
              </View>
            </View>

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
              <Text style={styles.summaryNote}>Estimation à partir des lignes open data 2021.</Text>
              <View style={styles.summaryActions}>
                <TouchableOpacity style={styles.summaryAction} onPress={handleToggleFavorite} activeOpacity={0.7} accessibilityRole="button">
                  <Ionicons name={isFavorite ? 'bookmark' : 'bookmark-outline'} size={18} color={isFavorite ? '#F26522' : '#111111'} />
                  <Text style={styles.summaryActionText}>Favori</Text>
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

            {steps.map(({ leg, start }, index) => {
              const kind = kindOf(leg);
              const lit = litStep(index) || focusedStep === index;
              const guide = kind === 'ride' ? rideGuide(leg) : null;
              const walkSteps = kind === 'walk' ? leg.walk_steps ?? [] : [];
              const walkOpen = openWalks.has(leg.id);
              return (
                <Animated.View key={leg.id} entering={FadeInDown.delay(120 + index * 120).duration(280)}>
                  <Pressable
                    style={styles.stepRow}
                    onPress={() => touchStep(index)}
                    // No « button » role: the row holds the « Voir le chemin » button.
                    accessibilityHint="SIRA lit cette étape et la montre sur la carte"
                  >
                    <RoadPiece kind={kind} delay={220 + index * 120} />
                    <View style={styles.iconSlot}>
                      {kind === 'ride' ? (
                        <View style={[styles.rideIcon, lit && styles.iconLit]}>
                          <Ionicons name={STEP_ICONS[leg.mode] ?? 'ellipse'} size={22} color="#FFFFFF" />
                        </View>
                      ) : kind === 'wait' ? (
                        <View style={[styles.waitIcon, lit && styles.iconLit]}>
                          <Ionicons name="time-outline" size={17} color="#F26522" />
                        </View>
                      ) : (
                        <View style={[styles.walkIcon, lit && styles.iconLit]}>
                          <Ionicons name={STEP_ICONS[leg.mode] ?? 'walk'} size={14} color="#4B5563" />
                        </View>
                      )}
                    </View>
                    <View style={[styles.stepBody, lit && styles.lit]}>
                      <View style={styles.stepHead}>
                        <Text style={[styles.stepTitle, kind !== 'ride' && styles.stepTitleLight]}>{stepTitle(leg, arrival)}</Text>
                        <Text style={styles.stepClock}>{formatClock(start)}</Text>
                      </View>
                      {/* The line to look for (a taxi is already said in the title). */}
                      {kind === 'ride' && leg.mode !== 'taxi' && (
                        <View style={styles.lineBadge}>
                          <Text style={styles.lineBadgeText}>{rideBadge(leg)}</Text>
                        </View>
                      )}
                      <Text style={styles.stepSubDesc}>{stepDescription(leg)}</Text>
                      {/* Where to get on, what you pass, where to get off. */}
                      {guide?.board && (
                        <View style={[styles.guideRow, reading === `board:${index}` && styles.guideLit]}>
                          <Ionicons name="enter-outline" size={14} color="#15803D" />
                          <Text style={styles.guideText}>{guide.board}</Text>
                        </View>
                      )}
                      {guide?.via && <Text style={styles.guideVia}>{guide.via}</Text>}
                      {guide?.alight && (
                        <View style={[styles.guideRow, reading === `alight:${index}` && styles.guideLit]}>
                          <Ionicons name="exit-outline" size={14} color="#F26522" />
                          <Text style={[styles.guideText, styles.guideAlight]}>{guide.alight}</Text>
                        </View>
                      )}
                      {guide?.ready && <Text style={styles.guideVia}>{guide.ready}</Text>}
                      {/* The walk turn by turn, folded: most people only need where it ends. */}
                      {walkSteps.length > 0 && (
                        <TouchableOpacity
                          style={styles.walkToggle}
                          onPress={() => toggleWalk(leg.id)}
                          activeOpacity={0.7}
                          accessibilityRole="button"
                          accessibilityState={{ expanded: walkOpen }}
                        >
                          <Text style={styles.walkToggleText}>{walkOpen ? 'Masquer le chemin' : `Voir le chemin (${walkSteps.length} étapes)`}</Text>
                          <Ionicons name={walkOpen ? 'chevron-up' : 'chevron-down'} size={14} color="#F26522" />
                        </TouchableOpacity>
                      )}
                      {walkOpen && walkSteps.map((step, stepIndex) => (
                        <View key={stepIndex} style={styles.walkStepRow}>
                          <Text style={styles.walkStepDistance}>{step.distance_m > 0 ? `${step.distance_m} m` : ''}</Text>
                          <Text style={styles.walkStepText}>{walkStepText(step, arrival)}</Text>
                        </View>
                      ))}
                      {kind === 'ride' && (
                        <Text style={styles.stepCostText}>
                          Coût estimé : <Text style={styles.boldText}>{formatPrice(leg.price)}</Text>
                        </Text>
                      )}
                      {kind === 'ride' && alternativesText(leg) && (
                        <Text style={styles.alternativesText}>{alternativesText(leg)} — prends le premier qui passe.</Text>
                      )}
                      {leg.line_id && fares[leg.line_id]?.reports ? (
                        <Text style={styles.communityFareText}>
                          {fares[leg.line_id].validated
                            ? `Prix confirmé par ${fares[leg.line_id].agreeing} voyageurs : ${formatPrice(fares[leg.line_id].median_fcfa)}`
                            : `${fares[leg.line_id].reports} avis de voyageurs : ${formatPrice(fares[leg.line_id].median_fcfa)} (à confirmer)`}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                </Animated.View>
              );
            })}

            {/* Arrival: the road stops here. */}
            {journey && arrivalAt && (
              <Animated.View entering={FadeInDown.delay(120 + steps.length * 120).duration(280)} style={styles.stepRow}>
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
  communityFareText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803D',
    marginTop: 2,
  },
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
  mapLegendContainer: {
    position: 'absolute',
    top: 14,
    right: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 4,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendLine: {
    width: 32,
    height: 4,
    borderRadius: 2,
  },
  legendIconCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#F26522',
    justifyContent: 'center',
    alignItems: 'center',
  },
  legendIconCircleBlue: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#1E40AF',
    justifyContent: 'center',
    alignItems: 'center',
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
  alternativesText: {
    fontSize: 12,
    color: '#2D6A4F',
    fontWeight: '600',
    marginTop: 2,
  },
  stepTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '900',
    color: '#000000',
    lineHeight: 19,
  },
  stepTitleLight: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
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
  guideVia: {
    fontSize: 12,
    color: '#4B5563',
    marginTop: 2,
    marginLeft: 20,
    lineHeight: 16,
  },
  walkToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    marginTop: 4,
    paddingVertical: 2,
  },
  walkToggleText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#F26522',
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
  stepCostText: {
    fontSize: 12,
    color: '#333333',
    marginTop: 2,
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

