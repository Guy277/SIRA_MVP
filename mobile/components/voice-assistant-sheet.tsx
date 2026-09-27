// Voice assistant sheet (home microphone). The traveller speaks; SIRA sends by
// itself once they stop talking, answers out loud and, when it understood,
// starts the trip after a short countdown (« On y va ! »), like a GPS. Questions
// are answered hands-free; after two misunderstandings SIRA offers typing.
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import type { Coordinates, VoiceJourneyRequest, VoiceReply } from '@/lib/sira-api';
import { useVoiceAssistant } from '@/lib/use-voice-assistant';

const EXAMPLES = ['Je quitte Yopougon, je vais au Plateau', 'Le gbaka pour Anyama, ça fait combien ?', 'Il y a un accident à Adjamé'];
// Seconds before the trip starts by itself, after the answer (time to cancel).
const START_COUNTDOWN_S = 5;

// « Il y a un accident vers Koumassi » → the report form, already filled in.
const REPORT_CATEGORIES: [RegExp, string, string][] = [
  [/accident|collision|cogn|renvers/i, 'accident', 'Accident'],
  [/bouchon|embouteill|go-?slow|ça bouge pas/i, 'embouteillage', 'Embouteillage'],
  [/bloqu|ferm|barr|barrage|manif/i, 'route_bloquee', 'Route bloquée'],
  [/inond|\beau\b|pluie/i, 'inondation', 'Inondation'],
  [/trou|nid|dégrad|gâté.*route/i, 'route_degradee', 'Route dégradée'],
  [/panne|gâté|en rade/i, 'vehicule_panne', 'Véhicule en panne'],
];
export function reportCategory(reply: VoiceReply) {
  const said = [reply.understanding?.entities?.find((e) => e.label === 'INCIDENT_TYPE')?.text, reply.transcript?.text]
    .filter(Boolean).join(' ');
  const found = REPORT_CATEGORIES.find(([pattern]) => pattern.test(said));
  return found ? { categoryId: found[1], title: found[2] } : { categoryId: 'autre', title: 'Autre évènement' };
}

type Props = {
  visible: boolean;
  onClose: () => void;
  position: Coordinates | null;
  onShowJourneys: (request: VoiceJourneyRequest) => void;
  onStartJourney: (reply: VoiceReply) => void;
  onTypeInstead: () => void;
  onReport: (category: { categoryId: string; title: string }) => void;
};

export function VoiceAssistantSheet(props: Props) {
  return (
    <Modal visible={props.visible} animationType="slide" transparent onRequestClose={props.onClose}>
      {/* Mounted at each opening: a new conversation every time. */}
      {props.visible && <Sheet {...props} />}
    </Modal>
  );
}

