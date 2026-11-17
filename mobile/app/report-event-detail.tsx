// Signaler un événement, step 2, as in the designer's screens: the place on a map, the form
// (place, what happens, since when, photo), then « Message envoyé avec succès » with the
// SIRA character waving. Without GPS no place is assumed: the traveller puts it on the map.
import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { Text, TextInput } from '@/components/sira-text';
import { Image } from 'expo-image';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CustomBottomTabBar, useTabBarSpace } from '@/components/custom-bottom-tab-bar';
import { OsmMapView } from '@/components/osm-map-view';
import { MapLocationPicker } from '@/components/map-location-picker';
import type { MapPlace } from '@/components/osm-map-types';
import { notify } from '@/lib/notify';
import { currentToken } from '@/lib/session';
import { createReport, type Coordinates } from '@/lib/sira-api';
import { REPORT_FAILED, REPORT_SENT, reportDetailSpeech } from '@/lib/spoken';
import { say, useSpeech } from '@/lib/voice';
import { locateUser, nearestPlaceLabel } from '@/lib/places';
import { REPORT_TYPE_BY_CATEGORY, upsertReport, alertBadge, useAlertCount } from '@/lib/reports';
import { rememberReportOpinion } from '@/lib/report-opinions';
import { goBack } from '@/lib/navigation';

const { width, height } = Dimensions.get('window');

// « … constaté » or « … constatée », as each kind is said.
const TITLES: Record<string, string> = {
  accident: 'Accident de la circulation constaté',
  embouteillage: 'Embouteillage constaté',
  route_bloquee: 'Route bloquée constatée',
  inondation: 'Inondation constatée',
  route_degradee: 'Route dégradée constatée',
  vehicule_panne: 'Véhicule en panne constaté',
  autre: 'Événement constaté',
};

// Success screen of the design (402 wide): bubble 311 wide at x 46, the character 310 wide.
const k = width / 402;

