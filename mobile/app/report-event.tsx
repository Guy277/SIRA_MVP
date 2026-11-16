import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
  Pressable,
  ScrollView,
  Dimensions,
} from 'react-native';
import { Text } from '@/components/sira-text';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInDown, ReduceMotion } from 'react-native-reanimated';
import { REPORT_CHOOSE } from '@/lib/spoken';
import { useSpeech } from '@/lib/voice';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, FontAwesome5, MaterialCommunityIcons } from '@expo/vector-icons';
import { CustomBottomTabBar, useTabBarSpace } from '@/components/custom-bottom-tab-bar';
import { playIntroToday } from '@/lib/motion';
import { goBack } from '@/lib/navigation';
import { ensureCurrentPlace, useCurrentPlace } from '@/lib/places';
import { alertBadge, useAlertCount, useLiveReports } from '@/lib/reports';
import { summarizeReports, type ReportCategory } from '@/lib/report-summary-core';

const { width } = Dimensions.get('window');

// The designer's screen is 804 px wide (2x): k turns its pixels into this phone's.
const k = width / 804;
// Banner of the design (city, crashed cars, bus, the SIRA character pointing), 804 × 540; the
// bubble drawn into it was erased, it is written below (it says « tu », like the rest of SIRA).
const BANNER_HEIGHT = 540 * k;
// Three square cards per row: 198 px wide, 38 px apart, 66 px from the edges in the design.
const CARD_SIZE = 198 * k;
// « Embouteillage » must stay on one line inside its card: the label follows the card's width.
const CARD_FONT = Math.min(12.5, CARD_SIZE / 8.8);

interface EventCategory {
  id: ReportCategory;
  title: string;
  iconName: string;
  iconFamily: 'FontAwesome5' | 'Ionicons' | 'MaterialCommunityIcons';
}

// Icons as in the design: crash, line of cars, barrier, drop, road, broken-down car, dots.
const CATEGORIES: EventCategory[] = [
  { id: 'accident', title: 'Accident', iconName: 'car-crash', iconFamily: 'FontAwesome5' },
  { id: 'embouteillage', title: 'Embouteillage', iconName: 'car-multiple', iconFamily: 'MaterialCommunityIcons' },
  { id: 'route_bloquee', title: 'Route bloquée', iconName: 'boom-gate', iconFamily: 'MaterialCommunityIcons' },
  { id: 'inondation', title: 'Inondation', iconName: 'water', iconFamily: 'Ionicons' },
  { id: 'route_degradee', title: 'Route\ndégradée', iconName: 'road', iconFamily: 'FontAwesome5' },
  { id: 'vehicule_panne', title: 'Véhicule\nen panne', iconName: 'car-wrench', iconFamily: 'MaterialCommunityIcons' },
  { id: 'autre', title: 'Autre\névénement', iconName: 'ellipsis-horizontal', iconFamily: 'Ionicons' },
];

// SIRA's orange for every kind: the icon and the name tell them apart (white, black and orange only).
const SIRA_ORANGE = '#F26522';

function CategoryIcon({ category, size, color = '#FFFFFF' }: { category: EventCategory; size: number; color?: string }) {
  if (category.iconFamily === 'FontAwesome5') return <FontAwesome5 name={category.iconName as any} size={size - 2} color={color} />;
  if (category.iconFamily === 'MaterialCommunityIcons') return <MaterialCommunityIcons name={category.iconName as any} size={size + 2} color={color} />;
  return <Ionicons name={category.iconName as any} size={size} color={color} />;
}

