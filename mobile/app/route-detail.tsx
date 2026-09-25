import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Platform,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFavorites } from '@/hooks/use-favorites';
import { OsmMapView } from '@/components/osm-map-view';
import { journeyStore, selectedJourney, useJourneyStore } from '@/lib/journey-store';
import { formatClock, formatDistance, formatDuration, formatPrice, isVehicle, journeyPath, journeyTitle, stepDescription, stepTitle, timeline } from '@/lib/journey-format';
import type { LegMode } from '@/lib/sira-api';

const STEP_ICONS: Record<LegMode, keyof typeof Ionicons.glyphMap> = {
  walk: 'walk', wait: 'time', transfer: 'swap-horizontal', sotra: 'bus', gbaka: 'bus', woro: 'car-sport', taxi: 'car', boat: 'boat',
};

const { width, height } = Dimensions.get('window');

export default function RouteDetailScreen() {
  const router = useRouter();
  const { isFavorite: checkIsFavorite, toggleFavorite } = useFavorites();

  const store = useJourneyStore();
  const journey = selectedJourney(store);
  const search = store.search;
  const departure = search?.departure.name ?? '';
  const arrival = search?.arrival.name ?? '';
  const tripTitle = `D’${departure} à ${arrival}`;
  const steps = journey && search ? timeline(journey, search.departureAt) : [];

  const [isLiked, setIsLiked] = useState(false);
  const isFavorite = checkIsFavorite(tripTitle);

  const handleStartNavigation = () => {
    if (!journey) return;
    journeyStore.start(journey);
    router.push({ pathname: '/navigation-active', params: { destination: arrival } });
  };

  const handleShare = () => {
    Alert.alert('Partager le trajet', `Lien de partage généré pour le trajet de ${departure} à ${arrival}.`);
  };

  const handleToggleFavorite = () => {
    const nowFavorite = toggleFavorite({
      departure,
      arrival,
      title: tripTitle,
      mode: (journey?.categories?.[0] ?? 'coule') === 'suspendu' ? 'Suspendu' : (journey?.categories?.[0] === 'debout' ? 'Debout' : 'Coulé'),
      transport: journey ? journeyTitle(journey) : '',
      duration: journey ? formatDuration(journey.duration) : '',
      costRange: formatPrice(journey?.price),
    });
    Alert.alert(
      nowFavorite ? 'Ajouté aux favoris' : 'Retiré des favoris',
      nowFavorite
        ? `Le trajet "${tripTitle}" est enregistré dans vos favoris.`
        : `Le trajet "${tripTitle}" a été retiré de vos favoris.`
    );
  };

  const handleLike = () => {
    setIsLiked(!isLiked);
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Top Header Bar */}
        <View style={styles.headerBar}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtnWrapper}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="arrow-back" size={24} color="#000000" />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Décomposition d'itinéraire</Text>

          <View style={styles.headerRightActions}>
            <TouchableOpacity
              style={styles.headerIconButton}
              onPress={() => router.push('/notifications')}
              activeOpacity={0.8}
            >
              <Ionicons name="notifications" size={22} color="#000000" />
              <View style={styles.notificationBadge}>
                <Text style={styles.badgeText}>5</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.headerIconButton}
              onPress={() => router.push('/report-event')}
              activeOpacity={0.8}
            >
              <Ionicons name="warning" size={22} color="#DC2626" />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Upper Map View Section */}
          <View style={styles.mapContainer}>
            <OsmMapView
              style={styles.mapImage}
              departureName={departure}
              arrivalName={arrival}
              origin={search?.departure}
              destination={search?.arrival}
              routeCoordinates={journeyPath(journey)}
            />

            {/* Top Right Map Legend Badges */}
            <View style={styles.mapLegendContainer}>
              <View style={styles.legendRow}>
                <View style={[styles.legendLine, { backgroundColor: '#F26522' }]} />
                <View style={styles.legendIconCircle}>
                  <Ionicons name="star" size={11} color="#FFFFFF" />
                </View>
              </View>
              <View style={styles.legendRow}>
                <View style={[styles.legendLine, { backgroundColor: '#1E40AF' }]} />
                <View style={styles.legendIconCircleBlue}>
                  <Ionicons name="ribbon" size={11} color="#FFFFFF" />
                </View>
              </View>
            </View>

            {/* Orange Compass FAB Icon (Bottom Right of Map) */}
            <TouchableOpacity
              style={styles.mapCompassFab}
              activeOpacity={0.8}
              onPress={() => {}}
            >
              <Ionicons name="navigate-sharp" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {/* Timeline Breakdown Section */}
          <View style={styles.timelineSectionWrapper}>
            {/* Timeline Steps Column */}
            <View style={styles.timelineColumn}>
              {/* Continuous Black Vertical Road Stripe with White Dashed Center Line */}
              <View style={styles.blackRoadStripe}>
                <View style={styles.dashedCenterLine} />
              </View>

              {!journey && (
                <View style={styles.stepItemRow}>
                  <View style={styles.stepTextWrapper}>
                    <Text style={styles.stepTitle}>Aucun trajet sélectionné</Text>
                    <Text style={styles.stepSubDesc}>Revenez aux résultats et choisissez un itinéraire.</Text>
                  </View>
                </View>
              )}

              {steps.map(({ leg, start, end }) => (
                <View key={leg.id} style={styles.stepItemRow}>
                  <View style={styles.orangeStepIconCircle}>
                    <Ionicons name={STEP_ICONS[leg.mode] ?? 'ellipse'} size={20} color="#FFFFFF" />
                  </View>
                  <View style={styles.stepTextWrapper}>
                    <Text style={styles.stepTitle}>{stepTitle(leg)}</Text>
                    <Text style={styles.stepSubDesc}>{stepDescription(leg)}</Text>
                    {isVehicle(leg) && (
                      <Text style={styles.stepCostText}>
                        Coût estimé : <Text style={styles.boldText}>{formatPrice(leg.price)}</Text>
                      </Text>
                    )}
                    <Text style={styles.stepMetaText}>{formatClock(start)} → {formatClock(end)}</Text>
                  </View>
                </View>
              ))}

              {journey && (
                <View style={styles.stepItemRow}>
                  <View style={styles.stepTextWrapper}>
                    <Text style={styles.stepSubDesc}>
                      Total : <Text style={styles.boldText}>{formatDuration(journey.duration)}</Text> · <Text style={styles.boldText}>{formatPrice(journey.price)}</Text>{journey.distance_km ? ` · ${formatDistance(journey.distance_km)}` : ''}
                    </Text>
                    <Text style={styles.stepMetaText}>Durées et prix estimés à partir des lignes open data 2021.</Text>
                  </View>
                </View>
              )}

              {/* Step 5: Destination Arrival */}
              <View style={styles.stepItemRow}>
                <View style={styles.orangeStepIconCircle}>
                  <Ionicons name="location" size={22} color="#FFFFFF" />
                </View>
                <View style={styles.stepTextWrapper}>
                  <Text style={styles.stepTitle}>{arrival}</Text>
                  <Text style={styles.stepSubDesc}>Vous êtes bien arrivé !</Text>

                  {/* Icon Actions Row (Thumbs Up, Share, Bookmark) */}
                  <View style={styles.stepActionsRow}>
                    <TouchableOpacity
                      onPress={handleLike}
                      activeOpacity={0.7}
                      style={styles.stepActionIconBtn}
                    >
                      <Ionicons
                        name={isLiked ? 'thumbs-up' : 'thumbs-up-outline'}
                        size={18}
                        color={isLiked ? '#F26522' : '#000000'}
                      />
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={handleShare}
                      activeOpacity={0.7}
                      style={styles.stepActionIconBtn}
                    >
                      <Ionicons name="share-social-outline" size={18} color="#000000" />
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={handleToggleFavorite}
                      activeOpacity={0.7}
                      style={styles.stepActionIconBtn}
                    >
                      <Ionicons
                        name={isFavorite ? 'bookmark' : 'bookmark-outline'}
                        size={18}
                        color={isFavorite ? '#F26522' : '#000000'}
                      />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
          </View>

          {/* Floating Action Button: Démarrer l'itinéraire */}
          <View style={styles.floatingButtonContainer}>
            <TouchableOpacity
              style={styles.demarrerBtn}
              onPress={handleStartNavigation}
              activeOpacity={0.88}
            >
              <View style={styles.demarrerIconCircle}>
                <Image
                  source={require('@/assets/images/orange-pin-icon.png')}
                  style={styles.demarrerPinIcon}
                  contentFit="contain"
                />
              </View>
              <Text style={styles.demarrerBtnText}>Démarrer l'itinéraire</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
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
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  backBtnWrapper: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#000000',
    letterSpacing: 0.2,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIconButton: {
    position: 'relative',
    padding: 4,
  },
  notificationBadge: {
    position: 'absolute',
    top: -2,
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
  },
  scrollContent: {
    paddingBottom: 40,
  },
  mapContainer: {
    height: Math.max(260, height * 0.36),
    width: '100%',
    position: 'relative',
    backgroundColor: '#EAEAEA',
  },
  mapImage: {
    width: '100%',
    height: '100%',
  },
  mapLegendContainer: {
    position: 'absolute',
    top: 14,
    right: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 4,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendLine: {
    width: 32,
    height: 4,
    borderRadius: 2,
  },
  legendIconCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#F26522',
    justifyContent: 'center',
    alignItems: 'center',
  },
  legendIconCircleBlue: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#1E40AF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapCompassFab: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F26522',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#F26522',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 5,
  },
  timelineSectionWrapper: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 18,
    position: 'relative',
    minHeight: 400,
  },
  timelineColumn: {
    flex: 1,
    position: 'relative',
    paddingRight: 0,
  },
  blackRoadStripe: {
    position: 'absolute',
    left: 17,
    top: 14,
    bottom: 30,
    width: 14,
    backgroundColor: '#000000',
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  dashedCenterLine: {
    width: 2,
    height: '92%',
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  stepItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 22,
  },
  orangeStepIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F26522',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 3,
    shadowColor: '#F26522',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  stepTextWrapper: {
    flex: 1,
    marginLeft: 14,
    paddingRight: 10,
  },
  stepTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#000000',
    lineHeight: 19,
  },
  stepSubDesc: {
    fontSize: 12.5,
    color: '#333333',
    marginTop: 2,
    lineHeight: 16,
  },
  stepCostText: {
    fontSize: 12,
    color: '#333333',
    marginTop: 2,
  },
  stepMetaText: {
    fontSize: 11.5,
    color: '#666666',
    fontWeight: '600',
    marginTop: 3,
  },
  boldText: {
    fontWeight: '900',
    color: '#000000',
  },
  stepActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 8,
  },
  stepActionIconBtn: {
    padding: 4,
  },
  floatingButtonContainer: {
    position: 'absolute',
    bottom: 24,
    right: 16,
    zIndex: 20,
  },
  demarrerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F26522',
    borderRadius: 28,
    paddingHorizontal: 18,
    paddingVertical: 12,
    gap: 10,
    shadowColor: '#F26522',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  demarrerIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  demarrerPinIcon: {
    width: 18,
    height: 18,
  },
  demarrerBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
});

