// « Discuter avec SIRA » : SIRA en compagnon (docs/assistant-compagnon.md). Une conversation écrite ou dite, qui
// se souvient des derniers échanges ; chaque réponse vient des sources de SIRA (SIRA-MORE, signalements des
// voyageurs, FAQ), montrées sous la réponse, avec des boutons et des relances décidés par les règles de SIRA.
// Le micro de l'accueil (« On va où ? ») reste une commande rapide ; celui-ci converse.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text, TextInput } from '@/components/sira-text';
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
import { firstName, useSession } from '@/lib/session';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { voiceTrip, type CompanionStep, type VoiceReply } from '@/lib/sira-api';
import { useCompanion } from '@/lib/use-companion';

type Message = { id: string; from: 'me' | 'sira'; text: string; reply?: VoiceReply; error?: boolean };

const TRIP_QUESTIONS = ['Où en est mon trajet ?', 'Je descends où ?', 'Y a des bouchons sur mon trajet ?', 'Ça fait combien ?', "J'arrive à quelle heure ?"];
// Each one checked against SIRA on 2026-11-08 (answered from the FAQ, or a real trip from SIRA-MORE).
const GENERAL_QUESTIONS = ['Je veux aller au Plateau', 'C’est quoi Coulé, Debout, Suspendu ?', 'Différence entre gbaka et wôrô ?', 'Comment signaler un accident ?',
  'Le bateau-bus part d’où à Treichville ?', 'Tu gardes ma voix ?'];

// What SIRA is really doing while the traveller waits (one line per step it launched).
const STEP_WORDS: Record<CompanionStep, string> = {
  comprendre: 'Je comprends ta demande',
  trajets: 'Je compare les trajets (SIRA-MORE)',
  signalements: 'Je regarde les signalements des voyageurs',
  faq: 'Je cherche dans ce que je sais',
  llm: 'Je réfléchis à ta phrase',
  rediger: 'J’écris ma réponse',
};