export default function ReportEventScreen() {
  // The list ends above the bottom bar (its last item stays reachable on small phones).
  const tabBarSpace = useTabBarSpace();
  const router = useRouter();
  const alertCount = useAlertCount();
  useSpeech('report:choose', REPORT_CHOOSE);

  // The travellers' active reports, live, counted on each card: around the traveller (whole Grand Abidjan without their position).
  const { reports } = useLiveReports();
  const here = useCurrentPlace();
  useEffect(() => { void ensureCurrentPlace(); }, []);
  const position = here.status === 'ready' && !here.outside ? here.coordinates : null;
  const summary = summarizeReports(reports, position);
  const near = summary.scope === 'near';

  // Cards come in one after the other the first time today, then only fade in (lib/motion.ts).
  const [intro] = useState(() => playIntroToday('report-event'));
  const entering = (index: number) => (intro
    ? FadeInDown.delay(120 + index * 45).duration(300).reduceMotion(ReduceMotion.System)
    : FadeIn.duration(200).reduceMotion(ReduceMotion.System));

  const handleSelectCategory = (category: EventCategory) => {
    router.push({
      pathname: '/report-event-detail',
      params: {
        categoryId: category.id,
        title: category.title.replace('\n', ' '),
      },
    });
  };

  const countLabel = (count: number) => (near ? `${count} signalé${count > 1 ? 's' : ''} près de toi` : `${count} signalé${count > 1 ? 's' : ''} en ce moment`);

  const card = (category: EventCategory, index: number) => {
    const count = summary.byCategory[category.id] ?? 0;
    return (
      <Animated.View key={category.id} entering={entering(index)}>
        <Pressable
          onPress={() => handleSelectCategory(category)}
          accessibilityRole="button"
          accessibilityLabel={`${category.title.replace('\n', ' ')}${count ? `, ${countLabel(count)}` : ''}`}
          style={({ pressed }) => [styles.categoryCard, pressed && styles.categoryCardPressed]}
        >
          <View style={styles.categoryCircleIcon}>
            <CategoryIcon category={category} size={Math.round(50 * k)} />
          </View>
          <Text style={styles.categoryTitle} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.75}>
            {category.title}
          </Text>
          {count > 0 && (
            <View style={styles.countPill}>
              <Text style={styles.countPillText}>{count}</Text>
            </View>
          )}
        </Pressable>
      </Animated.View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Header Bar */}
        <View style={styles.headerBar}>
          <TouchableOpacity
            onPress={() => goBack(router)}
            style={styles.backBtnWrapper}
            activeOpacity={0.7}
            accessibilityLabel="Retour"
          >
            <Ionicons name="arrow-back" size={24} color="#000000" />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Signaler un événement</Text>

          <TouchableOpacity
            style={styles.headerIconButton}
            onPress={() => router.push('/notifications')}
            activeOpacity={0.8}
            accessibilityLabel="Notifications"
          >
            <Ionicons name="notifications" size={22} color="#000000" />
            {alertCount > 0 && (
              <View style={styles.notificationBadge}>
                <Text style={styles.badgeText}>{alertBadge(alertCount)}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: tabBarSpace }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Banner of the design, with the character's speech bubble written over it. */}
          <View style={styles.bannerContainer}>
            <Image
              source={require('@/assets/images/report-banner.png')}
              style={styles.bannerImage}
              contentFit="cover"
            />
            <View style={styles.speechBubbleBox}>
              <Text style={styles.speechBubbleText}>
                <Text style={styles.boldText}>En signalant un événement</Text>, tu nous aides
                à <Text style={styles.boldText}>améliorer SIRA</Text> et à te proposer
                des <Text style={styles.boldText}>itinéraires plus optimisés</Text>.
              </Text>
              <View style={styles.speechBubblePointer} />
            </View>
          </View>

          {/* Heading Section */}
          <View style={styles.headingSection}>
            <Text style={styles.mainHeading}>Que se passe-t-il ?</Text>
            <Text style={styles.subHeading}>
              Choisis le type d’événement que tu veux signaler.
            </Text>
          </View>

          {/* Seven kinds, three square cards per row. */}
          <View style={styles.gridContainer}>
            {CATEGORIES.map((category, index) => card(category, index + 1))}
          </View>
        </ScrollView>

        {/* Bottom Navigation Bar */}
        <CustomBottomTabBar activeTab="alerts" />
      </SafeAreaView>
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
    backgroundColor: '#FFFFFF',
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  backBtnWrapper: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '500',
    color: '#000000',
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
  scrollView: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    paddingBottom: 90,
  },
  bannerContainer: {
    width: '100%',
    height: BANNER_HEIGHT,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  bannerImage: {
    width: '100%',
    height: '100%',
  },
  // Where the design's bubble was (from x 160, 28 px down), a little wider for SIRA's font.
  speechBubbleBox: {
    position: 'absolute',
    top: 28 * k,
    left: 152 * k,
    width: 318 * k,
    backgroundColor: '#FFFFFF',
    borderRadius: 30 * k,
    paddingHorizontal: 18 * k,
    paddingVertical: 16 * k,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  speechBubbleText: {
    fontSize: 23 * k,
    lineHeight: 32 * k,
    color: '#222222',
    textAlign: 'center',
  },
  boldText: {
    fontWeight: '800',
    color: '#000000',
  },
  // The tail, on the right, toward the character's face.
  speechBubblePointer: {
    position: 'absolute',
    right: -14 * k,
    bottom: 22 * k,
    width: 0,
    height: 0,
    borderTopWidth: 10 * k,
    borderBottomWidth: 10 * k,
    borderLeftWidth: 16 * k,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: '#FFFFFF',
  },
  headingSection: {
    paddingHorizontal: 20,
    marginTop: 12,
    marginBottom: 18,
    alignItems: 'center',
  },
  mainHeading: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111111',
    textAlign: 'center',
  },
  subHeading: {
    fontSize: 13,
    color: '#333333',
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 10,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 66 * k,
    columnGap: 38 * k,
    rowGap: 34 * k,
  },
  categoryCard: {
    width: CARD_SIZE,
    height: CARD_SIZE,
    backgroundColor: '#F4F5F7',
    borderWidth: 1,
    borderColor: '#C9CDD3',
    paddingHorizontal: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryCardPressed: {
    transform: [{ scale: 0.95 }],
    borderColor: SIRA_ORANGE,
  },
  categoryCircleIcon: {
    width: 102 * k,
    height: 102 * k,
    borderRadius: 51 * k,
    backgroundColor: SIRA_ORANGE,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10 * k,
  },
  countPill: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: '#111111',
  },
  countPillText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  categoryTitle: {
    fontSize: CARD_FONT,
    fontWeight: '600',
    color: '#111111',
    textAlign: 'center',
    lineHeight: CARD_FONT * 1.25,
  },
  bottomBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#1E1E1E',
    paddingTop: 10,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: '#2D2D2D',
  },
  bottomNavItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerAlertBadgeWrapper: {
    width: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerAlertBadgeBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#F26522',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: -22,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    shadowColor: '#F26522',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
});
