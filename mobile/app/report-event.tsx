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
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { CustomBottomTabBar, useTabBarSpace } from '@/components/custom-bottom-tab-bar';
import { playIntroToday } from '@/lib/motion';
import { goBack } from '@/lib/navigation';
import { ensureCurrentPlace, useCurrentPlace } from '@/lib/places';
import { alertBadge, useAlertCount, useLiveReports } from '@/lib/reports';
import { summarizeReports, type ReportCategory } from '@/lib/report-summary-core';

const { width } = Dimensions.get('window');

// Banner sizes follow the screen: the character shrinks on narrow phones and
// the bubble takes the room left beside it, so they never cover each other.
const CHARACTER_WIDTH = Math.min(180, width * 0.42);
const CHARACTER_HEIGHT = CHARACTER_WIDTH * (220 / 180);
const BUBBLE_WIDTH = Math.max(150, width - CHARACTER_WIDTH - 18 - 14);
// Three category cards per row: on narrow phones the labels get a smaller font
// (« Embouteillage » must fit on one line, not be cut in the middle).
const CARD_WIDTH = (width - 56) / 3;
const NARROW_CARDS = CARD_WIDTH < 100;

interface EventCategory {
  id: ReportCategory;
  title: string;
  iconName: string;
  iconFamily: 'FontAwesome5' | 'Ionicons';
}

const CATEGORIES: EventCategory[] = [
  { id: 'accident', title: 'Accident', iconName: 'car-crash', iconFamily: 'FontAwesome5' },
  { id: 'embouteillage', title: 'Embouteillage', iconName: 'car', iconFamily: 'FontAwesome5' },
  { id: 'route_bloquee', title: 'Route bloquée', iconName: 'road', iconFamily: 'FontAwesome5' },
  { id: 'inondation', title: 'Inondation', iconName: 'water', iconFamily: 'Ionicons' },
  { id: 'route_degradee', title: 'Route\ndégradée', iconName: 'warning', iconFamily: 'Ionicons' },
  { id: 'vehicule_panne', title: 'Véhicule\nen panne', iconName: 'tools', iconFamily: 'FontAwesome5' },
  { id: 'autre', title: 'Autre évènement', iconName: 'ellipsis-horizontal', iconFamily: 'Ionicons' },
];

// SIRA's orange for every kind: the icon and the name tell them apart (white, black and orange only).
const SIRA_ORANGE = '#F26522';

