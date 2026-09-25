import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Switch,
  Dimensions,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CustomBottomTabBar } from '@/components/custom-bottom-tab-bar';
import { OsmMapView } from '@/components/osm-map-view';
import { goBack } from '@/lib/navigation';

const { width, height } = Dimensions.get('window');

export default function LocationSettingsScreen() {
  const router = useRouter();
  const [locationAccessEnabled, setLocationAccessEnabled] = useState(false);
  const [currentAddress, setCurrentAddress] = useState('Abobo samaké, abobo, rue 099');

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Top Header Bar */}
        <View style={styles.headerBar}>
          <TouchableOpacity
            style={styles.darkBackBtn}
            onPress={() => goBack(router)}
            activeOpacity={0.8}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Localisation</Text>
          <View style={styles.headerRightSpacer} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Top Interactive Map View Section */}
          <View style={styles.mapContainer}>
            <OsmMapView
              departureName="Abobo Samaké"
              arrivalName="Orange Digital Center"
              style={styles.mapImage}
            />

            {/* Top Right "Votre position" Pill Badge */}
            <TouchableOpacity
              style={styles.votrePositionBadge}
              activeOpacity={0.85}
              onPress={() => setLocationAccessEnabled(true)}
            >
              <Text style={styles.votrePositionText}>Votre position</Text>
            </TouchableOpacity>

            {/* Accident / Traffic Callout Badge on Map */}
            <View style={styles.accidentCalloutCard}>
              <View style={styles.warningCircleSmall}>
                <Ionicons name="warning" size={12} color="#FFFFFF" />
              </View>
              <View>
                <Text style={styles.calloutTitle}>Accident</Text>
                <Text style={styles.calloutSub}>Circulation ralentie</Text>
              </View>
            </View>

            {/* Glowing Pin Pinpoint */}
            <View style={styles.glowingPinWrapper}>
              <View style={styles.glowPulseRing} />
              <View style={styles.redCarPin}>
                <Ionicons name="car" size={14} color="#FFFFFF" />
              </View>
            </View>
          </View>

          {/* Position Address & Permission Card Details */}
          <View style={styles.detailsContainer}>
            <Text style={styles.positionLabel}>Position</Text>
            <Text style={styles.addressValueText}>{currentAddress}</Text>
            <View style={styles.dividerLine} />

            {/* Access to Location Switch Card */}
            <View style={styles.permissionCard}>
              <View style={styles.cardTextCol}>
                <Text style={styles.cardTitle}>Accès à la position</Text>
                <Text style={styles.cardDesc}>
                  Permet à SIRA d'utiliser automatiquement votre position pour vous proposer des itinéraires adaptés.
                </Text>
              </View>

              <Switch
                trackColor={{ false: '#E2E8F0', true: '#F26522' }}
                thumbColor={Platform.OS === 'ios' ? '#FFFFFF' : locationAccessEnabled ? '#FFFFFF' : '#F4F3F4'}
                ios_backgroundColor="#E2E8F0"
                onValueChange={setLocationAccessEnabled}
                value={locationAccessEnabled}
              />
            </View>
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
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
  },
  darkBackBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#1E1E1E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#000000',
    marginLeft: 14,
    letterSpacing: -0.2,
  },
  headerRightSpacer: {
    width: 38,
  },
  scrollView: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    paddingBottom: 24,
  },
  mapContainer: {
    height: Math.max(250, height * 0.35),
    width: '100%',
    position: 'relative',
    backgroundColor: '#EAEAEA',
  },
  mapImage: {
    width: '100%',
    height: '100%',
  },
  votrePositionBadge: {
    position: 'absolute',
    top: 14,
    right: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 7,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 5,
    elevation: 4,
  },
  votrePositionText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#000000',
  },
  accidentCalloutCard: {
    position: 'absolute',
    top: '32%',
    left: '26%',
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
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#DC2626',
    justifyContent: 'center',
    alignItems: 'center',
  },
  calloutTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#DC2626',
  },
  calloutSub: {
    fontSize: 8.5,
    color: '#DC2626',
    fontWeight: '500',
  },
  glowingPinWrapper: {
    position: 'absolute',
    top: '44%',
    left: '20%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowPulseRing: {
    position: 'absolute',
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(220, 38, 38, 0.25)',
  },
  redCarPin: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailsContainer: {
    paddingHorizontal: 18,
    paddingTop: 18,
  },
  positionLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#888888',
    marginBottom: 4,
  },
  addressValueText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#000000',
    letterSpacing: -0.2,
  },
  dividerLine: {
    height: 1,
    backgroundColor: '#EAEAEA',
    marginVertical: 16,
    width: '85%',
  },
  permissionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingVertical: 14,
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.03,
        shadowRadius: 4,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  cardTextCol: {
    flex: 1,
    paddingRight: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#000000',
    marginBottom: 4,
  },
  cardDesc: {
    fontSize: 12.5,
    fontWeight: '400',
    color: '#555555',
    lineHeight: 17,
  },
});
