import React, { useState, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  TextInput,
  Modal,
  Dimensions,
  Platform,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { CustomBottomTabBar } from '@/components/custom-bottom-tab-bar';
import { useFavorites } from '@/hooks/use-favorites';
import { goBack } from '@/lib/navigation';

const { width } = Dimensions.get('window');

export interface HistoryItem {
  id: string;
  departure: string;
  arrival: string;
  title: string;
  option: string;
  transport: string;
  duration: string;
  costMin: string;
  costMax: string;
  costRange: string;
  date: string;
}

const MOCK_HISTORY: HistoryItem[] = [
  {
    id: '1',
    departure: 'Abobo Samaké',
    arrival: 'Orange Digital Center',
    title: "D’Abobo Samaké à Orange Digital Center",
    option: 'Coulé',
    transport: 'Gbaka',
    duration: '24 min',
    costMin: '500F',
    costMax: '1.500F',
    costRange: 'entre 500F et 1.500F',
    date: "Aujourd'hui, 08:30",
  },
  {
    id: '2',
    departure: 'Abobo Samaké',
    arrival: 'Orange Digital Center',
    title: "D’Abobo Samaké à Orange Digital Center",
    option: 'Coulé',
    transport: 'Gbaka',
    duration: '24 min',
    costMin: '500F',
    costMax: '1.500F',
    costRange: 'entre 500F et 1.500F',
    date: 'Hier, 17:45',
  },
  {
    id: '3',
    departure: 'Abobo Samaké',
    arrival: 'Orange Digital Center',
    title: "D’Abobo Samaké à Orange Digital Center",
    option: 'Coulé',
    transport: 'Gbaka',
    duration: '24 min',
    costMin: '500F',
    costMax: '1.500F',
    costRange: 'entre 500F et 1.500F',
    date: '18 Sep, 09:15',
  },
  {
    id: '4',
    departure: 'Abobo Samaké',
    arrival: 'Orange Digital Center',
    title: "D’Abobo Samaké à Orange Digital Center",
    option: 'Coulé',
    transport: 'Gbaka',
    duration: '24 min',
    costMin: '500F',
    costMax: '1.500F',
    costRange: 'entre 500F et 1.500F',
    date: '17 Sep, 14:20',
  },
  {
    id: '5',
    departure: 'Abobo Samaké',
    arrival: 'Orange Digital Center',
    title: "D’Abobo Samaké à Orange Digital Center",
    option: 'Coulé',
    transport: 'Gbaka',
    duration: '24 min',
    costMin: '500F',
    costMax: '1.500F',
    costRange: 'entre 500F et 1.500F',
    date: '15 Sep, 08:10',
  },
  {
    id: '6',
    departure: 'Abobo Samaké',
    arrival: 'Orange Digital Center',
    title: "D’Abobo Samaké à Orange Digital Center",
    option: 'Coulé',
    transport: 'Gbaka',
    duration: '24 min',
    costMin: '500F',
    costMax: '1.500F',
    costRange: 'entre 500F et 1.500F',
    date: '14 Sep, 19:00',
  },
  {
    id: '7',
    departure: 'Abobo Samaké',
    arrival: 'Orange Digital Center',
    title: "D’Abobo Samaké à Orange Digital Center",
    option: 'Coulé',
    transport: 'Gbaka',
    duration: '24 min',
    costMin: '500F',
    costMax: '1.500F',
    costRange: 'entre 500F et 1.500F',
    date: '12 Sep, 10:45',
  },
];

export default function HistoryScreen() {
  const router = useRouter();
  const { addFavorite } = useFavorites();
  const [historyList, setHistoryList] = useState<HistoryItem[]>(MOCK_HISTORY);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [selectedItem, setSelectedItem] = useState<HistoryItem | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const filteredHistory = useMemo(() => {
    if (!searchQuery.trim()) return historyList;
    const q = searchQuery.toLowerCase();
    return historyList.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.transport.toLowerCase().includes(q) ||
        item.option.toLowerCase().includes(q) ||
        item.departure.toLowerCase().includes(q) ||
        item.arrival.toLowerCase().includes(q)
    );
  }, [historyList, searchQuery]);

  const handleOpenDetail = (item: HistoryItem) => {
    setSelectedItem(item);
    setIsDetailOpen(true);
  };

  const handleOpenMenu = (item: HistoryItem) => {
    setSelectedItem(item);
    setIsMenuOpen(true);
  };

  const handleDeleteItem = () => {
    if (selectedItem) {
      setHistoryList((prev) => prev.filter((i) => i.id !== selectedItem.id));
    }
    setIsMenuOpen(false);
    setSelectedItem(null);
  };

  const handleRepeatRoute = () => {
    if (selectedItem) {
      handleOpenDetail(selectedItem);
    }
    setIsMenuOpen(false);
    setSelectedItem(null);
  };

  const handleAddToFavorites = () => {
    setIsMenuOpen(false);
    if (selectedItem) {
      addFavorite({
        departure: selectedItem.departure,
        arrival: selectedItem.arrival,
        title: selectedItem.title,
        mode: selectedItem.option,
        transport: selectedItem.transport,
        duration: selectedItem.duration,
        costRange: selectedItem.costRange,
      });
      Alert.alert('Favoris', `Le trajet "${selectedItem.title}" a été ajouté à vos favoris.`);
    }
    setSelectedItem(null);
  };

  const handleShareRoute = () => {
    setIsMenuOpen(false);
    if (selectedItem) {
      Alert.alert('Partager', `Lien de partage généré pour le trajet "${selectedItem.title}".`);
    }
    setSelectedItem(null);
  };

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
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyStateContainer}>
              <Ionicons name="time-outline" size={48} color="#CBD5E1" />
              <Text style={styles.emptyStateTitle}>Aucun historique trouvé</Text>
              <Text style={styles.emptyStateSubtitle}>
                {searchQuery
                  ? 'Aucun résultat ne correspond à votre recherche.'
                  : "Vous n'avez pas encore de trajets enregistrés."}
              </Text>
            </View>
          }
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
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {item.title}
                </Text>

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
                  <Text style={styles.valueSpan}>{item.option}</Text>
                  <Text style={styles.spacerSpan}>      </Text>
                  <Text style={styles.labelSpan}>Transport : </Text>
                  <Text style={styles.valueSpan}>{item.transport}</Text>
                  <Text style={styles.spacerSpan}>      </Text>
                  <Text style={styles.labelSpan}>Durée : </Text>
                  <Text style={styles.valueSpan}>{item.duration}</Text>
                </Text>

                {/* Row 2: Coût */}
                <Text style={styles.detailsLine}>
                  <Text style={styles.labelSpan}>Coût : entre </Text>
                  <Text style={styles.valueSpan}>{item.costMin}</Text>
                  <Text style={styles.labelSpan}> et </Text>
                  <Text style={styles.valueSpan}>{item.costMax}</Text>
                </Text>
              </View>

              {/* Action Button: Détail du trajet */}
              <TouchableOpacity
                style={styles.detailButton}
                onPress={() => handleOpenDetail(item)}
                activeOpacity={0.85}
              >
                <View style={styles.plusIconCircle}>
                  <Ionicons name="add" size={14} color="#F26522" />
                </View>
                <Text style={styles.detailButtonText}>Détail du trajet</Text>
              </TouchableOpacity>
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
                <Text style={styles.menuOptionText}>Supprimer de l'historique</Text>
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
                <Ionicons name="checkmark-circle" size={16} color="#16A34A" />
                <Text style={styles.completedBadgeText}>Trajet effectué</Text>
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
            <Text style={styles.historyDetailDate}>{selectedItem?.date}</Text>
            <Text style={styles.historyDetailTitle}>{selectedItem?.title}</Text>

            {/* Departure & Arrival Timeline */}
            <View style={styles.historyTimelineBox}>
              <View style={styles.historyTimelineRow}>
                <Ionicons name="ellipse" size={12} color="#F26522" />
                <Text style={styles.historyTimelineLabel}>Départ : </Text>
                <Text style={styles.historyTimelineValue}>{selectedItem?.departure}</Text>
              </View>
              <View style={styles.historyTimelineRow}>
                <Ionicons name="location" size={14} color="#F26522" />
                <Text style={styles.historyTimelineLabel}>Arrivée : </Text>
                <Text style={styles.historyTimelineValue}>{selectedItem?.arrival}</Text>
              </View>
            </View>

            {/* Details Badges */}
            <View style={styles.historyMetaGrid}>
              <View style={styles.metaBadgeItem}>
                <Text style={styles.metaBadgeLabel}>Option</Text>
                <Text style={styles.metaBadgeValue}>{selectedItem?.option}</Text>
              </View>
              <View style={styles.metaBadgeItem}>
                <Text style={styles.metaBadgeLabel}>Transport</Text>
                <Text style={styles.metaBadgeValue}>{selectedItem?.transport}</Text>
              </View>
              <View style={styles.metaBadgeItem}>
                <Text style={styles.metaBadgeLabel}>Durée</Text>
                <Text style={styles.metaBadgeValue}>{selectedItem?.duration}</Text>
              </View>
              <View style={styles.metaBadgeItem}>
                <Text style={styles.metaBadgeLabel}>Coût payé</Text>
                <Text style={styles.metaBadgeValue}>{selectedItem?.costRange}</Text>
              </View>
            </View>

            {/* Action Buttons */}
            <View style={styles.historyActionsCol}>
              <TouchableOpacity
                style={styles.historyRepeatBtn}
                onPress={() => {
                  setIsDetailOpen(false);
                  handleRepeatRoute();
                }}
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
  cardTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    color: '#000000',
    marginLeft: 10,
    marginRight: 6,
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

