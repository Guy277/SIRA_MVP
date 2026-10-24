// « Comment s'est passé ton trajet ? »: the mascot asks for 1 to 5 stars on arrival
// (design by Banatou). The note is sent to SIRA with the lines taken, so it is
// only offered to a signed-in traveller.
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, StyleSheet, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/sira-text';
import { notify } from '@/lib/notify';
import { firstName, useSession } from '@/lib/session';
import { rateTrip, type ApiLeg } from '@/lib/sira-api';

type Props = { visible: boolean; legs: ApiLeg[]; onClose: () => void };

export function TripRatingModal({ visible, legs, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const name = firstName(useSession()?.user);
  const [rating, setRating] = useState(0);
  const [state, setState] = useState<'ask' | 'sending' | 'sent'>('ask');

  // Once thanked, the screen closes by itself. The navigation screen re-renders with
  // every GPS fix: the latest onClose is read from a ref so the delay is not restarted.
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; });
  useEffect(() => {
    if (state !== 'sent') return;
    const timer = setTimeout(() => close.current(), 1600);
    return () => clearTimeout(timer);
  }, [state]);

  const rate = async (stars: number) => {
    if (state !== 'ask') return;
    setRating(stars);
    setState('sending');
    try {
      await rateTrip(stars, legs);
      setState('sent');
    } catch (error) {
      setState('ask');
      notify('Note non envoyée', error instanceof Error ? error.message : 'Réessaie dans un instant.');
    }
  };

  return (
    <Modal visible={visible} transparent={false} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <Image source={require('@/assets/images/city-route-3d-bg.png')} style={StyleSheet.absoluteFill} contentFit="cover" />

        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
          <View style={styles.topDragPill} />
          <TouchableOpacity
            style={[styles.closeBtn, { top: Math.max(insets.top, 16) }]}
            onPress={onClose}
            activeOpacity={0.8}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Fermer sans noter"
          >
            <Ionicons name="close" size={22} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.contentArea}>
            <View style={styles.speechBubbleWrapper}>
              <View style={[styles.speechBubbleCard, { maxWidth: width * 0.58 }]}>
                {state === 'sent' ? (
                  <Text style={styles.speechBubbleText}>
                    Merci{name ? <Text style={styles.boldText}> {name}</Text> : null}{'\u00A0'}! Ta note est enregistrée.
                  </Text>
                ) : (
                  <Text style={styles.speechBubbleText}>
                    Comment{'\n'}s’est passé{'\n'}ton trajet{name ? <Text style={styles.boldText}> {name}</Text> : null}{'\u00A0'}?
                  </Text>
                )}
              </View>
              <View style={styles.speechBubblePointer} />
            </View>
            <Image
              source={require('@/assets/images/sira-character-assistant.png')}
              style={{ width: Math.min(width * 0.75, 310), height: Math.min(height * 0.55, 420), marginBottom: -10 }}
              contentFit="contain"
            />
          </View>

          <View style={[styles.bottomRatingContainer, { paddingBottom: Math.max(insets.bottom, 24) }]}>
            <Text style={styles.ratingSubtitle}>
              <Text style={styles.boldText}>Ton avis</Text> aide{'\n'}à <Text style={styles.boldText}>améliorer SIRA.</Text>
            </Text>
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity
                  key={star}
                  onPress={() => void rate(star)}
                  disabled={state !== 'ask'}
                  activeOpacity={0.7}
                  style={styles.starTouchArea}
                  accessibilityRole="button"
                  accessibilityLabel={`${star} étoile${star > 1 ? 's' : ''} sur 5`}
                >
                  <Ionicons name={star <= rating ? 'star' : 'star-outline'} size={36} color="#000000" />
                </TouchableOpacity>
              ))}
            </View>
            {state === 'sending' && <ActivityIndicator style={styles.sending} color="#000000" />}
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  safeArea: {
    flex: 1,
    justifyContent: 'space-between',
  },
  topDragPill: {
    width: 54,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#000000',
    alignSelf: 'center',
    marginTop: 8,
  },
  closeBtn: {
    position: 'absolute',
    left: 18,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 50,
    ...Platform.select({
      ios: { shadowColor: '#000000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4 },
      android: { elevation: 6 },
    }),
  },
  contentArea: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'flex-start',
    paddingLeft: 10,
  },
  speechBubbleWrapper: {
    position: 'absolute',
    top: '12%',
    right: '8%',
    zIndex: 20,
  },
  speechBubbleCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderRadius: 22,
    paddingHorizontal: 20,
    paddingVertical: 14,
    ...Platform.select({
      ios: { shadowColor: '#000000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 8 },
      android: { elevation: 4 },
    }),
  },
  speechBubbleText: {
    fontSize: 20,
    color: '#000000',
    lineHeight: 26,
  },
  boldText: {
    fontWeight: '800',
    color: '#000000',
  },
  speechBubblePointer: {
    position: 'absolute',
    left: 20,
    bottom: -8,
    width: 16,
    height: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    transform: [{ rotate: '45deg' }],
  },
  bottomRatingContainer: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    zIndex: 30,
  },
  ratingSubtitle: {
    fontSize: 21,
    color: '#000000',
    textAlign: 'center',
    lineHeight: 28,
    marginBottom: 16,
  },
  starsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  starTouchArea: {
    padding: 4,
  },
  sending: {
    marginTop: 10,
  },
});
