import React, { useState, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Modal,
  Dimensions,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CustomBottomTabBar } from '@/components/custom-bottom-tab-bar';

const { width, height } = Dimensions.get('window');

export interface TrafficIncident {
  id: string;
  type: 'accident' | 'embouteillage' | 'route_bloquee' | 'inondation' | 'autre';
  title: string;
  location: string;
  severity: 'Fluide' | 'Modéré' | 'Dense' | 'Très dense';
  timeReported: string;
  description: string;
  topPercent: number;
  leftPercent: number;
}

const MOCK_INCIDENTS: TrafficIncident[] = [
  {
    id: '1',
    type: 'accident',
    title: 'Accident entre 2 véhicules',
    location: 'Voie Express Adjamé - Cocody',
    severity: 'Très dense',
    timeReported: 'Il y a 10 min',
    description: 'Voie de gauche bloquée. Fort ralentissement vers l’Indénié.',
    topPercent: 32,
    leftPercent: 68,
  },
  {
    id: '2',
    type: 'embouteillage',
    title: 'Ralentissement important',
    location: 'Carrefour Agban / Adjamé',
    severity: 'Dense',
    timeReported: 'Il y a 15 min',
    description: 'Bouchon habituel des heures de pointe. Avancement au pas.',
    topPercent: 44,
    leftPercent: 30,
  },
  {
    id: '3',
    type: 'accident',
    title: 'Accident matériel',
    location: 'Pont Bédié - Sortie Marcory',
    severity: 'Très dense',
    timeReported: 'Il y a 5 min',
    description: 'Véhicule en panne sur le pont. Intervention en cours.',
    topPercent: 68,
    leftPercent: 78,
  },
  {
    id: '4',
    type: 'route_bloquee',
    title: 'Travaux de voirie',
    location: 'Sortie Autoroute du Nord (Abobo)',
    severity: 'Très dense',
    timeReported: 'Il y a 45 min',
    description: 'Voie neutralisée pour réfection de la chaussée.',
    topPercent: 22,
    leftPercent: 88,
  },
  {
    id: '5',
    type: 'inondation',
    title: 'Accumulation d’eau de pluie',
    location: 'Zone Lagoon Abobo Samaké',
    severity: 'Modéré',
    timeReported: 'Il y a 30 min',
    description: 'Chaussée glissante et grande flaque d’eau.',
    topPercent: 12,
    leftPercent: 6,
  },
  {
    id: '6',
    type: 'embouteillage',
    title: 'Trafic très ralenti',
    location: 'Boulevard de la République - Plateau',
    severity: 'Dense',
    timeReported: 'Il y a 8 min',
    description: 'Affluence élevée aux abords de la cité administrative.',
    topPercent: 57,
    leftPercent: 48,
  },
];

