import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import {
  Dimensions,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { OsmMapView } from '@/components/osm-map-view';
import { notify } from '@/lib/notify';
import { journeyStore, useJourneyStore } from '@/lib/journey-store';
import { fetchJourneys, journeyImpact, voteReport, type ApiJourney, type LegMode, type ReportImpact } from '@/lib/sira-api';
import { formatClock, formatDistance, formatDuration, formatPrice, isVehicle, journeyPath, journeyTitle, stepDescription, stepTitle, timeline } from '@/lib/journey-format';
import { clientId, upsertReport, useLiveReports } from '@/lib/reports';
import { locateUser } from '@/lib/places';
import { goBack } from '@/lib/navigation';

const { height } = Dimensions.get('window');

const MODE_ICONS: Record<LegMode, keyof typeof Ionicons.glyphMap> = {
  walk: 'walk', wait: 'time', transfer: 'swap-horizontal', sotra: 'bus', gbaka: 'bus', woro: 'car-sport', taxi: 'car', boat: 'boat',
};
const MODE_COLORS: Record<LegMode, string> = {
  walk: '#10B981', wait: '#64748B', transfer: '#7C3AED', sotra: '#F26522', gbaka: '#F26522', woro: '#1E6091', taxi: '#1E6091', boat: '#0284C7',
};

export default function NavigationActiveScreen() {
  const router = useRouter();
  const { activeJourney: journey, search } = useJourneyStore();
  const { reports } = useLiveReports();
  const [startedAt] = useState(() => new Date());
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isVoiceMuted, setIsVoiceMuted] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [impact, setImpact] = useState<{ journeyId: string; value: ReportImpact } | null>(null);
  const [alternative, setAlternative] = useState<ApiJourney | null>(null);
  const [rerouting, setRerouting] = useState(false);
  // Incidents the traveller chose to drive through, and reports already
  // answered in the "toujours là ?" prompt.
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [answered, setAnswered] = useState<string[]>([]);

  const targetDestination = search?.arrival.name ?? 'Destination';
  const steps = useMemo(() => journey ? timeline(journey, startedAt) : [], [journey, startedAt]);
  const current = steps[Math.min(currentStepIndex, Math.max(steps.length - 1, 0))];

  // Re-evaluates confirmed incidents on this journey whenever reports change.
  const reportsKey = reports.map((report) => `${report.id}:${report.status}`).join('|');
  useEffect(() => {
    if (!journey) return;
    let cancelled = false;
    journeyImpact(journey.legs)
      .then((value) => { if (!cancelled) setImpact({ journeyId: journey.id, value }); })
      .catch(() => { /* signalements indisponibles : pas d'alerte */ });
    return () => { cancelled = true; };
  }, [journey, reportsKey]);

  const currentImpact = impact?.journeyId === journey?.id ? impact?.value : null;
  const affected = (currentImpact?.affected ?? []).filter((item) => !dismissed.includes(item.report.id));
  const delay = affected.reduce((sum, item) => sum + item.delayMinutes, 0);
  // Waze-style prompt for an unconfirmed report on the way.
  const toConfirm = (currentImpact?.unconfirmed ?? []).find((item) => !answered.includes(item.report.id));

  const eta = journey ? new Date(startedAt.getTime() + (journey.duration + delay) * 60_000) : null;

  const findAlternative = async () => {
    if (!search || !journey) return;
    setRerouting(true);
    try {
      // Reroute from where the traveller is now when GPS allows it.
      const here = await locateUser().catch(() => null);
      const origin = here ? { ...here, name: 'Ma position actuelle' } : search.departure;
      const data = await fetchJourneys({
        origin, destination: search.arrival, departureAt: new Date(),
        // Every confirmed incident is avoided, not only the one on this route:
        // otherwise the detour can lead straight into an earlier incident.
        avoid: reports
          .filter((report) => report.status === 'confirmed' || report.status === 'reliable')
          .slice(0, 10)
          .map((report) => ({ lat: report.lat, lon: report.lon, radiusM: ['flood', 'blocked'].includes(report.type) ? 300 : 200 })),
      });
      const best = data.journeys.find((item) => item.recommended) ?? data.journeys[0];
      if (best) setAlternative({ ...best, id: `${best.id}~${Date.now().toString(36)}` });
      else notify('Pas d’alternative', 'Aucun trajet ne contourne l’incident. Votre trajet actuel reste le meilleur choix.');
    } catch (error) {
      notify('Recalcul impossible', error instanceof Error ? error.message : 'Réessayez dans un instant.');
    } finally {
      setRerouting(false);
    }
  };

  const adoptAlternative = () => {
    if (!alternative) return;
    journeyStore.replaceActive(alternative);
    setAlternative(null);
    setCurrentStepIndex(0);
  };

  const answerStillThere = async (reportId: string, kind: 'confirm' | 'contest') => {
    setAnswered((ids) => [...ids, reportId]);
    try { upsertReport(await voteReport(reportId, kind, clientId())); } catch { /* déjà voté ou hors ligne */ }
  };

  const voiceText = affected.length
    ? `${affected[0].report.title} confirmé sur votre trajet : environ ${delay} min de retard.`
    : current ? `${stepTitle(current.leg)}. ${stepDescription(current.leg)}.` : 'Choisissez un trajet pour démarrer le guidage.';

  if (!journey || !current) {
    return (
      <View style={[styles.container, styles.emptyContainer]}>
        <StatusBar style="light" />
        <Ionicons name="navigate-circle" size={54} color="#F26522" />
        <Text style={styles.exitModalTitle}>Aucun trajet en cours</Text>
        <TouchableOpacity style={styles.confirmExitBtn} onPress={() => goBack(router)} activeOpacity={0.8}>
          <Text style={styles.confirmExitText}>Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const currentLeg = current.leg;

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Live map of the journey and community reports */}
      <OsmMapView
        style={styles.fullMapImage}
        origin={search?.departure}
        destination={search?.arrival}
        routeCoordinates={journeyPath(alternative ?? journey)}
        reports={reports}
      />

      {/* Overlay Safe Area */}
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']} pointerEvents="box-none">
        {/* Top instruction banner: tap to move to the next step */}
        <TouchableOpacity
          style={styles.topHudCard}
          activeOpacity={0.9}
          onPress={() => setCurrentStepIndex((index) => Math.min(index + 1, steps.length - 1))}
        >
          <View style={styles.hudHeaderRow}>
            <View style={[styles.directionIconCircle, { backgroundColor: MODE_COLORS[currentLeg.mode] }]}>
              <Ionicons name={MODE_ICONS[currentLeg.mode]} size={26} color="#FFFFFF" />
            </View>
            <View style={styles.hudTextCol}>
              <Text style={styles.hudInstructionText}>{stepTitle(currentLeg)}</Text>
              <Text style={styles.hudSubtext}>Étape {currentStepIndex + 1}/{steps.length} • {stepDescription(currentLeg)}</Text>
            </View>
            <TouchableOpacity
              onPress={() => setShowExitConfirm(true)}
              style={styles.exitNavBtn}
              activeOpacity={0.8}
            >
              <Ionicons name="close-circle" size={30} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <View style={styles.hudBottomRow}>
            <View style={styles.hudMetricBadge}>
              <Ionicons name="time-outline" size={14} color="#FFFFFF" />
              <Text style={styles.hudMetricText}>{formatClock(current.start)} → {formatClock(current.end)}</Text>
            </View>
            {isVehicle(currentLeg) && (
              <View style={styles.hudMetricBadge}>
                <Ionicons name="cash-outline" size={14} color="#FFFFFF" />
                <Text style={styles.hudMetricText}>{formatPrice(currentLeg.price)}</Text>
              </View>
            )}
            <View style={styles.hudMetricBadge}>
              <Ionicons name="play-forward-outline" size={14} color="#FFFFFF" />
              <Text style={styles.hudMetricText}>Touchez : étape suivante</Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Map Side Quick Action Buttons (Right Side) */}
        <View style={styles.mapSideControls}>
          <TouchableOpacity
            style={styles.mapControlBtn}
            onPress={() => setIsVoiceMuted(!isVoiceMuted)}
            activeOpacity={0.8}
          >
            <Ionicons
              name={isVoiceMuted ? 'volume-mute' : 'volume-high'}
              size={22}
              color={isVoiceMuted ? '#94A3B8' : '#F26522'}
            />
          </TouchableOpacity>

          <TouchableOpacity style={styles.mapControlBtn} activeOpacity={0.8} onPress={() => router.push('/report-event')}>
            <Ionicons name="warning" size={22} color="#EF4444" />
          </TouchableOpacity>
        </View>

        {/* Journey traffic status from confirmed community reports */}
        <View style={[styles.liveTrafficBadge, affected.length > 0 && styles.liveTrafficBadgeAlert]}>
          <View style={[styles.liveDotPulse, affected.length > 0 && styles.liveDotAlert]} />
          <Text style={styles.liveTrafficText}>
            {affected.length ? `${affected[0].report.title} confirmé · +${delay} min` : 'Aucun incident confirmé sur votre trajet'}
          </Text>
        </View>

        {/* SIRA voice assistant bubble (spoken text in a next version) */}
        {!isVoiceMuted && (
          <View style={styles.siraVoiceFloatingBar}>
            <Image
              source={require('@/assets/images/sira-character-assistant.png')}
              style={styles.siraNavAvatar}
              contentFit="contain"
            />
            <View style={styles.siraSpeechBubble}>
              <View style={styles.voiceWaveHeader}>
                <Ionicons name="mic" size={12} color="#F26522" />
                <Text style={styles.voiceLabel}>SIRA VOCAL</Text>
              </View>
              <Text style={styles.siraSpeechText}>{voiceText}</Text>
            </View>
          </View>
        )}

        {/* Incident on the route: estimated delay and alternative */}
        {affected.length > 0 && !alternative && (
          <View style={styles.incidentCard}>
            <Ionicons name="warning" size={22} color="#FFFFFF" />
            <View style={styles.incidentTextCol}>
              <Text style={styles.incidentTitle}>{affected[0].report.title} sur votre trajet</Text>
              <Text style={styles.incidentSub}>
                Confirmé par {affected[0].report.confirmations} usager(s) · {affected[0].report.location} · retard estimé {delay} min
              </Text>
            </View>
            <TouchableOpacity style={styles.incidentButton} onPress={findAlternative} disabled={rerouting} activeOpacity={0.85}>
              <Text style={styles.incidentButtonText}>{rerouting ? 'Calcul…' : 'Alternative'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {alternative && (
          <View style={styles.alternativeCard}>
            <Text style={styles.alternativeTitle}>Alternative : {journeyTitle(alternative)}</Text>
            <Text style={styles.alternativeSub}>
              {formatDuration(alternative.duration)} · {formatPrice(alternative.price)} · évite l’incident (trajet actuel ≈ {formatDuration(journey.duration + delay)})
            </Text>
            <View style={styles.alternativeButtons}>
              <TouchableOpacity style={styles.confirmExitBtn} onPress={adoptAlternative} activeOpacity={0.85}>
                <Text style={styles.confirmExitText}>Prendre ce trajet</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelExitBtn}
                onPress={() => { setDismissed((ids) => [...ids, ...affected.map((item) => item.report.id)]); setAlternative(null); }}
                activeOpacity={0.85}
              >
                <Text style={styles.cancelExitText}>Garder le mien</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {toConfirm && !affected.length && (
          <View style={styles.alternativeCard}>
            <Text style={styles.alternativeTitle}>{toConfirm.report.title} signalé sur votre trajet</Text>
            <Text style={styles.alternativeSub}>{toConfirm.report.location} · toujours là ?</Text>
            <View style={styles.alternativeButtons}>
              <TouchableOpacity style={styles.confirmExitBtn} onPress={() => answerStillThere(toConfirm.report.id, 'confirm')} activeOpacity={0.85}>
                <Text style={styles.confirmExitText}>Oui, toujours là</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelExitBtn} onPress={() => answerStillThere(toConfirm.report.id, 'contest')} activeOpacity={0.85}>
                <Text style={styles.cancelExitText}>Non, plus là</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Bottom Navigation Dashboard Card */}
        <View style={styles.bottomDashboardCard}>
          {/* Progress Bar with Milestones */}
          <View style={styles.progressTrackContainer}>
            <View style={styles.progressTrackBg}>
              <View style={[styles.progressTrackFill, { width: `${((currentStepIndex + 1) / steps.length) * 100}%` }]} />
            </View>
            <View style={styles.milestonesRow}>
              {steps.map((step, idx) => (
                <TouchableOpacity
                  key={step.leg.id}
                  onPress={() => setCurrentStepIndex(idx)}
                  style={[
                    styles.milestoneDot,
                    idx <= currentStepIndex && { backgroundColor: MODE_COLORS[step.leg.mode], borderColor: '#FFFFFF' },
                  ]}
                >
                  <Ionicons
                    name={MODE_ICONS[step.leg.mode]}
                    size={10}
                    color={idx <= currentStepIndex ? '#FFFFFF' : '#94A3B8'}
                  />
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Time, Destination & Actions Footer Row */}
          <View style={styles.dashboardFooterRow}>
            <View style={styles.etaCol}>
              <Text style={styles.etaTimeText}>{eta ? formatClock(eta) : '--:--'}</Text>
              <Text style={styles.etaLabelText}>Arrivée estimée</Text>
            </View>

            <View style={styles.destCol}>
              <Text style={styles.destNameText} numberOfLines={1}>
                {targetDestination}
              </Text>
              <Text style={styles.destSubText}>
                {formatDuration(journey.duration + delay)}{journey.distance_km ? ` • ${formatDistance(journey.distance_km)} au total` : ''}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.sosButton}
              onPress={() => setShowExitConfirm(true)}
              activeOpacity={0.85}
            >
              <Ionicons name="stop-circle" size={20} color="#FFFFFF" />
              <Text style={styles.sosButtonText}>Quitter</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Exit Confirmation Modal Overlay */}
        {showExitConfirm && (
          <View style={styles.exitModalOverlay}>
            <View style={styles.exitModalCard}>
              <Ionicons name="alert-circle" size={44} color="#F26522" />
              <Text style={styles.exitModalTitle}>Arrêter la navigation ?</Text>
              <Text style={styles.exitModalSub}>
                Voulez-vous vraiment quitter le guidage vers {targetDestination} ?
              </Text>
              <View style={styles.exitModalButtonsRow}>
                <TouchableOpacity
                  style={styles.cancelExitBtn}
                  onPress={() => setShowExitConfirm(false)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.cancelExitText}>Continuer</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.confirmExitBtn}
                  onPress={() => {
                    setShowExitConfirm(false);
                    goBack(router);
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.confirmExitText}>Quitter</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  liveTrafficBadgeAlert: {
    backgroundColor: '#991B1B',
  },
  liveDotAlert: {
    backgroundColor: '#FCA5A5',
  },
  incidentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    padding: 12,
    borderRadius: 16,
    backgroundColor: '#DC2626',
  },
  incidentTextCol: {
    flex: 1,
  },
  incidentTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  incidentSub: {
    color: '#FEE2E2',
    fontSize: 11,
    marginTop: 2,
  },
  incidentButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  incidentButtonText: {
    color: '#DC2626',
    fontSize: 12,
    fontWeight: '800',
  },
  alternativeCard: {
    marginHorizontal: 16,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    gap: 6,
  },
  alternativeTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  alternativeSub: {
    fontSize: 12,
    color: '#475569',
  },
  alternativeButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  fullMapImage: {
    ...StyleSheet.absoluteFill,
    width: '100%',
    height: '100%',
  },
  safeArea: {
    flex: 1,
    justifyContent: 'space-between',
  },
  topHudCard: {
    marginHorizontal: 16,
    marginTop: Platform.OS === 'android' ? 10 : 0,
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: 14,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  hudHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  directionIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 4,
  },
  hudTextCol: {
    flex: 1,
  },
  hudInstructionText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 20,
  },
  hudSubtext: {
    fontSize: 11.5,
    color: '#94A3B8',
    marginTop: 2,
    fontWeight: '600',
  },
  exitNavBtn: {
    padding: 2,
  },
  hudBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  hudMetricBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  hudMetricText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  mapSideControls: {
    position: 'absolute',
    right: 16,
    top: height * 0.22,
    gap: 10,
  },
  mapControlBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 5,
  },
  liveTrafficBadge: {
    position: 'absolute',
    top: height * 0.22,
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  liveDotPulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  liveTrafficText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  siraVoiceFloatingBar: {
    marginHorizontal: 16,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  siraNavAvatar: {
    width: 54,
    height: 64,
  },
  siraSpeechBubble: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
    borderWidth: 1,
    borderColor: '#EEF2F6',
  },
  voiceWaveHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  voiceLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: '#F26522',
    letterSpacing: 0.5,
  },
  siraSpeechText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
    lineHeight: 16,
  },
  bottomDashboardCard: {
    marginHorizontal: 16,
    marginBottom: Platform.OS === 'ios' ? 10 : 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  progressTrackContainer: {
    position: 'relative',
    marginBottom: 14,
  },
  progressTrackBg: {
    height: 6,
    backgroundColor: '#E2E8F0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressTrackFill: {
    height: '100%',
    backgroundColor: '#F26522',
    borderRadius: 3,
  },
  milestonesRow: {
    position: 'absolute',
    top: -4,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  milestoneDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#CBD5E1',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  dashboardFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  etaCol: {
    alignItems: 'flex-start',
  },
  etaTimeText: {
    fontSize: 22,
    fontWeight: '900',
    color: '#F26522',
  },
  etaLabelText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },
  destCol: {
    flex: 1,
    paddingHorizontal: 8,
  },
  destNameText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  destSubText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  sosButton: {
    backgroundColor: '#EF4444',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    gap: 4,
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 4,
  },
  sosButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  exitModalOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 1000,
  },
  exitModalCard: {
    width: '88%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  exitModalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 12,
    textAlign: 'center',
  },
  exitModalSub: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 6,
    textAlign: 'center',
    lineHeight: 18,
  },
  exitModalButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
    width: '100%',
  },
  cancelExitBtn: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    paddingVertical: 12,
    borderRadius: 16,
    alignItems: 'center',
  },
  cancelExitText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#475569',
  },
  confirmExitBtn: {
    flex: 1,
    backgroundColor: '#EF4444',
    paddingVertical: 12,
    borderRadius: 16,
    alignItems: 'center',
  },
  confirmExitText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
