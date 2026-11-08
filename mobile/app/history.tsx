import React, { useState, useMemo } from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
  FlatList,
  Modal,
  Platform,
  Share,
} from 'react-native';
import { Text, TextInput } from '@/components/sira-text';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CustomBottomTabBar, useTabBarSpace } from '@/components/custom-bottom-tab-bar';
import { useFavorites } from '@/hooks/use-favorites';
import { formatDuration, formatPrice } from '@/lib/journey-format';
import { goBack } from '@/lib/navigation';
import { notify } from '@/lib/notify';
import { rememberPlace } from '@/lib/places';
import {
  CATEGORY_NAMES, clearTripHistory, deleteTrip, searchTrips, tripTitle, useTripHistory, whenLabel, type TripRecord,
} from '@/lib/trip-history';

// The traveller's real trips, recorded on the phone when a guidance starts (lib/trip-history.ts).
// Figures are SIRA-MORE's estimates at that moment, never the price actually paid.
const option = (trip: TripRecord) => (trip.category ? CATEGORY_NAMES[trip.category] : 'Autre trajet');

export default function HistoryScreen() {
  // The list ends above the bottom bar (its last item stays reachable on small phones).
  const tabBarSpace = useTabBarSpace();
  const router = useRouter();
  const { addFavorite } = useFavorites();
  const trips = useTripHistory();
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [selectedItem, setSelectedItem] = useState<TripRecord | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const filteredHistory = useMemo(() => searchTrips(trips, searchQuery), [trips, searchQuery]);

  const handleOpenDetail = (item: TripRecord) => {
    setSelectedItem(item);
    setIsDetailOpen(true);
  };

  const handleOpenMenu = (item: TripRecord) => {
    setSelectedItem(item);
    setIsMenuOpen(true);
  };

  const handleDeleteItem = () => {
    if (selectedItem) deleteTrip(selectedItem.id);
    setIsMenuOpen(false);
    setSelectedItem(null);
  };

  // Same departure and arrival, journeys computed again for now (prices and lines may have changed).
  const repeat = (trip: TripRecord) => {
    rememberPlace(trip.from.name, { latitude: trip.from.latitude, longitude: trip.from.longitude });
    rememberPlace(trip.to.name, { latitude: trip.to.latitude, longitude: trip.to.longitude });
    router.push({ pathname: '/(tabs)/explore', params: { destination: trip.to.name, query: trip.to.name, from: trip.from.name } });
  };

  const handleRepeatRoute = () => {
    const trip = selectedItem;
    setIsMenuOpen(false);
    setIsDetailOpen(false);
    setSelectedItem(null);
    if (trip) repeat(trip);
  };

  const handleAddToFavorites = () => {
    setIsMenuOpen(false);
    if (selectedItem) {
      const title = tripTitle(selectedItem);
      addFavorite({
        departure: selectedItem.from.name,
        arrival: selectedItem.to.name,
        title,
        mode: option(selectedItem),
        transport: selectedItem.transport,
        duration: formatDuration(selectedItem.durationMin),
        costRange: formatPrice(selectedItem.priceF),
      });
      notify('Favoris', `Le trajet « ${title} » a été ajouté à tes favoris.`);
    }
    setSelectedItem(null);
  };

  // The phone's own sharing (WhatsApp, SMS…), with the trip in words.
  const handleShareRoute = async () => {
    const trip = selectedItem;
    setIsMenuOpen(false);
    setSelectedItem(null);
    if (!trip) return;
    try {
      await Share.share({ message: `Mon trajet SIRA : ${trip.from.name} → ${trip.to.name}. ${trip.transport}, ${formatDuration(trip.durationMin)}, ${formatPrice(trip.priceF)}.` });
    } catch {
      notify('Partage impossible', 'Ce téléphone ne permet pas de partager depuis ici.');
    }
  };

  const handleClearAll = () => notify('Effacer l’historique', 'Tous tes trajets seront supprimés de ce téléphone.', [
    { text: 'Effacer', onPress: clearTripHistory },
    { text: 'Annuler', onPress: () => {} },
  ]);

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      {/* Map Pattern Overlay Background */}
      <Image
        source={require('@/assets/images/explore-map-bg.png')}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
      />
      <View style={[StyleSheet.absoluteFill, styles.lightOverlay]} />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Header Bar */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.headerIconButton}
            onPress={() => goBack(router)}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="arrow-back" size={24} color="#000000" />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Historiques</Text>

          <TouchableOpacity
            style={styles.headerIconButton}
            onPress={() => {
              setIsSearching((prev) => !prev);
              if (isSearching) setSearchQuery('');
            }}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons
              name={isSearching ? 'close' : 'search'}
              size={24}
              color="#000000"
            />
          </TouchableOpacity>
        </View>

        {/* Expandable Search Input Bar */}
        {isSearching && (
          <View style={styles.searchBarContainer}>
            <Ionicons name="search" size={18} color="#64748B" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Rechercher un trajet, lieu..."
              placeholderTextColor="#94A3B8"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={18} color="#94A3B8" />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* History Cards List */}
        <FlatList
          data={filteredHistory}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContent, { paddingBottom: tabBarSpace }]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyStateContainer}>
              <Ionicons name="time-outline" size={48} color="#CBD5E1" />
              <Text style={styles.emptyStateTitle}>{searchQuery ? 'Aucun trajet trouvé' : 'Pas encore de trajet'}</Text>
              <Text style={styles.emptyStateSubtitle}>
                {searchQuery
                  ? 'Aucun trajet ne correspond à ta recherche.'
                  : 'Lance un itinéraire : il apparaîtra ici, prêt à être refait en un toucher. Ton historique reste sur ce téléphone.'}
              </Text>
            </View>
          }
          ListFooterComponent={trips.length > 0 && !searchQuery ? (
            <TouchableOpacity style={styles.clearAllButton} onPress={handleClearAll} activeOpacity={0.7} accessibilityRole="button">
              <Ionicons name="trash-outline" size={15} color="#B91C1C" />
              <Text style={styles.clearAllText}>Effacer l’historique</Text>
            </TouchableOpacity>
          ) : undefined}
          renderItem={({ item }) => (
            <View style={styles.card}>
              {/* Card Header Row */}
              <View style={styles.cardHeaderRow}>
                {/* Orange Circle Badge with Pin Path Vector Icon */}
                <View style={styles.iconCircleBadge}>
                  <Image
                    source={require('@/assets/images/pin-path-decor.png')}
                    style={styles.pinPathImage}
                    contentFit="contain"
                  />
                </View>

                {/* Title */}
                <View style={styles.cardTitleBox}>
                  <Text style={styles.cardTitle} numberOfLines={2}>{tripTitle(item)}</Text>
                  <Text style={styles.cardDate}>{whenLabel(item.at)}{item.finished ? ' · arrivé' : ''}</Text>
                </View>

                {/* Three Dots Menu Button */}
                <TouchableOpacity
                  style={styles.optionsButton}
                  onPress={() => handleOpenMenu(item)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="ellipsis-vertical" size={20} color="#000000" />
                </TouchableOpacity>
              </View>

              {/* Card Meta Details */}
              <View style={styles.detailsContainer}>
                {/* Row 1: Option | Transport | Durée */}
                <Text style={styles.detailsLine}>
                  <Text style={styles.labelSpan}>Option : </Text>
                  <Text style={styles.valueSpan}>{option(item)}</Text>
                  <Text style={styles.spacerSpan}>      </Text>
                  <Text style={styles.labelSpan}>Durée : </Text>
                  <Text style={styles.valueSpan}>{formatDuration(item.durationMin)}</Text>
                </Text>
                <Text style={styles.detailsLine} numberOfLines={1}>
                  <Text style={styles.labelSpan}>Transport : </Text>
                  <Text style={styles.valueSpan}>{item.transport}</Text>
                </Text>

                {/* Row 2: estimated cost when the trip was computed */}
                <Text style={styles.detailsLine}>
                  <Text style={styles.labelSpan}>Coût estimé : </Text>
                  <Text style={styles.valueSpan}>{formatPrice(item.priceF)}</Text>
                </Text>
              </View>

              {/* Action Button: Détail du trajet */}
              <View style={styles.cardActions}>
                <TouchableOpacity style={styles.detailButton} onPress={() => repeat(item)} activeOpacity={0.85} accessibilityRole="button">
                  <View style={styles.plusIconCircle}>
                    <Ionicons name="refresh" size={12} color="#F26522" />
                  </View>
                  <Text style={styles.detailButtonText}>Refaire ce trajet</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.detailLink} onPress={() => handleOpenDetail(item)} activeOpacity={0.7} accessibilityRole="button">
                  <Text style={styles.detailLinkText}>Détail</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      </SafeAreaView>

      {/* Item Options Modal / Action Popup */}
      <Modal
        visible={isMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsMenuOpen(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setIsMenuOpen(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={styles.blackMenuCard}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Top Right Orange Close Button */}
            <TouchableOpacity
              style={styles.closeOrangeBtn}
              onPress={() => setIsMenuOpen(false)}
              activeOpacity={0.8}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={14} color="#000000" />
            </TouchableOpacity>

            <View style={styles.menuItemsList}>
              {/* Option 1: Refaire ce trajet */}
              <TouchableOpacity
                style={styles.menuOptionRow}
                onPress={handleRepeatRoute}
                activeOpacity={0.7}
              >
                <View style={styles.darkIconCircle}>
                  <Ionicons name="refresh" size={18} color="#F26522" />
                </View>
                <Text style={styles.menuOptionText}>Refaire ce trajet</Text>
              </TouchableOpacity>

              {/* Option 2: Ajouter aux favoris */}
              <TouchableOpacity
                style={styles.menuOptionRow}
                onPress={handleAddToFavorites}
                activeOpacity={0.7}
              >
                <View style={styles.darkIconCircle}>
                  <Ionicons name="bookmark-outline" size={18} color="#F26522" />
                </View>
                <Text style={styles.menuOptionText}>Ajouter aux favoris</Text>
              </TouchableOpacity>

              {/* Option 3: Partager ce trajet */}
              <TouchableOpacity
                style={styles.menuOptionRow}
                onPress={handleShareRoute}
                activeOpacity={0.7}
              >
                <View style={styles.darkIconCircle}>
                  <Ionicons name="share-social-outline" size={18} color="#F26522" />
                </View>
                <Text style={styles.menuOptionText}>Partager ce trajet</Text>
              </TouchableOpacity>

              {/* Option 4: Supprimer de l'historique */}
              <TouchableOpacity
                style={styles.menuOptionRow}
                onPress={handleDeleteItem}
                activeOpacity={0.7}
              >
                <View style={styles.darkIconCircle}>
                  <Ionicons name="trash-outline" size={18} color="#F26522" />
                </View>
                <Text style={styles.menuOptionText}>Supprimer de l’historique</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* History Completed Trip Detail Modal */}
      <Modal
        visible={isDetailOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setIsDetailOpen(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setIsDetailOpen(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={styles.historyDetailCard}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <View style={styles.historyDetailHeader}>
              <View style={styles.completedBadge}>
                <Ionicons name={selectedItem?.finished ? 'checkmark-circle' : 'navigate-circle'} size={16} color="#16A34A" />
                <Text style={styles.completedBadgeText}>{selectedItem?.finished ? 'Arrivé à destination' : 'Trajet commencé'}</Text>
              </View>
              <TouchableOpacity
                style={styles.closeOrangeBtn}
                onPress={() => setIsDetailOpen(false)}
                activeOpacity={0.8}
              >
                <Ionicons name="close" size={14} color="#000000" />
              </TouchableOpacity>
            </View>

            {/* Date & Title */}
            <Text style={styles.historyDetailDate}>{selectedItem ? whenLabel(selectedItem.at) : ''}</Text>
            <Text style={styles.historyDetailTitle}>{selectedItem ? tripTitle(selectedItem) : ''}</Text>

            {/* Departure & Arrival Timeline */}
            <View style={styles.historyTimelineBox}>
              <View style={styles.historyTimelineRow}>
                <Ionicons name="ellipse" size={12} color="#F26522" />
                <Text style={styles.historyTimelineLabel}>Départ : </Text>
                <Text style={styles.historyTimelineValue}>{selectedItem?.from.name}</Text>
              </View>
              <View style={styles.historyTimelineRow}>
                <Ionicons name="location" size={14} color="#F26522" />
                <Text style={styles.historyTimelineLabel}>Arrivée : </Text>
                <Text style={styles.historyTimelineValue}>{selectedItem?.to.name}</Text>
              </View>
            </View>

            {/* Details Badges */}
            <View style={styles.historyMetaGrid}>
              <View style={styles.metaBadgeItem}>
                <Text style={styles.metaBadgeLabel}>Option</Text>
                <Text style={styles.metaBadgeValue}>{selectedItem ? option(selectedItem) : ''}</Text>
              </View>
              <View style={styles.metaBadgeItem}>
                <Text style={styles.metaBadgeLabel}>Transport</Text>
                <Text style={styles.metaBadgeValue} numberOfLines={2}>{selectedItem?.transport}</Text>
              </View>
              <View style={styles.metaBadgeItem}>
                <Text style={styles.metaBadgeLabel}>Durée</Text>
                <Text style={styles.metaBadgeValue}>{selectedItem ? formatDuration(selectedItem.durationMin) : ''}</Text>
              </View>
              <View style={styles.metaBadgeItem}>
                <Text style={styles.metaBadgeLabel}>Coût estimé</Text>
                <Text style={styles.metaBadgeValue}>{selectedItem ? formatPrice(selectedItem.priceF) : ''}</Text>
              </View>
            </View>

            {/* Action Buttons */}
            <View style={styles.historyActionsCol}>
              <TouchableOpacity
                style={styles.historyRepeatBtn}
                onPress={handleRepeatRoute}
                activeOpacity={0.85}
              >
                <Ionicons name="refresh" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.historyRepeatText}>Refaire ce même trajet</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.historyFavBtn}
                onPress={() => {
                  setIsDetailOpen(false);
                  handleAddToFavorites();
                }}
                activeOpacity={0.85}
              >
                <Ionicons name="bookmark-outline" size={18} color="#F26522" style={{ marginRight: 6 }} />
                <Text style={styles.historyFavText}>Ajouter aux favoris</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Bottom Navigation Bar */}
      <CustomBottomTabBar />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F6F8',
  },
  lightOverlay: {
    backgroundColor: 'rgba(245, 246, 248, 0.93)',
  },
  safeArea: {
    flex: 1,
  },
  header: {
    height: 54,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'transparent',
  },
  headerIconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#000000',
    letterSpacing: -0.3,
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
  },
  card: {
    backgroundColor: '#F8F9FB',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 14,
    marginBottom: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
      },
      android: {
        elevation: 1.5,
      },
    }),
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  iconCircleBadge: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#F26522',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pinPathImage: {
    width: 26,
    height: 26,
    tintColor: '#FFFFFF',
  },
  cardTitleBox: {
    flex: 1,
    marginLeft: 10,
    marginRight: 6,
  },
  cardDate: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  detailLink: {
    paddingVertical: 6,
  },
  detailLinkText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F26522',
    textDecorationLine: 'underline',
  },
  clearAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
  },
  clearAllText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#B91C1C',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#000000',
    lineHeight: 20,
  },
  optionsButton: {
    padding: 4,
  },
  detailsContainer: {
    marginBottom: 12,
    paddingLeft: 2,
  },
  detailsLine: {
    fontSize: 13,
    color: '#475569',
    marginBottom: 4,
    lineHeight: 18,
  },
  labelSpan: {
    fontWeight: '400',
    color: '#475569',
  },
  valueSpan: {
    fontWeight: '800',
    color: '#000000',
  },
  spacerSpan: {
    fontSize: 12,
  },
  detailButton: {
    backgroundColor: '#F26522',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  plusIconCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  detailButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  emptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  emptyStateTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#334155',
    marginTop: 12,
    marginBottom: 6,
  },
  emptyStateSubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  blackMenuCard: {
    width: '100%',
    backgroundColor: '#000000',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: Platform.OS === 'ios' ? 38 : 24,
    position: 'relative',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
  },
  closeOrangeBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#F26522',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  menuItemsList: {
    paddingTop: 8,
  },
  menuOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  darkIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#262626',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  menuOptionText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.1,
  },

  /* History Completed Trip Detail Modal Styles */
  historyDetailCard: {
    width: '90%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  historyDetailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  completedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
  },
  completedBadgeText: {
    color: '#16A34A',
    fontSize: 12,
    fontWeight: '800',
  },
  historyDetailDate: {
    fontSize: 12,
    color: '#888888',
    fontWeight: '600',
    marginBottom: 2,
  },
  historyDetailTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#000000',
    marginBottom: 16,
  },
  historyTimelineBox: {
    backgroundColor: '#F8F9FA',
    borderRadius: 14,
    padding: 12,
    gap: 10,
    marginBottom: 16,
  },
  historyTimelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  historyTimelineLabel: {
    fontSize: 13,
    color: '#666666',
    fontWeight: '500',
  },
  historyTimelineValue: {
    fontSize: 14,
    color: '#000000',
    fontWeight: '800',
  },
  historyMetaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  metaBadgeItem: {
    width: '47%',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 10,
  },
  metaBadgeLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
    marginBottom: 2,
  },
  metaBadgeValue: {
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '800',
  },
  historyActionsCol: {
    gap: 10,
  },
  historyRepeatBtn: {
    backgroundColor: '#F26522',
    borderRadius: 20,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyRepeatText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  historyFavBtn: {
    backgroundColor: '#FFF5F0',
    borderWidth: 1.5,
    borderColor: '#F26522',
    borderRadius: 20,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyFavText: {
    color: '#F26522',
    fontSize: 14,
    fontWeight: '800',
  },
});

