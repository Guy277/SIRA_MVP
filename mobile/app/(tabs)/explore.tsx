// Journeys screen, on one page: the three ways to travel (Coulé, Debout,
// Suspendu) with their best option, a touch opens its detail; the journeys
// not on the cards wait folded underneath. The mode chips say which ways of
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
import { CustomBottomTabBar } from '@/components/custom-bottom-tab-bar';
import { YangoLocationModal } from '@/components/yango-location-modal';
import { JourneyBadges } from '@/components/journey-badges';
import { DepartureTimeSheet, departureLabel } from '@/components/departure-time-sheet';
import { fetchJourneys, type ApiJourney, type CategoryName, type LegMode } from '@/lib/sira-api';
import { CURRENT_LOCATION, ensureCurrentPlace, isOwnPosition, placeLabel, resolvePlace, useCurrentPlace } from '@/lib/places';
import { useUsage } from '@/lib/usage';
import { needsSecureContext } from '@/lib/secure-context';
import { journeyStore, useJourneyStore } from '@/lib/journey-store';
import { arrivalTime, formatClock, formatDuration, formatPrice, journeySummary } from '@/lib/journey-format';
import { goBack } from '@/lib/navigation';
import { resultsSpeech, SEARCH_ERRORS } from '@/lib/spoken';
import { useSpeech } from '@/lib/voice';
import { SkeletonCards } from '@/components/skeleton-cards';
import Animated, { FadeInDown } from 'react-native-reanimated';

