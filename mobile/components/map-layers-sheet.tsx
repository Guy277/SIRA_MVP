// « Calques » of the map, as in Google Maps: a sheet rising from the bottom to pick the
// type of map (Plan, Nuit, Épuré) and what is drawn on it. The choice is kept (lib/map-settings).
import React from 'react';
import { Modal, Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '@/components/sira-text';
import { SiraSwitch } from '@/components/sira-switch';
import { Ionicons } from '@expo/vector-icons';
import { MAP_STYLE_LABELS, setMapSettings, TRANSIT_LEGEND, useMapSettings, type MapSettings, type MapStyleName } from '@/lib/map-settings';

// A small picture of each map background: its land colour and a road.
const PREVIEW: Record<MapStyleName, { land: string; road: string }> = {
  plan: { land: '#EDE9E0', road: '#FFFFFF' },
  nuit: { land: '#2B2F36', road: '#4B515C' },
  epure: { land: '#F6F6F4', road: '#E2E2E2' },
};

type Toggle = { key: keyof Pick<MapSettings, 'transitLines' | 'reports' | 'buildings'>; icon: keyof typeof Ionicons.glyphMap; label: string; hint: string };
const TOGGLES: Toggle[] = [
  { key: 'transitLines', icon: 'bus-outline', label: 'Lignes SIRA', hint: 'Les 611 lignes, une couleur par mode' },
  { key: 'reports', icon: 'warning-outline', label: 'Signalements', hint: 'Accidents, bouchons, routes bloquées' },
  { key: 'buildings', icon: 'business-outline', label: 'Bâtiments 3D', hint: 'Visibles en zoomant, debout en 3D' },
];

export function MapLayersSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const settings = useMapSettings();
  if (!visible) return null;
  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fermer les calques" />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.title}>Type de carte</Text>
        <View style={styles.styleRow}>
          {(Object.keys(MAP_STYLE_LABELS) as MapStyleName[]).map((name) => {
            const chosen = settings.style === name;
            return (
              <TouchableOpacity key={name} style={styles.styleItem} onPress={() => setMapSettings({ style: name })} activeOpacity={0.8}
                accessibilityRole="radio" accessibilityState={{ checked: chosen }} accessibilityLabel={`Carte ${MAP_STYLE_LABELS[name]}`}>
                <View style={[styles.preview, { backgroundColor: PREVIEW[name].land }, chosen && styles.previewChosen]}>
                  <View style={[styles.previewRoad, { backgroundColor: PREVIEW[name].road }]} />
                </View>
                <Text style={[styles.styleLabel, chosen && styles.styleLabelChosen]}>{MAP_STYLE_LABELS[name]}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.section}>Afficher sur la carte</Text>
        {TOGGLES.map((toggle) => (
          <View key={toggle.key}>
            <View style={styles.toggleRow}>
              <Ionicons name={toggle.icon} size={20} color="#F26522" />
              <View style={styles.toggleText}>
                <Text style={styles.toggleLabel}>{toggle.label}</Text>
                <Text style={styles.toggleHint}>{toggle.hint}</Text>
              </View>
              <SiraSwitch value={settings[toggle.key]} onValueChange={(value) => setMapSettings({ [toggle.key]: value })} accessibilityLabel={toggle.label} />
            </View>
            {toggle.key === 'transitLines' && settings.transitLines && (
              <View style={styles.legend}>
                {TRANSIT_LEGEND.map((mode) => (
                  <View key={mode.label} style={styles.legendItem}>
                    <View style={[styles.legendLine, { backgroundColor: mode.color }]} />
                    <Text style={styles.legendText}>{mode.label}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        ))}
        <Text style={styles.credit}>Carte © OpenStreetMap, fonds OpenFreeMap</Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 20, paddingBottom: 28, paddingTop: 10 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#DDDDDD', marginBottom: 14 },
  title: { fontSize: 18, fontWeight: '800', color: '#111111', marginBottom: 12 },
  styleRow: { flexDirection: 'row', gap: 12 },
  styleItem: { flex: 1, alignItems: 'center', gap: 6 },
  preview: { width: '100%', height: 64, borderRadius: 12, borderWidth: 1, borderColor: '#E2E2E2', justifyContent: 'center', overflow: 'hidden' },
  previewChosen: { borderWidth: 3, borderColor: '#F26522' },
  previewRoad: { height: 8, transform: [{ rotate: '-12deg' }], marginHorizontal: -10 },
  styleLabel: { fontSize: 13, fontWeight: '600', color: '#444444' },
  styleLabelChosen: { color: '#F26522', fontWeight: '800' },
  section: { fontSize: 13, fontWeight: '700', color: '#666666', marginTop: 20, marginBottom: 4 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  toggleText: { flex: 1 },
  toggleLabel: { fontSize: 15, fontWeight: '700', color: '#111111' },
  toggleHint: { fontSize: 12, color: '#777777' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingLeft: 32, paddingBottom: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendLine: { width: 18, height: 4, borderRadius: 2 },
  legendText: { fontSize: 12, color: '#444444' },
  credit: { fontSize: 11, color: '#999999', marginTop: 14, textAlign: 'center' },
});
