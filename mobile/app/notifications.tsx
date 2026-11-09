import React, { useMemo, useState } from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Platform,
  SafeAreaView,
} from 'react-native';
import { Text, TextInput } from '@/components/sira-text';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { CustomBottomTabBar, useTabBarSpace } from '@/components/custom-bottom-tab-bar';
import { goBack } from '@/lib/navigation';
import { REPORT_STATUS_LABEL, REPORT_STYLE, timeAgo, useLiveReports } from '@/lib/reports';
import type { TrafficReport } from '@/lib/sira-api';

const { width } = Dimensions.get('window');

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  time: string;
  createdAt: number;
  iconName: keyof typeof Ionicons.glyphMap;
  color: string;
}

// One alert per report still active, live (Socket.IO + reload, lib/reports.ts):
// what travellers really reported, never an example written in the app.
function toNotification(report: TrafficReport): NotificationItem {
  const style = REPORT_STYLE[report.type] ?? REPORT_STYLE.other;
  const votes = report.confirmations > 0 ? ` · ${report.confirmations} confirmation${report.confirmations > 1 ? 's' : ''}` : '';
  return {
    id: report.id,
    title: report.title,
    message: `${report.location} · ${REPORT_STATUS_LABEL[report.status]}${votes}${report.description ? `. ${report.description}` : ''}`,
    time: timeAgo(report.createdAt),
    createdAt: Date.parse(report.createdAt) || 0,
    iconName: style.icon,
    color: style.color,
  };
}

export default function NotificationsScreen() {
  // The list ends above the bottom bar (its last item stays reachable on small phones).
  const tabBarSpace = useTabBarSpace();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const { reports } = useLiveReports();
  const notifications = useMemo(
    () => reports.map(toNotification).sort((a, b) => b.createdAt - a.createdAt),
    [reports],
  );

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const filteredNotifications = notifications.filter((item) => {
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
            onPress={() => goBack(router)}
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
              placeholder="Rechercher une notification…"
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
          contentContainerStyle={[styles.scrollContent, { paddingBottom: tabBarSpace }]}
          showsVerticalScrollIndicator={false}
        >
          {filteredNotifications.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="notifications-off-outline" size={48} color="#B0B0B0" />
              <Text style={styles.emptyText}>
                {notifications.length === 0
                  ? 'Aucune alerte en ce moment. Les signalements des voyageurs apparaissent ici en direct.'
                  : 'Aucune notification trouvée'}
              </Text>
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
                  onPress={() => router.push({ pathname: '/traffic', params: { incident: item.id } })}
                  activeOpacity={0.85}
                >
                  {/* Left Orange Circle Icon */}
                  <View style={[styles.iconCircle, { backgroundColor: item.color }]}>
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
                    onPress={() => router.push({ pathname: '/traffic', params: { incident: item.id } })}
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
