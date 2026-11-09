// « Discuter avec SIRA » en compagnon (docs/assistant-compagnon.md) : une vraie conversation, différente du micro de
// l'accueil (« On va où ? »). Dit : SIRA écoute, montre tout de suite ce qu'il a entendu (/voice/hear), puis prépare
// sa réponse (/voice/chat) en montrant les étapes qu'il lance vraiment. Les derniers échanges partent avec chaque
// message (« et le moins cher ? ») ; ils restent dans l'application, jamais sur le serveur.
import { useEffect, useRef, useState } from 'react';
import { savedPlaces, voicePlaces } from '@/lib/saved-places';
import {
  chatWithSira, hearVoice, type ChatTurn, type CompanionStep, type Coordinates, type VoiceAudio, type VoiceContext,
  type VoiceReply, type VoiceTrip,
} from '@/lib/sira-api';
import { useMicrophone } from '@/lib/use-microphone';
import { getVoiceMode, sayParts, stopSpeaking } from '@/lib/voice';
import { MIC_NEEDS_HTTPS, needsSecureContext } from '@/lib/secure-context';
import { getUsage, USAGE_OFF_MESSAGES } from '@/lib/usage';

// recording: SIRA écoute ; hearing: il transcrit ; thinking: il prépare la réponse (steps = ce qu'il a lancé).
export type CompanionPhase = 'idle' | 'recording' | 'hearing' | 'thinking' | 'answered' | 'error';

const NOTHING_HEARD = "Pardon, je n'ai rien entendu. Tu peux répéter un peu plus fort, ou m'écrire ?";

export function useCompanion(position: Coordinates | null, trip: VoiceTrip | null) {
  const [busy, setBusy] = useState<'hearing' | 'thinking' | 'answered' | 'error' | null>(null);
  const [heardText, setHeardText] = useState<string | null>(null);
  const [steps, setSteps] = useState<CompanionStep[]>([]);
  const [reply, setReply] = useState<VoiceReply | null>(null);
  const [error, setError] = useState<string | null>(null);
  const context = useRef<VoiceContext>(null);
  const history = useRef<ChatTurn[]>([]);
  const open = useRef(true);

  useEffect(() => {
    open.current = true;
    return () => { open.current = false; };
  }, []);

  // One exchange: the question (typed, or heard), SIRA's answer, then its voice when it was spoken to.
  const exchange = async (text: string, spoken: boolean) => {
    setBusy('thinking');
    setSteps([]);
    setError(null);
    const aloud = spoken && getVoiceMode() !== 'off';
    let answer: VoiceReply;
    try {
      answer = await chatWithSira({
        text, history: history.current, position, context: context.current, trip, places: voicePlaces(savedPlaces()),
        speak: aloud, spoken,
      }, (name) => { if (open.current) setSteps((list) => (list.includes(name) ? list : [...list, name])); });
    } catch (reason) {
      if (!open.current) return;
      setError(reason instanceof Error ? reason.message : 'SIRA ne répond pas pour le moment.');
      setBusy('error');
      return;
    }
    if (!open.current) return;
    context.current = answer.context;
    history.current = [...history.current, { from: 'me' as const, text }, { from: 'sira' as const, text: answer.reply_text }].slice(-12);
    setReply(answer);
    setBusy('answered');
    if (aloud) {
      const parts = answer.reply_parts?.length ? answer.reply_parts : [answer.reply_text];
      await sayParts(parts, 'answer', answer.reply_audio?.base64 ?? null, answer.reply_audio?.mime);
    }
  };

  const microphone = useMicrophone(async (audio: VoiceAudio | null) => {
    if (!audio) {
      setError(NOTHING_HEARD);
      setBusy('error');
      return;
    }
    setBusy('hearing');
    setHeardText(null);
    setError(null);
    let text = '';
    try {
      text = (await hearVoice(audio, position, voicePlaces(savedPlaces()))).transcript.text.trim();
    } catch (reason) {
      if (!open.current) return;
      setError(reason instanceof Error ? reason.message : 'SIRA ne t’a pas entendu, réessaie.');
      setBusy('error');
      return;
    }
    if (!open.current) return;
    if (!text) {
      setError(NOTHING_HEARD);
      setBusy('error');
      return;
    }
    setHeardText(text);
    await exchange(text, true);
  });

  const send = (text: string) => {
    setHeardText(null);
    return exchange(text, false);
  };

  const toggleMic = async () => {
    if (microphone.listening) return microphone.finish(true);
    stopSpeaking();
    setError(null);
    if (!(await microphone.start())) {
      setError(needsSecureContext() ? MIC_NEEDS_HTTPS
        : !getUsage().microphone ? USAGE_OFF_MESSAGES.microphone
        : 'Autorise le micro pour parler à SIRA.');
      setBusy('error');
    }
  };

  const reset = () => {
    open.current = false;
    microphone.cancel();
    stopSpeaking();
    context.current = null;
    history.current = [];
    setReply(null);
    setError(null);
    setHeardText(null);
    setSteps([]);
    setBusy(null);
  };

  const phase: CompanionPhase = microphone.listening ? 'recording' : busy ?? 'idle';
  return { phase, heardText, steps, reply, error, send, toggleMic, reset };
}
