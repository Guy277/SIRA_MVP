// « Se déconnecter », as in the designer's screen: the bridge of Abidjan at night, the road
// « ON TRACE, SANS STRESS. » of the login screen, a speech bubble asking to confirm, and the
// SIRA character, sad to see the traveller go. Sizes come from that design (402 × 874).
import React from 'react';
import { Dimensions, Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '@/components/sira-text';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { logoutUser } from '@/hooks/use-auth';
import { setSession } from '@/lib/session';

interface LogoutModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm?: () => void;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Same road, slogan and pin as the login screen (its designer canvas is 406 × 874).
const CANVAS_WIDTH = 406;
const CANVAS_HEIGHT = 874;
const sx = (value: number) => (value / CANVAS_WIDTH) * SCREEN_WIDTH;
const sy = (value: number) => (value / CANVAS_HEIGHT) * SCREEN_HEIGHT;

// The character fills the width, standing on the bottom edge (image 804 × 858), but never
// more than the design's share of the height (429 of 874), so short phones keep room above.
const CHARACTER_HEIGHT = Math.min(SCREEN_WIDTH * (858 / 804), SCREEN_HEIGHT * (429 / 874));
// His hair starts 23 px down the image; the design leaves 29 px (of 402) between it and the
// bubble, tail included.
const BUBBLE_BOTTOM = CHARACTER_HEIGHT * (1 - 23 / 858) + SCREEN_WIDTH * (29 / 402);

export function LogoutModal({ visible, onClose, onConfirm }: LogoutModalProps) {
  const router = useRouter();

  const handleConfirmLogout = () => {
    logoutUser();
    setSession(null);
    onClose();
    if (onConfirm) {
      onConfirm();
    } else {
      router.replace('/onboarding');
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent={false} onRequestClose={onClose}>
      <View style={styles.container}>
        <StatusBar style="light" />

        <Image source={require('@/assets/images/bridge-bg.jpg')} style={StyleSheet.absoluteFill} contentFit="cover" />
        <View style={styles.darkOverlay} />

        {/* The SIRA character, sad to see the traveller go, standing on the bottom edge. */}
        <Image
          source={require('@/assets/images/logout-sad-character.png')}
          style={styles.character}
          contentFit="contain"
          contentPosition="bottom center"
          pointerEvents="none"
        />

        <SafeAreaView style={styles.safeArea} edges={['top']}>
          <View style={styles.topNavRow}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={onClose}
              activeOpacity={0.8}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel="Retour"
            >
              <Ionicons name="arrow-back" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {/* Road, slogan and pin of the login screen. */}
          <View style={styles.roadStripe} pointerEvents="none">
            <Image source={require('@/assets/images/road-stripe-designer.png')} style={styles.fill} contentFit="contain" />
          </View>
          <View style={styles.sloganRow} pointerEvents="none">
            <Text style={styles.sloganWhite}>ON TRACE, </Text>
            <Text style={styles.sloganOrange}>SANS STRESS.</Text>
          </View>
          <View style={styles.pin} pointerEvents="none">
            <Image source={require('@/assets/images/orange-pin-icon.png')} style={[styles.fill, styles.pinTilt]} contentFit="contain" />
          </View>

          {/* The character's speech bubble, its tail pointing down at him. */}
          <View style={styles.bubbleWrap}>
            <View style={styles.bubble}>
              <Text style={styles.question}>ÊTES-VOUS SÛR DE{'\n'}VOULOIR VOUS{'\n'}DÉCONNECTER ?</Text>
              <View style={styles.buttonsRow}>
                <TouchableOpacity
                  style={styles.pill}
                  onPress={handleConfirmLogout}
                  activeOpacity={0.85}
                  hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }}
                  accessibilityRole="button"
                  accessibilityLabel="Oui, me déconnecter"
                >
                  <Text style={styles.pillText}>OUI</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.pill}
                  onPress={onClose}
                  activeOpacity={0.85}
                  hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }}
                  accessibilityRole="button"
                  accessibilityLabel="Non, rester connecté"
                >
                  <Text style={styles.pillText}>NON</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.bubbleTail} />
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F0F',
    // The road is wider than the screen by design: never scroll sideways.
    overflow: 'hidden',
  },
  darkOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(5, 5, 5, 0.85)',
  },
  character: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    width: SCREEN_WIDTH,
    height: CHARACTER_HEIGHT,
  },
  safeArea: {
    flex: 1,
  },
  topNavRow: {
    minHeight: 46,
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 2,
    zIndex: 10,
    alignItems: 'flex-start',
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F26522',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fill: {
    width: '100%',
    height: '100%',
  },
  roadStripe: {
    position: 'absolute',
    top: sy(126),
    left: sx(-20),
    width: sx(450),
    height: sy(138),
  },
  sloganRow: {
    position: 'absolute',
    top: sy(107) + 12,
    left: sx(42) - 22,
    width: sx(325.1),
    height: sy(111.47),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-13.72deg' }],
  },
  sloganWhite: {
    color: '#FFFFFF',
    fontSize: 18.5,
    fontWeight: '500',
    lineHeight: 20,
  },
  sloganOrange: {
    color: '#F26522',
    fontSize: 18.5,
    fontWeight: '500',
    lineHeight: 20,
  },
  pin: {
    position: 'absolute',
    top: sy(107),
    left: sx(313),
    width: sx(42.03),
    height: sy(55.38),
  },
  pinTilt: {
    transform: [{ rotate: '-13.89deg' }],
  },
  // Bubble of the design: 284 wide at x 62 on a 402-wide screen, tail near its right end,
  // set just above the character's head.
  bubbleWrap: {
    position: 'absolute',
    bottom: BUBBLE_BOTTOM,
    left: SCREEN_WIDTH * (62 / 402),
    width: SCREEN_WIDTH * (284 / 402),
  },
  bubble: {
    backgroundColor: '#2D2D2D',
    borderRadius: 18,
    paddingTop: 22,
    paddingBottom: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  bubbleTail: {
    position: 'absolute',
    bottom: -17,
    right: SCREEN_WIDTH * (36 / 402),
    width: 0,
    height: 0,
    borderLeftWidth: 11,
    borderRightWidth: 11,
    borderTopWidth: 18,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#2D2D2D',
  },
  question: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 25,
    letterSpacing: 0.4,
  },
  buttonsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
  },
  pill: {
    backgroundColor: '#F26522',
    borderRadius: 14,
    minWidth: 47,
    paddingHorizontal: 12,
    paddingVertical: 3,
    alignItems: 'center',
  },
  pillText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