export default function ReportEventDetailScreen() {
  // The form ends above the bottom bar (its last field stays reachable on small phones).
  const tabBarSpace = useTabBarSpace();
  const router = useRouter();
  const alertCount = useAlertCount();
  const params = useLocalSearchParams<{ categoryId?: string; title?: string }>();

  const [locationText, setLocationText] = useState('');
  const [descriptionText, setDescriptionText] = useState('');
  const [timeText, setTimeText] = useState('');
  // Where it happened: the traveller's GPS position, or a point they put on the map.
  const [position, setPosition] = useState<Coordinates | null>(null);
  const [locating, setLocating] = useState(true);
  const [picking, setPicking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  // Waze-style: the traveller's position is filled in. Without it, no place is assumed.
  useEffect(() => {
    let cancelled = false;
    locateUser()
      .then((coordinates) => {
        if (cancelled) return;
        setPosition(coordinates);
        setLocationText((text) => text || (nearestPlaceLabel(coordinates) ?? 'Ma position actuelle'));
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLocating(false); });
    return () => { cancelled = true; };
  }, []);

  const headerTitle = TITLES[params.categoryId ?? ''] ?? (params.title ? `${params.title} constaté` : TITLES.accident);

  useSpeech(`report:${params.categoryId ?? 'autre'}`, reportDetailSpeech(params.title ?? 'Accident de la circulation'));

  // The event on the map, centred on it.
  const eventPlaces: MapPlace[] = position
    ? [{ id: 'event', lat: position.latitude, lon: position.longitude, color: '#F26522', icon: 'alert', label: locationText || 'Lieu de l’événement' }]
    : [];

  const handleSubmitReport = async () => {
    if (!position || submitting) return;
    // A report counts for one traveller: it needs an account (« Plus tard » at login leaves none).
    if (!currentToken()) {
      notify('Connexion requise', 'Connecte-toi avec ton numéro Orange pour envoyer un signalement.', [
        { text: 'Me connecter', onPress: () => router.push('/login') },
        { text: 'Plus tard', onPress: () => {} },
      ]);
      return;
    }
    setSubmitting(true);
    try {
      const report = await createReport({
        type: REPORT_TYPE_BY_CATEGORY[params.categoryId ?? ''] ?? 'other',
        lat: position.latitude,
        lon: position.longitude,
        location: locationText.trim() || nearestPlaceLabel(position) || 'Lieu du signalement',
        description: [descriptionText.trim(), timeText.trim() ? `Constaté : ${timeText.trim()}` : ''].filter(Boolean).join(' · ') || undefined,
      });
      upsertReport(report);
      // Its window will say « Tu as signalé cet événement » rather than offer a vote the server refuses.
      rememberReportOpinion(report.id, 'author');
    } catch (error) {
      void say(REPORT_FAILED, 'alert');
      notify('Envoi impossible', error instanceof Error ? error.message : 'Réessaie dans un instant.');
      return;
    } finally {
      setSubmitting(false);
    }
    void say(REPORT_SENT, 'answer');
    setSent(true);
  };

  if (sent) {
    return (
      <View style={styles.container}>
        <StatusBar style="dark" />
        <View style={styles.successScreen}>
          <Image source={require('@/assets/images/city-route-3d-bg.jpg')} style={styles.successBg} contentFit="cover" contentPosition="top" />
          <Image
            source={require('@/assets/images/sira-character-assistant.png')}
            style={styles.successCharacter}
            contentFit="contain"
            contentPosition="bottom"
          />
          <SafeAreaView style={styles.successSafe} edges={['top']}>
            <TouchableOpacity
              style={styles.successClose}
              onPress={() => router.replace('/(tabs)')}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Fermer"
            >
              <Ionicons name="close" size={30} color="#FFFFFF" />
            </TouchableOpacity>
            <View style={styles.successBubble}>
              <Text style={styles.successTitle}>Message envoyé{'\n'}avec succès.</Text>
              <Text style={styles.successText}>
                <Text style={styles.successBold}>Merci</Text> de participer à l’<Text style={styles.successBold}>amélioration</Text> de
                ton <Text style={styles.successBold}>expérience avec SIRA</Text>
              </Text>
              <View style={styles.successTail} />
            </View>
          </SafeAreaView>
        </View>
        <CustomBottomTabBar activeTab="alerts" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.headerBar}>
          <TouchableOpacity
            style={styles.backBtnWrapper}
            onPress={() => goBack(router)}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="Retour"
          >
            <Ionicons name="arrow-back" size={24} color="#000000" />
          </TouchableOpacity>

          <Text style={styles.headerTitle} numberOfLines={1}>
            {headerTitle}
          </Text>

          <TouchableOpacity
            style={styles.headerIconButton}
            onPress={() => router.push('/notifications')}
            activeOpacity={0.8}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="Notifications"
          >
            <Ionicons name="notifications" size={22} color="#000000" />
            {alertCount > 0 && (
              <View style={styles.notificationBadge}>
                <Text style={styles.badgeText}>{alertBadge(alertCount)}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView style={styles.flexOne} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: tabBarSpace }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.mapContainer}>
              <OsmMapView style={styles.mapImage} places={eventPlaces} />
            </View>

            <View style={styles.sheetCard}>
              {/* The road on the left edge, as in the design. */}
              <View style={styles.roadStrip}>
                {Array.from({ length: 14 }, (_, index) => <View key={index} style={styles.roadDash} />)}
              </View>

              <View style={styles.formFieldsContainer}>
                {/* Place: the GPS one, or put on the map (the chevron, or the line when there is none). */}
                <View style={styles.fieldRow}>
                  <Ionicons name="location-sharp" size={26} color="#F26522" style={styles.fieldIcon} />
                  <View style={styles.inputWrapper}>
                    {position || locating ? (
                      <TextInput
                        style={styles.textInputPlace}
                        value={locationText}
                        onChangeText={setLocationText}
                        placeholder={locating ? 'Localisation…' : 'Lieu de l’événement'}
                        placeholderTextColor="#888888"
                      />
                    ) : (
                      <TouchableOpacity onPress={() => setPicking(true)} activeOpacity={0.7} accessibilityRole="button">
                        <Text style={styles.placeMissing}>Place l’événement sur la carte</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  {locating ? (
                    <ActivityIndicator color="#F26522" />
                  ) : (
                    <TouchableOpacity
                      style={styles.orangeChevronBtn}
                      onPress={() => setPicking(true)}
                      activeOpacity={0.8}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                      accessibilityRole="button"
                      accessibilityLabel="Choisir le lieu sur la carte"
                    >
                      <Ionicons name="chevron-forward" size={14} color="#FFFFFF" />
                    </TouchableOpacity>
                  )}
                </View>

                <View style={styles.fieldRow}>
                  <Ionicons name="chatbubble-ellipses" size={24} color="#F26522" style={styles.fieldIcon} />
                  <View style={styles.inputWrapper}>
                    <TextInput
                      style={styles.textInputNormal}
                      value={descriptionText}
                      onChangeText={setDescriptionText}
                      placeholder="Décris brièvement la situation."
                      placeholderTextColor="#888888"
                    />
                  </View>
                </View>

                <View style={styles.fieldRow}>
                  <Ionicons name="time" size={24} color="#F26522" style={styles.fieldIcon} />
                  <View style={styles.inputWrapper}>
                    <TextInput
                      style={styles.textInputNormal}
                      value={timeText}
                      onChangeText={setTimeText}
                      placeholder="À quelle heure cela s’est-il produit ?"
                      placeholderTextColor="#888888"
                    />
                  </View>
                </View>

                {/* No photo upload on the server yet: the line says so instead of pretending. */}
                <TouchableOpacity
                  style={styles.fieldRow}
                  activeOpacity={0.7}
                  onPress={() => notify('Photo', 'L’ajout de photo arrive dans une prochaine version.')}
                >
                  <Ionicons name="camera" size={24} color="#F26522" style={styles.fieldIcon} />
                  <View style={styles.inputWrapper}>
                    <Text style={styles.textInputMuted}>Ajouter une image ou une photo (bientôt)</Text>
                  </View>
                </TouchableOpacity>

                <View style={styles.submitBtnContainer}>
                  <TouchableOpacity
                    style={[styles.submitPillBtn, (!position || submitting) && styles.submitDisabled]}
                    onPress={handleSubmitReport}
                    disabled={!position || submitting}
                    activeOpacity={0.88}
                    accessibilityRole="button"
                  >
                    <View style={styles.whiteWarningIconCircle}>
                      <Ionicons name="warning" size={16} color="#F26522" />
                    </View>
                    <Text style={styles.submitPillText}>{submitting ? 'Envoi…' : 'Signaler l’événement'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>

        <CustomBottomTabBar activeTab="alerts" />
      </SafeAreaView>

      {/* Where it happened, pointed on the map (the GPS may be off, or missing on a computer). */}
      <Modal visible={picking} animationType="slide" onRequestClose={() => setPicking(false)}>
        <MapLocationPicker
          purpose="report"
          onBack={() => setPicking(false)}
          onConfirm={(title, coordinates) => {
            setPosition(coordinates);
            setLocationText(title);
            setPicking(false);
          }}
        />
      </Modal>
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
  flexOne: {
    flex: 1,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
  },
  backBtnWrapper: {
    padding: 4,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    // « Accident de la circulation constaté » holds on one line of a small phone.
    fontSize: 14,
    fontWeight: '500',
    color: '#000000',
    marginHorizontal: 8,
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
    flexGrow: 1,
  },
  mapContainer: {
    height: Math.max(260, height * 0.42),
    width: '100%',
    backgroundColor: '#EAEAEA',
  },
  mapImage: {
    width: '100%',
    height: '100%',
  },
  sheetCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderTopRightRadius: 24,
    flexDirection: 'row',
    paddingBottom: 24,
    paddingRight: 22,
    minHeight: 300,
  },
  // Black road with white dashes along the left edge.
  roadStrip: {
    width: 12,
    backgroundColor: '#000000',
    marginRight: 22,
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 6,
  },
  roadDash: {
    width: 3,
    height: 12,
    backgroundColor: '#FFFFFF',
  },
  formFieldsContainer: {
    flex: 1,
    paddingTop: 14,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 16,
  },
  fieldIcon: {
    width: 30,
    marginRight: 8,
  },
  // The underline sits under the text only, as in the design.
  inputWrapper: {
    flex: 1,
    minWidth: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#D9D9D9',
    paddingBottom: 6,
  },
  textInputPlace: {
    fontSize: 15,
    fontWeight: '500',
    color: '#000000',
    paddingVertical: 4,
  },
  placeMissing: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F26522',
    paddingVertical: 4,
  },
  textInputNormal: {
    fontSize: 14,
    fontWeight: '400',
    color: '#333333',
    paddingVertical: 4,
  },
  textInputMuted: {
    fontSize: 14,
    fontWeight: '400',
    color: '#888888',
    paddingVertical: 4,
  },
  orangeChevronBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#F26522',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  submitBtnContainer: {
    marginTop: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F26522',
    borderRadius: 26,
    paddingLeft: 8,
    paddingRight: 20,
    paddingVertical: 8,
    gap: 10,
  },
  submitDisabled: {
    opacity: 0.5,
  },
  whiteWarningIconCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitPillText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },

  // « Message envoyé avec succès »
  successScreen: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  successBg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  successCharacter: {
    position: 'absolute',
    bottom: 0,
    left: 40 * k,
    width: 310 * k,
    height: 310 * k * (460 / 320),
  },
  successSafe: {
    flex: 1,
  },
  successClose: {
    marginTop: 18,
    marginLeft: 18,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#111111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  successBubble: {
    marginTop: 54 * k,
    marginHorizontal: 46 * k,
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  successTitle: {
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '700',
    color: '#000000',
    textAlign: 'center',
  },
  successText: {
    marginTop: 4,
    fontSize: 17,
    lineHeight: 24,
    color: '#000000',
    textAlign: 'center',
  },
  successBold: {
    fontWeight: '700',
  },
  // Tail toward the character's head, a little left of the middle.
  successTail: {
    position: 'absolute',
    bottom: -14,
    left: '44%',
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderTopWidth: 14,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: 'rgba(255, 255, 255, 0.88)',
  },
});
