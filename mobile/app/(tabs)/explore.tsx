import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Platform,
  LayoutAnimation,
  UIManager,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { SideMenuModal } from '@/components/side-menu-modal';
import { CustomBottomTabBar } from '@/components/custom-bottom-tab-bar';
import { LocationSuggestionsList } from '@/components/location-suggestions-list';
import { YangoLocationModal } from '@/components/yango-location-modal';
import { OsmMapView } from '@/components/osm-map-view';
import { fetchJourneys, type ApiJourney, type LegMode } from '@/lib/sira-api';
import { CURRENT_LOCATION, ensureCurrentPlace, isOwnPosition, resolvePlace, useCurrentPlace } from '@/lib/places';
import { journeyStore, useJourneyStore } from '@/lib/journey-store';
import {
  CATEGORY_BY_LABEL, CATEGORY_LABELS, arrivalTime, formatClock, formatDistance, formatDuration,
  formatPrice, isVehicle, journeyPath, journeySummary, journeyTitle, type CategoryLabel,
} from '@/lib/journey-format';
import { goBack } from '@/lib/navigation';

const { width, height } = Dimensions.get('window');

// Coulé / Debout / Suspendu are result categories ranked by the engine
// (budget, middle ground, comfort); they do not restrict transport modes.
type TransportMode = CategoryLabel;
type FilterType = 'Tout' | 'Marche' | 'Bus' | 'Gbaka' | 'wôro-wôro' | 'Taxi' | 'Yango';

const FILTER_MODES: Record<Exclude<FilterType, 'Tout'>, LegMode[]> = {
  Marche: ['walk'], Bus: ['sotra', 'boat'], Gbaka: ['gbaka'], 'wôro-wôro': ['woro'], Taxi: ['taxi'], Yango: [],
};
// No Yango data yet: the chip stays visible but is disabled rather than faked.
const UNAVAILABLE_FILTERS: FilterType[] = ['Yango'];

interface RouteStep {
  type: 'walk' | 'bus' | 'taxi' | 'arrow-right' | 'arrow-left';
  duration?: string;
}

interface RouteOption {
  id: string;
  mode: TransportMode | null;
  leads: TransportMode[];
  suboption: FilterType;
  subtext: string;
  title: string;
  steps: RouteStep[];
  trafficStatus: string;
  distance: string;
  durationMinutes: string;
  costRange: string;
  departureTime: string;
  arrivalTime: string;
  journey: ApiJourney;
}

function toRouteOption(journey: ApiJourney, departureAt: Date, mode: TransportMode | null): RouteOption {
  const vehicles = journey.legs.filter(isVehicle);
  const steps: RouteStep[] = [];
  journey.legs.filter((leg) => leg.mode !== 'wait' && leg.duration > 0).forEach((leg, index) => {
    if (index > 0) steps.push({ type: 'arrow-right' });
    steps.push({ type: leg.mode === 'walk' || leg.mode === 'transfer' ? 'walk' : leg.mode === 'taxi' ? 'taxi' : 'bus', duration: `${leg.duration} min` });
  });
  const mainMode = vehicles[0]?.mode;
  return {
    id: journey.id,
    mode,
    leads: (journey.categories ?? []).map((name) => CATEGORY_LABELS[name]),
    suboption: mainMode === 'taxi' ? 'Taxi' : mainMode === 'gbaka' ? 'Gbaka' : mainMode === 'woro' ? 'wôro-wôro' : mainMode ? 'Bus' : 'Marche',
    subtext: journeySummary(journey),
    title: journeyTitle(journey),
    steps,
    trafficStatus: '',
    distance: formatDistance(journey.distance_km),
    durationMinutes: formatDuration(journey.duration).replace(/ min$/, ''),
    costRange: formatPrice(journey.price),
    departureTime: formatClock(departureAt),
    arrivalTime: formatClock(arrivalTime(journey, departureAt)),
    journey,
  };
}

