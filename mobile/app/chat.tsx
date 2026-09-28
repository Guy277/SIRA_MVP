// « Discuter avec SIRA » : questions écrites ou dites à voix haute. SIRA répond
// avec sa FAQ (modes, catégories, application) et, quand un trajet est suivi,
// avec les chiffres de SIRA-MORE et les signalements des voyageurs en direct
// (« je descends où ? », « y a des bouchons sur mon trajet ? »).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { reportCategory } from '@/components/voice-assistant-sheet';
import { formatDuration, formatPrice } from '@/lib/journey-format';
import { selectedJourney, useJourneyStore } from '@/lib/journey-store';
import { goBack } from '@/lib/navigation';
import { ensureCurrentPlace, rememberPlace, useCurrentPlace } from '@/lib/places';
import { voiceTrip, type VoiceReply } from '@/lib/sira-api';
import { useVoiceAssistant } from '@/lib/use-voice-assistant';

type Message = { id: string; from: 'me' | 'sira'; text: string; reply?: VoiceReply; error?: boolean };

const TRIP_QUESTIONS = ['Où en est mon trajet ?', 'Je descends où ?', 'Y a des bouchons sur mon trajet ?', 'Ça fait combien ?', "J'arrive à quelle heure ?"];
const GENERAL_QUESTIONS = ['C’est quoi Coulé, Debout, Suspendu ?', 'Différence entre gbaka et wôrô ?', 'Comment signaler un accident ?',
  'Le bateau-bus part d’où à Treichville ?', 'Tu gardes ma voix ?'];

let messageCount = 0;
const message = (from: Message['from'], text: string, extra: Partial<Message> = {}): Message =>
  ({ id: `m${++messageCount}`, from, text, ...extra });

