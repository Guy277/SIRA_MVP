import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import {
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CustomBottomTabBar } from '@/components/custom-bottom-tab-bar';

const { width, height } = Dimensions.get('window');

export default function RouteDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    departure?: string;
    arrival?: string;
    mode?: string;
    suboption?: string;
    subtext?: string;
    costRange?: string;
    durationMinutes?: string;
    distance?: string;
    optionId?: string;
  }>();

  const departure = params.departure || 'Abobo Samaké';
  const arrival = params.arrival || 'Orange Digital Center';
  const mode = params.mode || 'Coulé';
  const suboption = params.suboption || 'Marche';
  const subtext = params.subtext || '';
  const costRange = params.costRange || 'gratuit';
  const durationMinutes = params.durationMinutes || '24';
  const distance = params.distance || '18 Km';

  const [showFeedback, setShowFeedback] = useState(false);
  const [rating, setRating] = useState(5);

  // Dynamic step breakdown generation based on exact mode and suboption
  const renderDynamicSteps = () => {
    if (mode === 'Coulé') {
      if (suboption === 'Marche') {
        return (
          <>
            <View style={styles.stepItemRow}>
              <View style={styles.orangeStepIcon}>
                <Ionicons name="walk" size={20} color="#FFFFFF" />
              </View>
              <View style={styles.stepTextContent}>
                <Text style={styles.stepTitleText}>Marchez pendant 12 min</Text>
                <Text style={styles.stepDescText}>
                  Depuis <Text style={styles.boldText}>{departure}</Text> vers l'avenue principale.
                </Text>
                <Text style={styles.stepMetaText}>09:30 → 09:42 • 900 m</Text>
              </View>
            </View>

            <View style={styles.stepItemRow}>
              <View style={styles.orangeStepIcon}>
                <Ionicons name="walk" size={20} color="#FFFFFF" />
              </View>
              <View style={styles.stepTextContent}>
                <Text style={styles.stepTitleText}>Marchez pendant 11 min</Text>
                <Text style={styles.stepDescText}>
                  Suivez la rue piétonne jusqu'à <Text style={styles.boldText}>{arrival}.</Text>
                </Text>
                <Text style={styles.stepMetaText}>09:42 → 09:53 • 900 m</Text>
              </View>
            </View>
          </>
        );
      }
      if (suboption === 'Bus') {
        return (
          <>
            <View style={styles.stepItemRow}>
              <View style={styles.orangeStepIcon}>
                <Ionicons name="walk" size={20} color="#FFFFFF" />
              </View>
              <View style={styles.stepTextContent}>
                <Text style={styles.stepTitleText}>Marchez pendant 4 min</Text>
                <Text style={styles.stepDescText}>
                  Depuis <Text style={styles.boldText}>{departure}</Text> jusqu me à l'arrêt de Bus SOTRA.
                </Text>
                <Text style={styles.stepMetaText}>09:30 → 09:34 • 250 m</Text>
              </View>
            </View>

            <View style={styles.stepItemRow}>
              <View style={styles.orangeStepIcon}>
                <Ionicons name="bus" size={20} color="#FFFFFF" />
              </View>
              <View style={styles.stepTextContent}>
                <Text style={styles.stepTitleText}>Prenez le Bus SOTRA Ligne 22 pendant 18 min</Text>
                <Text style={styles.stepDescText}>
                  Montez à l'arrêt <Text style={styles.boldText}>Gare Samaké</Text> et descendez à <Text style={styles.boldText}>Terminus Riviera.</Text>
                </Text>
                <Text style={styles.stepCostText}>
                  Coût estimé : <Text style={styles.boldText}>{costRange}</Text>
                </Text>
                <Text style={styles.stepMetaText}>09:34 → 09:52</Text>
              </View>
            </View>

            <View style={styles.stepItemRow}>
              <View style={styles.orangeStepIcon}>
                <Ionicons name="walk" size={20} color="#FFFFFF" />
              </View>
              <View style={styles.stepTextContent}>
                <Text style={styles.stepTitleText}>Marchez pendant 5 min</Text>
                <Text style={styles.stepDescText}>
                  Marchez jusqu me à <Text style={styles.boldText}>{arrival}.</Text>
                </Text>
                <Text style={styles.stepMetaText}>09:52 → 09:57 • 350 m</Text>
              </View>
            </View>
          </>
        );
      }
      // Gbaka
      return (
        <>
          <View style={styles.stepItemRow}>
            <View style={styles.orangeStepIcon}>
              <Ionicons name="walk" size={20} color="#FFFFFF" />
            </View>
            <View style={styles.stepTextContent}>
              <Text style={styles.stepTitleText}>Marchez pendant 3 min</Text>
              <Text style={styles.stepDescText}>
                Depuis <Text style={styles.boldText}>{departure}</Text> jusqu me au rang de Gbaka.
              </Text>
              <Text style={styles.stepMetaText}>09:30 → 09:33 • 200 m</Text>
            </View>
          </View>

          <View style={styles.stepItemRow}>
            <View style={styles.orangeStepIcon}>
              <Ionicons name="bus" size={20} color="#FFFFFF" />
            </View>
            <View style={styles.stepTextContent}>
              <Text style={styles.stepTitleText}>Prenez le Gbaka Samaké pendant 15 min</Text>
              <Text style={styles.stepDescText}>
                Direction <Text style={styles.boldText}>Adjamé Gare.</Text>
              </Text>
              <Text style={styles.stepCostText}>
                Coût estimé : <Text style={styles.boldText}>{costRange}</Text>
              </Text>
              <Text style={styles.stepMetaText}>09:33 → 09:48</Text>
            </View>
          </View>

          <View style={styles.stepItemRow}>
            <View style={styles.orangeStepIcon}>
              <Ionicons name="walk" size={20} color="#FFFFFF" />
            </View>
            <View style={styles.stepTextContent}>
              <Text style={styles.stepTitleText}>Marchez pendant 4 min</Text>
              <Text style={styles.stepDescText}>
                Arrivée à destination finale <Text style={styles.boldText}>{arrival}.</Text>
              </Text>
              <Text style={styles.stepMetaText}>09:48 → 09:52 • 300 m</Text>
            </View>
          </View>
        </>
      );
    }

    if (mode === 'Debout') {
      return (
        <>
          <View style={styles.stepItemRow}>
            <View style={styles.orangeStepIcon}>
              <Ionicons name="walk" size={20} color="#FFFFFF" />
            </View>
            <View style={styles.stepTextContent}>
              <Text style={styles.stepTitleText}>Marchez pendant 3 min</Text>
              <Text style={styles.stepDescText}>
                Depuis <Text style={styles.boldText}>{departure}</Text> jusqu me à la tête de station.
              </Text>
              <Text style={styles.stepMetaText}>09:30 → 09:33 • 200 m</Text>
            </View>
          </View>

          <View style={styles.stepItemRow}>
            <View style={styles.orangeStepIcon}>
              <Ionicons name={suboption === 'wôro-wôro' || suboption === 'Taxi' || suboption === 'Yango' ? 'car' : 'bus'} size={20} color="#FFFFFF" />
            </View>
            <View style={styles.stepTextContent}>
              <Text style={styles.stepTitleText}>
                Prenez le {suboption} ({subtext || 'Standard'}) pendant {durationMinutes} min
              </Text>
              <Text style={styles.stepDescText}>
                Trajet par la voie principale avec arrêts réguliers.
              </Text>
              <Text style={styles.stepCostText}>
                Coût estimé : <Text style={styles.boldText}>{costRange}</Text>
              </Text>
              <Text style={styles.stepMetaText}>09:33 → 09:48 • {distance}</Text>
            </View>
          </View>

          <View style={styles.stepItemRow}>
            <View style={styles.orangeStepIcon}>
              <Ionicons name="walk" size={20} color="#FFFFFF" />
            </View>
            <View style={styles.stepTextContent}>
              <Text style={styles.stepTitleText}>Marchez pendant 3 min</Text>
              <Text style={styles.stepDescText}>
                Jusqu'à <Text style={styles.boldText}>{arrival}.</Text>
              </Text>
              <Text style={styles.stepMetaText}>09:48 → 09:51 • 250 m</Text>
            </View>
          </View>
        </>
      );
    }

    // Suspendu (VIP / Confort)
    return (
      <>
        <View style={styles.stepItemRow}>
          <View style={styles.orangeStepIcon}>
            <Ionicons name={suboption === 'Yango' ? 'sparkles' : 'car'} size={20} color="#FFFFFF" />
          </View>
          <View style={styles.stepTextContent}>
            <Text style={styles.stepTitleText}>
              Prise en charge {suboption === 'Yango' ? 'Yango VIP' : 'Taxi Compteur'} à 09:30
            </Text>
            <Text style={styles.stepDescText}>
              Embarquement direct à <Text style={styles.boldText}>{departure}.</Text>
            </Text>
            <Text style={styles.stepMetaText}>09:30 → 09:33</Text>
          </View>
        </View>

        <View style={styles.stepItemRow}>
          <View style={styles.orangeStepIcon}>
            <Ionicons name="car" size={20} color="#FFFFFF" />
          </View>
          <View style={styles.stepTextContent}>
            <Text style={styles.stepTitleText}>
              Course Directe Climatisée pendant {durationMinutes} min
            </Text>
            <Text style={styles.stepDescText}>
              Trajet VIP via le Boulevard Latrille. Voyage confortable et rapide.
            </Text>
            <Text style={styles.stepCostText}>
              Coût estimé : <Text style={styles.boldText}>{costRange}</Text>
            </Text>
            <Text style={styles.stepMetaText}>09:33 → 09:54 • {distance}</Text>
          </View>
        </View>
      </>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        {/* Top Header Bar */}
        <View style={styles.headerBar}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtnWrapper}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={24} color="#000000" />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>
            Détail : {mode} ({suboption})
          </Text>

          <View style={styles.headerRightIcons}>
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
              <Ionicons name="warning" size={22} color="#ED1C24" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Top Half: Interactive Route Map Section */}
        <View style={styles.mapSection}>
          <Image
            source={require('@/assets/images/map-abidjan-routes.png')}
            style={styles.mapImage}
            contentFit="cover"
          />
        </View>

        {/* Bottom Half: Detailed Timeline Itinerary Decomposition */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.timelineRowLayout}>
            {/* Left Vertical Dashed Bar */}
            <View style={styles.timelineDashedLine} />

            {/* Timeline Steps Column */}
            <View style={styles.timelineStepsCol}>
              {renderDynamicSteps()}

              {/* Destination Arrival Step */}
              <View style={styles.stepItemRow}>
                <View style={styles.orangeStepIcon}>
                  <Ionicons name="location" size={22} color="#FFFFFF" />
                </View>
                <View style={styles.stepTextContent}>
                  <Text style={styles.destTitleText}>{arrival}</Text>
                  <Text style={styles.stepDescText}>
                    Vous êtes bien arrivé ! Trajet {mode} ({suboption}) terminé avec succès.
                  </Text>
                  <View style={styles.destActionsRow}>
                    <TouchableOpacity style={styles.actionIconBtn} activeOpacity={0.7}>
                      <Ionicons name="thumbs-up" size={16} color="#000000" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionIconBtn} activeOpacity={0.7}>
                      <Ionicons name="share-social" size={16} color="#000000" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionIconBtn} activeOpacity={0.7}>
                      <Ionicons name="bookmark-outline" size={16} color="#000000" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
          </View>

          {/* Assistant SIRA Section with exact user dimensions */}
          <View style={styles.assistantContainer}>
            <View style={styles.assistantBubbleBox}>
              <View style={styles.siraBadgeHeader}>
                <View style={styles.siraDotLive} />
                <Text style={styles.siraBadgeText}>ASSISTANT SIRA</Text>
              </View>
              <Text style={styles.bubbleText}>
                Voici comment <Text style={styles.bubbleBoldText}>vous</Text> allez <Text style={styles.bubbleBoldText}>rejoindre</Text> votre destination.
              </Text>
            </View>

            <Image
              source={require('@/assets/images/sira-character-assistant.png')}
              style={styles.assistantCharacterImg}
              contentFit="contain"
            />
          </View>
        </ScrollView>

        {/* Sticky Footer Bar with Start Itinerary Button */}
        <View style={styles.bottomBarContainer}>
          <TouchableOpacity
            style={styles.startNavigationBtn}
            onPress={() =>
              router.push({
                pathname: '/navigation-active',
                params: { destination: arrival },
              })
            }
            activeOpacity={0.85}
          >
            <View style={styles.startFabInnerCircle}>
              <Ionicons name="navigate-sharp" size={16} color="#F26522" />
            </View>
            <Text style={styles.startNavigationBtnText}>Démarrer l'itinéraire</Text>
          </TouchableOpacity>
        </View>

        {/* Feedback Modal */}
        {showFeedback && (
          <View style={styles.feedbackModalOverlay}>
            <View style={styles.feedbackCard}>
              <TouchableOpacity
                style={styles.feedbackClose}
                onPress={() => setShowFeedback(false)}
              >
                <Ionicons name="close" size={20} color="#666666" />
              </TouchableOpacity>

              <Image
                source={require('@/assets/images/sira-character-assistant.png')}
                style={styles.feedbackAvatar}
                contentFit="contain"
              />

              <Text style={styles.feedbackTitle}>
                Comment s'est passé votre trajet ?
              </Text>
              <Text style={styles.feedbackSub}>
                Votre avis nous aide à améliorer SIRA.
              </Text>

              <View style={styles.starsRow}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <TouchableOpacity
                    key={star}
                    onPress={() => setRating(star)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={star <= rating ? 'star' : 'star-outline'}
                      size={28}
                      color="#F26522"
                    />
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={styles.submitFeedbackBtn}
                onPress={() => setShowFeedback(false)}
                activeOpacity={0.85}
              >
                <Text style={styles.submitFeedbackText}>Envoyer mon avis</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Custom WhatsApp style Bottom Navigation Bar */}
        <CustomBottomTabBar activeTab="routes" />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  safeArea: {
    flex: 1,
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
    fontSize: 17,
    fontWeight: '800',
    color: '#000000',
  },
  headerRightIcons: {
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
  mapSection: {
    height: height * 0.36,
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#EAEAEA',
  },
  mapImage: {
    width: '100%',
    height: '100%',
  },
  tripSummaryPill: {
    position: 'absolute',
    top: 12,
    left: '12%',
    right: '25%',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 5,
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(242, 101, 34, 0.2)',
  },
  tripSummaryText: {
    fontSize: 11.5,
    color: '#333333',
    fontWeight: '500',
  },
  summaryBold: {
    fontWeight: '800',
    color: '#000000',
  },
  summaryGreen: {
    fontWeight: '800',
    color: '#10B981',
  },
  mapLegendCard: {
    position: 'absolute',
    top: 12,
    right: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 6,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  legendRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendLineBar: {
    width: 24,
    height: 4,
    borderRadius: 2,
  },
  mapTrafficCallout: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
  accidentCallout: {
    top: '36%',
    right: '15%',
    borderColor: '#E53E3E',
  },
  accidentTitle: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#E53E3E',
  },
  accidentSub: {
    fontSize: 9.5,
    color: '#E53E3E',
  },
  routePerturbeeCallout: {
    top: '62%',
    left: '38%',
    borderColor: '#F26522',
  },
  routePerturbeeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#F26522',
  },
  departStationBadge: {
    position: 'absolute',
    top: 14,
    left: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  departTag: {
    backgroundColor: '#00875A',
    color: '#FFFFFF',
    fontSize: 8.5,
    fontWeight: '900',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  departName: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#000000',
    marginTop: 2,
  },
  mapCompassFab: {
    position: 'absolute',
    bottom: 14,
    right: 14,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F26522',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#F26522',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  scrollView: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  scrollContent: {
    paddingTop: 16,
    paddingHorizontal: 14,
    paddingBottom: 40,
  },
  timelineRowLayout: {
    flexDirection: 'row',
    position: 'relative',
  },
  timelineDashedLine: {
    position: 'absolute',
    left: 18,
    top: 14,
    bottom: 40,
    width: 6,
    backgroundColor: '#1E293B',
    borderRadius: 3,
  },
  timelineStepsCol: {
    flex: 1,
    paddingLeft: 0,
    gap: 16,
  },
  stepItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  orangeStepIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F26522',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 3,
    shadowColor: '#F26522',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  stepTextContent: {
    flex: 1,
    paddingLeft: 4,
    paddingBottom: 16,
  },
  stepTitleText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#000000',
    marginBottom: 3,
  },
  stepTagBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  stepTagText: {
    fontSize: 10,
    fontWeight: '800',
  },
  stepDescText: {
    fontSize: 13,
    color: '#333333',
    lineHeight: 18,
    marginTop: 2,
  },
  boldText: {
    fontWeight: '800',
    color: '#000000',
  },
  stepCostText: {
    fontSize: 13,
    color: '#333333',
    marginTop: 3,
  },
  stepMetaText: {
    fontSize: 12,
    color: '#666666',
    fontWeight: '500',
    marginTop: 4,
  },
  destTitleText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#000000',
    marginBottom: 2,
  },
  destActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 10,
  },
  actionIconBtn: {
    padding: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
  },
  assistantContainer: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    marginTop: 14,
    marginRight: 16,
    marginBottom: 10,
  },
  assistantCharacterImg: {
    width: 110,
    height: 140,
  },
  assistantBubbleBox: {
    width: 135,
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(242, 101, 34, 0.3)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 3,
    marginBottom: 6,
  },
  siraBadgeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  siraDotLive: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#10B981',
  },
  siraBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#F26522',
    letterSpacing: 0.4,
  },
  bubbleText: {
    fontSize: 10.5,
    color: '#334155',
    lineHeight: 14,
  },
  bubbleBoldText: {
    fontWeight: '800',
    color: '#0F172A',
  },
  bottomBarContainer: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 4,
    alignItems: 'center',
  },
  startNavigationBtn: {
    backgroundColor: '#F26522',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: 22,
    borderRadius: 20,
    gap: 8,
    shadowColor: '#F26522',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  startFabInnerCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  startNavigationBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '800',
  },
  feedbackModalOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 200,
  },
  feedbackCard: {
    width: '90%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    alignItems: 'center',
    position: 'relative',
  },
  feedbackClose: {
    position: 'absolute',
    top: 14,
    right: 14,
    padding: 4,
  },
  feedbackAvatar: {
    width: 70,
    height: 70,
    marginBottom: 10,
  },
  feedbackTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#000000',
    textAlign: 'center',
  },
  feedbackSub: {
    fontSize: 12,
    color: '#666666',
    marginTop: 4,
    textAlign: 'center',
  },
  starsRow: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 16,
  },
  submitFeedbackBtn: {
    backgroundColor: '#F26522',
    width: '100%',
    paddingVertical: 12,
    borderRadius: 20,
    alignItems: 'center',
  },
  submitFeedbackText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
