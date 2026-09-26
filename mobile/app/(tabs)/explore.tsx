// Journeys screen, in two steps as in Bonjour RATP: the traveller first sees
// the three ways to travel (Coulé, Debout, Suspendu) with their best option,
// then the itineraries of the chosen category, then the detail.
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
import { CURRENT_LOCATION, ensureCurrentPlace, isOwnPosition, resolvePlace, useCurrentPlace } from '@/lib/places';
import { journeyStore, useJourneyStore } from '@/lib/journey-store';
import { alternativesText, arrivalTime, formatClock, formatDuration, formatPrice, isVehicle, journeySummary } from '@/lib/journey-format';
import { goBack } from '@/lib/navigation';

const CATEGORIES: { name: CategoryName; label: string; subtitle: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { name: 'coule', label: 'Coulé', subtitle: 'Le moins cher', icon: 'people' },
  { name: 'debout', label: 'Debout', subtitle: 'Le juste milieu', icon: 'sparkles' },
  { name: 'suspendu', label: 'Suspendu', subtitle: 'Le plus confortable', icon: 'trophy' },
];

type Filter = 'Tout' | 'Bus' | 'Gbaka' | 'Wôrô' | 'Taxi' | 'Bateau';
const FILTER_MODES: Record<Exclude<Filter, 'Tout'>, LegMode[]> = {
  Bus: ['sotra'], Gbaka: ['gbaka'], 'Wôrô': ['woro'], Taxi: ['taxi'], Bateau: ['boat'],
};

type Step = CategoryName | 'all' | null;

