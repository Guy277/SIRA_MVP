// "Choisir sur la carte", as in Uber and Yango: a pin stays in the middle,
// the traveller moves the map (or taps a spot) and SIRA names the place
// under the pin; one button confirms it as departure or destination.
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PinMap } from '@/components/pin-map';
import { reversePlace, type Coordinates } from '@/lib/sira-api';
import { ABIDJAN_CENTRE, GRAND_ABIDJAN_RADIUS_M, distanceM, nearestPlaceLabel, rememberPlace, useCurrentPlace } from '@/lib/places';

type Props = {
  purpose: 'departure' | 'arrival';
  onConfirm: (title: string) => void;
  onBack: () => void;
};

type Named = { title: string; subtitle: string; forKey: string };

const keyOf = (point: Coordinates) => `${point.latitude.toFixed(5)},${point.longitude.toFixed(5)}`;
const insideAbidjan = (point: Coordinates) => distanceM(point, ABIDJAN_CENTRE) <= GRAND_ABIDJAN_RADIUS_M;

export function MapLocationPicker({ purpose, onConfirm, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const here = useCurrentPlace();
  const gps = here.status === 'ready' && insideAbidjan(here.coordinates) ? here.coordinates : null;
  // Starts on the traveller when they are in Abidjan, else on the city centre.
  const [initialCenter] = useState<Coordinates>(() => gps ?? ABIDJAN_CENTRE);
  const [center, setCenter] = useState<Coordinates>(initialCenter);
  const [moving, setMoving] = useState(false);
  const [named, setNamed] = useState<Named | null>(null);
  const [focus, setFocus] = useState<{ coordinates: Coordinates; key: number } | null>(null);

  const centerKey = keyOf(center);
  const outside = !insideAbidjan(center);

  // The place under the pin is named once the map has stopped for a moment.
  useEffect(() => {
    if (moving || outside) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      reversePlace(center)
        .then((place) => place.title && place.title !== 'Ma position' ? { title: place.title, subtitle: place.subtitle } : null)
        .catch(() => null)
        .then((place) => {
          if (cancelled) return;
          const title = place?.title ?? nearestPlaceLabel(center) ?? 'Point choisi sur la carte';
          setNamed({ title, subtitle: place?.subtitle ?? 'Abidjan', forKey: centerKey });
        });
    }, 450);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [center, centerKey, moving, outside]);

  const current = named?.forKey === centerKey ? named : null;
  const confirm = () => {
    if (!current || outside) return;
    rememberPlace(current.title, center);
    onConfirm(current.title);
  };

  return (
    <View style={styles.screen}>
      <PinMap
        initialCenter={initialCenter}
        focus={focus}
        onMoveStart={() => setMoving(true)}
        onCenterChange={(point) => { setMoving(false); setCenter(point); }}
      />

      {/* Fixed pin: the tip marks the centre of the map. */}
      <View style={styles.pinLayer} pointerEvents="none">
        <View style={[styles.pin, moving && styles.pinLifted]}>
          <Ionicons name="location-sharp" size={46} color={purpose === 'departure' ? '#1F1F1F' : '#F26522'} />
        </View>
        <View style={styles.pinShadow} />
      </View>

      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={onBack} style={styles.roundButton} accessibilityLabel="Retour à la liste" activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={22} color="#000000" />
        </TouchableOpacity>
        <View style={styles.hint}>
          <Text style={styles.hintText}>Déplace la carte ou touche un endroit</Text>
        </View>
      </View>

      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        {gps && (
          <TouchableOpacity
            style={styles.locateButton}
            onPress={() => setFocus({ coordinates: gps, key: Date.now() })}
            accessibilityLabel="Revenir à ma position"
            activeOpacity={0.8}
          >
            <Ionicons name="locate" size={22} color="#F26522" />
          </TouchableOpacity>
        )}
        <Text style={styles.sheetLabel}>{purpose === 'departure' ? 'Départ' : 'Destination'}</Text>
        {outside ? (
          <Text style={styles.warning}>Ce point est hors du Grand Abidjan : SIRA ne couvre que le Grand Abidjan.</Text>
        ) : current && !moving ? (
          <>
            <Text style={styles.placeTitle} numberOfLines={1}>{current.title}</Text>
            <Text style={styles.placeSubtitle} numberOfLines={1}>{current.subtitle}</Text>
          </>
        ) : (
          <View style={styles.loadingRow}>
            <ActivityIndicator color="#F26522" />
            <Text style={styles.placeSubtitle}>Recherche du lieu…</Text>
          </View>
        )}
        <TouchableOpacity
          style={[styles.confirm, (!current || moving || outside) && styles.confirmDisabled]}
          onPress={confirm}
          disabled={!current || moving || outside}
          activeOpacity={0.85}
          accessibilityRole="button"
        >
          <Text style={styles.confirmText}>{purpose === 'departure' ? 'Partir d’ici' : 'Aller ici'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#EAEAEA' },
  pinLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  // The icon's tip sits on the centre: shift it up by half its height.
  pin: { marginBottom: 46 },
  pinLifted: { transform: [{ translateY: -10 }] },
  pinShadow: { position: 'absolute', width: 10, height: 4, borderRadius: 5, backgroundColor: 'rgba(0,0,0,0.35)' },
  topBar: { position: 'absolute', left: 0, right: 0, top: 0, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 },
  roundButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', elevation: 3 },
  hint: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8 },
  hintText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#FFFFFF', borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 20, paddingTop: 18, gap: 4 },
  locateButton: { position: 'absolute', right: 16, top: -60, width: 46, height: 46, borderRadius: 23, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', elevation: 3 },
  sheetLabel: { fontSize: 12, fontWeight: '700', color: '#888888', textTransform: 'uppercase' },
  placeTitle: { fontSize: 18, fontWeight: '800', color: '#111111' },
  placeSubtitle: { fontSize: 13, color: '#6B6B6B' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  warning: { fontSize: 14, color: '#B91C1C', fontWeight: '600', minHeight: 44 },
  confirm: { marginTop: 12, backgroundColor: '#F26522', borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  confirmDisabled: { opacity: 0.45 },
  confirmText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
});
