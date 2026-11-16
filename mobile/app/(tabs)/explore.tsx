// Journeys screen, on one page: three blocks side by side (Coulé, Debout,
// Suspendu) with their best option; the chosen one is drawn in orange on the
// map, the others in grey, and its details sit under the map. The journeys
// not in the blocks wait folded underneath. The mode chips say which ways of
// travel SIRA may combine (all by default): changing them searches again.
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '@/components/sira-text';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { SideMenuModal } from '@/components/side-menu-modal';
import { CustomBottomTabBar, useTabBarSpace } from '@/components/custom-bottom-tab-bar';
import { YangoLocationModal } from '@/components/yango-location-modal';
import { JourneyBadges } from '@/components/journey-badges';
import { DepartureTimeSheet, departureLabel } from '@/components/departure-time-sheet';
import { OsmMapView } from '@/components/osm-map-view';
import type { MapPadding, MapRoute } from '@/components/osm-map-types';
import { fetchJourneys, type ApiJourney, type CategoryName, type Coordinates, type LegMode } from '@/lib/sira-api';
import { useLiveReports } from '@/lib/reports';
import { CURRENT_LOCATION, ensureCurrentPlace, isApproximate, isOwnPosition, placeLabel, resolvePlace, useCurrentPlace } from '@/lib/places';
import { useUsage } from '@/lib/usage';
import { needsSecureContext } from '@/lib/secure-context';
import { journeyStore, useJourneyStore } from '@/lib/journey-store';
import { arrivalTime, formatClock, formatDistance, formatDuration, formatPrice, journeyPath, journeySummary } from '@/lib/journey-format';
import { goBack } from '@/lib/navigation';
import { resultsSpeech, SEARCH_ERRORS } from '@/lib/spoken';
import { useSpeech } from '@/lib/voice';
import { SkeletonCards } from '@/components/skeleton-cards';
import Animated, { FadeInDown } from 'react-native-reanimated';

// short: what fits under the name in a block a third of the screen wide.
const CATEGORIES: { name: CategoryName; label: string; subtitle: string; short: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { name: 'coule', label: 'Coulé', subtitle: 'Le moins cher', short: 'Moins cher', icon: 'people' },
  { name: 'debout', label: 'Debout', subtitle: 'Le juste milieu', short: 'Juste milieu', icon: 'sparkles' },
  { name: 'suspendu', label: 'Suspendu', subtitle: 'Le plus confortable', short: 'Confort', icon: 'trophy' },
];

// Reports shown on the map: those this close to a point of a drawn journey.
const REPORT_NEAR_ROUTE_M = 300;
const MAP_PADDING: MapPadding = { top: 36, bottom: 36, left: 36, right: 36 };
// Any screen: the map takes the height left once the blocks and the chosen journey fit above the
// bottom bar (about 240 on a 6.1-inch iPhone). Never under MAP_MIN, where the page scrolls instead,
// nor over MAP_MAX, on tall screens. My choices, to adjust.
const MAP_MIN = 140;
const MAP_MAX = 340;
const MAP_DEFAULT = 240;
const GAP = 10;
// One padding object per map height: when the height changes, the map sees a new padding and frames
// the journeys again for its new size (a route framed for 240 could stick out of a smaller map).
// Above and below, at most 15 % of the height: a small map keeps most of its room for the route.
const paddingByHeight = new Map<number, MapPadding>();
function mapPaddingFor(height: number) {
  let padding = paddingByHeight.get(height);
  if (!padding) {
    const vertical = Math.min(MAP_PADDING.top, Math.round(height * 0.15));
    padding = { ...MAP_PADDING, top: vertical, bottom: vertical };
    paddingByHeight.set(height, padding);
  }
  return padding;
}

// One block per way to travel, led by the first journey of its engine list. With few
// options one journey can lead several categories: it is shown once, the other blocks
// point to it (« = Coulé »). An empty Debout, or one that repeats another block, cannot be chosen.
function buildBlocks(categories: Record<CategoryName, string[]> | undefined, byId: Map<string, ApiJourney>) {
  const shownLeaders = new Map<string, string>();
  return CATEGORIES.map((category) => {
    const journey = (categories?.[category.name] ?? []).map((id) => byId.get(id)).find(Boolean);
    const sameAs = journey ? shownLeaders.get(journey.id) : undefined;
    if (journey && !sameAs) shownLeaders.set(journey.id, category.label);
    return { ...category, journey, sameAs, usable: Boolean(journey) && !(category.name === 'debout' && sameAs) };
  });
}

