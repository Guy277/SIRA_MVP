import React from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Text, TextInput } from '@/components/sira-text';
import { Ionicons } from '@expo/vector-icons';
import { searchPlaces, type PlaceResult } from '@/lib/sira-api';
import { knownPlace, placeLabel, rememberPlace } from '@/lib/places';
import { SAVED_PLACE_LABELS, savePlace, useSavedPlaces, type SavedPlaceKind } from '@/lib/saved-places';

const SAVED_PLACE_ICONS: Record<SavedPlaceKind, keyof typeof Ionicons.glyphMap> = { home: 'home', work: 'briefcase' };
const SAVED_PLACE_PROMPTS: Record<SavedPlaceKind, string> = { home: 'ta maison', work: 'ton travail' };

export interface LocationItem {
  id: string;
  title: string;
  subtitle: string;
  duration?: string;
  iconName: keyof typeof Ionicons.glyphMap;
  iconType?: 'location' | 'school' | 'shopping' | 'food';
}

export const SIRA_ABIDJAN_LOCATIONS: LocationItem[] = [
  {
    id: 'loc-1',
    title: 'Orange Digital Center',
    subtitle: 'Plateau, Rue du Commerce, Abidjan',
    duration: '12 min',
    iconName: 'business-outline',
  },
  {
    id: 'loc-2',
    title: 'Abobo Samaké',
    subtitle: 'Abobo, Rond-point de la Gare, Abidjan',
    duration: '24 min',
    iconName: 'bus-outline',
  },
  {
    id: 'loc-3',
    title: 'Cocody Saint-Jean',
    subtitle: 'Cocody, Boulevard de France, Abidjan',
    duration: '15 min',
    iconName: 'location-outline',
  },
  {
    id: 'loc-4',
    title: 'Yopougon Sipores',
    subtitle: 'Yopougon, Autoroute du Nord, Abidjan',
    duration: '28 min',
    iconName: 'navigate-outline',
  },
  {
    id: 'loc-5',
    title: 'Plateau Cité Administrative',
    subtitle: 'Plateau, Avenue Marchand, Abidjan',
    duration: '18 min',
    iconName: 'business-outline',
  },
  {
    id: 'loc-6',
    title: 'Adjamé Gare Routière',
    subtitle: 'Adjamé, Boulevard Nangui Abrogoua, Abidjan',
    duration: '20 min',
    iconName: 'bus-outline',
  },
  {
    id: 'loc-7',
    title: 'Aéroport Int. Félix Houphouët-Boigny',
    subtitle: "Port-Bouët, Route de l'Aéroport, Abidjan",
    duration: '35 min',
    iconName: 'airplane-outline',
  },
  {
    id: 'loc-8',
    title: 'Marcory Zone 4',
    subtitle: 'Marcory, Rue Pierre et Marie Curie, Abidjan',
    duration: '22 min',
    iconName: 'bag-handle-outline',
  },
  {
    id: 'loc-9',
    title: 'Treichville Gare Bassam',
    subtitle: 'Treichville, Avenue Christiani, Abidjan',
    duration: '16 min',
    iconName: 'subway-outline',
  },
  {
    id: 'loc-10',
    title: 'Riviera 2 Anono',
    subtitle: 'Cocody, Boulevard Hassan II, Abidjan',
    duration: '25 min',
    iconName: 'location-outline',
  },
];

interface LocationSuggestionsListProps {
  query?: string;
  onQueryChange?: (text: string) => void;
  onSelectLocation: (locationTitle: string) => void;
  onUseCurrentLocation?: () => void;
  onBackPress?: () => void;
  onOpenMap?: () => void;
  currentLocationName?: string;
  // Small label above the header's place (« Je suis ici », « Je pars de »).
  headerLabel?: string;
  showFullHeader?: boolean;
  placeholder?: string;
}

