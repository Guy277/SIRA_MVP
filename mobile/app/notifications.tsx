import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Dimensions,
  Platform,
  SafeAreaView,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { CustomBottomTabBar } from '@/components/custom-bottom-tab-bar';

const { width } = Dimensions.get('window');

type NotificationType = 'accident' | 'traffic' | 'route' | 'signalement';

interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  time: string;
  iconName: keyof typeof Ionicons.glyphMap;
}

const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  {
    id: '1',
    type: 'accident',
    title: 'Accident signalé',
    message: 'Un accident a été signalé sur votre itinéraire vers Cocody.',
    time: 'Il y a 10 min',
    iconName: 'car-sport',
  },
  {
    id: '2',
    type: 'traffic',
    title: 'Embouteillage',
    message: "Fort ralentissement détecté sur la voie de l'Indénié. Votre trajet pourrait prendre du retard.",
    time: 'Il y a 18 min',
    iconName: 'car',
  },
  {
    id: '3',
    type: 'route',
    title: 'Itinéraire optimisé',
    message: "Votre itinéraire a été mis à jour. Une nouvelle route vous permet d'arriver 8 min plus tôt.",
    time: 'Il y a 1h',
    iconName: 'navigate',
  },
  {
    id: '4',
    type: 'signalement',
    title: 'Signalement pris en compte',
    message: 'Merci pour votre signalement ! Votre information a été enregistrée et transmise aux équipes.',
    time: 'Hier à 18h20',
    iconName: 'warning',
  },
  {
    id: '5',
    type: 'route',
    title: 'Itinéraire optimisé',
    message: "Votre itinéraire a été mis à jour. Une nouvelle route vous permet d'arriver 8 min plus tôt.",
    time: 'Il y a 1h',
    iconName: 'navigate',
  },
  {
    id: '6',
    type: 'accident',
    title: 'Accident signalé',
    message: 'Un accident a été signalé sur votre itinéraire vers Cocody.',
    time: 'Il y a 10 min',
    iconName: 'car-sport',
  },
  {
    id: '7',
    type: 'signalement',
    title: 'Signalement pris en compte',
    message: 'Merci pour votre signalement ! Votre information a été enregistrée et transmise aux équipes.',
    time: 'Hier à 18h20',
    iconName: 'warning',
  },
  {
    id: '8',
    type: 'route',
    title: 'Itinéraire optimisé',
    message: "Votre itinéraire a été mis à jour. Une nouvelle route vous permet d'arriver 12 min plus tôt.",
    time: 'Hier à 14h15',
    iconName: 'navigate',
  },
];

export default function NotificationsScreen() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const filteredNotifications = INITIAL_NOTIFICATIONS.filter((item) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      item.title.toLowerCase().includes(query) ||
      item.message.toLowerCase().includes(query) ||
      item.time.toLowerCase().includes(query)
    );
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />

      {/* Map Background Overlay */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Image
          source={require('@/assets/images/explore-map-bg.png')}
          style={styles.mapBackground}
          contentFit="cover"
        />
      </View>

      <View style={styles.container}>
        {/* Header Bar */}
        <View style={styles.headerContainer}>
          <TouchableOpacity
            style={styles.headerIconButton}
            onPress={() => router.back()}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="arrow-back" size={24} color="#000000" />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Notifications</Text>

          <TouchableOpacity
            style={styles.headerIconButton}
            onPress={() => setIsSearchActive(!isSearchActive)}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="search" size={22} color="#000000" />
          </TouchableOpacity>
        </View>

        {/* Dynamic Search Bar */}
        {isSearchActive && (
          <View style={styles.searchBarContainer}>
            <Ionicons name="search-outline" size={18} color="#888888" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Rechercher une notification..."
              placeholderTextColor="#999999"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={18} color="#888888" />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Scrollable Notification List */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {filteredNotifications.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="notifications-off-outline" size={48} color="#B0B0B0" />
              <Text style={styles.emptyText}>Aucune notification trouvée</Text>
            </View>
          ) : (
            filteredNotifications.map((item) => {
              const isExpanded = !!expandedIds[item.id];
              const shouldTruncate = item.message.length > 70;
              const displayMessage =
                shouldTruncate && !isExpanded
                  ? item.message.slice(0, 65) + '... '
                  : item.message;

              return (
                <TouchableOpacity
                  key={item.id}
                  style={styles.notificationCard}
                  onPress={() => router.push('/notification-accident-detail')}
                  activeOpacity={0.85}
                >
                  {/* Left Orange Circle Icon */}
                  <View style={styles.iconCircle}>
                    <Ionicons name={item.iconName} size={24} color="#FFFFFF" />
                  </View>

                  {/* Middle Content */}
                  <View style={styles.cardContent}>
                    <Text style={styles.cardTitle}>{item.title}</Text>
                    <Text style={styles.cardMessage}>
                      {displayMessage}
                      {shouldTruncate && !isExpanded && (
                        <Text style={styles.seeMoreText} onPress={(e) => { e.stopPropagation(); toggleExpand(item.id); }}>
                          voir plus
                        </Text>
                      )}
                    </Text>
                    <Text style={styles.cardTime}>{item.time}</Text>
                  </View>

                  {/* Right Action Circle Button */}
                  <TouchableOpacity
                    style={styles.actionCircle}
                    onPress={() => router.push('/notification-accident-detail')}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name="chevron-forward"
                      size={16}
                      color="#FFFFFF"
                    />
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      </View>

      {/* Bottom Navigation Bar */}
      <CustomBottomTabBar activeTab="alerts" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  mapBackground: {
    width: '100%',
    height: '100%',
    opacity: 0.12,
  },
  container: {
    flex: 1,
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: 'transparent',
  },
  headerIconButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000000',
    textAlign: 'center',
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#111111',
    padding: 0,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
  },
  notificationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#EAEAEA',
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
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F26522',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  cardContent: {
    flex: 1,
    paddingRight: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 4,
  },
  cardMessage: {
    fontSize: 13,
    color: '#444444',
    lineHeight: 18,
  },
  seeMoreText: {
    fontWeight: '700',
    color: '#111111',
  },
  cardTime: {
    fontSize: 12,
    color: '#888888',
    marginTop: 6,
  },
  actionCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#F26522',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 15,
    color: '#888888',
    fontWeight: '500',
  },
  bottomNavContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: '#262626',
    height: 60,
    paddingHorizontal: 16,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  navItem: {
    padding: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