export default function RouteExploreScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ query?: string; destination?: string }>();
  const here = useCurrentPlace();

  // Departure is the traveller's own position unless they pick another one.
  const [pickedDeparture, setPickedDeparture] = useState<string | null>(null);
  const departure = pickedDeparture ?? (here.status === 'ready' ? here.title : CURRENT_LOCATION);
  const departureName = departure === CURRENT_LOCATION
    ? (here.status === 'locating' ? 'Ma position · localisation…' : 'Ma position')
    : departure;
  const ownPositionUnavailable = departure === CURRENT_LOCATION && here.status === 'unavailable';

  // A new destination from the home screen replaces the one picked here.
  const paramArrival = (params.destination || params.query || '').trim();
  const [pickedArrival, setPickedArrival] = useState<{ param: string; value: string } | null>(null);
  const arrival = pickedArrival?.param === paramArrival ? pickedArrival.value : paramArrival;

  const [departAt, setDepartAt] = useState<Date | null>(null);
  const [picker, setPicker] = useState<'departure' | 'arrival' | null>(null);
  const [timeSheet, setTimeSheet] = useState(false);
  const [showSideMenu, setShowSideMenu] = useState(false);
  const [step, setStep] = useState<Step>(null);
  const [filter, setFilter] = useState<Filter>('Tout');

  useEffect(() => { ensureCurrentPlace(); }, []);

  const { search } = useJourneyStore();
  const searchKey = `${departure}→${arrival}@${departAt?.getTime() ?? 'now'}`;
  const [finished, setFinished] = useState<{ key: string; error: string | null } | null>(null);
  const sameEndpoints = arrival !== '' && departure === arrival;
  const waitingForPosition = departure === CURRENT_LOCATION && here.status === 'locating';
  const loading = !sameEndpoints && !ownPositionUnavailable && arrival !== '' && finished?.key !== searchKey;
  const searchError = sameEndpoints
    ? 'Le départ et l’arrivée sont identiques : choisissez une autre destination.'
    : finished?.key === searchKey ? finished.error : null;

  // Every change of departure, arrival or time asks SIRA-MORE for journeys.
  useEffect(() => {
    if (!arrival || departure === arrival || waitingForPosition || ownPositionUnavailable) return;
    let cancelled = false;
    (async () => {
      try {
        const [from, to] = await Promise.all([resolvePlace(departure), resolvePlace(arrival)]);
        const departureAt = departAt ?? new Date();
        const data = await fetchJourneys({ origin: { ...from, name: departure }, destination: { ...to, name: arrival }, departureAt });
        if (cancelled) return;
        journeyStore.setSearch({
          departure: { ...from, name: departure }, arrival: { ...to, name: arrival }, departureAt,
          journeys: data.journeys.filter((journey) => journey.legs?.length),
          categories: data.categories ?? { coule: [], debout: [], suspendu: [] },
        });
        setFinished({ key: searchKey, error: data.journeys.length ? null : data.rejected?.length ? 'Aucun trajet ne respecte vos contraintes.' : 'Aucun trajet trouvé entre ces deux lieux à cette heure.' });
      } catch (error) {
        if (!cancelled) setFinished({ key: searchKey, error: error instanceof Error ? error.message : 'Recherche impossible pour le moment.' });
      }
    })();
    return () => { cancelled = true; };
  }, [departure, arrival, departAt, searchKey, waitingForPosition, ownPositionUnavailable]);

  const swap = () => {
    setPickedDeparture(arrival || null);
    setPickedArrival({ param: paramArrival, value: departure === CURRENT_LOCATION ? '' : departure });
  };

  const ready = !loading && !searchError && !ownPositionUnavailable && search && search.journeys.length > 0;
  const journeys = search?.journeys ?? [];
  const byId = new Map(journeys.map((journey) => [journey.id, journey]));
  const inCategory = (name: CategoryName) => (search?.categories[name] ?? [])
    .map((id) => byId.get(id)).filter((journey): journey is ApiJourney => Boolean(journey));
  const departureAt = search?.departureAt ?? new Date();
  const shownLeaders = new Map<string, string>();

  const openJourney = (journey: ApiJourney) => {
    journeyStore.select(journey.id);
    router.push('/route-detail');
  };

  const matchesFilter = (journey: ApiJourney) => filter === 'Tout'
    || journey.legs.some((leg) => FILTER_MODES[filter].includes(leg.mode));
  const listed = step && step !== 'all' ? inCategory(step) : [...journeys].sort((a, b) => a.duration - b.duration);
  const others = step && step !== 'all' ? journeys.filter((journey) => !listed.includes(journey)) : [];

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.topHeader}>
          <View style={styles.logoRow}>
            <TouchableOpacity onPress={() => (step ? setStep(null) : goBack(router))} activeOpacity={0.7} style={styles.iconBtn} accessibilityLabel="Retour">
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
              <Text style={[styles.fieldValue, !arrival && styles.fieldPlaceholder]} numberOfLines={1}>{arrival || 'Où allez-vous ?'}</Text>
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
          {step && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
              {(['Tout', 'Bus', 'Gbaka', 'Wôrô', 'Taxi', 'Bateau'] as Filter[]).map((item) => (
                <TouchableOpacity key={item} style={[styles.filterChip, filter === item && styles.filterChipActive]} onPress={() => setFilter(item)} activeOpacity={0.8}>
                  <Text style={[styles.filterText, filter === item && styles.filterTextActive]}>{item}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>

        <YangoLocationModal
          visible={picker !== null}
          onClose={() => setPicker(null)}
          initialQuery={picker === 'departure' ? (isOwnPosition(departure) ? '' : departure) : arrival}
          currentLocationName={here.status === 'ready' ? here.title : CURRENT_LOCATION}
          placeholder={picker === 'departure' ? 'D’où partez-vous ?' : 'Où allez-vous ?'}
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
              <Text style={styles.stateText}>Où allez-vous ? Choisissez une destination.</Text>
            </TouchableOpacity>
          )}
          {ownPositionUnavailable && arrival !== '' && (
            <TouchableOpacity style={styles.stateCard} onPress={() => setPicker('departure')} activeOpacity={0.8}>
              <Ionicons name="locate" size={18} color="#F26522" />
              <Text style={styles.stateText}>Position introuvable : activez la localisation ou touchez ici pour choisir votre départ.</Text>
            </TouchableOpacity>
          )}
          {loading && !ownPositionUnavailable && (
            <View style={styles.stateCard}>
              <ActivityIndicator color="#F26522" />
              <Text style={styles.stateText}>{waitingForPosition ? 'Localisation en cours…' : 'SIRA compare les trajets…'}</Text>
            </View>
          )}
          {!loading && searchError && (
            <View style={styles.stateCard}>
              <Ionicons name="alert-circle" size={18} color="#DC2626" />
              <Text style={styles.stateText}>{searchError}</Text>
            </View>
          )}

          {ready && step === null && (
            <>
              <Text style={styles.sectionTitle}>Comment voulez-vous voyager ?</Text>
              {journeys.length === 1 && (
                <Text style={styles.metaText}>Un seul trajet possible à cette heure : il est à la fois le moins cher et le plus confortable.</Text>
              )}
              {CATEGORIES.map((category) => {
                // With few options one journey can lead several categories: it is
                // shown once, the other cards point to it instead of repeating it.
                const first = inCategory(category.name)[0];
                const sameAs = first ? shownLeaders.get(first.id) : undefined;
                const leader = sameAs ? undefined : first;
                if (leader) shownLeaders.set(leader.id, category.label);
                return (
                  <TouchableOpacity
                    key={category.name}
                    style={[styles.categoryCard, !leader && styles.categoryCardEmpty]}
                    disabled={!first || (category.name === 'debout' && Boolean(sameAs))}
                    onPress={() => { setFilter('Tout'); setStep(category.name); }}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={`${category.label}, ${category.subtitle}`}
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
                );
              })}
              <TouchableOpacity style={styles.allLink} onPress={() => { setFilter('Tout'); setStep('all'); }} activeOpacity={0.7}>
                <Text style={styles.allLinkText}>Voir tous les trajets ({journeys.length})</Text>
                <Ionicons name="chevron-forward" size={16} color="#F26522" />
              </TouchableOpacity>
            </>
          )}

          {ready && step !== null && (
            <>
              <View style={styles.tabs}>
                {CATEGORIES.map((category) => (
                  <TouchableOpacity
                    key={category.name}
                    style={[styles.tab, step === category.name && styles.tabActive]}
                    disabled={!inCategory(category.name).length}
                    onPress={() => setStep(category.name)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.tabText, step === category.name && styles.tabTextActive, !inCategory(category.name).length && styles.tabTextDisabled]}>{category.label}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity style={[styles.tab, step === 'all' && styles.tabActive]} onPress={() => setStep('all')} activeOpacity={0.8}>
                  <Text style={[styles.tabText, step === 'all' && styles.tabTextActive]}>Tous</Text>
                </TouchableOpacity>
              </View>

              <JourneyList journeys={listed.filter(matchesFilter)} departureAt={departureAt} onOpen={openJourney} />
              {listed.filter(matchesFilter).length === 0 && (
                <View style={styles.stateCard}>
                  <Ionicons name="information-circle" size={18} color="#F26522" />
                  <Text style={styles.stateText}>Aucun trajet avec ce mode dans cette catégorie.</Text>
                </View>
              )}
              {others.filter(matchesFilter).length > 0 && (
                <>
                  <Text style={styles.groupTitle}>Autres façons d’y aller</Text>
                  <JourneyList journeys={others.filter(matchesFilter)} departureAt={departureAt} onOpen={openJourney} />
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

// RATP-style rows: line badges, price and walk on the left; duration and
// clock times on the right; the other lines of the first ride underneath.
function JourneyList({ journeys, departureAt, onOpen }: { journeys: ApiJourney[]; departureAt: Date; onOpen: (journey: ApiJourney) => void }) {
  return (
    <View style={styles.list}>
      {journeys.map((journey) => {
        const firstRide = journey.legs.find(isVehicle);
        const also = firstRide ? alternativesText(firstRide, { otherModesOnly: true }) : null;
        return (
          <TouchableOpacity key={journey.id} style={styles.row} onPress={() => onOpen(journey)} activeOpacity={0.8} accessibilityRole="button">
            <View style={styles.rowMain}>
              <JourneyBadges journey={journey} />
              <Text style={styles.rowPrice}>{formatPrice(journey.price)}</Text>
              <Text style={styles.metaText}>{journeySummary(journey)}</Text>
              {also && <Text style={styles.alsoText} numberOfLines={2}>{also}</Text>}
            </View>
            <View style={styles.rowSide}>
              <Text style={styles.bigDuration}>{formatDuration(journey.duration)}</Text>
              <Text style={styles.metaText}>{formatClock(departureAt)} → {formatClock(arrivalTime(journey, departureAt))}</Text>
              <Ionicons name="chevron-forward" size={16} color="#B0B0B0" />
            </View>
          </TouchableOpacity>
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

  tabs: { flexDirection: 'row', backgroundColor: '#EAEAEA', borderRadius: 12, padding: 3 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10 },
  tabActive: { backgroundColor: '#000000' },
  tabText: { fontSize: 13, fontWeight: '700', color: '#333333' },
  tabTextActive: { color: '#FFFFFF' },
  tabTextDisabled: { color: '#AAAAAA' },
  groupTitle: { fontSize: 15, fontWeight: '800', color: '#111111', marginTop: 8 },

  list: { backgroundColor: '#FFFFFF', borderRadius: 16, overflow: 'hidden' },
  row: { flexDirection: 'row', padding: 14, gap: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  rowMain: { flex: 1, gap: 5 },
  rowPrice: { fontSize: 13, fontWeight: '700', color: '#111111' },
  alsoText: { fontSize: 12, color: '#2D6A4F', fontWeight: '600' },
  rowSide: { alignItems: 'flex-end', justifyContent: 'space-between' },
});