// Flat-earth distance, precise enough at the scale of a street in Abidjan.
function metersBetween(point: Coordinates, lat: number, lon: number) {
  const dx = (point.longitude - lon) * 111_320 * Math.cos((lat * Math.PI) / 180);
  const dy = (point.latitude - lat) * 111_320;
  return Math.hypot(dx, dy);
}

// Every way of travel SIRA can combine, always shown, so one taken away can be put back.
const MODES: { mode: LegMode; label: string }[] = [
  { mode: 'woro', label: 'Wôrô' }, { mode: 'gbaka', label: 'Gbaka' }, { mode: 'sotra', label: 'Bus' },
  { mode: 'taxi', label: 'Taxi' }, { mode: 'boat', label: 'Bateau' },
];

export default function RouteExploreScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ query?: string; destination?: string; from?: string }>();
  const here = useCurrentPlace();
  const usage = useUsage();

  // Departure is the traveller's own position unless they pick another one.
  // A departure given elsewhere (« je quitte Yop… » to the voice assistant)
  // comes as `from`; one picked here replaces it until a new one arrives.
  const paramDeparture = (params.from || '').trim() || null;
  const [pickedDep, setPickedDep] = useState<{ param: string | null; value: string | null } | null>(null);
  const pickedDeparture = pickedDep && pickedDep.param === paramDeparture ? pickedDep.value : paramDeparture;
  const setPickedDeparture = (value: string | null) => setPickedDep({ param: paramDeparture, value });
  const departure = pickedDeparture ?? (here.status === 'ready' ? here.title : CURRENT_LOCATION);
  // The own position reads « Ma position » (the landmark it is named after stays behind).
  const departureName = departure === CURRENT_LOCATION && here.status === 'locating'
    ? 'Ma position · localisation…'
    : placeLabel(departure);
  // Leaving from one's own position needs a position, inside the Grand
  // Abidjan: otherwise no search is sent and the traveller is asked to pick
  // the departure (the engine would only answer with a technical error).
  const fromOwnPosition = pickedDeparture === null;
  const ownPositionProblem: 'unavailable' | 'outside' | null = !fromOwnPosition ? null
    : here.status === 'unavailable' ? 'unavailable'
    : here.status === 'ready' && here.outside ? 'outside'
    : null;
  const ownPositionUnavailable = ownPositionProblem !== null;

  // A new destination from the home screen replaces the one picked here.
  const paramArrival = (params.destination || params.query || '').trim();
  const [pickedArrival, setPickedArrival] = useState<{ param: string; value: string } | null>(null);
  const arrival = pickedArrival?.param === paramArrival ? pickedArrival.value : paramArrival;

  const [departAt, setDepartAt] = useState<Date | null>(null);
  const [picker, setPicker] = useState<'departure' | 'arrival' | null>(null);
  const [timeSheet, setTimeSheet] = useState(false);
  const [showSideMenu, setShowSideMenu] = useState(false);
  // Measured on screen, for the map's height: the scrolling area, where the map starts, the chosen journey's card.
  const tabBarSpace = useTabBarSpace();
  const [bodyHeight, setBodyHeight] = useState(0);
  const [mapTop, setMapTop] = useState(0);
  const [panelHeight, setPanelHeight] = useState(0);
  const mapHeight = bodyHeight && mapTop && panelHeight
    ? Math.round(Math.min(MAP_MAX, Math.max(MAP_MIN, bodyHeight - tabBarSpace - mapTop - GAP - panelHeight)))
    : MAP_DEFAULT;
  const [excluded, setExcluded] = useState<LegMode[]>([]);
  // At least one way of travel stays allowed: the last one cannot be taken away.
  const toggleMode = (mode: LegMode) => setExcluded((current) => current.includes(mode)
    ? current.filter((item) => item !== mode)
    : current.length + 1 >= MODES.length ? current : [...current, mode]);
  // « Autres trajets » folds again with every new search.
  const [othersOpenFor, setOthersOpenFor] = useState<string | null>(null);
  // The block touched, for this search only.
  const [picked, setPicked] = useState<{ key: string; name: CategoryName } | null>(null);

  useEffect(() => { ensureCurrentPlace(); }, []);

  const { search } = useJourneyStore();
  // SIRA speaks the result once per trip: changing the modes searches again, silently.
  const tripKey = `${departure}→${arrival}@${departAt?.getTime() ?? 'now'}`;
  const excludedKey = [...excluded].sort().join(',');
  const searchKey = `${tripKey}-${excludedKey}`;
  const withoutModes = MODES.filter((item) => excluded.includes(item.mode)).map((item) => item.label);
  const [finished, setFinished] = useState<{ key: string; error: string | null } | null>(null);
  const sameEndpoints = arrival !== '' && departure === arrival;
  const waitingForPosition = departure === CURRENT_LOCATION && here.status === 'locating';
  const loading = !sameEndpoints && !ownPositionUnavailable && arrival !== '' && finished?.key !== searchKey;
  const searchError = sameEndpoints
    ? 'Le départ et l’arrivée sont identiques : choisis une autre destination.'
    : finished?.key === searchKey ? finished.error : null;

  // Every change of departure, arrival or time asks SIRA-MORE for journeys.
  useEffect(() => {
    if (!arrival || departure === arrival || waitingForPosition || ownPositionUnavailable) return;
    let cancelled = false;
    (async () => {
      try {
        const [from, to] = await Promise.all([resolvePlace(departure), resolvePlace(arrival)]);
        const departureAt = departAt ?? new Date();
        const data = await fetchJourneys({ origin: { ...from, name: departure }, destination: { ...to, name: arrival }, departureAt, excludedModes: excludedKey ? excludedKey.split(',') as LegMode[] : [] });
        if (cancelled) return;
        journeyStore.setSearch({
          departure: { ...from, name: departure }, arrival: { ...to, name: arrival }, departureAt,
          journeys: data.journeys.filter((journey) => journey.legs?.length),
          categories: data.categories ?? { coule: [], debout: [], suspendu: [] },
        });
        setFinished({ key: searchKey, error: data.journeys.length ? null
          // Like Moovit: too many ways of travel taken away leaves nothing, so say which ones to put back.
          : excludedKey ? `Aucun trajet sans ${listLabels(withoutModes)} à cette heure. Remets un mode de transport pour voir d’autres trajets.`
          : data.rejected?.length ? 'Aucun trajet ne respecte tes contraintes.' : 'Aucun trajet trouvé entre ces deux lieux à cette heure.' });
      } catch (error) {
        if (!cancelled) setFinished({ key: searchKey, error: error instanceof Error ? error.message : 'Recherche impossible pour le moment.' });
      }
    })();
    return () => { cancelled = true; };
    // withoutModes follows excludedKey, already in searchKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departure, arrival, departAt, searchKey, excludedKey, waitingForPosition, ownPositionUnavailable]);

  // SIRA tells the result out loud, once per search: the cheapest way, or why there is none.
  const searchFailed = finished?.key === searchKey && finished.error !== null;
  const spokenResult = sameEndpoints ? SEARCH_ERRORS.sameEndpoints
    : finished?.key !== searchKey || loading ? null
    : searchFailed ? (finished?.error?.startsWith('Aucun') ? SEARCH_ERRORS.nothing : SEARCH_ERRORS.offline)
    : search ? resultsSpeech(search) : null;
  useSpeech(spokenResult ? `results:${tripKey}` : null, spokenResult, searchFailed || sameEndpoints ? 'alert' : 'guidance');

  const swap = () => {
    setPickedDeparture(arrival || null);
    setPickedArrival({ param: paramArrival, value: departure === CURRENT_LOCATION ? '' : departure });
  };

  const ready = !loading && !searchError && !ownPositionUnavailable && search && search.journeys.length > 0;
  const journeys = search?.journeys ?? [];
  const byId = new Map(journeys.map((journey) => [journey.id, journey]));
  const departureAt = search?.departureAt ?? new Date();

  const openJourney = (journey: ApiJourney) => {
    journeyStore.select(journey.id);
    router.push('/route-detail');
  };

  const blocks = buildBlocks(search?.categories, byId);
  // Coulé is chosen first; a new search starts again from it.
  const chosen = blocks.find((block) => block.usable && picked?.key === searchKey && block.name === picked.name)
    ?? blocks.find((block) => block.usable);
  const chosenJourney = chosen?.journey;
  const chosenId = chosenJourney?.id;
  // Journeys already in the blocks; the others wait folded under them, quickest first.
  const onCards = new Set(blocks.map((block) => block.journey?.id).filter(Boolean));
  const leaderKey = [...onCards].join(',');
  const others = journeys.filter((journey) => !onCards.has(journey.id))
    .sort((a, b) => a.duration - b.duration);
  const othersOpen = othersOpenFor === searchKey;

  // The map: the chosen journey in orange, the other blocks' journeys in grey. The React
  // Compiler keeps these arrays while search and choice stay the same, so the map does not reframe.
  // Each line carries the name of the block it leads and its duration (« Suspendu · 21 min »).
  const routeLabelOf = (journey: ApiJourney | undefined) => {
    const block = blocks.find((item) => !item.sameAs && item.journey?.id === journey?.id);
    return block && journey ? `${block.label} · ${formatDuration(journey.duration)}` : undefined;
  };
  const chosenPath = journeyPath(search?.journeys.find((journey) => journey.id === chosenId));
  const chosenLabel = routeLabelOf(chosenJourney);
  const alternativeRoutes: MapRoute[] = (search?.journeys ?? [])
    .filter((journey) => journey.id !== chosenId && leaderKey.split(',').includes(journey.id))
    .map((journey) => ({ id: journey.id, coordinates: journeyPath(journey), label: routeLabelOf(journey) }));
  const chooseRoute = (id: string) => {
    const block = blocks.find((item) => item.usable && !item.sameAs && item.journey?.id === id);
    if (block) setPicked({ key: searchKey, name: block.name });
  };
  const { reports } = useLiveReports();
  const drawnPaths = [chosenPath, ...alternativeRoutes.map((route) => route.coordinates)];
  const nearbyReports = reports.filter((report) => drawnPaths.some((path) => path.some((point) => metersBetween(point, report.lat, report.lon) <= REPORT_NEAR_ROUTE_M)));

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.topHeader}>
          <View style={styles.logoRow}>
            <TouchableOpacity onPress={() => goBack(router)} activeOpacity={0.7} style={styles.iconBtn} accessibilityLabel="Retour">
              <Ionicons name="arrow-back" size={22} color="#000000" />
            </TouchableOpacity>
            <Image source={require('@/assets/images/sira-logo-official.png')} style={styles.logoImage} contentFit="contain" />
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/notifications')} activeOpacity={0.8} accessibilityLabel="Notifications">
              <Ionicons name="notifications" size={22} color="#000000" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} onPress={() => setShowSideMenu(true)} activeOpacity={0.8} accessibilityLabel="Menu">
              <Ionicons name="menu" size={24} color="#000000" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Wide screens (tablet, computer): one centred column, as wide as a big phone. */}
        <View style={styles.column}>
        {/* Départ / Arrivée: buttons, typing happens in the picker. */}
        <View style={styles.routeCard}>
          <View style={styles.routeDots}>
            <View style={styles.originDot} />
            <View style={styles.dotLine} />
            <Ionicons name="location-sharp" size={18} color="#F26522" />
          </View>
          <View style={styles.routeFields}>
            <TouchableOpacity onPress={() => setPicker('departure')} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Changer le départ">
              <Text style={styles.fieldLabel}>Départ</Text>
              <Text style={styles.fieldValue} numberOfLines={1}>{departureName}</Text>
            </TouchableOpacity>
            <View style={styles.fieldDivider} />
            <TouchableOpacity onPress={() => setPicker('arrival')} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Changer l’arrivée">
              <Text style={styles.fieldLabel}>Arrivée</Text>
              <Text style={[styles.fieldValue, !arrival && styles.fieldPlaceholder]} numberOfLines={1}>{arrival || 'On va où ?'}</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.swapButton} onPress={swap} activeOpacity={0.7} accessibilityLabel="Inverser départ et arrivée">
            <Ionicons name="swap-vertical" size={20} color="#F26522" />
          </TouchableOpacity>
        </View>

        <View style={styles.toolsRow}>
          <TouchableOpacity style={styles.timeChip} onPress={() => setTimeSheet(true)} activeOpacity={0.8} accessibilityLabel="Heure de départ">
            <Ionicons name="time-outline" size={16} color="#F26522" />
            <Text style={styles.timeChipText}>{departureLabel(departAt)}</Text>
            <Ionicons name="chevron-down" size={14} color="#1F1F1F" />
          </TouchableOpacity>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
            {/* « Tout » says at a glance that nothing is taken away, and puts every mode back in one touch. */}
            <TouchableOpacity
              style={[styles.filterChip, excluded.length === 0 && styles.filterChipActive]}
              onPress={() => setExcluded([])}
              disabled={excluded.length === 0}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityState={{ selected: excluded.length === 0 }}
              accessibilityLabel={excluded.length === 0 ? 'Tous les modes de transport sont permis' : 'Remettre tous les modes de transport'}
            >
              <Text style={[styles.filterText, excluded.length === 0 && styles.filterTextActive]}>Tout</Text>
            </TouchableOpacity>
            {MODES.map(({ mode, label }) => {
              const allowed = !excluded.includes(mode);
              const last = allowed && excluded.length + 1 >= MODES.length;
              return (
                <TouchableOpacity
                  key={mode}
                  style={[styles.filterChip, styles.modeChip, !allowed && styles.modeChipOff]}
                  onPress={() => toggleMode(mode)}
                  disabled={last}
                  activeOpacity={0.8}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: allowed, disabled: last }}
                  accessibilityLabel={allowed ? `${label} permis, touche pour l’enlever` : `${label} enlevé, touche pour le remettre`}
                >
                  {allowed && <Ionicons name="checkmark" size={14} color="#F26522" />}
                  <Text style={[styles.filterText, !allowed && styles.filterTextOff]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
        </View>

        <YangoLocationModal
          visible={picker !== null}
          onClose={() => setPicker(null)}
          initialQuery={picker === 'departure' ? (isOwnPosition(departure) ? '' : departure) : arrival}
          currentLocationName={here.status === 'ready' ? here.title : CURRENT_LOCATION}
          placeholder={picker === 'departure' ? 'D’où pars-tu ?' : 'On va où ?'}
          purpose={picker === 'departure' ? 'departure' : 'arrival'}
          // Choosing the arrival, the departure in the header can be changed too.
          departureName={picker === 'arrival' ? departure : undefined}
          onSelectDeparture={picker === 'arrival' ? (selected) => setPickedDeparture(isOwnPosition(selected) ? null : selected) : undefined}
          onSelectLocation={(selected) => {
            if (picker === 'departure') setPickedDeparture(isOwnPosition(selected) ? null : selected);
            else if (picker === 'arrival' && !isOwnPosition(selected)) setPickedArrival({ param: paramArrival, value: selected });
            setPicker(null);
          }}
        />
        <DepartureTimeSheet visible={timeSheet} value={departAt} onClose={() => setTimeSheet(false)} onChange={setDepartAt} />

        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false} onLayout={(event) => setBodyHeight(event.nativeEvent.layout.height)}>
          {!arrival && (
            <TouchableOpacity style={styles.stateCard} onPress={() => setPicker('arrival')} activeOpacity={0.8}>
              <Ionicons name="search" size={18} color="#F26522" />
              <Text style={styles.stateText}>On va où ? Choisis une destination.</Text>
            </TouchableOpacity>
          )}
          {ownPositionUnavailable && arrival !== '' && (
            <TouchableOpacity style={styles.stateCard} onPress={() => setPicker('departure')} activeOpacity={0.8}>
              <Ionicons name="locate" size={18} color="#F26522" />
              <Text style={styles.stateText}>
                {ownPositionProblem === 'outside'
                  ? 'Tu es hors du Grand Abidjan : touche ici pour choisir ton départ ou ton arrivée.'
                  : needsSecureContext()
                    ? 'Ta position n’est pas disponible sans HTTPS : touche ici pour choisir ton départ.'
                    : !usage.location
                      ? 'Tu as coupé la position dans SIRA : touche ici pour choisir ton départ.'
                      : 'Position introuvable : active la localisation ou touche ici pour choisir ton départ ou ton arrivée.'}
              </Text>
            </TouchableOpacity>
          )}
          {/* The device says its position may be far off (a computer without GPS): the traveller can pick the departure. */}
          {fromOwnPosition && here.status === 'ready' && isApproximate(here) && arrival !== '' && (
            <TouchableOpacity style={styles.stateCard} onPress={() => setPicker('departure')} activeOpacity={0.8}>
              <Ionicons name="locate" size={18} color="#F26522" />
              <Text style={styles.stateText}>
                Ta position est approximative (à {formatDistance((here.accuracyM ?? 0) / 1000)} près) : touche ici pour choisir ton départ.
              </Text>
            </TouchableOpacity>
          )}
          {loading && !ownPositionUnavailable && (
            <SkeletonCards label={waitingForPosition ? 'Localisation en cours…' : 'SIRA compare les trajets…'} />
          )}
          {!loading && searchError && (
            <View style={styles.stateCard}>
              <Ionicons name="alert-circle" size={18} color="#DC2626" />
              <Text style={styles.stateText}>{searchError}</Text>
            </View>
          )}

          {ready && (
            <>
              {/* The blocks speak for themselves: no title above them, room left for the map. */}
              {journeys.length === 1 && (
                <Text style={styles.metaText}>Un seul trajet possible à cette heure.</Text>
              )}
              <View style={styles.blocks}>
                {blocks.map((block, index) => {
                  const selected = block === chosen;
                  const figures = block.usable && block.journey && !block.sameAs ? block.journey : null;
                  return (
                    // Coulé, Debout then Suspendu come in one after the other.
                    <Animated.View key={block.name} style={styles.blockWrap} entering={FadeInDown.delay(index * 70).duration(350)}>
                      <TouchableOpacity
                        style={[styles.block, selected && styles.blockSelected, !block.usable && styles.blockEmpty]}
                        disabled={!block.usable}
                        onPress={() => setPicked({ key: searchKey, name: block.name })}
                        activeOpacity={0.85}
                        accessibilityRole="button"
                        accessibilityState={{ selected, disabled: !block.usable }}
                        accessibilityLabel={figures
                          ? `${block.label}, ${block.subtitle}, ${formatDuration(figures.duration)}, ${formatPrice(figures.price)}`
                          : block.usable ? `${block.label}, même trajet que ${block.sameAs}` : `${block.label}, pas d’option intermédiaire`}
                      >
                        <View style={[styles.blockIcon, selected && styles.blockIconSelected]}>
                          <Ionicons name={block.icon} size={15} color="#FFFFFF" />
                        </View>
                        <Text style={styles.blockLabel}>{block.label}</Text>
                        <Text style={styles.blockSub} numberOfLines={1}>{block.short}</Text>
                        {figures ? (
                          <>
                            <Text style={styles.blockDuration}>{formatDuration(figures.duration)}</Text>
                            <Text style={styles.blockPrice}>{formatPrice(figures.price)}</Text>
                          </>
                        ) : (
                          <Text style={styles.blockSame}>{block.usable ? `= ${block.sameAs}` : '—'}</Text>
                        )}
                      </TouchableOpacity>
                    </Animated.View>
                  );
                })}
              </View>

              <View style={[styles.mapBox, { height: mapHeight }]} onLayout={(event) => setMapTop(event.nativeEvent.layout.y)}>
                <OsmMapView
                  departureName={departure}
                  arrivalName={arrival}
                  origin={search?.departure}
                  destination={search?.arrival}
                  routeCoordinates={chosenPath}
                  alternativeRoutes={alternativeRoutes}
                  onRoutePress={chooseRoute}
                  routeLabel={chosenLabel}
                  reports={nearbyReports}
                  padding={mapPaddingFor(mapHeight)}
                />
              </View>

              {/* The chosen journey only: the blocks above already say how long and how much. */}
              {chosen && chosenJourney && (
                <TouchableOpacity
                  style={styles.panel}
                  onLayout={(event) => setPanelHeight(event.nativeEvent.layout.height)}
                  onPress={() => openJourney(chosenJourney)}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={`Voir le détail du trajet ${chosen.label}`}
                >
                  <View style={styles.panelHead}>
                    <Text style={styles.panelTitle}>{chosen.label}</Text>
                    <Text style={styles.panelSub}>{chosen.subtitle}</Text>
                    <Text style={styles.panelClock}>{formatClock(departureAt)} → {formatClock(arrivalTime(chosenJourney, departureAt))}</Text>
                  </View>
                  <JourneyBadges journey={chosenJourney} />
                  <View style={styles.panelFoot}>
                    <Text style={[styles.metaText, styles.panelSummary]}>{journeySummary(chosenJourney)}</Text>
                    <View style={styles.panelButton}>
                      <Text style={styles.panelButtonText}>Voir le détail</Text>
                      <Ionicons name="chevron-forward" size={14} color="#FFFFFF" />
                    </View>
                  </View>
                </TouchableOpacity>
              )}
              {others.length > 0 && (
                <TouchableOpacity
                  style={styles.allLink}
                  onPress={() => setOthersOpenFor(othersOpen ? null : searchKey)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: othersOpen }}
                >
                  <Text style={styles.allLinkText}>
                    {othersOpen ? 'Masquer les autres trajets' : `Voir ${others.length === 1 ? 'l’autre trajet' : `les ${others.length} autres trajets`}`}
                  </Text>
                  <Ionicons name={othersOpen ? 'chevron-up' : 'chevron-down'} size={16} color="#F26522" />
                </TouchableOpacity>
              )}
              {othersOpen && others.length > 0 && (
                <>
                  <Text style={styles.groupTitle}>Autres façons d’y aller</Text>
                  <JourneyList journeys={others} departureAt={departureAt} onOpen={openJourney} />
                </>
              )}
            </>
          )}
        </ScrollView>

        <SideMenuModal visible={showSideMenu} onClose={() => setShowSideMenu(false)} />
        <CustomBottomTabBar activeTab="explore" />
      </SafeAreaView>
    </View>
  );
}

