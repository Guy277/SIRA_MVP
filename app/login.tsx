import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import {
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Designer canvas reference metrics (406px x 874px)
const DESIGN_CANVAS_WIDTH = 406;
const DESIGN_CANVAS_HEIGHT = 874;

// Diagonal Road Stripe specs: Width 450px, Height 138px, Top 126px, Left -20px
const ROAD_STRIPE_WIDTH = (450 / DESIGN_CANVAS_WIDTH) * SCREEN_WIDTH;
const ROAD_STRIPE_HEIGHT = (138 / DESIGN_CANVAS_HEIGHT) * SCREEN_HEIGHT;
const ROAD_STRIPE_TOP = (126 / DESIGN_CANVAS_HEIGHT) * SCREEN_HEIGHT;
const ROAD_STRIPE_LEFT = (-20 / DESIGN_CANVAS_WIDTH) * SCREEN_WIDTH;

// Tagline Slogan Row specs: Width 325.1px, Height 111.47px, Top 107px, Left 42px, Angle 0deg
const SLOGAN_WIDTH = (325.1 / DESIGN_CANVAS_WIDTH) * SCREEN_WIDTH;
const SLOGAN_HEIGHT = (111.47 / DESIGN_CANVAS_HEIGHT) * SCREEN_HEIGHT;
const SLOGAN_TOP = (107 / DESIGN_CANVAS_HEIGHT) * SCREEN_HEIGHT;
const SLOGAN_LEFT = (42 / DESIGN_CANVAS_WIDTH) * SCREEN_WIDTH;

// Location Pin specs: Width 42.03px, Height 55.38px, Top 107px, Left 313px, Angle 13.89deg
const PIN_WIDTH = (42.03 / DESIGN_CANVAS_WIDTH) * SCREEN_WIDTH;
const PIN_HEIGHT = (55.38 / DESIGN_CANVAS_HEIGHT) * SCREEN_HEIGHT;
const PIN_TOP = (107 / DESIGN_CANVAS_HEIGHT) * SCREEN_HEIGHT;
const PIN_LEFT = (313 / DESIGN_CANVAS_WIDTH) * SCREEN_WIDTH;

// White Sira Logo specs: Width 105px, Height 107px, Top 270px, Left 148px
const WHITE_LOGO_WIDTH = (105 / DESIGN_CANVAS_WIDTH) * SCREEN_WIDTH;
const WHITE_LOGO_HEIGHT = (107 / DESIGN_CANVAS_HEIGHT) * SCREEN_HEIGHT;
const WHITE_LOGO_TOP = (270 / DESIGN_CANVAS_HEIGHT) * SCREEN_HEIGHT;
const WHITE_LOGO_LEFT = (148 / DESIGN_CANVAS_WIDTH) * SCREEN_WIDTH;

import { setAuthenticated } from '@/hooks/use-auth';

export default function LoginScreen() {
  const router = useRouter();
  const [phone, setPhone] = useState('');

  const handleLogin = () => {
    setAuthenticated(true);
    router.replace('/(tabs)/explore');
  };

  const handleGoToSignup = () => {
    router.push('/signup');
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Dark City/Highway background */}
      <Image
        source={require('@/assets/images/bridge-bg.jpg')}
        style={styles.bgImage}
        contentFit="cover"
      />
      {/* Dark overlay with highway night atmosphere */}
      <View style={styles.darkOverlay} />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Top Left Circular Orange Back Button */}
        <View style={styles.topNavRow}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.8}
          >
            <Ionicons name="arrow-back" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Diagonal Road Stripe Image (Top: 126px, Left: -20px, 450x138) */}
        <View style={styles.roadStripeContainer} pointerEvents="none">
          <Image
            source={require('@/assets/images/road-stripe-designer.png')}
            style={styles.roadStripeImage}
            contentFit="contain"
          />
        </View>

        {/* Tagline Slogan Row (Top: 107px, Left: 42px, 325x111 at -13.72deg) */}
        <View style={styles.sloganRow} pointerEvents="none">
          <Text style={styles.sloganWhite}>ON TRACE, </Text>
          <Text style={styles.sloganOrange}>SANS STRESS.</Text>
        </View>

        {/* Location Pin Icon (Top: 107px, Left: 313px, 42x55 at 13.89deg) */}
        <Image
          source={require('@/assets/images/orange-pin-icon.png')}
          style={styles.pinImageStandalone}
          contentFit="contain"
        />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            bounces={false}
            showsVerticalScrollIndicator={false}
          >
            {/* Sira Brand White Logo */}
            <View style={styles.logoContainer}>
              <Image
                source={require('@/assets/images/sira-logo-white-designer.png')}
                style={styles.logoImage}
                contentFit="contain"
              />
            </View>

            {/* Welcome Headlines */}
            <View style={styles.textContainer}>
              <Text style={styles.titleLine1}>HEUREUX</Text>
              <Text style={styles.titleLine2}>
                DE <Text style={styles.titleOrange}>VOUS REVOIR</Text>
              </Text>

              {/* Formatted subtitle matching designer text styling */}
              <Text style={styles.subtitle}>
                Votre mobilité à Abidjan vous attend.{'\n'}
                <Text style={styles.subtitleBold}>Entrez votre numéro Orange</Text>{'\n'}
                pour accéder à votre compte{'\n'}
                et <Text style={styles.subtitleBold}>retrouver votre expérience SIRA.</Text>
              </Text>
            </View>

            {/* Input Field: Orange User Icon + Dark Pill */}
            <View style={styles.inputWrapper}>
              <View style={styles.iconCircle}>
                <Ionicons name="person" size={17} color="#FFFFFF" />
              </View>
              <TextInput
                style={styles.textInput}
                placeholder="07 XX XX XX XX"
                placeholderTextColor="#AAAAAA"
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
              />
            </View>

            {/* Orange Connect Button */}
            <TouchableOpacity
              style={styles.loginButton}
              onPress={handleLogin}
              activeOpacity={0.85}
            >
              <Text style={styles.loginButtonText}>SE CONNECTER</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F0F',
  },
  bgImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  darkOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(5, 5, 5, 0.90)',
  },
  safeArea: {
    flex: 1,
  },
  topNavRow: {
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
    shadowColor: '#F26522',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 28,
    paddingTop: ROAD_STRIPE_TOP + ROAD_STRIPE_HEIGHT * 0.45,
    paddingBottom: 35,
    alignItems: 'center',
  },
  roadStripeContainer: {
    position: 'absolute',
    top: ROAD_STRIPE_TOP,
    left: ROAD_STRIPE_LEFT,
    width: ROAD_STRIPE_WIDTH,
    height: ROAD_STRIPE_HEIGHT,
    zIndex: 1,
  },
  roadStripeImage: {
    width: '100%',
    height: '100%',
  },
  sloganRow: {
    position: 'absolute',
    top: SLOGAN_TOP + 12,
    left: SLOGAN_LEFT - 22,
    width: SLOGAN_WIDTH,
    height: SLOGAN_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-13.72deg' }],
    zIndex: 10,
  },
  sloganWhite: {
    color: '#FFFFFF',
    fontSize: 18.5,
    fontWeight: '500',
    lineHeight: 20,
    letterSpacing: 0,
    fontVariant: ['small-caps'],
    textTransform: 'uppercase',
  },
  sloganOrange: {
    color: '#F26522',
    fontSize: 18.5,
    fontWeight: '500',
    lineHeight: 20,
    letterSpacing: 0,
    fontVariant: ['small-caps'],
    textTransform: 'uppercase',
  },
  pinImageStandalone: {
    position: 'absolute',
    top: PIN_TOP,
    left: PIN_LEFT,
    width: PIN_WIDTH,
    height: PIN_HEIGHT,
    transform: [{ rotate: '-13.89deg' }],
    zIndex: 15,
  },
  logoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    marginBottom: 16,
  },
  logoImage: {
    width: WHITE_LOGO_WIDTH,
    height: WHITE_LOGO_HEIGHT,
  },
  textContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  titleLine1: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 0,
    textAlign: 'center',
    textTransform: 'uppercase',
    fontVariant: ['small-caps'],
  },
  titleLine2: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 0,
    textAlign: 'center',
    marginTop: 2,
    textTransform: 'uppercase',
    fontVariant: ['small-caps'],
  },
  titleOrange: {
    color: '#F26522',
  },
  subtitle: {
    color: '#E0E0E0',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 10,
    fontWeight: '400',
  },
  subtitleBold: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  inputWrapper: {
    width: '100%',
    backgroundColor: '#333333',
    borderRadius: 25,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginBottom: 20,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F26522',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  textInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 20,
    letterSpacing: 0,
    paddingVertical: 8,
  },
  loginButton: {
    backgroundColor: '#F26522',
    minWidth: 140,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#F26522',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 5,
  },
  loginButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    letterSpacing: 0,
    fontVariant: ['small-caps'],
    textTransform: 'uppercase',
  },
});
