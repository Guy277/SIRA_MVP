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
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { CustomBottomTabBar } from '@/components/custom-bottom-tab-bar';
import { goBack } from '@/lib/navigation';

const { width } = Dimensions.get('window');

interface EventCategory {
  id: string;
  title: string;
  iconName: string;
  iconFamily: 'FontAwesome5' | 'Ionicons';
}

export default function ReportEventScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);

  const categories: EventCategory[] = [
    {
      id: 'accident',
      title: 'Accident',
      iconName: 'car-crash',
      iconFamily: 'FontAwesome5',
    },
    {
      id: 'embouteillage',
      title: 'Embouteillage',
      iconName: 'car',
      iconFamily: 'FontAwesome5',
    },
    {
      id: 'route_bloquee',
      title: 'Route bloquée',
      iconName: 'road',
      iconFamily: 'FontAwesome5',
    },
    {
      id: 'inondation',
      title: 'Inondation',
      iconName: 'water',
      iconFamily: 'Ionicons',
    },
    {
      id: 'route_degradee',
      title: 'Route\ndégradée',
      iconName: 'warning',
      iconFamily: 'Ionicons',
    },
    {
      id: 'vehicule_panne',
      title: 'Véhicule\nen panne',
      iconName: 'tools',
      iconFamily: 'FontAwesome5',
    },
    {
      id: 'autre',
      title: 'Autre\névènement',
      iconName: 'ellipsis-horizontal',
      iconFamily: 'Ionicons',
    },
  ];

  const handleSelectCategory = (category: EventCategory) => {
    setSelectedEvent(category.id);
    router.push({
      pathname: '/report-event-detail',
      params: {
        categoryId: category.id,
        title: category.title.replace('\n', ' '),
      },
    });
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
          >
            <Ionicons name="arrow-back" size={24} color="#000000" />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Signaler un évènement</Text>

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
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Top Banner Illustration with Assistant & Speech Bubble */}
          <View style={styles.bannerContainer}>
            {/* Background Cityscape with cars & bus */}
            <Image
              source={require('@/assets/images/city-traffic-accident-bg.png')}
              style={styles.bannerBgImage}
              contentFit="cover"
            />
            <View style={styles.bannerOverlay} />

            {/* Speech Bubble */}
            <View style={styles.speechBubbleBox}>
              <Text style={styles.speechBubbleText}>
                <Text style={styles.boldText}>En signalant un événement</Text>,{'\n'}
                vous nous aidez à <Text style={styles.boldText}>améliorer</Text>{'\n'}
                <Text style={styles.boldText}>SIRA</Text> et à vous proposer <Text style={styles.boldText}>des</Text>{'\n'}
                <Text style={styles.boldText}>itinéraires plus optimisés.</Text>
              </Text>
              <View style={styles.speechBubblePointer} />
            </View>

            {/* SIRA 3D Character Assistant */}
            <Image
              source={require('@/assets/images/sira-character-assistant.png')}
              style={styles.characterImg}
              contentFit="contain"
            />
          </View>

          {/* Heading Section */}
          <View style={styles.headingSection}>
            <Text style={styles.mainHeading}>Que  se passe-t-il ?</Text>
            <Text style={styles.subHeading}>
              Sélectionnez le type d'événement que vous voulez signaler.
            </Text>
          </View>

          {/* Event Category Grid (3 Columns) */}
          <View style={styles.gridContainer}>
            {categories.map((category) => {
              const isSelected = selectedEvent === category.id;
              return (
                <TouchableOpacity
                  key={category.id}
                  style={[
                    styles.categoryCard,
                    isSelected && styles.categoryCardSelected,
                  ]}
                  onPress={() => handleSelectCategory(category)}
                  activeOpacity={0.8}
                >
                  <View style={styles.orangeCircleIcon}>
                    {category.iconFamily === 'FontAwesome5' ? (
                      <FontAwesome5 name={category.iconName as any} size={24} color="#FFFFFF" />
                    ) : (
                      <Ionicons name={category.iconName as any} size={26} color="#FFFFFF" />
                    )}
                  </View>
                  <Text
                    style={styles.categoryTitle}
                    numberOfLines={2}
                    adjustsFontSizeToFit
                    minimumFontScale={0.75}
                  >
                    {category.title}
                  </Text>
                </TouchableOpacity>
              );
            })}
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
    width: width * 0.52,
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
    width: 180,
    height: 220,
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
    width: (width - 56) / 3,
    height: 112,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
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
  categoryCardSelected: {
    borderColor: '#F26522',
    backgroundColor: '#FFF4EE',
  },
  orangeCircleIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#F26522',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
    shadowColor: '#F26522',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 4,
  },
  categoryTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#000000',
    textAlign: 'center',
    lineHeight: 14,
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
