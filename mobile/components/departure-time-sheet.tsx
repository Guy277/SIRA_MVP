// "Partir maintenant" or "Partir à…": a bottom sheet with quick offsets and
// hour/minute steppers, so no native date picker dependency is needed.
import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatClock } from '@/lib/journey-format';

const STEP_MIN = 5;

// Picked clock times already past today mean tomorrow.
export function upcoming(hours: number, minutes: number, now = new Date()) {
  const date = new Date(now);
  date.setHours(hours, minutes, 0, 0);
  if (date.getTime() < now.getTime() - 5 * 60_000) date.setDate(date.getDate() + 1);
  return date;
}

export function departureLabel(departAt: Date | null, now = new Date()) {
  if (!departAt) return 'Partir maintenant';
  const tomorrow = departAt.getDate() !== now.getDate();
  return `Partir à ${formatClock(departAt)}${tomorrow ? ' (demain)' : ''}`;
}

type Props = {
  visible: boolean;
  value: Date | null;
  onClose: () => void;
  onChange: (value: Date | null) => void;
};

export function DepartureTimeSheet(props: Props) {
  // Remounted on each opening so the draft starts from the current choice.
  return props.visible ? <Sheet {...props} /> : null;
}

function Sheet({ value, onClose, onChange }: Props) {
  const [draft, setDraft] = useState(() => {
    const start = value ?? new Date(Date.now() + 15 * 60_000);
    return { hours: start.getHours(), minutes: Math.round(start.getMinutes() / STEP_MIN) * STEP_MIN % 60 };
  });
  const shift = (minutes: number) => setDraft(({ hours, minutes: current }) => {
    const total = (((hours * 60 + current + minutes) % 1440) + 1440) % 1440;
    return { hours: Math.floor(total / 60), minutes: total % 60 };
  });
  const setFromNow = (minutes: number) => {
    const date = new Date();
    date.setMinutes(date.getMinutes() + minutes);
    setDraft({ hours: date.getHours(), minutes: date.getMinutes() });
  };
  const chosen = upcoming(draft.hours, draft.minutes);

  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fermer" />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.title}>Quand partez-vous ?</Text>

        <TouchableOpacity style={[styles.nowRow, !value && styles.nowRowActive]} onPress={() => { onChange(null); onClose(); }} activeOpacity={0.8}>
          <Ionicons name="flash" size={18} color={!value ? '#FFFFFF' : '#F26522'} />
          <Text style={[styles.nowText, !value && styles.nowTextActive]}>Partir maintenant</Text>
        </TouchableOpacity>

        <Text style={styles.section}>Partir à</Text>
        <View style={styles.clockRow}>
          <Stepper label="Heure" value={String(draft.hours).padStart(2, '0')} onMinus={() => shift(-60)} onPlus={() => shift(60)} />
          <Text style={styles.colon}>:</Text>
          <Stepper label="Minutes" value={String(draft.minutes).padStart(2, '0')} onMinus={() => shift(-STEP_MIN)} onPlus={() => shift(STEP_MIN)} />
        </View>
        <View style={styles.quickRow}>
          {[15, 30, 60].map((minutes) => (
            <TouchableOpacity key={minutes} style={styles.quickChip} onPress={() => setFromNow(minutes)} activeOpacity={0.8}>
              <Text style={styles.quickText}>Dans {minutes === 60 ? '1 h' : `${minutes} min`}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={styles.confirm} onPress={() => { onChange(chosen); onClose(); }} activeOpacity={0.85}>
          <Text style={styles.confirmText}>{departureLabel(chosen)}</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

function Stepper({ label, value, onMinus, onPlus }: { label: string; value: string; onMinus: () => void; onPlus: () => void }) {
  return (
    <View style={styles.stepper}>
      <TouchableOpacity onPress={onPlus} style={styles.stepBtn} accessibilityLabel={`${label} plus`}>
        <Ionicons name="chevron-up" size={22} color="#1F1F1F" />
      </TouchableOpacity>
      <Text style={styles.stepValue} accessibilityLabel={`${label} ${value}`}>{value}</Text>
      <TouchableOpacity onPress={onMinus} style={styles.stepBtn} accessibilityLabel={`${label} moins`}>
        <Ionicons name="chevron-down" size={22} color="#1F1F1F" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 20, paddingBottom: 28, paddingTop: 10 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#DDDDDD', marginBottom: 14 },
  title: { fontSize: 18, fontWeight: '800', color: '#111111', marginBottom: 14 },
  nowRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#F26522', borderRadius: 12, padding: 12 },
  nowRowActive: { backgroundColor: '#F26522' },
  nowText: { fontSize: 15, fontWeight: '700', color: '#F26522' },
  nowTextActive: { color: '#FFFFFF' },
  section: { fontSize: 13, fontWeight: '700', color: '#666666', marginTop: 18, marginBottom: 6 },
  clockRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  colon: { fontSize: 34, fontWeight: '800', color: '#111111' },
  stepper: { alignItems: 'center' },
  stepBtn: { padding: 6 },
  stepValue: { fontSize: 38, fontWeight: '800', color: '#111111', minWidth: 64, textAlign: 'center' },
  quickRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 8 },
  quickChip: { borderRadius: 16, backgroundColor: '#F3F3F3', paddingHorizontal: 12, paddingVertical: 7 },
  quickText: { fontSize: 13, fontWeight: '600', color: '#1F1F1F' },
  confirm: { marginTop: 20, backgroundColor: '#F26522', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  confirmText: { color: '#FFFFFF', fontWeight: '800', fontSize: 16 },
});
