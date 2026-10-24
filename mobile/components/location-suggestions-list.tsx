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
import { FIXED_PLACES, setPlaceAddress, useSavedPlaces, type PlaceAddress, type SavedPlace } from '@/lib/saved-places';

// « l'adresse de ta maison », « l'adresse de « Chez Maman » ».
const addressOf = (id: string, label: string) => (id === 'home' ? 'ta maison' : id === 'work' ? 'ton travail' : `« ${label} »`);

// Choosing an address instead of a destination (« Mes lieux », or a place set from
// the search): only places with known coordinates can be picked.
export type AddressPick = {
  prompt: string;
  onPick: (address: PlaceAddress) => void;
  onCancel: () => void;
  onRemove?: () => void;
};

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
  pickAddress?: AddressPick;
  // « Mes lieux » after the traveller's places, to add, rename or delete them.
  onManagePlaces?: () => void;
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
  pickAddress,
  onManagePlaces,
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

  // The traveller's places in one touch. Maison or Travail without an address, or a long
  // press on a place: the next place touched with known coordinates becomes its address.
  const savedPlaces = useSavedPlaces();
  const [assigning, setAssigning] = React.useState<{ id: string; label: string } | null>(null);
  const picking: AddressPick | undefined = pickAddress ?? (assigning ? {
    prompt: `Adresse de ${addressOf(assigning.id, assigning.label)}`,
    onPick: (address) => { setPlaceAddress(assigning.id, address); setAssigning(null); onQueryChange?.(''); },
    onCancel: () => setAssigning(null),
    onRemove: (assigning.id === 'home' || assigning.id === 'work') && savedPlaces.some((place) => place.id === assigning.id)
      ? () => { setPlaceAddress(assigning.id, null); setAssigning(null); }
      : undefined,
  } : undefined);
  // The map picks a destination: setting a place's address from a chip, it is offered by « Mes lieux » instead.
  const openMap = assigning ? undefined : onOpenMap;
  type EmptySlot ={ id: 'home' | 'work'; label: string; icon: string; empty: true };
  const slots: (SavedPlace | EmptySlot)[] = [
    savedPlaces.find((place) => place.id === 'home') ?? { ...FIXED_PLACES.home, empty: true },
    savedPlaces.find((place) => place.id === 'work') ?? { ...FIXED_PLACES.work, empty: true },
    ...savedPlaces.filter((place) => place.kind === 'custom'),
  ];

  const selectResult = (place: PlaceResult) => {
    rememberPlace(place.title, place.coordinates);
    if (picking) picking.onPick({ title: place.title, subtitle: place.subtitle, ...place.coordinates });
    else onSelectLocation(place.title);
  };

  const selectShortcut = (item: LocationItem) => {
    const coordinates = knownPlace(item.title);
    if (!picking) onSelectLocation(item.title);
    else if (coordinates) picking.onPick({ title: item.title, subtitle: item.subtitle, ...coordinates });
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
            placeholder={picking ? `${picking.prompt}…` : placeholder}
            placeholderTextColor="#888888"
            value={query}
            onChangeText={onQueryChange}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {openMap && (
            <>
              <View style={styles.verticalDivider} />
              <TouchableOpacity onPress={openMap} activeOpacity={0.7} style={styles.carteButton}>
                <Text style={styles.carteText}>Carte</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      {/* Suggestions Items List */}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContentContainer}
      >
        {/* Choosing an address: what to do, and a way out */}
        {picking && (
          <View style={styles.assignBanner}>
            <Text style={styles.assignBannerText}>
              {picking.prompt} : cherche-la ou choisis-la sur la carte, puis touche-la pour l’enregistrer.
            </Text>
            <View style={styles.assignBannerActions}>
              {picking.onRemove && (
                <TouchableOpacity onPress={picking.onRemove} activeOpacity={0.7} accessibilityRole="button">
                  <Text style={styles.assignBannerLink}>Retirer l’adresse</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={picking.onCancel} activeOpacity={0.7} accessibilityRole="button">
                <Text style={styles.assignBannerLink}>Annuler</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* The traveller's places in one touch (Yango, Google Maps); long press to change the address */}
        {!picking && query.trim().length === 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.savedPlacesRow}
            keyboardShouldPersistTaps="handled"
          >
            {slots.map((place) => {
              const empty = 'empty' in place;
              return (
                <TouchableOpacity
                  key={place.id}
                  style={styles.savedPlaceChip}
                  onPress={() => (empty ? setAssigning({ id: place.id, label: place.label }) : onSelectLocation(place.title))}
                  onLongPress={() => setAssigning({ id: place.id, label: place.label })}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={empty
                    ? `Ajouter l’adresse de ${addressOf(place.id, place.label)}`
                    : `${place.label} : ${place.title}. Appui long pour changer l’adresse.`}
                >
                  <View style={[styles.savedPlaceIcon, empty && styles.savedPlaceIconEmpty]}>
                    <Ionicons name={place.icon as keyof typeof Ionicons.glyphMap} size={14} color={empty ? '#F26522' : '#FFFFFF'} />
                  </View>
                  <View style={styles.savedPlaceTextCol}>
                    <Text style={styles.savedPlaceLabel} numberOfLines={1}>{place.label}</Text>
                    <Text style={styles.savedPlaceValue} numberOfLines={1}>{empty ? 'Ajouter' : place.title}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
            {onManagePlaces && (
              <TouchableOpacity
                style={[styles.savedPlaceChip, styles.managePlacesChip]}
                onPress={onManagePlaces}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Mes lieux : ajouter, renommer ou supprimer"
              >
                <View style={[styles.savedPlaceIcon, styles.savedPlaceIconEmpty]}>
                  <Ionicons name="add" size={16} color="#F26522" />
                </View>
                <Text style={styles.savedPlaceLabel}>Mes lieux</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        )}

        {/* Point at the place on the map instead of typing it (Uber, Yango). */}
        {openMap && query.trim().length === 0 && (
          <TouchableOpacity style={styles.locationCardRow} onPress={openMap} activeOpacity={0.7} accessibilityRole="button">
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
        {query.trim().length > 0 && !picking && (
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
        {filteredLocations.filter((item) => !picking || knownPlace(item.title)).map((item) => (
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
    gap: 10,
    paddingVertical: 8,
  },
  savedPlaceChip: {
    width: 150,
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
  managePlacesChip: {
    width: 'auto',
    paddingRight: 16,
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
