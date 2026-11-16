// SIRA's « … avec succès » card, as in the designer's screens: a dark card, an orange ✕, an orange
// icon and white capital letters. It closes by itself after a moment, or at a touch.
// - SuccessCard: the card alone, for a window that already has its own overlay (« Suivre cette zone »).
// - showSuccess() + <SuccessHost />: from any screen (favourites); the host sits in the root layout.
import React, { useEffect, useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Text } from '@/components/sira-text';

type Icon = keyof typeof MaterialCommunityIcons.glyphMap;

// Long enough to read four or five words, short enough not to stand in the way (my choice).
export const SUCCESS_CARD_MS = 1800;

export function SuccessCard({ message, icon = 'check-decagram', onClose }: { message: string; icon?: Icon; onClose?: () => void }) {
  return (
    <View style={styles.card} accessibilityLiveRegion="polite" accessibilityRole="alert">
      {onClose && (
        <TouchableOpacity style={styles.close} onPress={onClose} accessibilityLabel="Fermer" hitSlop={10}>
          <Ionicons name="close" size={18} color="#111111" />
        </TouchableOpacity>
      )}
      <MaterialCommunityIcons name={icon} size={30} color="#F26522" />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

type Shown = { message: string; icon?: Icon; key: number } | null;
let shown: Shown = null;
const listeners = new Set<() => void>();
const publish = (next: Shown) => { shown = next; listeners.forEach((listener) => listener()); };

export const showSuccess = (message: string, icon?: Icon) => publish({ message, icon, key: Date.now() });
const hideSuccess = () => publish(null);

export function SuccessHost() {
  const current = useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    () => shown,
    () => shown,
  );

  // Each new card gets its full time on screen.
  useEffect(() => {
    if (!current) return;
    const timer = setTimeout(hideSuccess, SUCCESS_CARD_MS);
    return () => clearTimeout(timer);
  }, [current]);

  if (!current) return null;
  return (
    <Pressable style={styles.overlay} onPress={hideSuccess} accessibilityLabel="Fermer le message">
      <SuccessCard key={current.key} message={current.message} icon={current.icon} onClose={hideSuccess} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 1000,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  // The designer's dark card: #3A3A3A, rounded, white uppercase text.
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#3A3A3A',
    borderRadius: 20,
    paddingTop: 28,
    paddingBottom: 24,
    paddingHorizontal: 26,
    alignItems: 'center',
    gap: 12,
  },
  close: {
    position: 'absolute',
    top: 10,
    left: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F26522',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: '#FFFFFF',
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '800',
    textAlign: 'center',
    textTransform: 'uppercase',
  },
});