export function LocationSuggestionsList({
  query = '',
  onQueryChange,
  onSelectLocation,
  onUseCurrentLocation,
  onBackPress,
  onOpenMap,
  currentLocationName = 'Ma position',
  headerLabel = 'Je suis ici',
  showFullHeader = true,
  placeholder = 'Quartier, gare, carrefour, lieu…',
}: LocationSuggestionsListProps) {
  const filteredLocations = SIRA_ABIDJAN_LOCATIONS.filter((item) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase().trim();
    return (
      item.title.toLowerCase().includes(q) ||
      item.subtitle.toLowerCase().includes(q)
    );
  });

  // Real places from the SIRA API (Photon / OpenStreetMap), debounced.
  const [results, setResults] = React.useState<PlaceResult[]>([]);
  const [searching, setSearching] = React.useState(false);
  React.useEffect(() => {
    const text = query.trim();
    if (text.length < 3) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setSearching(true);
      searchPlaces(text)
        .then((places) => { if (!cancelled) setResults(places); })
        .catch(() => { if (!cancelled) setResults([]); })
        .finally(() => { if (!cancelled) setSearching(false); });
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query]);

  // « Maison » / « Travail »: while one is being set, the next place touched with
  // known coordinates becomes that address instead of a destination.
  const savedPlaces = useSavedPlaces();
  const [assigning, setAssigning] = React.useState<SavedPlaceKind | null>(null);

  const assign = (kind: SavedPlaceKind, title: string, subtitle: string, coordinates: { latitude: number; longitude: number }) => {
    savePlace(kind, { title, subtitle, ...coordinates });
    setAssigning(null);
    onQueryChange?.('');
  };

  const selectResult = (place: PlaceResult) => {
    rememberPlace(place.title, place.coordinates);
    if (assigning) assign(assigning, place.title, place.subtitle, place.coordinates);
    else onSelectLocation(place.title);
  };

  const selectShortcut = (item: LocationItem) => {
    const coordinates = knownPlace(item.title);
    if (!assigning) onSelectLocation(item.title);
    else if (coordinates) assign(assigning, item.title, item.subtitle, coordinates);
  };

  return (
    <View style={styles.screenContainer}>
      {/* Top Header Section (Exact Yango Header) */}
      {showFullHeader && (
        <View style={styles.topHeaderBar}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={onBackPress}
            activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="arrow-back" size={24} color="#000000" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.headerTitleContainer}
            onPress={onUseCurrentLocation}
            activeOpacity={0.8}
          >
            <Text style={styles.headerSublabel}>{headerLabel}</Text>
            <View style={styles.headerTitleRow}>
              <Text style={styles.headerTitleText} numberOfLines={1}>
                {placeLabel(currentLocationName)}
              </Text>
              <Ionicons name="chevron-forward-circle" size={16} color="#000000" style={{ marginLeft: 4 }} />
            </View>
          </TouchableOpacity>

          <View style={{ width: 24 }} />
        </View>
      )}

      {/* Search Input Bar (Exact Yango Search Bar) */}
      <View style={styles.searchBarWrapper}>
        <View style={styles.searchBarInputContainer}>
          <Ionicons name="search-outline" size={20} color="#777777" style={styles.searchIcon} />
          <TextInput
            style={styles.searchTextInput}
            placeholder={assigning ? `Adresse de ${SAVED_PLACE_PROMPTS[assigning]}…` : placeholder}
            placeholderTextColor="#888888"
            value={query}
            onChangeText={onQueryChange}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={styles.verticalDivider} />
          <TouchableOpacity onPress={onOpenMap} activeOpacity={0.7} style={styles.carteButton}>
            <Text style={styles.carteText}>Carte</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Suggestions Items List */}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContentContainer}
      >
        {/* Setting « Maison » or « Travail »: what to do, and a way out */}
        {assigning && (
          <View style={styles.assignBanner}>
            <Text style={styles.assignBannerText}>
              Cherche l’adresse de {SAVED_PLACE_PROMPTS[assigning]}, puis touche-la pour l’enregistrer.
            </Text>
            <View style={styles.assignBannerActions}>
              {savedPlaces[assigning] && (
                <TouchableOpacity
                  onPress={() => { savePlace(assigning, null); setAssigning(null); }}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                >
                  <Text style={styles.assignBannerLink}>Retirer</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => setAssigning(null)} activeOpacity={0.7} accessibilityRole="button">
                <Text style={styles.assignBannerLink}>Annuler</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* One-touch « Maison » and « Travail » (Yango, Google Maps); long press to change */}
        {!assigning && query.trim().length === 0 && (
          <View style={styles.savedPlacesRow}>
            {(['home', 'work'] as const).map((kind) => {
              const place = savedPlaces[kind];
              return (
                <TouchableOpacity
                  key={kind}
                  style={styles.savedPlaceChip}
                  onPress={() => (place ? onSelectLocation(place.title) : setAssigning(kind))}
                  onLongPress={() => setAssigning(kind)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={place
                    ? `${SAVED_PLACE_LABELS[kind]} : ${place.title}. Appui long pour changer.`
                    : `Ajouter l’adresse de ${SAVED_PLACE_PROMPTS[kind]}`}
                >
                  <View style={[styles.savedPlaceIcon, !place && styles.savedPlaceIconEmpty]}>
                    <Ionicons name={SAVED_PLACE_ICONS[kind]} size={14} color={place ? '#FFFFFF' : '#F26522'} />
                  </View>
                  <View style={styles.savedPlaceTextCol}>
                    <Text style={styles.savedPlaceLabel}>{SAVED_PLACE_LABELS[kind]}</Text>
                    <Text style={styles.savedPlaceValue} numberOfLines={1}>{place ? place.title : 'Ajouter'}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Point at the place on the map instead of typing it (Uber, Yango). */}
        {onOpenMap && !assigning && query.trim().length === 0 && (
          <TouchableOpacity style={styles.locationCardRow} onPress={onOpenMap} activeOpacity={0.7} accessibilityRole="button">
            <View style={[styles.iconSquareBadge, styles.mapBadge]}>
              <Ionicons name="map" size={22} color="#FFFFFF" />
            </View>
            <View style={styles.locationTextCol}>
              <Text style={styles.locationTitle} numberOfLines={1}>Choisir sur la carte</Text>
              <Text style={styles.locationSubtitle} numberOfLines={1}>Déplace l’épingle jusqu’au bon endroit</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#F26522" />
          </TouchableOpacity>
        )}

        {/* Clickable Custom Typed Destination Option */}
        {/* A typed text has no coordinates yet: it cannot become « Maison » or « Travail ». */}
        {query.trim().length > 0 && !assigning && (
          <TouchableOpacity
            style={styles.customQueryRow}
            onPress={() => onSelectLocation(query.trim())}
            activeOpacity={0.7}
          >
            <View style={styles.customIconSquareBadge}>
              <Ionicons name="location-sharp" size={20} color="#FFFFFF" />
            </View>

            <View style={styles.locationTextCol}>
              <Text style={styles.customQueryTitle} numberOfLines={1}>
                « {query.trim()} »
              </Text>
              <Text style={styles.locationSubtitle} numberOfLines={1}>
                Rechercher cet endroit à Abidjan
              </Text>
            </View>

            <Ionicons name="chevron-forward" size={18} color="#F26522" />
          </TouchableOpacity>
        )}

        {searching && <ActivityIndicator style={styles.searchingIndicator} color="#F26522" />}

        {/* Search results from OpenStreetMap (hidden for queries under 3 letters) */}
        {query.trim().length >= 3 && results.map((place, index) => (
          <TouchableOpacity
            key={`result-${index}-${place.coordinates.latitude}`}
            style={styles.locationCardRow}
            onPress={() => selectResult(place)}
            activeOpacity={0.7}
          >
            <View style={styles.iconSquareBadge}>
              <Ionicons name="location-outline" size={22} color="#F26522" />
            </View>
            <View style={styles.locationTextCol}>
              <Text style={styles.locationTitle} numberOfLines={1}>{place.title}</Text>
              <Text style={styles.locationSubtitle} numberOfLines={1}>{place.subtitle}</Text>
            </View>
          </TouchableOpacity>
        ))}

        {/* Frequent places shortcuts */}
        {filteredLocations.filter((item) => !assigning || knownPlace(item.title)).map((item) => (
          <TouchableOpacity
            key={item.id}
            style={styles.locationCardRow}
            onPress={() => selectShortcut(item)}
            activeOpacity={0.7}
          >
            {/* Left Rounded Square Icon Badge */}
            <View style={styles.iconSquareBadge}>
              <Ionicons name={item.iconName} size={22} color="#777777" />
            </View>

            {/* Center Title and Subtitle */}
            <View style={styles.locationTextCol}>
              <Text style={styles.locationTitle} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={styles.locationSubtitle} numberOfLines={1}>
                {item.subtitle}
              </Text>
            </View>

          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  searchingIndicator: {
    marginVertical: 10,
  },
  screenContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  topHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 6,
    backgroundColor: '#FFFFFF',
  },
  backButton: {
    padding: 4,
  },
  headerTitleContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSublabel: {
    fontSize: 13,
    color: '#555555',
    fontWeight: '400',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 1,
  },
  headerTitleText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#000000',
  },
  searchBarWrapper: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
  },
  searchBarInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F2F4',
    borderRadius: 24,
    height: 48,
    paddingHorizontal: 14,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchTextInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '400',
    color: '#000000',
    paddingVertical: 0,
  },
  verticalDivider: {
    width: 1,
    height: 22,
    backgroundColor: '#D1D1D6',
    marginHorizontal: 10,
  },
  mapBadge: {
    backgroundColor: '#F26522',
  },
  savedPlacesRow: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 8,
  },
  savedPlaceChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F2F4',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  savedPlaceIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F26522',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  savedPlaceIconEmpty: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F26522',
  },
  savedPlaceTextCol: {
    flex: 1,
  },
  savedPlaceLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000000',
  },
  savedPlaceValue: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 1,
  },
  assignBanner: {
    backgroundColor: '#FFF3EC',
    borderRadius: 14,
    padding: 12,
    marginVertical: 8,
  },
  assignBannerText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111111',
    lineHeight: 20,
  },
  assignBannerActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 18,
    marginTop: 8,
  },
  assignBannerLink: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F26522',
  },
  carteButton: {
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  carteText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
    textDecorationLine: 'underline',
  },
  listContentContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
  },
  locationCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  customQueryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    marginBottom: 4,
  },
  iconSquareBadge: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#F2F2F4',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  customIconSquareBadge: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#F26522',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  locationTextCol: {
    flex: 1,
    marginRight: 10,
  },
  locationTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 3,
  },
  customQueryTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F26522',
    marginBottom: 3,
  },
  locationSubtitle: {
    fontSize: 13,
    color: '#8E8E93',
    fontWeight: '400',
  },
  durationText: {
    fontSize: 13.5,
    fontWeight: '400',
    color: '#8E8E93',
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#888888',
    textAlign: 'center',
  },
});
