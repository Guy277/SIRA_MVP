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
import { OsmMapView } from '@/components/osm-map-view';
import { notify } from '@/lib/notify';
import { voteReport, type TrafficReport } from '@/lib/sira-api';
import { REPORT_STATUS_LABEL, REPORT_STYLE, clientId, timeAgo, upsertReport, useLiveReports } from '@/lib/reports';
import { formatClock } from '@/lib/journey-format';

const { width, height } = Dimensions.get('window');

// Bottom panel categories filter the live map (maquette id -> API types).
const PANEL_TYPES: Record<string, string[]> = {
  accident: ['accident'],
  embouteillage: ['traffic'],
  route_bloquee: ['blocked', 'works'],
  inondation: ['flood'],
  autre: ['road_damage', 'breakdown', 'transport', 'other'],
};

export default function TrafficScreen() {
  const router = useRouter();
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panelFilter, setPanelFilter] = useState<string | null>(null);
  const [voting, setVoting] = useState(false);
  const { reports, updatedAt } = useLiveReports();
  const selectedIncident = reports.find((report) => report.id === selectedId) ?? null;

  const filteredIncidents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return reports.filter((item) =>
      (!panelFilter || PANEL_TYPES[panelFilter].includes(item.type))
      && (!query || item.location.toLowerCase().includes(query) || item.title.toLowerCase().includes(query)));
  }, [reports, searchQuery, panelFilter]);

  const handleCategoryPress = (categoryType: string) => {
    setPanelFilter((current) => current === categoryType ? null : categoryType);
  };

  const getMarkerColor = (type: string) => (REPORT_STYLE[type] ?? REPORT_STYLE.other).color;
  const getMarkerIcon = (type: string) => (REPORT_STYLE[type] ?? REPORT_STYLE.other).icon;

  // Waze-style confirmation by other users.
  const vote = async (report: TrafficReport, kind: 'confirm' | 'contest') => {
    setVoting(true);
    try {
      upsertReport(await voteReport(report.id, kind, clientId()));
      setSelectedId(null);
      notify('Merci', kind === 'confirm' ? 'Confirmation enregistrée.' : 'Votre avis a été enregistré.');
    } catch (error) {
      notify('Vote impossible', error instanceof Error ? error.message : 'Réessayez dans un instant.');
    } finally {
      setVoting(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      {/* Full Map View */}
      <View style={styles.mapWrapper}>
        <OsmMapView style={styles.mapImage} reports={filteredIncidents} onReportPress={(report) => setSelectedId(report.id)} />

        {/* Traffic Overlay Legend (Top Left) */}
        <View style={styles.legendCard}>
          <View style={styles.legendRow}>
            <View style={[styles.colorDot, { backgroundColor: '#F59E0B' }]} />
            <Text style={styles.legendText}>À confirmer</Text>
          </View>
          <View style={styles.legendRow}>
            <View style={[styles.colorDot, { backgroundColor: '#EF4444' }]} />
            <Text style={styles.legendText}>Confirmé</Text>
          </View>
          <View style={styles.legendRow}>
            <View style={[styles.colorDot, { backgroundColor: '#991B1B' }]} />
            <Text style={styles.legendText}>Fiable</Text>
          </View>
        </View>

        {/* Last Updated Badge (Top Right) */}
        <View style={styles.updatedBadge}>
          <View style={styles.greenPulseDot} />
          <Text style={styles.updatedText}>{updatedAt ? `${filteredIncidents.length} signalement(s) · ${formatClock(updatedAt)}` : 'Connexion…'}</Text>
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
            <View style={[styles.categoryIconCircle, panelFilter === 'accident' && styles.categoryIconCircleActive]}>
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
            <View style={[styles.categoryIconCircle, panelFilter === 'embouteillage' && styles.categoryIconCircleActive]}>
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
            <View style={[styles.categoryIconCircle, panelFilter === 'route_bloquee' && styles.categoryIconCircleActive]}>
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
            <View style={[styles.categoryIconCircle, panelFilter === 'inondation' && styles.categoryIconCircleActive]}>
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
            <View style={[styles.categoryIconCircle, panelFilter === 'autre' && styles.categoryIconCircleActive]}>
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
        onRequestClose={() => setSelectedId(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setSelectedId(null)}
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
                    <Text style={styles.modalInfoLabel}>Statut :</Text>
                    <Text
                      style={[
                        styles.modalInfoValue,
                        { color: getMarkerColor(selectedIncident.type) },
                      ]}
                    >
                      {REPORT_STATUS_LABEL[selectedIncident.status]} · {selectedIncident.confirmations} confirmation(s)
                    </Text>
                  </View>

                  <View style={styles.modalInfoRow}>
                    <Text style={styles.modalInfoLabel}>Signalé :</Text>
                    <Text style={styles.modalInfoValue}>{timeAgo(selectedIncident.createdAt)}</Text>
                  </View>

                  {selectedIncident.description ? <Text style={styles.modalDescription}>{selectedIncident.description}</Text> : null}
                </View>

                <View style={styles.modalActionsRow}>
                  <TouchableOpacity
                    style={styles.modalPrimaryButton}
                    onPress={() => vote(selectedIncident, 'confirm')}
                    disabled={voting}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="thumbs-up" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.modalPrimaryButtonText}>Toujours là</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.modalCloseButton}
                    onPress={() => vote(selectedIncident, 'contest')}
                    disabled={voting}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.modalCloseButtonText}>Plus là</Text>
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
  categoryIconCircleActive: {
    backgroundColor: '#F26522',
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
