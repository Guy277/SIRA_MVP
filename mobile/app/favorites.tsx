import React, { useState, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  TextInput,
  Modal,
  Platform,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFavorites, FavoriteRoute } from '@/hooks/use-favorites';
import { CustomBottomTabBar } from '@/components/custom-bottom-tab-bar';
import { goBack } from '@/lib/navigation';

export default function FavoritesScreen() {
  const router = useRouter();
  const { favorites, removeFavorite } = useFavorites();

  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [selectedItem, setSelectedItem] = useState<FavoriteRoute | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const filteredFavorites = useMemo(() => {
    if (!searchQuery.trim()) return favorites;
    const q = searchQuery.toLowerCase();
    return favorites.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.transport.toLowerCase().includes(q) ||
        item.mode.toLowerCase().includes(q) ||
        item.departure.toLowerCase().includes(q) ||
        item.arrival.toLowerCase().includes(q)
    );
  }, [favorites, searchQuery]);

  const handleOpenDetail = (item: FavoriteRoute) => {
    router.push({
      pathname: '/route-detail',
      params: {
        departure: item.departure,
        arrival: item.arrival,
        mode: item.mode,
        suboption: item.transport,
        costRange: item.costRange,
        durationMinutes: item.duration.replace(' min', ''),
      },
    });
  };

  const handleOpenMenu = (item: FavoriteRoute) => {
    setSelectedItem(item);
    setIsMenuOpen(true);
  };

  const handleRemove = (item: FavoriteRoute) => {
    Alert.alert(
      'Retirer des favoris',
      `Voulez-vous retirer le trajet "${item.title}" de vos favoris ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Retirer',
          style: 'destructive',
          onPress: () => removeFavorite(item.id),
        },
      ]
    );
  };

  const handleRepeatRoute = () => {
    if (selectedItem) {
      handleOpenDetail(selectedItem);
    }
    setIsMenuOpen(false);
    setSelectedItem(null);
  };

  const handleRemoveFromMenu = () => {
    if (selectedItem) {
      removeFavorite(selectedItem.id);
    }
    setIsMenuOpen(false);
    setSelectedItem(null);
  };

  const handleShareRoute = () => {
    if (selectedItem) {
      Alert.alert('Partager', `Lien de partage généré pour le trajet "${selectedItem.title}".`);
    }
    setIsMenuOpen(false);
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
            style={styles.darkBackBtn}
            onPress={() => goBack(router)}
            activeOpacity={0.8}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Mes favoris</Text>

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
              size={22}
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
              placeholder="Rechercher un trajet favori..."
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

        {/* Favorite Cards List */}
        <FlatList
          data={filteredFavorites}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyStateContainer}>
              <Ionicons name="heart-dislike-outline" size={56} color="#CBD5E1" />
              <Text style={styles.emptyStateTitle}>Aucun favori enregistré</Text>
              <Text style={styles.emptyStateSubtitle}>
                {searchQuery
                  ? 'Aucun résultat ne correspond à votre recherche.'
                  : 'Ajoutez vos trajets réguliers en favoris depuis l’historique ou le détail des trajets pour les retrouver ici à tout moment.'}
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

                {/* Title (Slightly reduced font size) */}
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {item.title}
                </Text>

                {/* Right Action Icons (Heart + Three Dots) */}
                <View style={styles.cardActionsGroup}>
                  <TouchableOpacity
                    style={styles.heartButton}
                    onPress={() => handleRemove(item)}
                    activeOpacity={0.7}
                    hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                  >
                    <Ionicons name="heart" size={22} color="#F26522" />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.optionsButton}
                    onPress={() => handleOpenMenu(item)}
                    activeOpacity={0.7}
                    hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                  >
                    <Ionicons name="ellipsis-vertical" size={20} color="#000000" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Card Meta Details (Reduced font sizes for clean fit) */}
              <View style={styles.detailsContainer}>
                {/* Row 1: Option & Transport */}
                <Text style={styles.detailsLine}>
                  <Text style={styles.labelSpan}>Option : </Text>
                  <Text style={styles.valueSpan}>{item.mode}</Text>
                  <Text style={styles.spacerSpan}>    </Text>
                  <Text style={styles.labelSpan}>Transport : </Text>
                  <Text style={styles.valueSpan}>{item.transport}</Text>
                </Text>

                {/* Row 2: Durée */}
                <Text style={styles.detailsLine}>
                  <Text style={styles.labelSpan}>Durée : </Text>
                  <Text style={styles.valueSpan}>{item.duration}</Text>
                </Text>

                {/* Row 3: Coût */}
                <Text style={styles.detailsLine}>
                  <Text style={styles.labelSpan}>Coût : </Text>
                  <Text style={styles.valueSpan}>{item.costRange}</Text>
                </Text>
              </View>

              {/* Action Button: Détail du trajet */}
              <TouchableOpacity
                style={styles.detailButton}
                onPress={() => handleOpenDetail(item)}
                activeOpacity={0.85}
              >
                <View style={styles.plusIconCircle}>
                  <Ionicons name="add" size={13} color="#F26522" />
                </View>
                <Text style={styles.detailButtonText}>Détail du trajet</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      </SafeAreaView>

      {/* Item Options Modal / Bottom Sheet Popup */}
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

              {/* Option 2: Retirer des favoris */}
              <TouchableOpacity
                style={styles.menuOptionRow}
                onPress={handleRemoveFromMenu}
                activeOpacity={0.7}
              >
                <View style={styles.darkIconCircle}>
                  <Ionicons name="heart-dislike-outline" size={18} color="#F26522" />
                </View>
                <Text style={styles.menuOptionText}>Retirer des favoris</Text>
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

              {/* Option 4: Supprimer */}
              <TouchableOpacity
                style={styles.menuOptionRow}
                onPress={handleRemoveFromMenu}
                activeOpacity={0.7}
              >
                <View style={styles.darkIconCircle}>
                  <Ionicons name="trash-outline" size={18} color="#F26522" />
                </View>
                <Text style={styles.menuOptionText}>Supprimer des favoris</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Bottom Navigation Bar */}
      <CustomBottomTabBar activeTab="profile" />
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
  darkBackBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#1E1E1E',
    justifyContent: 'center',
    alignItems: 'center',
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
    paddingBottom: 100,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
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
        elevation: 2,
      },
    }),
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  iconCircleBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F26522',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pinPathImage: {
    width: 24,
    height: 24,
    tintColor: '#FFFFFF',
  },
  cardTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    color: '#000000',
    marginLeft: 8,
    marginRight: 4,
    lineHeight: 17,
  },
  cardActionsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  heartButton: {
    padding: 2,
  },
  optionsButton: {
    padding: 2,
  },
  detailsContainer: {
    marginBottom: 8,
    paddingLeft: 2,
  },
  detailsLine: {
    fontSize: 11.5,
    color: '#475569',
    marginBottom: 2,
    lineHeight: 16,
  },
  labelSpan: {
    fontWeight: '400',
    color: '#475569',
    fontSize: 11.5,
  },
  valueSpan: {
    fontWeight: '800',
    color: '#000000',
    fontSize: 11.5,
  },
  spacerSpan: {
    fontSize: 10,
  },
  detailButton: {
    backgroundColor: '#F26522',
    borderRadius: 20,
    paddingVertical: 5,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  plusIconCircle: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  detailButtonText: {
    fontSize: 11.5,
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
    lineHeight: 18,
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
});
