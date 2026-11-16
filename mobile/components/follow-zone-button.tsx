// « Suivre cette zone », as in the designer's screens: a black pill with a bell, then a dark card
// asking to confirm, then « Zone suivie avec succès ». The confirmation says what really happens:
// an alert for each new report in the zone while SIRA is open (no notification app closed yet).
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Text } from '@/components/sira-text';
import { SUCCESS_CARD_MS, SuccessCard } from '@/components/success-card';
import { followZone, followedZoneAt, unfollowZone, useFollowedZones } from '@/lib/followed-zones';

type Place = { label: string; latitude: number; longitude: number };

export function FollowZoneButton({ place }: { place: Place }) {
  const zones = useFollowedZones();
  const followed = followedZoneAt(zones, place);
  const [step, setStep] = useState<'confirm' | 'done' | null>(null);

  // « Zone suivie avec succès » closes by itself.
  useEffect(() => {
    if (step !== 'done') return;
    const timer = setTimeout(() => setStep(null), SUCCESS_CARD_MS);
    return () => clearTimeout(timer);
  }, [step]);

  const confirm = () => {
    followZone(place);
    setStep('done');
  };

  return (
    <>
      {followed ? (
        <TouchableOpacity
          style={styles.followedPill}
          onPress={() => unfollowZone(followed.id)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`Zone suivie, ${followed.label}. Toucher pour ne plus la suivre.`}
        >
          <MaterialCommunityIcons name="check-decagram" size={18} color="#F26522" />
          <Text style={styles.followedText}>Zone suivie · Ne plus suivre</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={styles.followPill}
          onPress={() => setStep('confirm')}
          activeOpacity={0.85}
          accessibilityRole="button"
        >
          <Text style={styles.followText}>Suivre cette zone</Text>
          <View style={styles.bellCircle}>
            <Ionicons name="notifications" size={16} color="#111111" />
          </View>
        </TouchableOpacity>
      )}

      <Modal visible={step !== null} transparent animationType="fade" onRequestClose={() => setStep(null)}>
        <Pressable style={styles.overlay} onPress={() => setStep(null)}>
          {step === 'confirm' && (
            <Pressable style={styles.card} onPress={(event) => event.stopPropagation()}>
              <TouchableOpacity style={styles.close} onPress={() => setStep(null)} accessibilityLabel="Fermer" hitSlop={10}>
                <Ionicons name="close" size={18} color="#111111" />
              </TouchableOpacity>
              <Ionicons name="notifications" size={26} color="#F26522" />
              <Text style={styles.cardText}>
                Tu recevras une alerte pour chaque événement signalé dans cette zone, tant que SIRA est ouvert.
              </Text>
              <View style={styles.buttonsRow}>
                <TouchableOpacity style={styles.pill} onPress={confirm} accessibilityRole="button">
                  <Text style={styles.pillText}>Confirmer</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.pill} onPress={() => setStep(null)} accessibilityRole="button">
                  <Text style={styles.pillText}>Annuler</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          )}
          {step === 'done' && (
            <SuccessCard message={'Zone suivie\navec succès'} onClose={() => setStep(null)} />
          )}
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  followPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#000000',
    borderRadius: 26,
    paddingLeft: 22,
    paddingRight: 6,
    paddingVertical: 6,
    marginTop: 12,
  },
  followText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  bellCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  followedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: '#F26522',
    borderRadius: 26,
    paddingVertical: 10,
    marginTop: 12,
  },
  followedText: {
    color: '#111111',
    fontSize: 14,
    fontWeight: '700',
  },
  overlay: {
    flex: 1,
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
    paddingTop: 26,
    paddingBottom: 22,
    paddingHorizontal: 22,
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
  cardText: {
    color: '#FFFFFF',
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '800',
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  buttonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  pill: {
    backgroundColor: '#F26522',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  pillText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
});
