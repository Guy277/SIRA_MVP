import React, { useState, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ScrollView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CustomBottomTabBar } from '@/components/custom-bottom-tab-bar';
import { goBack } from '@/lib/navigation';

export interface ZoneReportItem {
  id: string;
  category: 'accident' | 'embouteillage' | 'route_bloquee' | 'inondation' | 'autre';
  location: string;
  timeAgo: string;
}

const MOCK_ZONE_REPORTS: ZoneReportItem[] = [
  { id: '1', category: 'accident', location: 'Cocody-Boulevard Latrille', timeAgo: 'Signalé il y a 1 min' },
  { id: '2', category: 'accident', location: 'Abobo-Carrefour Samaké', timeAgo: 'Signalé il y a 2 min' },
  { id: '3', category: 'accident', location: 'Adjamé-carrefour Cimetière', timeAgo: 'Signalé il y a 1 min' },
  { id: '4', category: 'accident', location: 'Abobo-Carrefour Samaké', timeAgo: 'Signalé il y a 2 min' },
  { id: '5', category: 'accident', location: 'Cocody-Boulevard Latrille', timeAgo: 'Signalé il y a 1 min' },
  { id: '6', category: 'accident', location: 'Adjamé-carrefour Cimetière', timeAgo: 'Signalé il y a 1 min' },
  { id: '7', category: 'accident', location: 'Abobo-Carrefour Samaké', timeAgo: 'Signalé il y a 2 min' },
  { id: '8', category: 'accident', location: 'Adjamé-carrefour Cimetière', timeAgo: 'Signalé il y a 1 min' },
  { id: '9', category: 'embouteillage', location: 'Yopougon-Siporex', timeAgo: 'Signalé il y a 3 min' },
  { id: '10', category: 'embouteillage', location: 'Marcory-Grand Carrefour', timeAgo: 'Signalé il y a 5 min' },
  { id: '11', category: 'route_bloquee', location: 'Treichville-Boulevard VGE', timeAgo: 'Signalé il y a 4 min' },
  { id: '12', category: 'inondation', location: 'Abobo-Zone Lagoon', timeAgo: 'Signalé il y a 10 min' },
];

const CATEGORIES = [
  { id: 'accident', label: 'Accident', icon: 'car-sport' },
  { id: 'embouteillage', label: 'Embouteillage', icon: 'car' },
  { id: 'route_bloquee', label: 'Route bloquée', icon: 'construct' },
  { id: 'inondation', label: 'Inondation', icon: 'water' },
  { id: 'autre', label: 'Autre', icon: 'ellipsis-horizontal' },
];

export default function TrafficDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ category?: string }>();
  const [activeCategory, setActiveCategory] = useState<string>(
    params.category || 'accident'
  );

  const filteredZoneReports = useMemo(() => {
    return MOCK_ZONE_REPORTS.filter((item) => item.category === activeCategory);
  }, [activeCategory]);

  const handleOpenZoneDetail = (item: ZoneReportItem) => {
    router.push('/notification-accident-detail');
  };

  const getCategoryTitle = () => {
    switch (activeCategory) {
      case 'accident':
        return 'Accidents signalés sur ces zones';
      case 'embouteillage':
        return 'Embouteillages signalés sur ces zones';
      case 'route_bloquee':
        return 'Routes bloquées sur ces zones';
      case 'inondation':
        return 'Inondations signalées sur ces zones';
      default:
        return 'Événements signalés sur ces zones';
    }
  };

  const getCategoryIcon = (catId: string) => {
    switch (catId) {
      case 'accident':
        return 'car-sport';
      case 'embouteillage':
        return 'car';
      case 'route_bloquee':
        return 'construct';
      case 'inondation':
        return 'water';
      default:
        return 'alert-circle';
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Header Bar */}
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.headerIconCircle}
            onPress={() => goBack(router)}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="arrow-back" size={24} color="#000000" />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Trafics</Text>

          <View style={styles.headerRightActions}>
            <TouchableOpacity
              style={styles.headerIconCircle}
              onPress={() => router.push('/notifications')}
              activeOpacity={0.7}
            >
              <Ionicons name="notifications" size={22} color="#000000" />
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>5</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.headerIconCircle}
              onPress={() => router.push('/report-event')}
              activeOpacity={0.7}
            >
              <Ionicons name="warning" size={24} color="#EF4444" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Horizontal Category Filter Chips Bar */}
        <View style={styles.chipsWrapper}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsScrollContainer}
          >
            {CATEGORIES.map((cat) => {
              const isActive = activeCategory === cat.id;
              return (
                <TouchableOpacity
                  key={cat.id}
                  style={[
                    styles.chipPill,
                    isActive ? styles.chipPillActive : styles.chipPillInactive,
                  ]}
                  onPress={() => setActiveCategory(cat.id)}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={cat.icon as any}
                    size={16}
                    color={isActive ? '#FFFFFF' : '#334155'}
                    style={{ marginRight: 6 }}
                  />
                  <Text
                    style={[
                      styles.chipText,
                      isActive ? styles.chipTextActive : styles.chipTextInactive,
                    ]}
                  >
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Section Title & Subtitle */}
        <View style={styles.listHeaderContainer}>
          <Text style={styles.listMainTitle}>{getCategoryTitle()}</Text>
          <Text style={styles.listSubtitle}>Faites attention !!!</Text>
        </View>

        {/* Cards List */}
        <FlatList
          data={filteredZoneReports}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.cardsListContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.zoneCard}
              onPress={() => handleOpenZoneDetail(item)}
              activeOpacity={0.85}
            >
              {/* Left Orange Circle Icon */}
              <View style={styles.cardIconCircle}>
                <Ionicons
                  name={getCategoryIcon(item.category) as any}
                  size={22}
                  color="#FFFFFF"
                />
              </View>

              {/* Middle Title & Subtitle */}
              <View style={styles.cardTextContainer}>
                <Text style={styles.cardLocationText}>{item.location}</Text>
                <Text style={styles.cardTimeText}>{item.timeAgo}</Text>
              </View>

              {/* Right Orange Chevron Circle Button */}
              <View style={styles.cardChevronCircle}>
                <Ionicons name="chevron-forward" size={14} color="#FFFFFF" />
              </View>
            </TouchableOpacity>
          )}
        />
      </SafeAreaView>

      {/* Bottom Navigation Bar */}
      <CustomBottomTabBar />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  safeArea: {
    flex: 1,
  },
  headerRow: {
    height: 52,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
  },
  headerIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#000000',
    letterSpacing: -0.3,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  notificationBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 15,
    height: 15,
    borderRadius: 7.5,
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  notificationBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  chipsWrapper: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 6,
  },
  chipsScrollContainer: {
    paddingHorizontal: 16,
    gap: 8,
  },
  chipPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  chipPillActive: {
    backgroundColor: '#F26522',
  },
  chipPillInactive: {
    backgroundColor: '#EFEFEF',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '700',
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  chipTextInactive: {
    color: '#334155',
  },
  listHeaderContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  listMainTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#000000',
    textAlign: 'center',
    marginBottom: 4,
  },
  listSubtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
    textAlign: 'center',
  },
  cardsListContent: {
    paddingHorizontal: 16,
    paddingBottom: 90,
  },
  zoneCard: {
    backgroundColor: '#F8F9FA',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
      },
      android: {
        elevation: 1.5,
      },
    }),
  },
  cardIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F26522',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTextContainer: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  cardLocationText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#000000',
    marginBottom: 2,
  },
  cardTimeText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  cardChevronCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#F26522',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
