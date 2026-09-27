// SIRA's ear, shared by the assistant and the questions asked during the trip:
// records, notices by itself when the traveller has finished speaking (level of
// the microphone), hands the audio over and deletes it from the phone.
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, type RecordingOptions,
} from 'expo-audio';
import { File } from 'expo-file-system';
import type { VoiceAudio } from '@/lib/sira-api';
import { stopSpeaking } from '@/lib/voice';

const RECORDING: RecordingOptions = { ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true };
const CHECK_MS = 150;
const SILENCE_MS = 1200;
const MAX_MS = 15000;

// onAudio receives the recording, or null when nothing was said; the file is
// deleted once the returned promise settles (audio is never kept).
export function useMicrophone(onAudio: (audio: VoiceAudio | null) => Promise<void>, { nothingHeardMs = 8000 } = {}) {
  const recorder = useAudioRecorder(RECORDING);
  const [listening, setListening] = useState(false);
  const [denied, setDenied] = useState(false);
  const sending = useRef(false);

  const start = async () => {
    stopSpeaking();
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      setDenied(true);
      return false;
    }
    setDenied(false);
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    sending.current = false;
    setListening(true);
    return true;
  };

  const finish = async (heardSomething = true) => {
    if (sending.current) return;
    sending.current = true;
    setListening(false);
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    const uri = recorder.uri;
    const forget = () => {
      if (!uri) return;
      if (Platform.OS === 'web') URL.revokeObjectURL(uri);
      else { try { new File(uri).delete(); } catch { /* déjà supprimé */ } }
    };
    if (!uri || !heardSomething) {
      forget();
      await onAudio(null);
      return;
    }
    const audio: VoiceAudio = Platform.OS === 'web'
      ? await (await fetch(uri)).blob()
      : { uri, name: 'voix.m4a', type: 'audio/m4a' };
    if (Platform.OS === 'web') forget();
    try { await onAudio(audio); } finally { if (Platform.OS !== 'web') forget(); }
  };

  // Closing: microphone released without sending anything.
  const cancel = () => {
    if (!listening) return;
    sending.current = true;
    setListening(false);
    recorder.stop().catch(() => {});
  };

  // Speech, then silence → sent by itself; nothing heard → null.
  const finishRef = useRef(finish);
  useEffect(() => { finishRef.current = finish; });
  useEffect(() => {
    if (!listening) return;
    const startedAt = Date.now();
    let noise = -60;
    let heard = false;
    let lastVoiceAt = startedAt;
    const timer = setInterval(() => {
      const level = recorder.getStatus().metering ?? -160;
      const now = Date.now();
      if (level > -140) noise = Math.min(noise * 0.95 + level * 0.05, level + 3);  // bruit de fond
      if (level > Math.max(noise + 12, -50)) {
        heard = true;
        lastVoiceAt = now;
      }
      const elapsed = now - startedAt;
      if ((heard && now - lastVoiceAt > SILENCE_MS) || elapsed > MAX_MS) void finishRef.current(true);
      else if (!heard && elapsed > nothingHeardMs) void finishRef.current(false);
    }, CHECK_MS);
    return () => clearInterval(timer);
  }, [listening, recorder, nothingHeardMs]);

  return { listening, denied, start, finish, cancel };
}
