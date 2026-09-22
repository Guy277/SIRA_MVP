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
import { CustomBottomTabBar } from '@/components/custom-bottom-tab-bar';
import { useFavorites } from '@/hooks/use-favorites';

const { width, height } = Dimensions.get('window');

export default function RouteDetailScreen() {
  const router = useRouter();
  const { isFavorite: checkIsFavorite, toggleFavorite } = useFavorites();

  const params = useLocalSearchParams<{
    departure?: string;
    arrival?: string;
    mode?: string;
    suboption?: string;
    subtext?: string;
    costRange?: string;
    durationMinutes?: string;
    distance?: string;
    date?: string;
    optionId?: string;
  }>();

  const departure = params.departure || 'Abobo Samaké';
  const arrival = params.arrival || 'Orange Digital Center';
  const mode = params.mode || 'Coulé';
  const transport = params.suboption || 'Gbaka';
  const duration = params.durationMinutes ? `${params.durationMinutes} min` : '24 min';
  const costRange = params.costRange || 'entre 500F et 1.500F';
  const tripDate = params.date || 'LUNDI 14 SEPTEMBRE 2026 À 08H40';
  const tripTitle = `D’${departure} à ${arrival}`;

  const isFavorite = checkIsFavorite(tripTitle);

  const handleRefaireTrajet = () => {
    router.push({
      pathname: '/navigation-active',
      params: { destination: arrival },
    });
  };

  const handleShare = () => {
    Alert.alert('Partager le trajet', `Lien de partage généré pour le trajet de ${departure} à ${arrival}.`);
  };

  const handleToggleFavorite = () => {
    const nowFavorite = toggleFavorite({
      departure,
      arrival,
      title: tripTitle,
      mode,
      transport,
      duration,
      costRange,
    });
    Alert.alert(
      nowFavorite ? 'Ajouté aux favoris' : 'Retiré des favoris',
      nowFavorite
        ? `Le trajet "${tripTitle}" est enregistré dans vos favoris.`
        : `Le trajet "${tripTitle}" a été retiré de vos favoris.`
    );
  };

  const handleDeleteHistory = () => {
    Alert.alert(
      'Supprimer du trajet',
      'Voulez-vous supprimer ce trajet de votre historique ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => router.back(),
        },
      ]
    );
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

          <Text style={styles.headerTitle}>Detail trajet</Text>

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
          {/* Upper Map View Section with Floating Departure/Arrival Card */}
          <View style={styles.mapContainer}>
            <Image
              source={require('@/assets/images/map-abidjan-routes.png')}
              style={styles.mapImage}
              contentFit="cover"
            />

            {/* Floating Departure/Arrival Input Card */}
            <View style={styles.floatingAddressCard}>
              <View style={styles.addressLinesCol}>
                {/* Departure Row */}
                <View style={styles.addressRow}>
                  <View style={styles.orangeDotCircle} />
                  <View style={styles.addressTextWrapper}>
                    <Text style={styles.addressLabel}>Départ</Text>
                    <Text style={styles.addressValue} numberOfLines={1}>{departure}</Text>
                  </View>
                </View>

                {/* Vertical Connector Line */}
                <View style={styles.addressDashedConnector} />

                {/* Arrival Row */}
                <View style={styles.addressRow}>
                  <Ionicons name="location" size={18} color="#F26522" style={styles.arrivalPinIcon} />
                  <View style={styles.addressTextWrapper}>
                    <Text style={styles.addressLabel}>Arrivée</Text>
                    <Text style={styles.addressValue} numberOfLines={1}>{arrival}</Text>
                  </View>
                </View>
              </View>

              {/* Swap Vertical Arrow Button */}
              <TouchableOpacity style={styles.swapBtn} activeOpacity={0.7}>
                <Ionicons name="swap-vertical" size={18} color="#000000" />
              </TouchableOpacity>
            </View>

            {/* Orange Compass FAB Icon (Bottom Right of Map) */}
            <View style={styles.mapCompassFab}>
              <Ionicons name="navigate-sharp" size={20} color="#FFFFFF" />
            </View>
          </View>

          {/* Trajet Summary Info Banner */}
          <View style={styles.tripSummaryHeaderContainer}>
            <Text style={styles.tripSummaryMainDate}>
              TRAJET EFFECTUÉ LE {tripDate.toUpperCase()}
            </Text>
            <View style={styles.tripSummaryRow}>
              <Text style={styles.tripSummaryItem}>
                Option : <Text style={styles.boldText}>{mode}</Text>
              </Text>
              <Text style={styles.tripSummaryItem}>
                Transport : <Text style={styles.boldText}>{transport}</Text>
              </Text>
              <Text style={styles.tripSummaryItem}>
                Durée : <Text style={styles.boldText}>{duration}</Text>
              </Text>
            </View>
            <Text style={styles.tripSummarySubRow}>
              Coût : entre <Text style={styles.boldText}>500F</Text> et <Text style={styles.boldText}>1.500F</Text>
            </Text>
            <Text style={styles.tripSummarySubRow}>
              Depart : <Text style={styles.boldText}>09H30</Text>   Arrivée : <Text style={styles.boldText}>10H30</Text>
            </Text>
          </View>

          {/* Main Content Layout (Timeline Steps) */}
          <View style={styles.mainContentRow}>
            {/* Timeline Breakdown Column */}
            <View style={styles.timelineColumn}>
              {/* Vertical Dashed Strip Background Bar */}
              <View style={styles.dashedBarBackground}>
                <View style={styles.whiteDashedLine} />
              </View>

              {/* Step 1: Walking 7 min */}
              <View style={styles.stepItemRow}>
                <View style={styles.orangeStepIconCircle}>
                  <Ionicons name="walk" size={20} color="#FFFFFF" />
                </View>
                <View style={styles.stepTextWrapper}>
                  <Text style={styles.stepTitle}>Marchez pendant 7 min</Text>
                  <Text style={styles.stepSubDesc}>Marchez jusqu'à la gare de gbaka</Text>
                  <Text style={styles.stepMetaText}>09:20 → 09:26 • 450 m</Text>
                </View>
              </View>

              {/* Step 2: Take Gbaka */}
              <View style={styles.stepItemRow}>
                <View style={styles.orangeStepIconCircle}>
                  <Ionicons name="bus" size={18} color="#FFFFFF" />
                </View>
                <View style={styles.stepTextWrapper}>
                  <Text style={styles.stepTitle}>Prenez un gbaka pour Adjamé liberté</Text>
                  <Text style={styles.stepSubDesc}>
                    Le cout varira entre 200f et 500f en fonction de l'heure.
                  </Text>
                  <Text style={styles.stepMetaText}>09:26 → 09:46 • 450 m</Text>
                </View>
              </View>

              {/* Step 3: Walking 25 min */}
              <View style={styles.stepItemRow}>
                <View style={styles.orangeStepIconCircle}>
                  <Ionicons name="walk" size={20} color="#FFFFFF" />
                </View>
                <View style={styles.stepTextWrapper}>
                  <Text style={styles.stepTitle}>Marchez pendant 25 min</Text>
                  <Text style={styles.stepSubDesc}>
                    Arrivé à Adjamé liberté, tournez à votre gauche et marchez tout droit.
                  </Text>
                  <Text style={styles.stepMetaText}>09:20 → 09:26 • 450 m</Text>
                </View>
              </View>

              {/* Step 4: Destination Arrival */}
              <View style={styles.stepItemRow}>
                <View style={styles.orangeStepIconCircle}>
                  <Ionicons name="location" size={20} color="#FFFFFF" />
                </View>
                <View style={styles.stepTextWrapper}>
                  <Text style={styles.stepTitle}>{arrival}</Text>
                  <Text style={styles.stepSubDesc}>Vous êtes bien arrivé !</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Bottom Action Area */}
          <View style={styles.actionFooterArea}>
            {/* Prominent Orange Pill Button */}
            <TouchableOpacity
              style={styles.refaireTrajetBtn}
              onPress={handleRefaireTrajet}
              activeOpacity={0.88}
            >
              <View style={styles.whiteIconCircle}>
                <Image
                  source={require('@/assets/images/pin-path-decor.png')}
                  style={styles.pinPathBtnIcon}
                  contentFit="contain"
                />
              </View>
              <Text style={styles.refaireTrajetText}>Refaire ce trajet</Text>
            </TouchableOpacity>

            {/* Action Icons Row (Share, Bookmark, Trash) */}
            <View style={styles.smallActionsRow}>
              <TouchableOpacity
                style={styles.smallIconBtn}
                onPress={handleShare}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="share-social-outline" size={20} color="#000000" />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.smallIconBtn}
                onPress={handleToggleFavorite}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name={isFavorite ? 'bookmark' : 'bookmark-outline'}
                  size={20}
                  color={isFavorite ? '#F26522' : '#000000'}
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.smallIconBtn}
                onPress={handleDeleteHistory}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="trash-outline" size={20} color="#000000" />
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>

        {/* Bottom Navigation Bar */}
        <CustomBottomTabBar activeTab="routes" />
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
  },
  scrollContent: {
    paddingBottom: 130,
  },
  mapContainer: {
    height: Math.max(260, height * 0.34),
    width: '100%',
    position: 'relative',
    backgroundColor: '#EAEAEA',
  },
  mapImage: {
    width: '100%',
    height: '100%',
  },
  floatingAddressCard: {
    position: 'absolute',
    top: 14,
    left: 16,
    right: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 5,
  },
  addressLinesCol: {
    flex: 1,
    paddingRight: 10,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  orangeDotCircle: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#F26522',
    backgroundColor: '#FFFFFF',
    marginRight: 10,
    marginLeft: 2,
  },
  arrivalPinIcon: {
    marginRight: 6,
  },
  addressTextWrapper: {
    flex: 1,
  },
  addressLabel: {
    fontSize: 11,
    color: '#888888',
    fontWeight: '500',
  },
  addressValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#000000',
  },
  addressDashedConnector: {
    width: 1,
    height: 12,
    backgroundColor: '#888888',
    marginLeft: 6,
    marginVertical: 2,
  },
  swapBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapCompassFab: {
    position: 'absolute',
    bottom: 14,
    right: 16,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#F26522',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#F26522',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 5,
  },
  tripSummaryHeaderContainer: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
  },
  tripSummaryMainDate: {
    fontSize: 13,
    fontWeight: '900',
    color: '#000000',
    letterSpacing: 0.3,
    marginBottom: 6,
    textAlign: 'center',
  },
  tripSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginTop: 2,
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  tripSummaryItem: {
    fontSize: 12,
    color: '#555555',
  },
  tripSummarySubRow: {
    fontSize: 12,
    color: '#555555',
    marginTop: 2,
    textAlign: 'center',
  },
  boldText: {
    fontWeight: '800',
    color: '#000000',
  },
  mainContentRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginTop: 8,
    position: 'relative',
  },
  timelineColumn: {
    flex: 1,
    position: 'relative',
    paddingRight: 0,
  },
  dashedBarBackground: {
    position: 'absolute',
    left: 16,
    top: 20,
    bottom: 24,
    width: 12,
    backgroundColor: '#000000',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  whiteDashedLine: {
    width: 2,
    height: '90%',
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  stepItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  orangeStepIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F26522',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
    shadowColor: '#F26522',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  stepTextWrapper: {
    flex: 1,
    marginLeft: 12,
  },
  stepTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#000000',
    lineHeight: 18,
  },
  stepSubDesc: {
    fontSize: 11.5,
    color: '#444444',
    marginTop: 2,
    lineHeight: 15,
  },
  stepMetaText: {
    fontSize: 11,
    color: '#666666',
    fontWeight: '500',
    marginTop: 4,
  },
  assistantRightCol: {
    width: 130,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  speechBubbleBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#EAEAEA',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 3,
    marginBottom: 8,
    position: 'relative',
  },
  speechBubbleText: {
    fontSize: 11,
    color: '#333333',
    lineHeight: 14,
    textAlign: 'center',
  },
  speechBold: {
    fontWeight: '800',
    color: '#000000',
  },
  speechBubblePointer: {
    position: 'absolute',
    bottom: -6,
    left: '45%',
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 6,
    borderStyle: 'solid',
    backgroundColor: 'transparent',
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#FFFFFF',
  },
  characterImage: {
    width: 130,
    height: 190,
  },
  actionFooterArea: {
    marginTop: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  refaireTrajetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F26522',
    borderRadius: 26,
    paddingHorizontal: 24,
    paddingVertical: 12,
    gap: 10,
    width: width * 0.72,
    shadowColor: '#F26522',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 5,
  },
  whiteIconCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pinPathBtnIcon: {
    width: 16,
    height: 16,
    tintColor: '#F26522',
  },
  refaireTrajetText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  smallActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    width: '100%',
    gap: 16,
    marginTop: 12,
    paddingRight: 10,
  },
  smallIconBtn: {
    padding: 6,
  },
});
