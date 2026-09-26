// Compact line of the steps of a journey: walk minutes and line badges.
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ApiJourney, LegMode } from '@/lib/sira-api';
import { legBadges } from '@/lib/journey-format';

export const MODE_COLORS: Partial<Record<LegMode, string>> = {
  sotra: '#F26522', boat: '#0077B6', gbaka: '#2D6A4F', woro: '#7B2CBF', taxi: '#1F1F1F',
};

const MODE_ICONS: Partial<Record<LegMode, keyof typeof Ionicons.glyphMap>> = {
  sotra: 'bus', boat: 'boat', gbaka: 'bus', woro: 'car-sport', taxi: 'car',
};

export function JourneyBadges({ journey }: { journey: ApiJourney }) {
  const badges = legBadges(journey);
  return (
    <View style={styles.row}>
      {badges.map((badge, index) => (
        <React.Fragment key={index}>
          {index > 0 && <Text style={styles.separator}>•</Text>}
          {badge.kind === 'walk' ? (
            <View style={styles.walk}>
              <Ionicons name="walk" size={16} color="#1F1F1F" />
              <Text style={styles.walkText}>{badge.minutes}</Text>
            </View>
          ) : (
            <View style={[styles.vehicle, { backgroundColor: MODE_COLORS[badge.mode] ?? '#1F1F1F' }]}>
              <Ionicons name={MODE_ICONS[badge.mode] ?? 'bus'} size={13} color="#FFFFFF" />
              <Text style={styles.vehicleText} numberOfLines={1}>{badge.text}</Text>
            </View>
          )}
        </React.Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5 },
  separator: { color: '#9A9A9A', fontSize: 10 },
  walk: { flexDirection: 'row', alignItems: 'flex-end' },
  walkText: { fontSize: 10, fontWeight: '700', color: '#1F1F1F', marginLeft: -1, marginBottom: -1 },
  vehicle: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, maxWidth: 170 },
  vehicleText: { color: '#FFFFFF', fontWeight: '800', fontSize: 12 },
});
