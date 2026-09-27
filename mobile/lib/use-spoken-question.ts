// Waze-style question during a trip: SIRA asks out loud, then listens a few
// seconds for « oui », « non » or a price. Answering by voice is optional: the
// buttons on screen stay, and silence simply leaves the question on screen.
import { useRef, useState } from 'react';
import { answerByVoice, type ShortAnswer, type VoiceAudio } from '@/lib/sira-api';
import { useMicrophone } from '@/lib/use-microphone';
import { getVoiceMode, say, stopSpeaking } from '@/lib/voice';

export function useSpokenQuestion() {
  const pending = useRef<((answer: ShortAnswer | null) => void) | null>(null);
  const current = useRef<string | null>(null);  // question being asked
  const [asking, setAsking] = useState<string | null>(null);

  const settle = (answer: ShortAnswer | null) => {
    pending.current?.(answer);
    pending.current = null;
    current.current = null;
    setAsking(null);
  };

  const microphone = useMicrophone(async (audio: VoiceAudio | null) => {
    if (!audio) return settle(null);
    try { settle(await answerByVoice(audio)); } catch { settle(null); }
  }, { nothingHeardMs: 6000 });

  // Resolves with what was understood, or null (silence, muted, no microphone).
  const ask = async (question: string, id: string): Promise<ShortAnswer | null> => {
    if (getVoiceMode() === 'off') return null;
    settle(null);
    current.current = id;
    setAsking(id);
    await say(question, 'alert');
    // A button was tapped meanwhile, or the voice was muted.
    if (current.current !== id || getVoiceMode() === 'off') { if (current.current === id) settle(null); return null; }
    return new Promise<ShortAnswer | null>((resolve) => {
      pending.current = resolve;
      void microphone.start().then((started) => { if (!started) settle(null); });
    });
  };
  // A newer question or a tap on a button cancels the one being asked.
  const cancel = () => {
    microphone.cancel();
    stopSpeaking();
    settle(null);
  };

  return { ask, cancel, asking, listening: microphone.listening };
}
