import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { SideMenuModal } from '@/components/side-menu-modal';
import { CustomBottomTabBar } from '@/components/custom-bottom-tab-bar';
import { goBack } from '@/lib/navigation';

const { width, height } = Dimensions.get('window');

export default function NotificationAccidentDetailScreen() {
  const router = useRouter();
  const [showSideMenu, setShowSideMenu] = React.useState(false);

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      {/* Light Map Background Overlay */}
      <Image
        source={require('@/assets/images/explore-map-bg.png')}
        style={styles.backgroundImage}
        contentFit="cover"
      />

      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        {/* Header Bar */}
        <View style={styles.headerBar}>
          <TouchableOpacity
            style={styles.backBtnWrapper}
            onPress={() => goBack(router)}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={24} color="#000000" />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Accident signalé</Text>

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
              onPress={() => setShowSideMenu(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="menu" size={24} color="#000000" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Scrollable Responsive Body */}
        <ScrollView
          style={styles.mainScrollView}
          contentContainerStyle={styles.mainScrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Top Incident Details Section */}
          <View style={styles.alertContentContainer}>
            <View style={styles.accidentIconCircle}>
              <Ionicons name="car-sport" size={26} color="#FFFFFF" />
            </View>

            <Text style={styles.alertMainTitle}>
              Accident signalé sur votre itinéraire
            </Text>

            <Text style={styles.alertDescriptionText}>
              Un accident vient d’être signalé sur votre itinéraire actuel en direction de Cocody. L’incident a été signalé sur le Boulevard Latrille et pourrait entraîner un ralentissement d’environ 12 minutes sur votre trajet. SIRA a identifié une alternative pour vous permettre d’éviter la zone concernée.
            </Text>
          </View>

          {/* Map View Section */}
          <View style={styles.mapSection}>
            <Image
              source={require('@/assets/images/map-abidjan-routes.png')}
              style={styles.mapImage}
              contentFit="cover"
            />

            {/* Compass Rose (Top Right) */}
            <View style={styles.compassFab}>
              <Ionicons name="navigate-sharp" size={20} color="#002B66" />
              <Text style={styles.compassLetter}>N</Text>
            </View>

            {/* Red Accident Callout Badge on Map */}
            <View style={styles.accidentCalloutCard}>
              <View style={styles.warningCircleSmall}>
                <Ionicons name="warning" size={12} color="#FFFFFF" />
              </View>
              <View>
                <Text style={styles.calloutTitle}>Accident</Text>
                <Text style={styles.calloutSub}>Circulation ralentie</Text>
              </View>
            </View>

            {/* Glowing Red Pin Location */}
            <View style={styles.glowingPinWrapper}>
              <View style={styles.glowPulseRing} />
              <View style={styles.redCarPin}>
                <Ionicons name="car" size={14} color="#FFFFFF" />
              </View>
            </View>

            {/* Destination Pin Badge (Orange CI / Orange Digital Center) */}
            <View style={styles.destinationPinBadge}>
              <View style={styles.destIconWrapper}>
                <Ionicons name="business" size={14} color="#FFFFFF" />
              </View>
              <View style={styles.destTextWrapper}>
                <Text style={styles.destTitle}>Orange CI / Orange Digital Center</Text>
                <View style={styles.destTagPill}>
                  <Text style={styles.destTagText}>Destination</Text>
                </View>
              </View>
            </View>
          </View>
        </ScrollView>

        {/* Dual Action Bottom Bar (Split Pill Button) */}
        <View style={styles.dualBarContainer}>
          <View style={styles.splitPillWrapper}>
            {/* Orange Button: Changer d'itinéraire */}
            <TouchableOpacity
              style={styles.changeRouteBtn}
              onPress={() => router.push('/route-detail')}
              activeOpacity={0.85}
            >
              <View style={styles.whiteIconCircle}>
                <Ionicons name="location" size={14} color="#F26522" />
              </View>
              <Text style={styles.changeRouteText}>Changer d'itinéraire</Text>
            </TouchableOpacity>

            {/* Black Button: Garder mon itinéraire */}
            <TouchableOpacity
              style={styles.keepRouteBtn}
              onPress={() => router.push({ pathname: '/navigation-active', params: { destination: 'Orange Digital Center' } })}
              activeOpacity={0.85}
            >
              <Text style={styles.keepRouteText}>Garder mon itinéraire</Text>
              <View style={styles.whiteIconCircle}>
                <Ionicons name="location" size={14} color="#000000" />
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Bottom Navigation Bar */}
        <CustomBottomTabBar activeTab="alerts" />

        {/* Side Menu Drawer */}
        <SideMenuModal
          visible={showSideMenu}
          onClose={() => setShowSideMenu(false)}
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  backgroundImage: {
    ...StyleSheet.absoluteFill,
    width: '100%',
    height: '100%',
  },
  safeArea: {
    flex: 1,
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
  mainScrollView: {
    flex: 1,
  },
  mainScrollContent: {
    flexGrow: 1,
    paddingBottom: 10,
  },
  alertContentContainer: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 14,
  },
  accidentIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#F26522',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
    shadowColor: '#F26522',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  alertMainTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#000000',
    textAlign: 'center',
    marginBottom: 8,
  },
  alertDescriptionText: {
    fontSize: 13,
    color: '#444444',
    textAlign: 'center',
    lineHeight: 19,
    fontWeight: '400',
  },
  mapSection: {
    height: Math.max(300, height * 0.42),
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#EAEAEA',
  },
  mapImage: {
    width: '100%',
    height: '100%',
  },
  compassFab: {
    position: 'absolute',
    top: 14,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 5,
    elevation: 4,
  },
  compassLetter: {
    fontSize: 9,
    fontWeight: '900',
    color: '#002B66',
    marginTop: -2,
  },
  accidentCalloutCard: {
    position: 'absolute',
    top: '25%',
    left: '18%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 6,
    borderWidth: 1.5,
    borderColor: '#DC2626',
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 5,
  },
  warningCircleSmall: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#DC2626',
    justifyContent: 'center',
    alignItems: 'center',
  },
  calloutTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#DC2626',
  },
  calloutSub: {
    fontSize: 11,
    color: '#DC2626',
    fontWeight: '500',
  },
  glowingPinWrapper: {
    position: 'absolute',
    top: '34%',
    left: '14%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowPulseRing: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(220, 38, 38, 0.25)',
  },
  redCarPin: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  destinationPinBadge: {
    position: 'absolute',
    bottom: '18%',
    right: '8%',
    backgroundColor: '#002B66',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  destIconWrapper: {
    padding: 2,
  },
  destTextWrapper: {
    gap: 1,
  },
  destTitle: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  destTagPill: {
    backgroundColor: '#001A40',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  destTagText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  dualBarContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
  },
  splitPillWrapper: {
    flexDirection: 'row',
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  changeRouteBtn: {
    flex: 1,
    backgroundColor: '#F26522',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    gap: 8,
  },
  changeRouteText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  keepRouteBtn: {
    flex: 1,
    backgroundColor: '#000000',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    gap: 8,
  },
  keepRouteText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  whiteIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomNavContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#1E1E1E',
    paddingVertical: 12,
  },
  navItem: {
    padding: 6,
  },
});