function Sheet({ onClose, position, onShowJourneys, onStartJourney, onTypeInstead, onReport }: Props) {
  const voice = useVoiceAssistant(position);
  const listening = voice.phase === 'recording';
  const thinking = voice.phase === 'thinking';
  const reply = voice.reply;

  // The microphone pulses while SIRA listens.
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (listening) pulse.set(withRepeat(withTiming(1.15, { duration: 600 }), -1, true));
    else { cancelAnimation(pulse); pulse.set(withTiming(1, { duration: 150 })); }
  }, [listening, pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  // Understood with journeys: « On y va ! » and the trip starts after the countdown.
  const request = reply?.journey_request;
  const ready = Boolean(reply?.kind === 'journeys' && reply.journeys?.journeys?.length && request?.destination);
  const [countdown, setCountdown] = useState<{ reply: VoiceReply; left: number } | null>(null);
  const [cancelled, setCancelled] = useState<VoiceReply | null>(null);
  // The countdown starts once SIRA has finished saying where it goes.
  const counting = ready && voice.spoken && reply !== cancelled ? (countdown?.reply === reply ? countdown.left : START_COUNTDOWN_S) : null;
  useEffect(() => {
    if (counting === null || !reply) return;
    if (counting <= 0) { onStartJourney(reply); return; }
    const timer = setTimeout(() => setCountdown({ reply, left: counting - 1 }), 1000);
    return () => clearTimeout(timer);
  }, [counting, reply, onStartJourney]);

  // « Il y a un accident à Adjamé » : the report form opens, filled in.
  useEffect(() => {
    if (reply?.understanding?.intent !== 'report_incident') return;
    const timer = setTimeout(() => onReport(reportCategory(reply)), 2500);
    return () => clearTimeout(timer);
  }, [reply, onReport]);

  const close = () => {
    voice.reset();
    onClose();
  };

  const pressMic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setCancelled(reply);
    void voice.toggle();
  };

  const hint = listening ? "Je t'écoute… j'envoie dès que tu te tais"
    : thinking ? 'SIRA réfléchit…'
    : counting !== null ? `On y va ! Départ dans ${counting} s`
    : voice.awaitingAnswer ? 'Réponds, je t’écoute'
    : 'Touche le micro et dis où tu vas';

  return (
    <View style={styles.overlay}>
      <View style={styles.content}>
        <TouchableOpacity style={styles.closeButton} onPress={close} activeOpacity={0.8} accessibilityLabel="Fermer l'assistant vocal">
          <Ionicons name="close" size={20} color="#FFFFFF" />
        </TouchableOpacity>

        <Text style={styles.title}>Assistant vocal SIRA</Text>
        <Text style={[styles.subtitle, counting !== null && styles.subtitleGo]} accessibilityLiveRegion="polite">{hint}</Text>

        <TouchableOpacity
          onPress={pressMic}
          disabled={thinking}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={listening ? 'Envoyer ma demande' : 'Parler à SIRA'}
        >
          <Animated.View style={[styles.micOuter, listening && styles.micOuterListening, pulseStyle]}>
            <View style={[styles.micInner, listening && styles.micInnerListening]}>
              {thinking
                ? <ActivityIndicator color="#FFFFFF" size="large" />
                : <Ionicons name={listening ? 'stop' : 'mic'} size={40} color="#FFFFFF" />}
            </View>
          </Animated.View>
        </TouchableOpacity>

        <ScrollView style={styles.conversation} contentContainerStyle={styles.conversationContent}>
          {reply?.transcript?.text ? <Text style={styles.heard}>Toi : « {reply.transcript.text} »</Text> : null}
          {reply && (
            <View style={styles.answer} accessibilityLiveRegion="polite">
              <Text style={styles.answerLabel}>SIRA</Text>
              <Text style={styles.answerText}>{reply.reply_text}</Text>
            </View>
          )}
          {voice.error && <Text style={styles.error}>{voice.error}</Text>}
        </ScrollView>

        {counting !== null && reply && request && (
          <View style={styles.row}>
            <TouchableOpacity style={styles.goButton} onPress={() => onStartJourney(reply)} activeOpacity={0.85}>
              <Ionicons name="navigate" size={18} color="#FFFFFF" />
              <Text style={styles.goButtonText}>Partir ({counting})</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => { setCancelled(reply); onShowJourneys(request); }} activeOpacity={0.85}>
              <Text style={styles.secondaryButtonText}>Autres trajets</Text>
            </TouchableOpacity>
          </View>
        )}
        {counting !== null && (
          <TouchableOpacity onPress={() => setCancelled(reply)} activeOpacity={0.7}>
            <Text style={styles.cancelLink}>Annuler le départ</Text>
          </TouchableOpacity>
        )}
        {ready && counting === null && request && (
          <TouchableOpacity style={styles.goButton} onPress={() => onShowJourneys(request)} activeOpacity={0.85}>
            <Text style={styles.goButtonText}>Voir les trajets</Text>
            <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        )}

        {voice.offerTyping && (
          <TouchableOpacity style={styles.goButton} onPress={onTypeInstead} activeOpacity={0.85}>
            <Ionicons name="create" size={18} color="#FFFFFF" />
            <Text style={styles.goButtonText}>Écrire ou montrer sur la carte</Text>
          </TouchableOpacity>
        )}

        {!reply && !listening && !thinking && (
          <>
            <Text style={styles.examplesLabel}>Ou touche un exemple :</Text>
            <View style={styles.chips}>
              {EXAMPLES.map((example) => (
                <TouchableOpacity key={example} style={styles.chip} onPress={() => void voice.ask(example)} activeOpacity={0.8}>
                  <Ionicons name="chatbubble-ellipses" size={14} color="#F26522" style={{ marginRight: 6 }} />
                  <Text style={styles.chipText}>{example}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.82)', justifyContent: 'flex-end' },
  content: {
    backgroundColor: '#1E1E1E', borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingHorizontal: 24, paddingTop: 28,
    paddingBottom: Platform.OS === 'ios' ? 44 : 32, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)',
    maxHeight: '92%',
  },
  closeButton: {
    position: 'absolute', top: 20, right: 20, width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(255, 255, 255, 0.15)', justifyContent: 'center', alignItems: 'center', zIndex: 2,
  },
  title: { color: '#FFFFFF', fontSize: 20, fontWeight: '700', marginBottom: 4 },
  subtitle: { color: '#AAAAAA', fontSize: 14, marginBottom: 22, textAlign: 'center' },
  subtitleGo: { color: '#F26522', fontWeight: '800', fontSize: 16 },
  micOuter: {
    width: 104, height: 104, borderRadius: 52, backgroundColor: 'rgba(242, 101, 34, 0.2)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 18,
  },
  micOuterListening: { backgroundColor: 'rgba(220, 38, 38, 0.25)' },
  micInner: {
    width: 78, height: 78, borderRadius: 39, backgroundColor: '#F26522', justifyContent: 'center', alignItems: 'center', elevation: 10,
  },
  micInnerListening: { backgroundColor: '#DC2626' },
  conversation: { width: '100%', maxHeight: 200 },
  conversationContent: { gap: 10, paddingBottom: 6 },
  heard: { color: '#CCCCCC', fontSize: 14, fontStyle: 'italic' },
  answer: { backgroundColor: '#2A2A2A', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: 'rgba(242, 101, 34, 0.35)' },
  answerLabel: { color: '#F26522', fontSize: 12, fontWeight: '800', marginBottom: 4 },
  answerText: { color: '#FFFFFF', fontSize: 15, lineHeight: 21 },
  error: { color: '#FCA5A5', fontSize: 14, textAlign: 'center' },
  row: { flexDirection: 'row', gap: 10, marginTop: 14 },
  goButton: {
    marginTop: 14, backgroundColor: '#F26522', borderRadius: 24, paddingVertical: 13, paddingHorizontal: 20,
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  goButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  secondaryButton: {
    marginTop: 14, borderRadius: 24, paddingVertical: 13, paddingHorizontal: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
  },
  secondaryButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  cancelLink: { color: '#AAAAAA', fontSize: 13, marginTop: 10, textDecorationLine: 'underline' },
  examplesLabel: {
    color: '#888888', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5,
    marginTop: 6, marginBottom: 10, alignSelf: 'flex-start',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, width: '100%' },
  chip: {
    backgroundColor: '#2A2A2A', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  chipText: { color: '#FFFFFF', fontSize: 13, fontWeight: '500' },
});