export default function RouteExploreScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ query?: string; destination?: string }>();

  // State for Departure & Arrival (Dynamic from query params or manual entry)
  const here = useCurrentPlace();
  const [departure, setDeparture] = useState(here.status === 'ready' ? here.title : '');
  const [arrival, setArrival] = useState(params.destination || params.query || 'Cocody Saint-Jean');
  const [focusedField, setFocusedField] = useState<'departure' | 'arrival' | null>(null);

  // Own-position labels are not search terms.
  const pickerQuery = (value: string) =>
    value === CURRENT_LOCATION || (here.status === 'ready' && value === here.title) ? '' : value;

  // Departure defaults to where the traveller is; they can change it.
  useEffect(() => {
    let cancelled = false;
    ensureCurrentPlace().then((place) => {
      if (!cancelled && place.status === 'ready') setDeparture((value) => value || place.title);
    });
    return () => { cancelled = true; };
  }, []);
  const { search, selectedId } = useJourneyStore();
  // Loading and error are derived from the last finished search, keyed by its
  // endpoints, instead of being toggled from the effect.
  const searchKey = `${departure}→${arrival}`;
  const [finished, setFinished] = useState<{ key: string; error: string | null } | null>(null);
  const sameEndpoints = departure.trim() !== '' && departure === arrival;
  const loading = !sameEndpoints && departure.trim() !== '' && arrival.trim() !== '' && finished?.key !== searchKey;
  const searchError = sameEndpoints
    ? 'Le départ et l’arrivée sont identiques : choisissez une autre destination.'
    : finished?.key === searchKey ? finished.error : null;

  useEffect(() => {
    if (params.destination) {
      setArrival(params.destination);
    } else if (params.query) {
      setArrival(params.query);
    }
  }, [params.destination, params.query]);

  // Every departure/arrival change asks the SIRA engine for real journeys.
  useEffect(() => {
    if (!departure.trim() || !arrival.trim() || departure === arrival) return;
    let cancelled = false;
    const key = `${departure}→${arrival}`;
    (async () => {
      try {
        const [from, to] = await Promise.all([resolvePlace(departure), resolvePlace(arrival)]);
        const departureAt = new Date();
        const data = await fetchJourneys({ origin: { ...from, name: departure }, destination: { ...to, name: arrival }, departureAt });
        if (cancelled) return;
        journeyStore.setSearch({
          departure: { ...from, name: departure }, arrival: { ...to, name: arrival }, departureAt,
          journeys: data.journeys.filter((journey) => journey.legs?.length),
          categories: data.categories ?? { coule: [], debout: [], suspendu: [] },
        });
        setFinished({ key, error: data.journeys.length ? null : data.rejected?.length ? 'Aucun trajet ne respecte vos contraintes.' : 'Aucun trajet trouvé entre ces deux lieux.' });
      } catch (error) {
        if (!cancelled) setFinished({ key, error: error instanceof Error ? error.message : 'Recherche impossible pour le moment.' });
      }
    })();
    return () => { cancelled = true; };
  }, [departure, arrival]);

  const [selectedMode, setSelectedMode] = useState<TransportMode | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterType | 'Tout'>('Tout');
  const [showDetail, setShowDetail] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showSideMenu, setShowSideMenu] = useState(false);
  const [rating, setRating] = useState(5);
  const [isSheetExpanded, setIsSheetExpanded] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  // Mode chips filter on the modes a journey actually uses, in every category.
  const handleFilterChange = (filter: FilterType | 'Tout') => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setActiveFilter(filter);
  };

  const handleModeChange = (mode: TransportMode) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedMode(selectedMode === mode ? null : mode);
  };

  // Sync incoming search params from Home screen into arrival state
  useEffect(() => {
    const incoming = params.query || params.destination;
    if (incoming && incoming.trim().length > 0) {
      setArrival(incoming.trim());
    }
  }, [params.query, params.destination]);

  // Swap Departure and Arrival locations
  const handleSwapLocations = () => {
    const temp = departure;
    setDeparture(arrival);
    setArrival(temp);
  };

  const modesList: { name: TransportMode; subtitle: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { name: 'Coulé', subtitle: 'Moins cher', icon: 'people' },
    { name: 'Debout', subtitle: 'Juste milieu', icon: 'sparkles' },
    { name: 'Suspendu', subtitle: 'Confort', icon: 'trophy' },
  ];

  // Journeys of the chosen category in the engine's order, or every journey
  // (category leaders first) when no category is selected.
  const departureAt = search?.departureAt ?? new Date();
  const journeys = search?.journeys ?? [];
  const byId = new Map(journeys.map((journey) => [journey.id, journey]));
  const ordered: ApiJourney[] = selectedMode
    ? (search?.categories[CATEGORY_BY_LABEL[selectedMode]] ?? []).map((id) => byId.get(id)).filter((journey): journey is ApiJourney => Boolean(journey))
    : [...journeys].sort((a, b) => (b.categories?.length ?? 0) - (a.categories?.length ?? 0) || a.duration - b.duration);

  const filteredRouteOptions = ordered
    .filter((journey) => activeFilter === 'Tout' || journey.legs.some((leg) => FILTER_MODES[activeFilter].includes(leg.mode)))
    .map((journey) => toRouteOption(journey, departureAt, selectedMode));

  const shownJourney = (selectedId ? byId.get(selectedId) : null) ?? filteredRouteOptions[0]?.journey ?? null;
  const mapPath = journeyPath(shownJourney);
  const categoryPreview = (mode: TransportMode) => {
    const leader = byId.get(search?.categories[CATEGORY_BY_LABEL[mode]]?.[0] ?? '');
    return leader ? `${formatPrice(leader.price)} · ${formatDuration(leader.duration)}` : null;
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      {/* Real OpenStreetMap Interactive Canvas with OSRM Polyline */}
      <OsmMapView
        departureName={departure}
        arrivalName={arrival}
        origin={search?.departure}
        destination={search?.arrival}
        routeCoordinates={mapPath}
        style={styles.backgroundImage}
      />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Top Header Bar */}
        <View style={styles.topHeader}>
          <View style={styles.logoRow}>
            <TouchableOpacity onPress={() => goBack(router)} activeOpacity={0.7} style={styles.backBtnWrapper}>
              <Ionicons name="arrow-back" size={20} color="#000000" />
            </TouchableOpacity>
            <Image
              source={require('@/assets/images/sira-logo-official.png')}
              style={styles.logoImage}
              contentFit="contain"
            />
          </View>

          <View style={styles.headerRightActions}>
            {/* Notification Bell with Red Badge "5" */}
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

            {/* Hamburger Menu */}
            <TouchableOpacity
              style={styles.headerIconButton}
              onPress={() => setShowSideMenu(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="menu" size={24} color="#000000" />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          style={styles.mainScrollView}
          contentContainerStyle={styles.mainScrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Departure & Arrival Card (Interactive Editable Inputs + Swap) */}
          <View style={styles.routeInputCard}>
            <View style={styles.routeTimelineCol}>
              {/* Departure Dot (Orange ring with inner dot) */}
              <View style={styles.deptRingDot}>
                <View style={styles.deptInnerDot} />
              </View>
              {/* Dotted Vertical Line */}
              <View style={styles.verticalDottedLine} />
              {/* Arrival Orange Location Pin */}
              <Ionicons name="location-sharp" size={20} color="#F26522" />
            </View>

            <View style={styles.routeInputsCol}>
              {/* Departure Row */}
              <View style={styles.inputItemRow}>
                <Text style={styles.inputLabel}>Départ</Text>
                {/* A button, not a text field: on web a focused field reopened the
                    picker as soon as it closed. Typing happens in the picker. */}
                <TouchableOpacity onPress={() => setFocusedField('departure')} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Choisir le départ">
                  <Text style={[styles.inputValueInput, !departure && styles.inputPlaceholder]} numberOfLines={1}>
                    {departure || (here.status === 'locating' ? 'Localisation en cours…' : 'D’où partez-vous ?')}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.cardInputDivider} />

              {/* Arrival Row */}
              <View style={styles.inputItemRow}>
                <Text style={styles.inputLabel}>Arrivée</Text>
                <TouchableOpacity onPress={() => setFocusedField('arrival')} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Choisir l’arrivée">
                  <Text style={[styles.inputValueInput, !arrival && styles.inputPlaceholder]} numberOfLines={1}>
                    {arrival || 'Où allez-vous ?'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Interactive Swap Button */}
            <TouchableOpacity
              style={styles.swapButton}
              onPress={handleSwapLocations}
              activeOpacity={0.7}
            >
              <Ionicons name="swap-vertical" size={22} color="#F26522" />
            </TouchableOpacity>
          </View>

          {/* Yango Full Screen Location Selection Modal */}
          <YangoLocationModal
            visible={focusedField !== null}
            onClose={() => setFocusedField(null)}
            initialQuery={pickerQuery(focusedField === 'departure' ? departure : arrival)}
            currentLocationName={here.status === 'ready' ? here.title : 'Ma position actuelle'}
            placeholder={focusedField === 'departure' ? 'D’où partez-vous ?' : 'Où allez-vous ?'}
            onSelectLocation={(selectedLoc) => {
              if (focusedField === 'departure') {
                setDeparture(selectedLoc);
              } else if (focusedField === 'arrival' && !isOwnPosition(selectedLoc)) {
                setArrival(selectedLoc);
              }
              setFocusedField(null);
            }}
          />

          {/* Horizontal Transport Filter Chips Row */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filtersScrollView}
            contentContainerStyle={styles.filtersContentContainer}
          >
            {(['Tout', 'Marche', 'Bus', 'Gbaka', 'wôro-wôro', 'Taxi', 'Yango'] as FilterType[]).map((filterItem) => {
              const isEnabled = !UNAVAILABLE_FILTERS.includes(filterItem);
              const isActive = activeFilter === filterItem && isEnabled;

              const iconName: keyof typeof Ionicons.glyphMap =
                filterItem === 'Tout'
                  ? 'grid'
                  : filterItem === 'Marche'
                  ? 'walk'
                  : filterItem === 'Bus'
                  ? 'bus'
                  : filterItem === 'Gbaka'
                  ? 'bus'
                  : filterItem === 'wôro-wôro'
                  ? 'car-sport'
                  : filterItem === 'Taxi'
                  ? 'car'
                  : 'sparkles';

              return (
                <TouchableOpacity
                  key={filterItem}
                  disabled={!isEnabled}
                  style={[
                    styles.filterChip,
                    isActive && styles.filterChipActive,
                    !isEnabled && styles.filterChipDisabled,
                  ]}
                  onPress={() => isEnabled && handleFilterChange(filterItem)}
                  activeOpacity={isEnabled ? 0.8 : 1}
                >
                  <Ionicons
                    name={iconName}
                    size={14}
                    color={isActive ? '#FFFFFF' : isEnabled ? '#000000' : '#999999'}
                  />
                  <Text
                    style={[
                      styles.filterChipText,
                      isActive && styles.filterChipTextActive,
                      !isEnabled && styles.filterChipTextDisabled,
                    ]}
                  >
                    {filterItem}{isEnabled ? '' : ' · bientôt'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* 3 Main Mode Selection Cards (Coulé, Debout, Suspendu) */}
          <View style={styles.modeCardsRow}>
            {modesList.map((modeItem) => {
              const isSelected = selectedMode === modeItem.name;
              return (
                <TouchableOpacity
                  key={modeItem.name}
                  style={[
                    styles.modeCard,
                    isSelected && styles.modeCardActive,
                  ]}
                  onPress={() => handleModeChange(modeItem.name)}
                  activeOpacity={0.85}
                >
                  <Ionicons name={modeItem.icon} size={17} color="#FFFFFF" />
                  <View style={styles.modeCardTextWrapper}>
                    <Text style={styles.modeCardTitle}>{modeItem.name}</Text>
                    <Text style={styles.modeCardSub}>{modeItem.subtitle}</Text>
                    {categoryPreview(modeItem.name) && <Text style={styles.modeCardPreview}>{categoryPreview(modeItem.name)}</Text>}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Enlarged Map Display View (Real Interactive OpenStreetMap) */}
          <View style={[styles.mapContainer, isSheetExpanded && styles.mapContainerCollapsed]}>
            <OsmMapView
              departureName={departure}
              arrivalName={arrival}
              origin={search?.departure}
              destination={search?.arrival}
              routeCoordinates={mapPath}
              style={styles.mapImage}
            />
          </View>

          {/* Draggable Bottom Sheet Panel for Route Options */}
          <View style={styles.sheetPanelContainer}>
            {/* Draggable Pull Handle Bar */}
            <TouchableOpacity
              style={styles.sheetHandleHeader}
              activeOpacity={0.85}
              onPress={() => {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setIsSheetExpanded((prev) => !prev);
              }}
            >
              {/* Top Drag Indicator Pill */}
              <View style={styles.sheetDragPill} />

              <View style={styles.sheetHeaderContentRow}>
                <View style={styles.sheetHeaderLeftGroup}>
                  <View style={styles.sheetHeaderBadgeIcon}>
                    <Ionicons name="location" size={13} color="#FFFFFF" />
                  </View>
                  <Text style={styles.sheetTitleText}>Itinéraires disponibles</Text>
                  <View style={styles.sheetCountBadge}>
                    <Text style={styles.sheetCountText}>{filteredRouteOptions.length}</Text>
                  </View>
                </View>

                <View style={styles.sheetPullActionHint}>
                  <Text style={styles.sheetPullHintText}>
                    {isSheetExpanded ? 'Réduire' : 'Tirer pour voir tout'}
                  </Text>
                  <Ionicons
                    name={isSheetExpanded ? 'chevron-down' : 'chevron-up'}
                    size={16}
                    color="#F26522"
                  />
                </View>
              </View>
            </TouchableOpacity>

            {/* Route Options Result Cards (Coulé, Debout, Suspendu) */}
            <View style={[styles.resultsContainer, !isSheetExpanded && styles.resultsContainerCollapsed]}>
              {loading && (
                <View style={styles.searchStateRow}>
                  <ActivityIndicator color="#F26522" />
                  <Text style={styles.searchStateText}>SIRA calcule vos trajets…</Text>
                </View>
              )}
              {!departure.trim() && here.status === 'unavailable' && (
                <View style={styles.searchStateRow}>
                  <Ionicons name="locate" size={18} color="#F26522" />
                  <Text style={styles.searchStateText}>Activez la localisation ou saisissez votre point de départ.</Text>
                </View>
              )}
              {!loading && searchError && (
                <View style={styles.searchStateRow}>
                  <Ionicons name="alert-circle" size={18} color="#DC2626" />
                  <Text style={styles.searchStateText}>{searchError}</Text>
                </View>
              )}
              {!loading && !searchError && search && filteredRouteOptions.length === 0 && (
                <View style={styles.searchStateRow}>
                  <Ionicons name="information-circle" size={18} color="#F26522" />
                  <Text style={styles.searchStateText}>Aucun trajet dans cette catégorie pour ce filtre.</Text>
                </View>
              )}
              {!loading && filteredRouteOptions.map((option) => (
              <View
                key={option.id}
                style={[
                  styles.resultCard,
                  option.id === shownJourney?.id && styles.resultCardHighlighted,
                ]}
              >
                {/* Left Column: Title, Steps, Cost, Schedule */}
                <View style={styles.cardLeftCol}>
                  {option.leads.length > 0 && (
                    <View style={styles.leadBadgesRow}>
                      {option.leads.map((lead) => (
                        <Text key={lead} style={styles.leadBadge}>{option.leads.length === 3 ? 'Meilleur choix · 3 catégories' : lead}</Text>
                      )).slice(0, option.leads.length === 3 ? 1 : 3)}
                    </View>
                  )}
                  <Text style={styles.resultModeTitle} numberOfLines={1}>{option.title}</Text>
                  <Text style={styles.resultSubtext} numberOfLines={1}>{option.subtext}</Text>

                  <View style={styles.stepsPillsRow}>
                    {option.steps.map((step, sIdx) => {
                      const isArrowRight = step.type === 'arrow-right';
                      const isArrowLeft = step.type === 'arrow-left';
                      return (
                        <React.Fragment key={sIdx}>
                          <View style={[styles.stepTag, (isArrowRight || isArrowLeft) && styles.arrowStepTag]}>
                            <Ionicons
                              name={
                                isArrowRight
                                  ? 'arrow-forward'
                                  : isArrowLeft
                                  ? 'arrow-back'
                                  : step.type === 'walk'
                                  ? 'walk'
                                  : step.type === 'bus'
                                  ? 'bus'
                                  : 'car'
                              }
                              size={isArrowRight || isArrowLeft ? 12 : 11}
                              color="#FFFFFF"
                            />
                            {step.duration ? <Text style={styles.stepTagText}>{step.duration}</Text> : null}
                          </View>
                          {sIdx < option.steps.length - 1 && (
                            <Text style={styles.stepSeparator}>- -</Text>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </View>

                  <Text style={styles.costText}>
                    Coût : <Text style={styles.boldText}>{option.costRange}</Text>
                  </Text>

                  <Text style={styles.timesText}>
                    Depart : <Text style={styles.boldText}>{option.departureTime}</Text>  Arrivée :{' '}
                    <Text style={styles.boldText}>{option.arrivalTime}</Text>
                  </Text>
                </View>

                {/* Right Column: Traffic, Distance, Duration, Detail Button */}
                <View style={styles.cardRightCol}>
                  {option.trafficStatus ? (
                    <View style={styles.trafficRow}>
                      <Ionicons name="car-sport" size={13} color="#000000" />
                      <Text style={styles.trafficText}>{option.trafficStatus}</Text>
                    </View>
                  ) : null}

                  <Text style={styles.distanceText}>
                    sur <Text style={styles.boldText}>{option.distance}</Text>
                  </Text>

                  <View style={styles.durationWrapper}>
                    <Text style={styles.durationPrefix}>en </Text>
                    <Text style={styles.durationBold}>{option.durationMinutes}</Text>
                    {option.journey.duration < 60 && <Text style={styles.durationUnit}> min</Text>}
                  </View>

                  <TouchableOpacity
                    style={styles.detailPillBtn}
                    onPress={() => {
                      journeyStore.select(option.id);
                      router.push('/route-detail');
                    }}
                    activeOpacity={0.85}
                  >
                    <View style={styles.plusIconCircle}>
                      <Ionicons name="add" size={12} color="#F26522" />
                    </View>
                    <Text style={styles.detailPillBtnText}>Detail</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
            </View>
          </View>
        </ScrollView>

        {/* Full-Screen Detailed Itinerary Breakdown ("Décomposition d'itinéraire") */}
        {showDetail && (
          <View style={styles.fullDecompositionContainer}>
            {/* Top Header Bar */}
            <View style={styles.decompHeaderBar}>
              <TouchableOpacity
                onPress={() => setShowDetail(false)}
                style={styles.backBtnWrapper}
                activeOpacity={0.7}
              >
                <Ionicons name="arrow-back" size={24} color="#000000" />
              </TouchableOpacity>

              <Text style={styles.decompHeaderTitle}>Décomposition d'itinéraire</Text>

              <View style={styles.decompHeaderRightIcons}>
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
                  <Ionicons name="warning" size={22} color="#ED1C24" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Top Half: Interactive Map Section */}
            <View style={styles.decompMapSection}>
              <OsmMapView
                departureName={departure}
                arrivalName={arrival}
                routeCoordinates={mapPath}
                style={styles.decompMapImage}
              />

              {/* Map Route Legend (Top Right) */}
              <View style={styles.mapLegendCard}>
                <View style={styles.legendRowItem}>
                  <View style={[styles.legendLineBar, { backgroundColor: '#F26522' }]} />
                  <Ionicons name="star" size={14} color="#F26522" />
                </View>
                <View style={styles.legendRowItem}>
                  <View style={[styles.legendLineBar, { backgroundColor: '#1E6091' }]} />
                  <Ionicons name="ribbon" size={14} color="#1E6091" />
                </View>
              </View>

              {/* Map Traffic Alerts */}
              <View style={[styles.mapTrafficCallout, styles.accidentCallout]}>
                <Ionicons name="warning-outline" size={14} color="#E53E3E" />
                <View>
                  <Text style={styles.accidentTitle}>Accident</Text>
                  <Text style={styles.accidentSub}>circulation ralentie</Text>
                </View>
              </View>

              <View style={[styles.mapTrafficCallout, styles.routePerturbeeCallout]}>
                <Ionicons name="construct-outline" size={14} color="#F26522" />
                <Text style={styles.routePerturbeeText}>Route perturbée</Text>
              </View>

              {/* Station Badges on Map */}
              <View style={styles.departStationBadge}>
                <Text style={styles.departTag}>DÉPART</Text>
                <Text style={styles.departName}>Abobo Sanmake</Text>
              </View>

              {/* Floating Orange Navigation Compass Button */}
              <TouchableOpacity style={styles.mapCompassFab} activeOpacity={0.85}>
                <Ionicons name="navigate" size={22} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {/* Bottom Half: Detailed Timeline Itinerary Breakdown */}
            <ScrollView
              style={styles.decompScrollView}
              contentContainerStyle={styles.decompScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.decompTimelineRowLayout}>
                {/* Left Vertical Dashed Line Bar */}
                <View style={styles.timelineDashedLine} />

                {/* Timeline Steps */}
                <View style={styles.timelineStepsCol}>
                  {/* Step 1: Walk */}
                  <View style={styles.stepItemRow}>
                    <View style={styles.stepCircleIcon}>
                      <Ionicons name="walk" size={18} color="#FFFFFF" />
                    </View>
                    <View style={styles.stepInfoCol}>
                      <Text style={styles.stepTitleText}>Marchez pendant 6 min</Text>
                      <Text style={styles.stepDescText}>
                        Depuis Abobo Terminus jusqu'à <Text style={styles.boldText}>Gare d'Adjamé</Text>.
                      </Text>
                      <Text style={styles.stepMetaText}>09:20 → 09:26 • 450 m</Text>
                    </View>
                  </View>

                  {/* Step 2: Bus 22 */}
                  <View style={styles.stepItemRow}>
                    <View style={styles.stepCircleIcon}>
                      <Ionicons name="bus" size={18} color="#FFFFFF" />
                    </View>
                    <View style={styles.stepInfoCol}>
                      <Text style={styles.stepTitleText}>Prenez le Bus 22 pendant 20 min</Text>
                      <Text style={styles.stepDescText}>
                        Direction <Text style={styles.boldText}>Riviera Palmeraie</Text>.
                      </Text>
                      <Text style={styles.stepDescText}>
                        Montez à <Text style={styles.boldText}>Gare d'Adjamé</Text> et descendez au <Text style={styles.boldText}>Rond-Point de la Riviera</Text>.
                      </Text>
                      <Text style={styles.stepCostText}>Coût estimé : 200 FCFA</Text>
                      <Text style={styles.stepMetaText}>09:26 → 09:46</Text>
                    </View>
                  </View>

                  {/* Step 3: Taxi */}
                  <View style={styles.stepItemRow}>
                    <View style={styles.stepCircleIcon}>
                      <Ionicons name="car" size={18} color="#FFFFFF" />
                    </View>
                    <View style={styles.stepInfoCol}>
                      <Text style={styles.stepTitleText}>Prenez un taxi pendant 7 min</Text>
                      <Text style={styles.stepDescText}>
                        Depuis le <Text style={styles.boldText}>Rond-Point de la Riviera</Text> jusqu'à <Text style={styles.boldText}>Cocody Riviera 3</Text>.
                      </Text>
                      <Text style={styles.stepCostText}>Coût estimé : 1 000 FCFA</Text>
                      <Text style={styles.stepMetaText}>09:46 → 09:53 • 3,2 km</Text>
                    </View>
                  </View>

                  {/* Step 4: Walk */}
                  <View style={styles.stepItemRow}>
                    <View style={styles.stepCircleIcon}>
                      <Ionicons name="walk" size={18} color="#FFFFFF" />
                    </View>
                    <View style={styles.stepInfoCol}>
                      <Text style={styles.stepTitleText}>Marchez pendant 5 min</Text>
                      <Text style={styles.stepDescText}>
                        Il ne vous reste plus qu'à marcher jusqu'à votre destination.
                      </Text>
                      <Text style={styles.stepMetaText}>09:53 → 09:58 • 350 m</Text>
                    </View>
                  </View>

                  {/* Step 5: Destination Pin */}
                  <View style={styles.stepItemRow}>
                    <View style={[styles.stepCircleIcon, { backgroundColor: '#F26522' }]}>
                      <Ionicons name="location-sharp" size={18} color="#FFFFFF" />
                    </View>
                    <View style={styles.stepInfoCol}>
                      <Text style={styles.destTitleText}>{arrival || 'Orange Digital Center'}</Text>
                      <Text style={styles.stepDescText}>
                        Vous êtes bien arrivé ! Votre trajet est terminé.
                      </Text>
                      <View style={styles.destActionsRow}>
                        <TouchableOpacity style={styles.actionIconBtn} activeOpacity={0.7}>
                          <Ionicons name="thumbs-up-outline" size={18} color="#222222" />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.actionIconBtn} activeOpacity={0.7}>
                          <Ionicons name="share-social-outline" size={18} color="#222222" />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.actionIconBtn} activeOpacity={0.7}>
                          <Ionicons name="bookmark-outline" size={18} color="#222222" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                </View>

                {/* Floating Assistant Speech Bubble + Character + Start Button (Right Side) */}
                <View style={styles.assistantColumn}>
                  {/* Floating Speech Bubble */}
                  <View style={styles.floatingBubbleBox}>
                    <Text style={styles.bubbleText}>
                      Voici comment <Text style={styles.bubbleBoldText}>vous</Text> allez <Text style={styles.bubbleBoldText}>rejoindre</Text> votre destination.
                    </Text>
                  </View>

                  {/* 3D Character Assistant pointing hand to timeline */}
                  <Image
                    source={require('@/assets/images/sira-character-assistant.png')}
                    style={styles.pointingCharacterImg}
                    contentFit="contain"
                  />

                  {/* Orange Floating Start Itinerary FAB */}
                  <TouchableOpacity
                    style={styles.startFabButton}
                    onPress={() => setShowFeedback(true)}
                    activeOpacity={0.85}
                  >
                    <View style={styles.startFabInnerCircle}>
                      <Ionicons name="navigate-sharp" size={14} color="#F26522" />
                    </View>
                    <Text style={styles.startFabText}>Démarrer l'itinéraire</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          </View>
        )}

        {/* Feedback Rating Popup Modal */}
        {showFeedback && (
          <View style={styles.feedbackModalOverlay}>
            <View style={styles.feedbackCard}>
              <TouchableOpacity
                style={styles.feedbackClose}
                onPress={() => setShowFeedback(false)}
              >
                <Ionicons name="close" size={20} color="#666666" />
              </TouchableOpacity>

              <Image
                source={require('@/assets/images/sira-character-assistant.png')}
                style={styles.feedbackAvatar}
                contentFit="contain"
              />

              <Text style={styles.feedbackTitle}>
                Comment s'est passé votre trajet ?
              </Text>
              <Text style={styles.feedbackSub}>
                Votre avis nous aide à améliorer SIRA.
              </Text>

              <View style={styles.starsRow}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <TouchableOpacity
                    key={star}
                    onPress={() => setRating(star)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={star <= rating ? 'star' : 'star-outline'}
                      size={28}
                      color="#F26522"
                    />
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={styles.submitFeedbackBtn}
                onPress={() => setShowFeedback(false)}
                activeOpacity={0.85}
              >
                <Text style={styles.submitFeedbackText}>Envoyer mon avis</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Side Menu Drawer Modal */}
        <SideMenuModal
          visible={showSideMenu}
          onClose={() => setShowSideMenu(false)}
        />

        {/* WhatsApp-style Bottom Navigation Bar */}
        <CustomBottomTabBar activeTab="explore" />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
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
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: '#FFFFFF',
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backBtnWrapper: {
    padding: 4,
  },
  logoImage: {
    width: 120,
    height: 42,
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
    top: 0,
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
  mainScrollView: {
    flex: 1,
  },
  mainScrollContent: {
    paddingBottom: 140,
  },
  routeInputCard: {
    marginHorizontal: 16,
    marginTop: 2,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
    borderWidth: 1,
    borderColor: '#EEEEEE',
  },
  routeTimelineCol: {
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  deptRingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#F26522',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deptInnerDot: {
    width: 3.5,
    height: 3.5,
    borderRadius: 1.75,
    backgroundColor: '#F26522',
  },
  verticalDottedLine: {
    width: 1,
    height: 10,
    borderWidth: 1,
    borderColor: '#CCCCCC',
    borderStyle: 'dashed',
    marginVertical: 1,
  },
  routeInputsCol: {
    flex: 1,
  },
  inputItemRow: {
    paddingVertical: 0,
  },
  inputLabel: {
    fontSize: 9.5,
    color: '#888888',
    fontWeight: '500',
  },
  inputPlaceholder: {
    color: '#999999',
    fontWeight: '500',
  },
  inputValueInput: {
    fontSize: 11.5,
    color: '#000000',
    fontWeight: '700',
    marginTop: -3,
    padding: 0,
  },
  cardInputDivider: {
    height: 1,
    backgroundColor: '#EEEEEE',
    marginVertical: 1.5,
  },
  swapButton: {
    padding: 4,
    marginLeft: 4,
    backgroundColor: '#FFF4EE',
    borderRadius: 12,
  },
  filtersScrollView: {
    marginTop: 4,
    maxHeight: 34,
  },
  filtersContentContainer: {
    paddingHorizontal: 16,
    gap: 6,
    alignItems: 'center',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFEFEF',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 16,
    gap: 5,
  },
  filterChipActive: {
    backgroundColor: '#F26522',
  },
  filterChipDisabled: {
    backgroundColor: '#E5E7EB',
    opacity: 0.45,
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#333333',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  filterChipTextDisabled: {
    color: '#9CA3AF',
  },
  modeCardsRow: {
    flexDirection: 'row',
    gap: 6,
    marginHorizontal: 16,
    marginTop: 12,
  },
  modeCard: {
    flex: 1,
    backgroundColor: '#000000',
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  modeCardActive: {
    borderColor: '#F26522',
    backgroundColor: '#F26522',
  },
  modeCardTextWrapper: {
    alignItems: 'center',
    marginTop: 1,
  },
  vipBadgeText: {
    fontSize: 7,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  modeCardTitle: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  modeCardPreview: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 2,
  },
  searchStateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 6,
  },
  searchStateText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#333333',
  },
  leadBadgesRow: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 2,
  },
  leadBadge: {
    fontSize: 9,
    fontWeight: '800',
    color: '#F26522',
    backgroundColor: '#FFF4EE',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  resultSubtext: {
    fontSize: 10,
    color: '#666666',
    marginTop: 1,
  },
  modeCardSub: {
    fontSize: 9,
    color: '#CCCCCC',
    marginTop: 1,
  },
  mapContainer: {
    marginHorizontal: 16,
    marginTop: 10,
    height: 360,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  mapContainerCollapsed: {
    height: 210,
  },
  mapImage: {
    width: '100%',
    height: '100%',
  },
  sheetPanelContainer: {
    marginTop: -16,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  sheetHandleHeader: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 12,
    paddingHorizontal: 18,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  sheetDragPill: {
    width: 42,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#CBD5E1',
    marginBottom: 10,
  },
  sheetHeaderContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  sheetHeaderLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sheetHeaderBadgeIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#F26522',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheetTitleText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  sheetCountBadge: {
    backgroundColor: '#FFF4EE',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#FFD7C2',
  },
  sheetCountText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#F26522',
  },
  sheetPullActionHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sheetPullHintText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#F26522',
  },
  resultsContainerCollapsed: {
    maxHeight: 280,
    overflow: 'hidden',
  },
  sectionHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 2,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionHeaderIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F26522',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionHeaderTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1A1A1A',
    letterSpacing: 0.2,
  },
  sectionHeaderBadge: {
    backgroundColor: '#F26522',
    borderRadius: 9,
    paddingHorizontal: 7,
    paddingVertical: 2,
    minWidth: 20,
    alignItems: 'center',
  },
  sectionHeaderBadgeText: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontWeight: '900',
  },
  resultsContainer: {
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 10,
    gap: 6,
  },
  resultCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#FAFAFA',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 6,
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 3,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  resultCardHighlighted: {
    borderColor: '#F26522',
    backgroundColor: '#FFFFFF',
  },
  cardLeftCol: {
    flex: 1,
    paddingRight: 8,
    justifyContent: 'space-between',
  },
  cardRightCol: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  cardRow1: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  cardRow2: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  cardRow3: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  cardRow4: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 1,
  },
  resultModeTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#000000',
  },
  stepsPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 2,
    marginBottom: 2,
    flexWrap: 'wrap',
  },
  stepTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F26522',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
    gap: 2,
  },
  arrowStepTag: {
    paddingHorizontal: 3,
    paddingVertical: 1.5,
    borderRadius: 6,
    backgroundColor: '#F26522',
  },
  stepTagText: {
    color: '#FFFFFF',
    fontSize: 9.5,
    fontWeight: '700',
  },
  stepSeparator: {
    color: '#333333',
    fontSize: 9,
    fontWeight: '700',
  },
  costText: {
    fontSize: 10.5,
    color: '#333333',
    lineHeight: 14,
  },
  timesText: {
    fontSize: 10.5,
    color: '#333333',
    lineHeight: 14,
    marginTop: 1,
  },
  boldText: {
    fontWeight: '700',
    color: '#000000',
  },
  resultRightStats: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  trafficRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  trafficText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#000000',
  },
  distanceText: {
    fontSize: 10.5,
    color: '#333333',
    marginTop: 1,
  },
  durationWrapper: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginVertical: 2,
  },
  durationPrefix: {
    fontSize: 11,
    color: '#000000',
    fontWeight: '500',
  },
  durationBold: {
    fontSize: 19,
    fontWeight: '900',
    color: '#000000',
  },
  durationUnit: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#000000',
  },
  detailPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F26522',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
    gap: 4,
    shadowColor: '#F26522',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.22,
    shadowRadius: 3,
    elevation: 2,
  },
  plusIconCircle: {
    width: 13,
    height: 13,
    borderRadius: 6.5,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailPillBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  detailModalOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
    zIndex: 100,
  },
  detailModalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '80%',
  },
  detailModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  detailModalTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#000000',
  },
  closeDetailBtn: {
    padding: 4,
  },
  tipBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF4EE',
    padding: 12,
    borderRadius: 14,
    marginBottom: 16,
    gap: 12,
  },
  tipAvatar: {
    width: 40,
    height: 40,
  },
  tipText: {
    flex: 1,
    fontSize: 12,
    color: '#333333',
    fontWeight: '600',
  },
  timelineList: {
    gap: 14,
    marginBottom: 20,
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  timelineInfo: {
    flex: 1,
  },
  timelineTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#000000',
  },
  timelineSub: {
    fontSize: 11,
    color: '#666666',
    marginTop: 1,
  },
  confirmNavBtn: {
    backgroundColor: '#F26522',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 24,
    gap: 8,
  },
  confirmNavText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  fullDecompositionContainer: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#FFFFFF',
    zIndex: 150,
  },
  decompHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  decompHeaderTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#000000',
  },
  decompHeaderRightIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  decompMapSection: {
    height: height * 0.38,
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#EAEAEA',
  },
  decompMapImage: {
    width: '100%',
    height: '100%',
  },
  mapLegendCard: {
    position: 'absolute',
    top: 12,
    right: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 6,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  legendRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendLineBar: {
    width: 24,
    height: 4,
    borderRadius: 2,
  },
  mapTrafficCallout: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
  accidentCallout: {
    top: '32%',
    right: '15%',
    borderColor: '#E53E3E',
  },
  accidentTitle: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#E53E3E',
  },
  accidentSub: {
    fontSize: 9.5,
    color: '#E53E3E',
  },
  routePerturbeeCallout: {
    top: '60%',
    left: '40%',
    borderColor: '#F26522',
  },
  routePerturbeeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#F26522',
  },
  departStationBadge: {
    position: 'absolute',
    top: 14,
    left: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  departTag: {
    backgroundColor: '#00875A',
    color: '#FFFFFF',
    fontSize: 8.5,
    fontWeight: '900',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  departName: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#000000',
    marginTop: 2,
  },
  mapCompassFab: {
    position: 'absolute',
    bottom: 14,
    right: 14,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F26522',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#F26522',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  decompScrollView: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  decompScrollContent: {
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  decompTimelineRowLayout: {
    flexDirection: 'row',
    position: 'relative',
  },
  timelineDashedLine: {
    position: 'absolute',
    left: 18,
    top: 10,
    bottom: 40,
    width: 6,
    backgroundColor: '#000000',
    borderRadius: 3,
  },
  timelineStepsCol: {
    flex: 1.2,
    paddingLeft: 0,
    gap: 20,
  },
  stepItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  stepCircleIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#F26522',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
    shadowColor: '#F26522',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  stepInfoCol: {
    flex: 1,
    paddingTop: 2,
  },
  stepTitleText: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#000000',
  },
  stepDescText: {
    fontSize: 12.5,
    color: '#444444',
    marginTop: 2,
    lineHeight: 17,
  },
  stepCostText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#333333',
    marginTop: 3,
  },
  stepMetaText: {
    fontSize: 11.5,
    color: '#777777',
    fontWeight: '600',
    marginTop: 3,
  },
  destTitleText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#F26522',
  },
  destActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 8,
  },
  actionIconBtn: {
    padding: 4,
  },
  assistantColumn: {
    width: 140,
    alignItems: 'center',
    justifyContent: 'flex-end',
    position: 'relative',
    paddingLeft: 6,
  },
  floatingBubbleBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#EAEAEA',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
    marginBottom: 8,
  },
  bubbleText: {
    fontSize: 11,
    color: '#333333',
    lineHeight: 15,
  },
  bubbleBoldText: {
    fontWeight: '900',
    color: '#000000',
  },
  pointingCharacterImg: {
    width: 130,
    height: 190,
    marginBottom: 12,
  },
  startFabButton: {
    backgroundColor: '#F26522',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 22,
    gap: 6,
    shadowColor: '#F26522',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  startFabInnerCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  startFabText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  feedbackModalOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 200,
  },
  feedbackCard: {
    width: '90%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    alignItems: 'center',
    position: 'relative',
  },
  feedbackClose: {
    position: 'absolute',
    top: 14,
    right: 14,
    padding: 4,
  },
  feedbackAvatar: {
    width: 70,
    height: 70,
    marginBottom: 10,
  },
  feedbackTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#000000',
    textAlign: 'center',
  },
  feedbackSub: {
    fontSize: 12,
    color: '#666666',
    marginTop: 4,
    textAlign: 'center',
  },
  starsRow: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 16,
  },
  submitFeedbackBtn: {
    backgroundColor: '#F26522',
    width: '100%',
    paddingVertical: 12,
    borderRadius: 20,
    alignItems: 'center',
  },
  submitFeedbackText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  exploreSuggestionsWrapper: {
    marginTop: -8,
    marginBottom: 12,
    zIndex: 50,
  },
});