export default function TrafficScreen() {
  const router = useRouter();
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIncident, setSelectedIncident] = useState<TrafficIncident | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);

  const filteredIncidents = useMemo(() => {
    if (!searchQuery.trim()) return MOCK_INCIDENTS;
    return MOCK_INCIDENTS.filter(
      (item) =>
        item.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.title.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery]);

  const handleCategoryPress = (categoryType: string) => {
    router.push({
      pathname: '/traffic-detail',
      params: { category: categoryType },
    });
  };

  const getMarkerColor = (type: string) => {
    switch (type) {
      case 'accident':
        return '#EF4444';
      case 'embouteillage':
        return '#F97316';
      case 'route_bloquee':
        return '#DC2626';
      case 'inondation':
        return '#0284C7';
      default:
        return '#F26522';
    }
  };

  const getMarkerIcon = (type: string) => {
    switch (type) {
      case 'accident':
        return 'car-sport';
      case 'embouteillage':
        return 'car';
      case 'route_bloquee':
        return 'ban';
      case 'inondation':
        return 'water';
      default:
        return 'alert-circle';
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      {/* Full Map View */}
      <View style={styles.mapWrapper}>
        <Image
          source={require('@/assets/images/map-abidjan-routes.png')}
          style={[
            styles.mapImage,
            { transform: [{ scale: zoomLevel }] }
          ]}
          contentFit="cover"
        />

        {/* Traffic Overlay Legend (Top Left) */}
        <View style={styles.legendCard}>
          <View style={styles.legendRow}>
            <View style={[styles.colorDot, { backgroundColor: '#22C55E' }]} />
            <Text style={styles.legendText}>Fluide</Text>
          </View>
          <View style={styles.legendRow}>
            <View style={[styles.colorDot, { backgroundColor: '#EAB308' }]} />
            <Text style={styles.legendText}>Modéré</Text>
          </View>
          <View style={styles.legendRow}>
            <View style={[styles.colorDot, { backgroundColor: '#F97316' }]} />
            <Text style={styles.legendText}>Dense</Text>
          </View>
          <View style={styles.legendRow}>
            <View style={[styles.colorDot, { backgroundColor: '#EF4444' }]} />
            <Text style={styles.legendText}>Très dense</Text>
          </View>
        </View>

        {/* Last Updated Badge (Top Right) */}
        <View style={styles.updatedBadge}>
          <View style={styles.greenPulseDot} />
          <Text style={styles.updatedText}>Mis à jour il y a 2 min.</Text>
        </View>

        {/* Zoom Controls */}
        <View style={styles.zoomControlBox}>
          <TouchableOpacity
            style={styles.zoomButton}
            onPress={() => setZoomLevel((prev) => Math.min(prev + 0.15, 1.4))}
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.zoomDivider} />
          <TouchableOpacity
            style={styles.zoomButton}
            onPress={() => setZoomLevel((prev) => Math.max(prev - 0.15, 0.85))}
            activeOpacity={0.8}
          >
            <Ionicons name="remove" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Interactive Map Incident Markers */}
        {filteredIncidents.map((incident) => {
          const bgColor = getMarkerColor(incident.type);
          const iconName = getMarkerIcon(incident.type);

          return (
            <TouchableOpacity
              key={incident.id}
              style={[
                styles.mapMarkerBadge,
                {
                  top: `${incident.topPercent}%`,
                  left: `${incident.leftPercent}%`,
                  backgroundColor: bgColor,
                },
              ]}
              onPress={() => setSelectedIncident(incident)}
              activeOpacity={0.85}
            >
              <Ionicons name={iconName as any} size={18} color="#FFFFFF" />
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Header Overlay Bar */}
      <SafeAreaView style={styles.safeAreaHeader} edges={['top']}>
        <View style={styles.headerRow}>
          {/* Back Button */}
          <TouchableOpacity
            style={styles.headerIconCircle}
            onPress={() => router.back()}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="arrow-back" size={24} color="#000000" />
          </TouchableOpacity>

          {/* Title */}
          <Text style={styles.headerTitle}>Trafics</Text>

          {/* Right Action Icons Row */}
          <View style={styles.headerRightActions}>
            {/* Notifications Bell */}
            <TouchableOpacity
              style={styles.headerIconCircle}
              onPress={() => router.push('/notifications')}
              activeOpacity={0.7}
            >
              <Ionicons name="notifications" size={22} color="#000000" />
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>5</Text>
              </View>
            </TouchableOpacity>

            {/* Warning Triangle Report Icon */}
            <TouchableOpacity
              style={styles.headerIconCircle}
              onPress={() => router.push('/report-event')}
              activeOpacity={0.7}
            >
              <Ionicons name="warning" size={24} color="#EF4444" />
            </TouchableOpacity>

            {/* Search Icon */}
            <TouchableOpacity
              style={styles.headerIconCircle}
              onPress={() => {
                setIsSearching((prev) => !prev);
                if (isSearching) setSearchQuery('');
              }}
              activeOpacity={0.7}
            >
              <Ionicons
                name={isSearching ? 'close' : 'search'}
                size={22}
                color="#000000"
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Expandable Search Input Bar */}
        {isSearching && (
          <View style={styles.searchBarContainer}>
            <Ionicons name="search" size={18} color="#64748B" style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Rechercher un axe, commune (Abobo, Plateau...)"
              placeholderTextColor="#94A3B8"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={18} color="#94A3B8" />
              </TouchableOpacity>
            )}
          </View>
        )}
      </SafeAreaView>

      {/* Floating Bottom Incident Category Panel (Floating above Bottom Navigation Bar) */}
      <View style={styles.bottomFloatingPanelWrapper}>
        <View style={styles.categoryCardPanel}>
          <TouchableOpacity
            style={styles.categoryItem}
            onPress={() => handleCategoryPress('accident')}
            activeOpacity={0.75}
          >
            <View style={styles.categoryIconCircle}>
              <Ionicons name="car-sport" size={20} color="#FFFFFF" />
            </View>
            <Text style={styles.categoryLabel} numberOfLines={1} adjustsFontSizeToFit>
              Accident
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.categoryItem}
            onPress={() => handleCategoryPress('embouteillage')}
            activeOpacity={0.75}
          >
            <View style={styles.categoryIconCircle}>
              <Ionicons name="car" size={20} color="#FFFFFF" />
            </View>
            <Text style={styles.categoryLabel} numberOfLines={1} adjustsFontSizeToFit>
              Embouteillage
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.categoryItem}
            onPress={() => handleCategoryPress('route_bloquee')}
            activeOpacity={0.75}
          >
            <View style={styles.categoryIconCircle}>
              <Ionicons name="construct" size={18} color="#FFFFFF" />
            </View>
            <Text style={styles.categoryLabel} numberOfLines={1} adjustsFontSizeToFit>
              Route bloquée
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.categoryItem}
            onPress={() => handleCategoryPress('inondation')}
            activeOpacity={0.75}
          >
            <View style={styles.categoryIconCircle}>
              <Ionicons name="water" size={20} color="#FFFFFF" />
            </View>
            <Text style={styles.categoryLabel} numberOfLines={1} adjustsFontSizeToFit>
              Inondation
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.categoryItem}
            onPress={() => handleCategoryPress('autre')}
            activeOpacity={0.75}
          >
            <View style={styles.categoryIconCircle}>
              <Ionicons name="ellipsis-horizontal" size={20} color="#FFFFFF" />
            </View>
            <Text style={styles.categoryLabel} numberOfLines={1} adjustsFontSizeToFit>
              Autre
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Incident Detail Modal */}
      <Modal
        visible={!!selectedIncident}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedIncident(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setSelectedIncident(null)}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />

            {selectedIncident && (
              <>
                <View style={styles.modalHeaderRow}>
                  <View
                    style={[
                      styles.modalCategoryBadge,
                      { backgroundColor: getMarkerColor(selectedIncident.type) },
                    ]}
                  >
                    <Ionicons
                      name={getMarkerIcon(selectedIncident.type) as any}
                      size={18}
                      color="#FFFFFF"
                    />
                  </View>

                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.modalTitle}>{selectedIncident.title}</Text>
                    <Text style={styles.modalSubtext}>{selectedIncident.location}</Text>
                  </View>
                </View>

                <View style={styles.modalInfoBox}>
                  <View style={styles.modalInfoRow}>
                    <Text style={styles.modalInfoLabel}>Gravité :</Text>
                    <Text
                      style={[
                        styles.modalInfoValue,
                        { color: getMarkerColor(selectedIncident.type) },
                      ]}
                    >
                      {selectedIncident.severity}
                    </Text>
                  </View>

                  <View style={styles.modalInfoRow}>
                    <Text style={styles.modalInfoLabel}>Signalé :</Text>
                    <Text style={styles.modalInfoValue}>{selectedIncident.timeReported}</Text>
                  </View>

                  <Text style={styles.modalDescription}>{selectedIncident.description}</Text>
                </View>

                <View style={styles.modalActionsRow}>
                  <TouchableOpacity
                    style={styles.modalPrimaryButton}
                    onPress={() => {
                      setSelectedIncident(null);
                      router.push('/notification-accident-detail');
                    }}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="navigate" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.modalPrimaryButtonText}>Voir le détail</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.modalCloseButton}
                    onPress={() => setSelectedIncident(null)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.modalCloseButtonText}>Fermer</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Bottom Navigation Bar */}
      <CustomBottomTabBar />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#E5E7EB',
  },
  mapWrapper: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapImage: {
    width: '100%',
    height: '100%',
  },
  safeAreaHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    zIndex: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerRow: {
    height: 54,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
  },
  headerIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#000000',
    letterSpacing: -0.3,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  notificationBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  notificationBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 4,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
  },
  legendCard: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 104 : 94,
    left: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    zIndex: 5,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 2,
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  legendText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
  },
  updatedBadge: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 104 : 94,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    zIndex: 5,
  },
  greenPulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22C55E',
    marginRight: 6,
  },
  updatedText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  zoomControlBox: {
    position: 'absolute',
    top: height * 0.42,
    right: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    zIndex: 5,
  },
  zoomButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F26522',
    justifyContent: 'center',
    alignItems: 'center',
  },
  zoomDivider: {
    height: 6,
  },
  mapMarkerBadge: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  bottomFloatingPanelWrapper: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 76 : 68,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 10,
    zIndex: 10,
  },
  categoryCardPanel: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 10,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  categoryItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    paddingHorizontal: 2,
  },
  categoryIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#F26522',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
    shadowColor: '#F26522',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  categoryLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#000000',
    textAlign: 'center',
    width: '100%',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  modalCategoryBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSubtext: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  modalInfoBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  modalInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  modalInfoLabel: {
    fontSize: 13,
    color: '#64748B',
  },
  modalInfoValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  modalDescription: {
    fontSize: 13,
    color: '#334155',
    marginTop: 6,
    lineHeight: 18,
  },
  modalActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modalPrimaryButton: {
    flex: 1,
    height: 44,
    backgroundColor: '#F26522',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalPrimaryButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalCloseButton: {
    height: 44,
    paddingHorizontal: 16,
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
  },
});