const CATEGORIES: { name: CategoryName; label: string; subtitle: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { name: 'coule', label: 'Coulé', subtitle: 'Le moins cher', icon: 'people' },
  { name: 'debout', label: 'Debout', subtitle: 'Le juste milieu', icon: 'sparkles' },
  { name: 'suspendu', label: 'Suspendu', subtitle: 'Le plus confortable', icon: 'trophy' },
];

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
  const [excluded, setExcluded] = useState<LegMode[]>([]);
  // At least one way of travel stays allowed: the last one cannot be taken away.
  const toggleMode = (mode: LegMode) => setExcluded((current) => current.includes(mode)
    ? current.filter((item) => item !== mode)
    : current.length + 1 >= MODES.length ? current : [...current, mode]);
  // « Autres trajets » folds again with every new search.
  const [othersOpenFor, setOthersOpenFor] = useState<string | null>(null);

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
  const shownLeaders = new Map<string, string>();

  const openJourney = (journey: ApiJourney) => {
    journeyStore.select(journey.id);
    router.push('/route-detail');
  };

  // Only the modes these journeys really use: no « Bateau » chip that leads to an empty list,
  // and no chips at all when every journey uses the same mode.
  const inCategory = (name: CategoryName) => (search?.categories[name] ?? [])
    .map((id) => byId.get(id)).filter((journey): journey is ApiJourney => Boolean(journey));
  // Journeys already on the three cards; the others wait folded under them, quickest first.
  const onCards = new Set(CATEGORIES.map((category) => inCategory(category.name)[0]?.id).filter(Boolean));
  const others = journeys.filter((journey) => !onCards.has(journey.id))
    .sort((a, b) => a.duration - b.duration);
  const othersOpen = othersOpenFor === searchKey;

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
            {MODES.map(({ mode, label }) => {
              const allowed = !excluded.includes(mode);
              const last = allowed && excluded.length + 1 >= MODES.length;
              return (
                <TouchableOpacity
                  key={mode}
                  style={[styles.filterChip, allowed && styles.filterChipActive]}
                  onPress={() => toggleMode(mode)}
                  disabled={last}
                  activeOpacity={0.8}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: allowed, disabled: last }}
                  accessibilityLabel={allowed ? `${label} permis, touche pour l’enlever` : `${label} enlevé, touche pour le remettre`}
                >
                  <Text style={[styles.filterText, allowed ? styles.filterTextActive : styles.filterTextOff]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
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

        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
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
              <Text style={styles.sectionTitle}>Comment veux-tu voyager ?</Text>
              {journeys.length === 1 && (
                <Text style={styles.metaText}>Un seul trajet possible à cette heure : il est à la fois le moins cher et le plus confortable.</Text>
              )}
              {CATEGORIES.map((category, index) => {
                // With few options one journey can lead several categories: it is
                // shown once, the other cards point to it instead of repeating it.
                const first = inCategory(category.name)[0];
                const sameAs = first ? shownLeaders.get(first.id) : undefined;
                const leader = sameAs ? undefined : first;
                if (leader) shownLeaders.set(leader.id, category.label);
                return (
                  // Coulé, Debout then Suspendu come in one after the other.
                  <Animated.View key={category.name} entering={FadeInDown.delay(index * 70).duration(350)}>
                  <TouchableOpacity
                    style={[styles.categoryCard, !leader && styles.categoryCardEmpty]}
                    disabled={!first || (category.name === 'debout' && Boolean(sameAs))}
                    onPress={() => first && openJourney(first)}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={`${category.label}, ${category.subtitle}`}
                    accessibilityHint="Ouvre le détail du trajet"
                  >
                    <View style={styles.categoryHead}>
                      <View style={styles.categoryIcon}><Ionicons name={category.icon} size={20} color="#FFFFFF" /></View>
                      <View style={styles.categoryNames}>
                        <Text style={styles.categoryLabel}>{category.label}</Text>
                        <Text style={styles.categorySub}>{category.subtitle}</Text>
                      </View>
                      {leader ? (
                        <View style={styles.categoryFigures}>
                          <Text style={styles.bigDuration}>{formatDuration(leader.duration)}</Text>
                          <Text style={styles.categoryPrice}>{formatPrice(leader.price)}</Text>
                        </View>
                      ) : null}
                    </View>
                    {leader ? (
                      <View style={styles.categoryBody}>
                        <JourneyBadges journey={leader} />
                        <View style={styles.categoryFoot}>
                          <Text style={styles.metaText}>{journeySummary(leader)}</Text>
                          <Text style={styles.metaText}>{formatClock(departureAt)} → {formatClock(arrivalTime(leader, departureAt))}</Text>
                        </View>
                      </View>
                    ) : (
                      <Text style={styles.emptyText}>
                        {category.name === 'debout' || !sameAs
                          ? 'Pas d’option intermédiaire : Coulé et Suspendu couvrent déjà ce trajet.'
                          : `Même trajet que ${sameAs} : c’est aussi le plus confortable.`}
                      </Text>
                    )}
                  </TouchableOpacity>
                  </Animated.View>
                );
              })}
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

  routeCard: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: 8, backgroundColor: '#FFFFFF', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#EEEEEE' },
  routeDots: { alignItems: 'center', marginRight: 10 },
  originDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 3, borderColor: '#F26522', backgroundColor: '#FFFFFF' },
  dotLine: { width: 1, height: 16, borderLeftWidth: 1, borderColor: '#CCCCCC', borderStyle: 'dashed', marginVertical: 2 },
  routeFields: { flex: 1 },
  fieldLabel: { fontSize: 11, color: '#888888', fontWeight: '500' },
  fieldValue: { fontSize: 15, color: '#000000', fontWeight: '700' },
  fieldPlaceholder: { color: '#999999', fontWeight: '500' },
  fieldDivider: { height: 1, backgroundColor: '#EEEEEE', marginVertical: 6 },
  swapButton: { padding: 8, marginLeft: 6, backgroundColor: '#FFF4EE', borderRadius: 12 },

  toolsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 16, marginTop: 10 },
  timeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: '#E3E3E3', paddingHorizontal: 12, paddingVertical: 7 },
  timeChipText: { fontSize: 13, fontWeight: '700', color: '#1F1F1F' },
  filters: { gap: 6, paddingRight: 16 },
  filterChip: { backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: '#E3E3E3', paddingHorizontal: 12, paddingVertical: 7 },
  filterChipActive: { backgroundColor: '#F26522', borderColor: '#F26522' },
  filterText: { fontSize: 13, fontWeight: '600', color: '#1F1F1F' },
  filterTextActive: { color: '#FFFFFF' },
  filterTextOff: { color: '#9A9A9A', textDecorationLine: 'line-through' },

  body: { flex: 1 },
  bodyContent: { padding: 16, paddingBottom: 140, gap: 10 },
  stateCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14 },
  stateText: { flex: 1, fontSize: 14, color: '#333333' },

  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#111111', marginTop: 2 },
  categoryCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#EEEEEE', gap: 10 },
  categoryCardEmpty: { opacity: 0.6 },
  categoryHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  categoryIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center' },
  categoryNames: { flex: 1 },
  categoryLabel: { fontSize: 17, fontWeight: '800', color: '#111111' },
  categorySub: { fontSize: 13, color: '#6B6B6B' },
  categoryFigures: { alignItems: 'flex-end' },
  categoryPrice: { fontSize: 13, fontWeight: '700', color: '#F26522' },
  categoryBody: { gap: 8 },
  categoryFoot: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  emptyText: { fontSize: 13, color: '#6B6B6B' },
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