export default function ChatScreen() {
  const router = useRouter();
  const here = useCurrentPlace();
  useEffect(() => { ensureCurrentPlace(); }, []);
  const position = here.status === 'ready' && !here.outside ? here.coordinates : null;

  // The trip SIRA talks about: the one being followed, else the one chosen in the results.
  const store = useJourneyStore();
  const followed = store.activeJourney ?? selectedJourney(store);
  const arrival = store.search?.arrival ?? null;
  const trip = useMemo(() => (followed && arrival ? voiceTrip(followed, arrival) : null), [followed, arrival]);
  const tripLabel = store.activeJourney ? 'Trajet en cours' : 'Trajet choisi';

  const voice = useVoiceAssistant(position, trip);
  const listening = voice.phase === 'recording';
  const thinking = voice.phase === 'thinking';

  const [messages, setMessages] = useState<Message[]>(() => [message('sira', trip
    ? `Pose-moi une question sur ton trajet vers ${arrival?.name}, ou sur les transports d'Abidjan.`
    : "Pose-moi une question sur les transports d'Abidjan ou sur l'application, ou dis-moi où tu veux aller.")]);
  const [draft, setDraft] = useState('');
  const scroll = useRef<ScrollView>(null);

  // Each new answer joins the conversation (with what was heard, when spoken).
  const shownReply = useRef<VoiceReply | null>(null);
  useEffect(() => {
    const reply = voice.reply;
    if (!reply || reply === shownReply.current) return;
    shownReply.current = reply;
    setMessages((list) => [
      ...list,
      ...(reply.transcript?.text ? [message('me', reply.transcript.text)] : []),
      message('sira', reply.reply_text, { reply }),
    ]);
  }, [voice.reply]);
  const shownError = useRef<string | null>(null);
  useEffect(() => {
    if (!voice.error || voice.error === shownError.current) return;
    shownError.current = voice.error;
    setMessages((list) => [...list, message('sira', voice.error!, { error: true })]);
  }, [voice.error]);
  useEffect(() => {
    const timer = setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(timer);
  }, [messages.length, thinking, listening]);

  const send = (text: string) => {
    const question = text.trim();
    if (!question || thinking) return;
    shownError.current = null;
    setDraft('');
    setMessages((list) => [...list, message('me', question)]);
    void voice.ask(question, { aloud: false });
  };

  const pressMic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    shownError.current = null;
    void voice.toggle();
  };

  const close = () => {
    voice.reset();
    goBack(router);
  };

  // Journeys found in the conversation open in the trips screen, like from the home microphone.
  const showJourneys = (reply: VoiceReply) => {
    const destination = reply.journey_request?.destination;
    if (!destination) return;
    voice.reset();
    rememberPlace(destination.name, { latitude: destination.lat, longitude: destination.lon });
    const origin = reply.journey_request?.origin;
    const spokenOrigin = origin && origin.name !== 'Ma position' ? origin : null;
    if (spokenOrigin) rememberPlace(spokenOrigin.name, { latitude: spokenOrigin.lat, longitude: spokenOrigin.lon });
    router.push({
      pathname: '/(tabs)/explore',
      params: { destination: destination.name, query: destination.name, ...(spokenOrigin ? { from: spokenOrigin.name } : {}) },
    });
  };
  const openReport = (reply: VoiceReply) => {
    voice.reset();
    router.push({ pathname: '/report-event-detail', params: reportCategory(reply) });
  };

  const lastSira = [...messages].reverse().find((item) => item.from === 'sira' && item.reply);
  const suggestions = trip ? TRIP_QUESTIONS : GENERAL_QUESTIONS;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <StatusBar style="light" />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeButton} onPress={close} activeOpacity={0.8} accessibilityLabel="Fermer la discussion"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={20} color="#000000" />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.title}>Discuter avec SIRA</Text>
            <Text style={styles.subtitle}>Transports, application, trajet en cours</Text>
          </View>
        </View>

        {trip && followed && (
          <View style={styles.tripCard} accessibilityLabel={`${tripLabel} vers ${arrival?.name}`}>
            <View style={styles.tripIcon}><Ionicons name="navigate" size={16} color="#FFFFFF" /></View>
            <View style={styles.flex}>
              <Text style={styles.tripLabel}>{tripLabel}</Text>
              <Text style={styles.tripText} numberOfLines={1}>
                Vers {arrival?.name} · {formatDuration(followed.duration)} · {formatPrice(followed.price)}
              </Text>
            </View>
            <Ionicons name="pulse" size={16} color="#F26522" accessibilityLabel="Signalements en direct" />
          </View>
        )}

        <ScrollView ref={scroll} style={styles.flex} contentContainerStyle={styles.conversation} keyboardShouldPersistTaps="handled">
          {messages.map((item) => (item.from === 'me' ? (
            <View key={item.id} style={styles.meRow}>
              <View style={styles.meBubble}><Text style={styles.meText}>{item.text}</Text></View>
            </View>
          ) : (
            <View key={item.id} style={styles.siraRow}>
              <Image source={require('@/assets/images/sira-character-assistant.png')} style={styles.avatar} contentFit="cover" />
              <View style={styles.siraColumn}>
                <View style={[styles.siraBubble, item.error && styles.errorBubble]} accessibilityLiveRegion="polite">
                  <Text style={[styles.siraText, item.error && styles.errorText]}>{item.text}</Text>
                </View>
                {item === lastSira && item.reply?.kind === 'journeys' && item.reply.journey_request?.destination && (
                  <TouchableOpacity style={styles.action} onPress={() => showJourneys(item.reply!)} activeOpacity={0.85}>
                    <Text style={styles.actionText}>Voir les trajets</Text>
                    <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
                  </TouchableOpacity>
                )}
                {item === lastSira && item.reply?.understanding?.intent === 'report_incident' && (
                  <TouchableOpacity style={styles.action} onPress={() => openReport(item.reply!)} activeOpacity={0.85}>
                    <Ionicons name="warning" size={16} color="#FFFFFF" />
                    <Text style={styles.actionText}>Signaler</Text>
                  </TouchableOpacity>
                )}
                {item.reply?.sources?.some((source) => source === 'signalements') && (
                  <Text style={styles.sourceNote}>D&apos;après les signalements des voyageurs, en direct</Text>
                )}
              </View>
            </View>
          )))}
          {(thinking || listening) && (
            <View style={styles.siraRow}>
              <Image source={require('@/assets/images/sira-character-assistant.png')} style={styles.avatar} contentFit="cover" />
              <View style={[styles.siraBubble, styles.pending]}>
                {thinking ? <ActivityIndicator color="#F26522" size="small" /> : <Ionicons name="mic" size={16} color="#DC2626" />}
                <Text style={styles.pendingText}>{thinking ? 'SIRA réfléchit…' : "Je t'écoute… j'envoie dès que tu te tais"}</Text>
              </View>
            </View>
          )}
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsBar} contentContainerStyle={styles.chips}
          keyboardShouldPersistTaps="handled">
          {suggestions.map((question) => (
            <TouchableOpacity key={question} style={styles.chip} onPress={() => send(question)} disabled={thinking || listening} activeOpacity={0.8}>
              <Text style={styles.chipText}>{question}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder="Écris ta question…"
            placeholderTextColor="#777777"
            onSubmitEditing={() => send(draft)}
            returnKeyType="send"
            editable={!listening}
            maxLength={500}
            accessibilityLabel="Ta question pour SIRA"
          />
          {draft.trim() ? (
            <TouchableOpacity style={styles.roundButton} onPress={() => send(draft)} disabled={thinking} activeOpacity={0.85} accessibilityLabel="Envoyer">
              <Ionicons name="send" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[styles.roundButton, listening && styles.roundButtonListening]} onPress={pressMic} disabled={thinking}
              activeOpacity={0.85} accessibilityLabel={listening ? 'Envoyer ma question' : 'Parler à SIRA'}>
              <Ionicons name={listening ? 'stop' : 'mic'} size={20} color="#FFFFFF" />
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#000000' },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 14 },
  closeButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#F26522', justifyContent: 'center', alignItems: 'center' },
  headerText: { flex: 1 },
  title: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  subtitle: { color: '#9CA3AF', fontSize: 13, marginTop: 2 },
  tripCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginBottom: 8, padding: 12,
    backgroundColor: '#1E1E1E', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(242, 101, 34, 0.35)',
  },
  tripIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#F26522', justifyContent: 'center', alignItems: 'center' },
  tripLabel: { color: '#F26522', fontSize: 12, fontWeight: '800' },
  tripText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600', marginTop: 1 },
  conversation: { paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  meRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  meBubble: { maxWidth: '80%', backgroundColor: '#F26522', borderRadius: 18, borderBottomRightRadius: 4, paddingVertical: 10, paddingHorizontal: 14 },
  meText: { color: '#FFFFFF', fontSize: 15, lineHeight: 21 },
  siraRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  avatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#1E1E1E' },
  siraColumn: { flex: 1, alignItems: 'flex-start', gap: 6 },
  siraBubble: {
    maxWidth: '88%', backgroundColor: '#1E1E1E', borderRadius: 18, borderBottomLeftRadius: 4, paddingVertical: 10, paddingHorizontal: 14,
    borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  siraText: { color: '#FFFFFF', fontSize: 15, lineHeight: 21 },
  errorBubble: { borderColor: 'rgba(252, 165, 165, 0.4)' },
  errorText: { color: '#FCA5A5' },
  pending: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pendingText: { color: '#9CA3AF', fontSize: 14 },
  sourceNote: { color: '#9CA3AF', fontSize: 11, marginLeft: 4 },
  action: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F26522', borderRadius: 20, paddingVertical: 9, paddingHorizontal: 16,
  },
  actionText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  chipsBar: { flexGrow: 0 },
  chips: { gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  chip: {
    backgroundColor: '#1E1E1E', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18,
    borderWidth: 1, borderColor: 'rgba(242, 101, 34, 0.4)',
  },
  chipText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  inputBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10 },
  input: {
    flex: 1, minHeight: 46, backgroundColor: '#1E1E1E', color: '#FFFFFF', borderRadius: 23, paddingHorizontal: 18, fontSize: 15,
    borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  roundButton: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#F26522', justifyContent: 'center', alignItems: 'center' },
  roundButtonListening: { backgroundColor: '#DC2626' },
});
