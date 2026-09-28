// Talking to SIRA: record, send to the voice service, speak the answer and
// keep the conversation going hands-free (« D'où pars-tu ? » → the microphone
// opens again). The recording stops by itself when the traveller stops talking,
// and it is deleted from the phone as soon as it is sent (lib/use-microphone).
import { useEffect, useRef, useState } from 'react';
import { askByText, askByVoice, type Coordinates, type VoiceAudio, type VoiceContext, type VoiceReply, type VoiceTrip } from '@/lib/sira-api';
import { useMicrophone } from '@/lib/use-microphone';
import { say, stopSpeaking } from '@/lib/voice';
import { MIC_NEEDS_HTTPS, needsSecureContext } from '@/lib/secure-context';

export type VoicePhase = 'idle' | 'recording' | 'thinking' | 'answered' | 'error';

// After two misunderstandings in a row, SIRA offers to type or use the map.
const MAX_RETRIES = 2;
const OFFER_OTHER_WAY = "Pardon, je n'arrive pas à bien t'entendre. Tu peux aussi écrire ta destination ou la montrer sur la carte.";
const NOTHING_HEARD = "Pardon, je n'ai rien entendu. Tu peux répéter un peu plus fort, s'il te plaît ?";

// trip: the journey being followed, so SIRA can answer « je descends où ? ».
export function useVoiceAssistant(position: Coordinates | null, trip: VoiceTrip | null = null) {
  const [busy, setBusy] = useState<'thinking' | 'answered' | 'error' | null>(null);
  const [reply, setReply] = useState<VoiceReply | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offerTyping, setOfferTyping] = useState(false);
  const [heard, setHeard] = useState<VoiceReply | null>(null);  // last answer fully spoken
  const context = useRef<VoiceContext>(null);
  const retries = useRef(0);
  const open = useRef(true);  // false once the assistant is closed: no more listening
  const listenAgainRef = useRef(async () => {});  // hands-free: set below, once the microphone exists

  useEffect(() => {
    open.current = true;
    return () => { open.current = false; };
  }, []);

  // aloud: SIRA says the answer and keeps listening (voice); typed questions get a written answer.
  const handle = async (request: Promise<VoiceReply>, aloud = true) => {
    setBusy('thinking');
    setError(null);
    let answer: VoiceReply;
    try {
      answer = await request;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Assistant vocal indisponible pour le moment.');
      setBusy('error');
      return;
    }
    if (!open.current) return;
    context.current = answer.context;
    retries.current = answer.kind === 'retry' ? retries.current + 1 : 0;
    const giveUp = answer.kind === 'retry' && retries.current >= MAX_RETRIES;
    const shown = giveUp ? { ...answer, reply_text: OFFER_OTHER_WAY, reply_audio: null } : answer;
    setOfferTyping(giveUp);
    setReply(shown);
    setBusy('answered');
    if (aloud) await say(shown.reply_text, 'answer', shown.reply_audio?.base64 ?? null);
    if (!open.current) return;
    setHeard(shown);
    // A question or « répète » : listen again right away, hands-free.
    const listenAgain = aloud && !giveUp && (answer.kind === 'question' || answer.kind === 'retry');
    if (listenAgain && open.current) await listenAgainRef.current();
  };

  const microphone = useMicrophone((audio: VoiceAudio | null) => handle(audio
    ? askByVoice(audio, position, context.current, true, trip)
    // Nothing heard counts as a misunderstanding: polite reprompt, then other ways.
    : Promise.resolve({
      reply_text: NOTHING_HEARD, context: context.current, journey_request: null, journeys: null,
      reply_audio: null, understanding: null, kind: 'retry', chosen_id: null,
    })));

  const listen = async () => {
    setError(null);
    if (!(await microphone.start())) {
      setError(needsSecureContext() ? MIC_NEEDS_HTTPS : 'Autorise le micro pour parler à SIRA.');
      setBusy('error');
    }
  };
  useEffect(() => { listenAgainRef.current = listen; });

  // Microphone button: start listening, or send right away without waiting.
  const toggle = () => (microphone.listening ? microphone.finish(true) : listen());
  const ask = (text: string, { aloud = true } = {}) => handle(askByText(text, position, context.current, aloud, trip), aloud);

  // Closing the assistant: microphone released, voice stopped, new conversation next time.
  const reset = () => {
    open.current = false;
    microphone.cancel();
    stopSpeaking();
    context.current = null;
    retries.current = 0;
    setReply(null);
    setError(null);
    setOfferTyping(false);
    setHeard(null);
    setBusy(null);
  };

  const phase: VoicePhase = microphone.listening ? 'recording' : busy ?? 'idle';
  // spoken: the answer has been said out loud (the trip may start after it).
  return { phase, reply, error, offerTyping, toggle, ask, reset, spoken: heard !== null && heard === reply, awaitingAnswer: Boolean(reply?.context) };
}