function CategoryIcon({ category, size, color = '#FFFFFF' }: { category: EventCategory; size: number; color?: string }) {
  return category.iconFamily === 'FontAwesome5'
    ? <FontAwesome5 name={category.iconName as any} size={size - 2} color={color} />
    : <Ionicons name={category.iconName as any} size={size} color={color} />;
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
    const wide = category.id === 'autre';
    return (
      <Animated.View key={category.id} entering={entering(index)} style={wide ? styles.wideWrap : undefined}>
        <Pressable
          onPress={() => handleSelectCategory(category)}
          accessibilityRole="button"
          accessibilityLabel={`${category.title.replace('\n', ' ')}${count ? `, ${countLabel(count)}` : ''}`}
          style={({ pressed }) => [styles.categoryCard, wide && styles.wideCard, pressed && styles.categoryCardPressed, pressed && { borderColor: SIRA_ORANGE }]}
        >
          <View style={[styles.categoryCircleIcon, wide && styles.wideCircleIcon, { backgroundColor: SIRA_ORANGE, shadowColor: SIRA_ORANGE }]}>
            <CategoryIcon category={category} size={wide ? 24 : 26} />
          </View>
          {wide ? (
            <View style={styles.wideTexts}>
              <Text style={styles.wideTitle}>{category.title}</Text>
              <Text style={styles.wideHint}>Tout ce qui gêne la circulation et n’est pas dans la liste.</Text>
            </View>
          ) : (
            <Text style={styles.categoryTitle} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.75}>
              {category.title}
            </Text>
          )}
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

          <Text style={styles.headerTitle}>Signaler un évènement</Text>

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
          {/* Top Banner Illustration with Assistant & Speech Bubble */}
          <View style={styles.bannerContainer}>
            <Image
              source={require('@/assets/images/city-traffic-accident-bg.png')}
              style={styles.bannerBgImage}
              contentFit="cover"
            />
            <View style={styles.bannerOverlay} />

            <View style={styles.speechBubbleBox}>
              <Text style={styles.speechBubbleText}>
                <Text style={styles.boldText}>En signalant un événement</Text>, tu nous aides
                à <Text style={styles.boldText}>améliorer SIRA</Text> et à te proposer
                des <Text style={styles.boldText}>itinéraires plus optimisés.</Text>
              </Text>
              <View style={styles.speechBubblePointer} />
            </View>

            <Image
              source={require('@/assets/images/sira-character-assistant.png')}
              style={styles.characterImg}
              contentFit="contain"
            />
          </View>

          {/* Heading Section */}
          <View style={styles.headingSection}>
            <Text style={styles.mainHeading}>Que se passe-t-il ?</Text>
            <Text style={styles.subHeading}>
              Choisis le type d’évènement que tu veux signaler.
            </Text>
          </View>

          {/* Six kinds in three columns, then « Autre évènement » across the width. */}
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
    fontWeight: '800',
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
    height: 230,
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#FFF8F5',
  },
  bannerBgImage: {
    ...StyleSheet.absoluteFill,
    width: '100%',
    height: '100%',
    opacity: 1,
  },
  bannerOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'transparent',
  },
  speechBubbleBox: {
    position: 'absolute',
    top: 20,
    left: 18,
    width: BUBBLE_WIDTH,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#EAEAEA',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  speechBubbleText: {
    fontSize: 11,
    color: '#333333',
    lineHeight: 15,
  },
  boldText: {
    fontWeight: '800',
    color: '#000000',
  },
  speechBubblePointer: {
    position: 'absolute',
    right: -8,
    top: 30,
    width: 0,
    height: 0,
    borderTopWidth: 6,
    borderBottomWidth: 6,
    borderLeftWidth: 8,
    borderStyle: 'solid',
    backgroundColor: 'transparent',
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: '#FFFFFF',
  },
  characterImg: {
    position: 'absolute',
    right: 5,
    bottom: -5,
    width: CHARACTER_WIDTH,
    height: CHARACTER_HEIGHT,
  },
  headingSection: {
    paddingHorizontal: 20,
    marginTop: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  mainHeading: {
    fontSize: 24,
    fontWeight: '900',
    color: '#000000',
    textAlign: 'center',
    letterSpacing: 0.4,
  },
  subHeading: {
    fontSize: 13,
    color: '#4A5568',
    textAlign: 'center',
    marginTop: 6,
    fontWeight: '500',
    paddingHorizontal: 10,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    justifyContent: 'space-between',
    rowGap: 14,
  },
  categoryCard: {
    width: CARD_WIDTH,
    height: 112,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: NARROW_CARDS ? 2 : 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  categoryCardPressed: {
    transform: [{ scale: 0.95 }],
    backgroundColor: '#FAFAFA',
  },
  wideWrap: {
    width: '100%',
  },
  wideCard: {
    width: '100%',
    height: 76,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingHorizontal: 16,
    gap: 14,
  },
  wideTexts: {
    flex: 1,
  },
  wideTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#000000',
  },
  wideHint: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  categoryCircleIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 4,
  },
  wideCircleIcon: {
    marginBottom: 0,
    width: 46,
    height: 46,
    borderRadius: 23,
  },
  countPill: {
    position: 'absolute',
    top: 7,
    right: 7,
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
    fontSize: NARROW_CARDS ? 10.5 : 12,
    fontWeight: '800',
    color: '#000000',
    textAlign: 'center',
    lineHeight: NARROW_CARDS ? 13 : 14,
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