// « Taxi », « Taxi et Gbaka », « Taxi, Gbaka et Bus ».
function listLabels(labels: string[]) {
  return labels.length < 2 ? labels.join('') : `${labels.slice(0, -1).join(', ')} et ${labels[labels.length - 1]}`;
}

// RATP-style rows: line badges, price and walk on the left; duration and
// clock times on the right; the other lines of the first ride underneath.
function JourneyList({ journeys, departureAt, onOpen }: { journeys: ApiJourney[]; departureAt: Date; onOpen: (journey: ApiJourney) => void }) {
  return (
    <View style={styles.list}>
      {journeys.map((journey, index) => {
        return (
          // Rows cascade in; only the first few are delayed so long lists stay quick.
          <Animated.View key={journey.id} entering={FadeInDown.delay(Math.min(index, 6) * 50).duration(300)}>
          <TouchableOpacity style={styles.row} onPress={() => onOpen(journey)} activeOpacity={0.8} accessibilityRole="button">
            <View style={styles.rowMain}>
              <JourneyBadges journey={journey} />
              <Text style={styles.rowPrice}>{formatPrice(journey.price)}</Text>
              <Text style={styles.metaText}>{journeySummary(journey)}</Text>
            </View>
            <View style={styles.rowSide}>
              <Text style={styles.bigDuration}>{formatDuration(journey.duration)}</Text>
              <Text style={styles.metaText}>{formatClock(departureAt)} → {formatClock(arrivalTime(journey, departureAt))}</Text>
              <Ionicons name="chevron-forward" size={16} color="#B0B0B0" />
            </View>
          </TouchableOpacity>
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F6F6F6' },
  safeArea: { flex: 1 },
  topHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 4, backgroundColor: '#FFFFFF' },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  logoImage: { width: 110, height: 40 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { padding: 6 },

  column: { width: '100%', maxWidth: 640, alignSelf: 'center' },
  routeCard: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: 8, backgroundColor: '#FFFFFF', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: '#EEEEEE' },
  routeDots: { alignItems: 'center', marginRight: 10 },
  originDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 3, borderColor: '#F26522', backgroundColor: '#FFFFFF' },
  dotLine: { width: 1, height: 16, borderLeftWidth: 1, borderColor: '#CCCCCC', borderStyle: 'dashed', marginVertical: 2 },
  routeFields: { flex: 1 },
  fieldLabel: { fontSize: 11, color: '#888888', fontWeight: '500' },
  fieldValue: { fontSize: 15, color: '#000000', fontWeight: '700' },
  fieldPlaceholder: { color: '#999999', fontWeight: '500' },
  fieldDivider: { height: 1, backgroundColor: '#EEEEEE', marginVertical: 4 },
  swapButton: { padding: 8, marginLeft: 6, backgroundColor: '#FFF4EE', borderRadius: 12 },

  toolsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 16, marginTop: 8 },
  timeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: '#E3E3E3', paddingHorizontal: 12, paddingVertical: 7 },
  timeChipText: { fontSize: 13, fontWeight: '700', color: '#1F1F1F' },
  filters: { gap: 6, paddingRight: 16 },
  filterChip: { backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: '#E3E3E3', paddingHorizontal: 12, paddingVertical: 7 },
  filterChipActive: { backgroundColor: '#F26522', borderColor: '#F26522' },
  filterText: { fontSize: 13, fontWeight: '600', color: '#1F1F1F' },
  filterTextActive: { color: '#FFFFFF' },
  filterTextOff: { color: '#9A9A9A', textDecorationLine: 'line-through' },
  modeChip: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  modeChipOff: { backgroundColor: '#F2F2F2', borderColor: '#E8E8E8' },

  body: { flex: 1 },
  bodyContent: { width: '100%', maxWidth: 640, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 140, gap: GAP },
  stateCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14 },
  stateText: { flex: 1, fontSize: 14, color: '#333333' },

  blocks: { flexDirection: 'row', gap: 8 },
  blockWrap: { flex: 1 },
  block: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 2, borderColor: '#EEEEEE', paddingVertical: 8, paddingHorizontal: 8, alignItems: 'center', gap: 1 },
  blockSelected: { borderColor: '#F26522', backgroundColor: '#FFF4EE' },
  blockEmpty: { opacity: 0.5 },
  blockIcon: { width: 24, height: 24, borderRadius: 7, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center', marginBottom: 3 },
  blockIconSelected: { backgroundColor: '#F26522' },
  blockLabel: { fontSize: 15, fontWeight: '800', color: '#111111' },
  blockSub: { fontSize: 11, color: '#6B6B6B' },
  blockDuration: { fontSize: 17, fontWeight: '800', color: '#111111', marginTop: 2 },
  blockPrice: { fontSize: 12, fontWeight: '700', color: '#F26522' },
  blockSame: { fontSize: 13, fontWeight: '700', color: '#6B6B6B', marginTop: 2 },

  mapBox: { borderRadius: 16, overflow: 'hidden', backgroundColor: '#EAEAEA' },

  panel: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 12, borderWidth: 1, borderColor: '#EEEEEE', gap: 6 },
  panelHead: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  panelTitle: { fontSize: 16, fontWeight: '800', color: '#111111' },
  panelSub: { flex: 1, fontSize: 12, color: '#6B6B6B' },
  panelClock: { fontSize: 12, fontWeight: '700', color: '#111111' },
  panelFoot: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  panelSummary: { flex: 1 },
  panelButton: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#F26522', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  panelButtonText: { fontSize: 12, fontWeight: '800', color: '#FFFFFF' },
  bigDuration: { fontSize: 20, fontWeight: '800', color: '#111111' },
  metaText: { fontSize: 12, color: '#6B6B6B' },
  allLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8 },
  allLinkText: { fontSize: 14, fontWeight: '700', color: '#F26522' },

  groupTitle: { fontSize: 15, fontWeight: '800', color: '#111111', marginTop: 8 },

  list: { backgroundColor: '#FFFFFF', borderRadius: 16, overflow: 'hidden' },
  row: { flexDirection: 'row', padding: 14, gap: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  rowMain: { flex: 1, gap: 5 },
  rowPrice: { fontSize: 13, fontWeight: '700', color: '#111111' },
  rowSide: { alignItems: 'flex-end', justifyContent: 'space-between' },
});