// SIRA's last answer appears word by word (the whole text is already checked: only its display is gradual).
// Mounted once per answer (key = the message): it starts empty and fills up.
function TypingText({ text, style }: { text: string; style: object }) {
  const reduced = useReducedMotion();
  const words = useMemo(() => text.split(' '), [text]);
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (reduced) return;
    const timer = setInterval(() => setShown((n) => Math.min(n + 1, words.length)), 45);
    return () => clearInterval(timer);
  }, [words, reduced]);
  return <Text style={style}>{words.slice(0, reduced ? words.length : shown).join(' ')}</Text>;
}

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

  const voice = useCompanion(position, trip);
  const listening = voice.phase === 'recording';
  const hearing = voice.phase === 'hearing';
  const thinking = hearing || voice.phase === 'thinking';
  // A long wait is said, not hidden (the CPU server can take several seconds).
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!thinking) return;
    const timer = setTimeout(() => setSlow(true), 8000);
    return () => { clearTimeout(timer); setSlow(false); };
  }, [thinking, voice.phase]);

  // SIRA greets like a companion, with the traveller's first name when the account has one.
  const name = firstName(useSession()?.user);
  const [messages, setMessages] = useState<Message[]>(() => [message('sira', trip
    ? `Akwaba${name ? ` ${name}` : ''} ! Je suis avec toi sur ton trajet vers ${arrival?.name}. Une question, un doute ? Dis-moi.`
    : `Akwaba${name ? ` ${name}` : ''} ! Je suis SIRA, ton compagnon de route. Dis-moi où tu vas, ou ce qui te tracasse sur la route : je suis là.`)]);
  const [draft, setDraft] = useState('');
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);

  // What SIRA heard, shown at once while it answers; it joins the conversation with the answer.
  const spokenQuestion = useRef<string | null>(null);
  // Each new answer joins the conversation (with what was heard, when spoken).
  const shownReply = useRef<VoiceReply | null>(null);
  useEffect(() => {
    const reply = voice.reply;
    if (!reply || reply === shownReply.current) return;
    shownReply.current = reply;
    // A spoken question joins the conversation with SIRA's answer (a typed one is already there). Read now:
    // the update below runs later, after the ref is cleared.
    const heard = spokenQuestion.current;
    spokenQuestion.current = null;
    setMessages((list) => [
      ...list,
      ...(heard ? [message('me', heard)] : []),
      message('sira', reply.reply_text, { reply }),
    ]);
  }, [voice.reply]);
  useEffect(() => { if (voice.heardText) spokenQuestion.current = voice.heardText; }, [voice.heardText]);
  const shownError = useRef<string | null>(null);
  useEffect(() => {
    if (!voice.error || voice.error === shownError.current) return;
    shownError.current = voice.error;
    const heard = spokenQuestion.current;
    spokenQuestion.current = null;
    setMessages((list) => [
      ...list,
      ...(heard ? [message('me', heard)] : []),
      message('sira', voice.error!, { error: true }),
    ]);
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
    spokenQuestion.current = null;
    setMessages((list) => [...list, message('me', question)]);
    void voice.send(question);
  };

  const pressMic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    shownError.current = null;
    void voice.toggleMic();
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
  // After an answer: SIRA's own follow-ups (from its rules); before the first one, the checked examples.
  const suggestions = lastSira?.reply?.suggestions?.length ? lastSira.reply.suggestions : trip ? TRIP_QUESTIONS : GENERAL_QUESTIONS;
  const lastMessage = messages.at(-1);
  const actionsOf = (reply: VoiceReply) => reply.actions ?? [
    ...(reply.kind === 'journeys' && reply.journey_request?.destination ? [{ id: 'voir_trajets' as const, label: 'Voir les trajets' }] : []),
    ...(reply.understanding?.intent === 'report_incident' ? [{ id: 'signaler' as const, label: 'Signaler' }] : []),
  ];

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
            <Text style={styles.subtitle}>Ton compagnon de route à Abidjan</Text>
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
                  {item === lastMessage && item.reply
                    ? <TypingText key={item.id} text={item.text} style={styles.siraText} />
                    : <Text style={[styles.siraText, item.error && styles.errorText]}>{item.text}</Text>}
                </View>
                {/* Where the answer comes from (never the LLM: it only writes, the facts are SIRA's). */}
                {item.reply?.facts_sources?.length ? (
                  <Text style={styles.sourceNote}>Sources : {item.reply.facts_sources.join(' · ')}</Text>
                ) : item.reply?.sources?.some((source) => source === 'signalements') ? (
                  <Text style={styles.sourceNote}>D&apos;après les signalements des voyageurs, en direct</Text>
                ) : null}
                {item === lastSira && item.reply && actionsOf(item.reply).map((action) => (
                  <TouchableOpacity key={action.id} style={styles.action} activeOpacity={0.85}
                    onPress={() => (action.id === 'signaler' ? openReport(item.reply!) : showJourneys(item.reply!))}>
                    {action.id === 'signaler' && <Ionicons name="warning" size={16} color="#FFFFFF" />}
                    <Text style={styles.actionText}>{action.label}</Text>
                    {action.id === 'voir_trajets' && <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />}
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )))}
          {/* What SIRA heard, at once, while it prepares its answer. */}
          {voice.phase === 'thinking' && voice.heardText && (
            <View style={styles.meRow}>
              <View style={styles.meBubble}><Text style={styles.meText}>{voice.heardText}</Text></View>
            </View>
          )}
          {(thinking || listening) && (
            <View style={styles.siraRow}>
              <Image source={require('@/assets/images/sira-character-assistant.png')} style={styles.avatar} contentFit="cover" />
              <View style={[styles.siraBubble, styles.pendingColumn]}>
                {/* The steps SIRA really launched (sent by the voice service as they happen). */}
                {voice.phase === 'thinking' && voice.steps.map((name, index) => (
                  <Animated.View key={name} entering={FadeIn.duration(200)} style={styles.pending}>
                    {index === voice.steps.length - 1
                      ? <ActivityIndicator color="#F26522" size="small" />
                      : <Ionicons name="checkmark-circle" size={16} color="#4ADE80" />}
                    <Text style={styles.pendingText}>{STEP_WORDS[name]}</Text>
                  </Animated.View>
                ))}
                {(listening || hearing || !voice.steps.length) && (
                  <View style={styles.pending}>
                    {listening ? <Ionicons name="mic" size={16} color="#DC2626" /> : <ActivityIndicator color="#F26522" size="small" />}
                    <Text style={styles.pendingText}>
                      {listening ? "Je t'écoute… j'envoie dès que tu te tais" : hearing ? 'J’écoute ce que tu as dit…' : 'SIRA réfléchit…'}
                    </Text>
                  </View>
                )}
                {thinking && slow && <Text style={styles.pendingText}>Encore un instant.</Text>}
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
  pendingColumn: { gap: 6 },
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
