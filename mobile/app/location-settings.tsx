// Ma position : la position réelle du voyageur (nommée par le repère le plus
// proche) et l'état réel de l'autorisation du téléphone. Aucune donnée
// d'exemple : sans autorisation, l'écran le dit et propose de l'accorder.
import React, { useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { OsmMapView } from '@/components/osm-map-view';
import { goBack } from '@/lib/navigation';
import { canOpenSettings, openPhoneSettings, PERMISSION_LABELS, usePermissions } from '@/lib/permissions';
import { ensureCurrentPlace, useCurrentPlace } from '@/lib/places';

const { height } = Dimensions.get('window');

export default function LocationSettingsScreen() {
  const router = useRouter();
  const here = useCurrentPlace();
  const { states, request } = usePermissions();
  const permission = states.location;
  useEffect(() => { if (permission === 'granted') void ensureCurrentPlace(); }, [permission]);

  const placeTitle = here.status === 'ready' ? here.title
    : here.status === 'locating' ? 'Localisation…'
    : 'Position inconnue';
  const placeDetail = here.status === 'ready' ? here.subtitle
    : here.status === 'unavailable' ? here.reason
    : null;

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
          {/* Map centred on the real position, when it is known */}
          <View style={styles.mapContainer}>
            <OsmMapView
              departureName={here.status === 'ready' ? here.title : undefined}
              origin={here.status === 'ready' ? here.coordinates : null}
              style={styles.mapImage}
            />

            {/* Top Right "Me localiser" Pill Badge */}
            {permission !== 'granted' && permission !== 'blocked' && (
              <TouchableOpacity
                style={styles.votrePositionBadge}
                activeOpacity={0.85}
                onPress={() => void request('location')}
              >
                <Text style={styles.votrePositionText}>Me localiser</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Position Address & Permission Card Details */}
          <View style={styles.detailsContainer}>
            <Text style={styles.positionLabel}>Position</Text>
            <Text style={styles.addressValueText}>{placeTitle}</Text>
            {placeDetail ? <Text style={styles.addressDetailText}>{placeDetail}</Text> : null}
            <View style={styles.dividerLine} />

            {/* Access to Location: real permission of the phone */}
            <View style={styles.permissionCard}>
              <View style={styles.cardTextCol}>
                <Text style={styles.cardTitle}>Accès à la position · {PERMISSION_LABELS[permission]}</Text>
                <Text style={styles.cardDesc}>
                  Permet à SIRA de partir de là où vous êtes et de vous prévenir avant de descendre. Votre position n&apos;est pas enregistrée.
                </Text>
                {permission === 'blocked' && !canOpenSettings && (
                  <Text style={styles.cardHint}>Pour changer ce choix, passez par les réglages du navigateur.</Text>
                )}
              </View>

              {(permission === 'unknown' || permission === 'denied') && (
                <TouchableOpacity style={styles.cardButton} onPress={() => void request('location')} activeOpacity={0.85}>
                  <Text style={styles.cardButtonText}>Autoriser</Text>
                </TouchableOpacity>
              )}
              {(permission === 'granted' || permission === 'blocked') && canOpenSettings && (
                <TouchableOpacity style={[styles.cardButton, styles.cardButtonOutline]} onPress={openPhoneSettings} activeOpacity={0.85}>
                  <Text style={[styles.cardButtonText, styles.cardButtonOutlineText]}>Réglages</Text>
                </TouchableOpacity>
              )}
              {permission === 'granted' && !canOpenSettings && (
                <Ionicons name="checkmark-circle" size={26} color="#16A34A" />
              )}
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
  addressDetailText: {
    fontSize: 13,
    color: '#666666',
    marginTop: 4,
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
  cardHint: {
    fontSize: 12,
    color: '#888888',
    fontStyle: 'italic',
    marginTop: 6,
  },
  cardButton: {
    backgroundColor: '#F26522',
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  cardButtonOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  cardButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  cardButtonOutlineText: {
    color: '#000000',
  },
});
