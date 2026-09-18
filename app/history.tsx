import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CustomBottomTabBar } from '@/components/custom-bottom-tab-bar';

const { width, height } = Dimensions.get('window');

export default function HistoryScreen() {
  const router = useRouter();

  const handleStartSearch = () => {
    router.push('/(tabs)/explore');
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Background Image with Dark Semi-transparent Overlay */}
      <Image
        source={require('@/assets/images/bridge-bg.jpg')}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
      />
      <View style={[StyleSheet.absoluteFill, styles.darkOverlay]} />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Top Header Bar with Close Button & Road Banner Decor */}
        <View style={styles.headerContainer}>
          {/* Close Button Circle (Orange with Black X) */}
          <TouchableOpacity
            style={styles.closeButtonCircle}
            onPress={() => router.back()}
            activeOpacity={0.8}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={20} color="#000000" />
          </TouchableOpacity>

          {/* Road Stripe Graphic & Slogan Header */}
          <View style={styles.roadDecorWrapper}>
            <Image
              source={require('@/assets/images/road-stripe.png')}
              style={styles.roadStripeImage}
              contentFit="fill"
            />
            <View style={styles.sloganContainer}>
              <Text style={styles.sloganWhite}>ON TRACE, </Text>
              <Text style={styles.sloganOrange}>SANS STRESS.</Text>
            </View>
            <Image
              source={require('@/assets/images/orange-pin-icon.png')}
              style={styles.locationPinDecor}
              contentFit="contain"
            />
          </View>
        </View>

        {/* Main Body */}
        <View style={styles.bodyContent}>
          {/* Sira Brand Logo */}
          <View style={styles.logoWrapper}>
            <Image
              source={require('@/assets/images/sira-logo-transparent.png')}
              style={styles.siraLogoImage}
              contentFit="contain"
            />
          </View>

          {/* Speech Bubble "Que recherchez-vous ?" */}
          <View style={styles.speechBubbleWrapper}>
            <TouchableOpacity
              style={styles.speechBubblePill}
              onPress={handleStartSearch}
              activeOpacity={0.85}
            >
              <Text style={styles.speechBubbleText}>Que recherchez-vous ?</Text>
            </TouchableOpacity>

            {/* Speech Bubble Triangle Tail Pointer */}
            <View style={styles.speechTriangleTail} />
          </View>

          {/* SIRA 3D Assistant Character */}
          <View style={styles.characterWrapper} pointerEvents="none">
            <Image
              source={require('@/assets/images/sira-character-assistant.png')}
              style={styles.characterImage}
              contentFit="contain"
            />
          </View>
        </View>
      </SafeAreaView>

      {/* Bottom Navigation Bar */}
      <CustomBottomTabBar />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  darkOverlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
  },
  safeArea: {
    flex: 1,
  },
  headerContainer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  closeButtonCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F26522',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  roadDecorWrapper: {
    flex: 1,
    marginLeft: 8,
    height: 48,
    justifyContent: 'center',
    position: 'relative',
  },
  roadStripeImage: {
    position: 'absolute',
    top: 0,
    left: -20,
    width: 380,
    height: 120,
    opacity: 0.95,
  },
  sloganContainer: {
    position: 'absolute',
    top: 48,
    left: 20,
    flexDirection: 'row',
    alignItems: 'center',
    transform: [{ rotate: '-12deg' }],
    zIndex: 10,
  },
  sloganWhite: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  sloganOrange: {
    fontSize: 15,
    fontWeight: '800',
    color: '#F26522',
    letterSpacing: 0.5,
  },
  locationPinDecor: {
    position: 'absolute',
    top: 0,
    right: 10,
    width: 38,
    height: 48,
    transform: [{ rotate: '13deg' }],
    zIndex: 10,
  },
  bodyContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 40,
    position: 'relative',
  },
  logoWrapper: {
    width: 140,
    height: 55,
    marginBottom: 28,
  },
  siraLogoImage: {
    width: '100%',
    height: '100%',
  },
  speechBubbleWrapper: {
    width: '88%',
    maxWidth: 340,
    alignItems: 'center',
    position: 'relative',
    zIndex: 5,
  },
  speechBubblePill: {
    width: '100%',
    backgroundColor: '#F26522',
    borderRadius: 28,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#F26522',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  speechBubbleText: {
    fontSize: 19,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  speechTriangleTail: {
    position: 'absolute',
    bottom: -13,
    right: 32,
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderTopWidth: 14,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#F26522',
  },
  characterWrapper: {
    width: width * 0.9,
    height: height * 0.5,
    marginTop: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  characterImage: {
    width: '100%',
    height: '100%',
  },
});
