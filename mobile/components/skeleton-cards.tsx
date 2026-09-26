// Grey placeholder cards that pulse while SIRA computes the journeys: the
// traveller sees the shape of the answer coming instead of a spinner.
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

export function SkeletonCards({ label, count = 3 }: { label: string; count?: number }) {
  const reduced = useReducedMotion();
  const opacity = useSharedValue(1);
  useEffect(() => {
    if (!reduced) opacity.set(withRepeat(withTiming(0.45, { duration: 700 }), -1, true));
  }, [opacity, reduced]);
  const pulse = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <View style={styles.wrap} accessibilityLabel={label} accessibilityRole="progressbar">
      <Text style={styles.label}>{label}</Text>
      {Array.from({ length: count }, (_, index) => (
        <Animated.View key={index} style={[styles.card, pulse]}>
          <View style={styles.head}>
            <View style={styles.icon} />
            <View style={styles.lines}>
              <View style={[styles.line, { width: '45%' }]} />
              <View style={[styles.line, styles.thin, { width: '30%' }]} />
            </View>
            <View style={[styles.line, { width: 54, height: 18 }]} />
          </View>
          <View style={[styles.line, styles.thin, { width: '70%' }]} />
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  label: { fontSize: 14, color: '#6B6B6B', fontWeight: '600' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, gap: 12, borderWidth: 1, borderColor: '#EEEEEE' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#E6E6E6' },
  lines: { flex: 1, gap: 6 },
  line: { height: 14, borderRadius: 7, backgroundColor: '#E6E6E6' },
  thin: { height: 10 },
});
